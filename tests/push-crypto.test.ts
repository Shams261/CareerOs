import { describe, expect, it, vi } from 'vitest';
import {
  createDecipheriv,
  createECDH,
  createPublicKey,
  hkdfSync,
  randomBytes,
  verify,
} from 'node:crypto';
import webpush from 'web-push';
vi.mock('server-only', () => ({}));
vi.mock('@/server/db', () => ({ db: () => null }));
import { pushRequestOptions } from '../src/features/push/service';
import { pushPayload } from '../src/features/push/domain';
import { configProblems } from '../src/lib/env';

const b64u = (b: Buffer) => b.toString('base64url');
const hkdf = (ikm: Buffer, salt: Buffer, info: string | Buffer, n: number) =>
  Buffer.from(hkdfSync('sha256', ikm, salt, info, n));

/** The browser side of RFC 8291 (Web Push encryption) over RFC 8188 aes128gcm. */
function decrypt(
  body: Buffer,
  receiver: ReturnType<typeof createECDH>,
  auth: Buffer,
) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const senderKey = body.subarray(21, 21 + idlen);
  const ciphertext = body.subarray(21 + idlen);
  const secret = receiver.computeSecret(senderKey);
  const info = Buffer.concat([
    Buffer.from('WebPush: info\0'),
    receiver.getPublicKey(),
    senderKey,
  ]);
  const ikm = hkdf(secret, auth, info, 32);
  const cek = hkdf(ikm, salt, 'Content-Encoding: aes128gcm\0', 16);
  const nonce = hkdf(ikm, salt, 'Content-Encoding: nonce\0', 12);
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(-16));
  const padded = Buffer.concat([
    decipher.update(ciphertext.subarray(0, -16)),
    decipher.final(),
  ]);
  // The last record ends with the 0x02 delimiter followed by zero padding.
  return padded.subarray(0, padded.lastIndexOf(2)).toString('utf8');
}

describe('Web Push encryption and VAPID (RFC 8291 / 8292)', () => {
  const vapid = webpush.generateVAPIDKeys();
  const cfg = {
    publicKey: vapid.publicKey,
    privateKey: vapid.privateKey,
    subject: 'mailto:owner@example.com',
  };
  const receiver = createECDH('prime256v1');
  receiver.generateKeys();
  const auth = randomBytes(16);
  const subscription = {
    endpoint: 'https://push.example.net/wpush/v2/abc123',
    keys: { p256dh: b64u(receiver.getPublicKey()), auth: b64u(auth) },
  };

  it('generated VAPID keys pass environment validation', () => {
    expect(
      configProblems({
        DATABASE_URL: 'postgresql://u@localhost/db',
        OWNER_EMAIL: 'owner@example.com',
        CRON_SECRET: 'c'.repeat(40),
        VAPID_PUBLIC_KEY: cfg.publicKey,
        VAPID_PRIVATE_KEY: cfg.privateKey,
        VAPID_SUBJECT: cfg.subject,
      }).filter((p) => p.startsWith('VAPID')),
    ).toEqual([]);
  });

  it('encrypts the payload so only the subscribed browser can read it', () => {
    const payload = pushPayload({
      id: 'n1',
      type: 'DSA_REVISION',
      title: '2 DSA problems due',
      dedupeKey: 'u:DSA_REVISION:day:2026-09-24',
    });
    const req = webpush.generateRequestDetails(
      subscription,
      payload,
      pushRequestOptions(cfg),
    );
    expect(req.method).toBe('POST');
    expect(req.endpoint).toBe(subscription.endpoint);
    expect(req.headers).toMatchObject({
      'Content-Encoding': 'aes128gcm',
      TTL: 43200,
      Urgency: 'normal',
    });
    const body = req.body as Buffer;
    expect(body.includes(Buffer.from('DSA'))).toBe(false);
    expect(JSON.parse(decrypt(body, receiver, auth))).toEqual({
      title: 'CareerOS',
      body: '2 DSA problems due',
      tag: 'n1',
      url: '/dsa',
    });
    const stranger = createECDH('prime256v1');
    stranger.generateKeys();
    expect(() => decrypt(body, stranger, auth)).toThrow();
    expect(() => decrypt(body, receiver, randomBytes(16))).toThrow();
  });

  it('signs a VAPID JWT for the push service origin with the configured key', () => {
    const req = webpush.generateRequestDetails(
      subscription,
      'x',
      pushRequestOptions(cfg),
    );
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(
      String(req.headers.Authorization),
    );
    expect(m?.[2]).toBe(cfg.publicKey);
    const [h, p, sig] = m![1].split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toMatchObject({
      alg: 'ES256',
    });
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    expect(claims.aud).toBe('https://push.example.net');
    expect(claims.sub).toBe(cfg.subject);
    expect(claims.exp * 1000).toBeGreaterThan(Date.now());
    expect(claims.exp * 1000).toBeLessThanOrEqual(Date.now() + 24 * 3600000);
    const point = Buffer.from(cfg.publicKey, 'base64url');
    const key = createPublicKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: b64u(point.subarray(1, 33)),
        y: b64u(point.subarray(33, 65)),
      },
      format: 'jwk',
    });
    const ok = (data: string) =>
      verify(
        'sha256',
        Buffer.from(data),
        { key, dsaEncoding: 'ieee-p1363' },
        Buffer.from(sig, 'base64url'),
      );
    expect(ok(`${h}.${p}`)).toBe(true);
    expect(ok(`${h}.${p}x`)).toBe(false);
  });
});
