import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Authenticated encryption for OAuth refresh tokens (ADR-010): AES-256-GCM with a random 96-bit IV.
 * Envelope: `v1:<iv b64url>:<tag b64url>:<ciphertext b64url>`. The key comes only from
 * CALENDAR_TOKEN_ENCRYPTION_KEY (32 random bytes, base64) and is never stored in PostgreSQL.
 */
const VERSION = 'v1';
export class TokenDecryptionError extends Error {
  constructor() {
    // Deliberately generic: never echo ciphertext or key material.
    super('Stored credential could not be decrypted with the configured key.');
  }
}

export function parseEncryptionKey(value: string | undefined) {
  if (!value) throw new Error('CALENDAR_TOKEN_ENCRYPTION_KEY is not set.');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value.trim())
    throw new Error(
      'CALENDAR_TOKEN_ENCRYPTION_KEY must be 32 random bytes encoded as base64 (openssl rand -base64 32).',
    );
  return key;
}

export function encryptSecret(plaintext: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(VERSION));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptSecret(envelope: string, key: Buffer) {
  const [version, iv, tag, ciphertext] = envelope.split(':');
  if (version !== VERSION || !iv || !tag || !ciphertext)
    throw new TokenDecryptionError();
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAAD(Buffer.from(VERSION));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new TokenDecryptionError();
  }
}

export const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export const randomToken = (bytes = 32) =>
  randomBytes(bytes).toString('base64url');
