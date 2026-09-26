import { describe, expect, it } from 'vitest';
import {
  createPgAdapter,
  parseDatabaseSsl,
  pgSslOption,
  prismaCliConnectionString,
  utcConnectionString,
} from '../src/lib/database';
import { configProblems } from '../src/lib/env';

const url = 'postgresql://u:p@db.example.com:5432/silsila';
const params = (s: string) => Object.fromEntries(new URL(s).searchParams);

describe('parseDatabaseSsl', () => {
  it('defaults to off for missing or blank values', () => {
    expect(parseDatabaseSsl(undefined, undefined)).toEqual({ mode: 'off' });
    expect(parseDatabaseSsl('  ', '')).toEqual({ mode: 'off' });
  });
  it('accepts the three modes and trims whitespace', () => {
    expect(parseDatabaseSsl(' no-verify ', undefined).mode).toBe('no-verify');
    expect(parseDatabaseSsl('verify-full', '/etc/ssl/ca.pem')).toEqual({
      mode: 'verify-full',
      caFile: '/etc/ssl/ca.pem',
    });
  });
  it('rejects unknown modes and a CA file outside verify-full, naming only variables', () => {
    expect(() => parseDatabaseSsl('require', undefined)).toThrow(
      /DATABASE_SSL must be one of off, no-verify, verify-full/,
    );
    expect(() => parseDatabaseSsl('no-verify', '/ca.pem')).toThrow(
      /DATABASE_SSL_CA is only used with DATABASE_SSL=verify-full/,
    );
  });
});

describe('pgSslOption', () => {
  it('leaves the URL in charge when off', () => {
    expect(pgSslOption({ mode: 'off' })).toBeUndefined();
  });
  it('encrypts without verification for no-verify', () => {
    expect(pgSslOption({ mode: 'no-verify' })).toEqual({
      rejectUnauthorized: false,
    });
  });
  it('verifies for verify-full', () => {
    expect(pgSslOption({ mode: 'verify-full' })).toEqual({
      rejectUnauthorized: true,
    });
  });
});

describe('prismaCliConnectionString', () => {
  it('keeps the UTC pin and adds nothing when off', () => {
    const out = prismaCliConnectionString(url, { mode: 'off' });
    expect(out).toBe(utcConnectionString(url));
    expect(params(out)).toEqual({ options: '-c TimeZone=UTC' });
  });
  it("translates no-verify to the CLI's require + accept_invalid_certs", () => {
    expect(
      params(prismaCliConnectionString(url, { mode: 'no-verify' })),
    ).toEqual({
      options: '-c TimeZone=UTC',
      sslmode: 'require',
      sslaccept: 'accept_invalid_certs',
    });
  });
  it('translates verify-full with an optional CA path', () => {
    expect(
      params(
        prismaCliConnectionString(url, {
          mode: 'verify-full',
          caFile: '/certs/ca.pem',
        }),
      ),
    ).toEqual({
      options: '-c TimeZone=UTC',
      sslmode: 'verify-full',
      sslcert: '/certs/ca.pem',
    });
  });
  it('never exposes credentials differently from the input', () => {
    const out = new URL(prismaCliConnectionString(url, { mode: 'no-verify' }));
    expect(`${out.username}:${out.password}@${out.host}${out.pathname}`).toBe(
      'u:p@db.example.com:5432/silsila',
    );
  });
});

describe('createPgAdapter', () => {
  it('constructs with and without SSL (no connection is opened)', () => {
    expect(() => createPgAdapter(url)).not.toThrow();
    expect(() =>
      createPgAdapter(url, { max: 2, ssl: { mode: 'no-verify' } }),
    ).not.toThrow();
  });
});

describe('configProblems with DATABASE_SSL', () => {
  const base = {
    DATABASE_URL: url,
    OWNER_EMAIL: 'owner@example.com',
    CRON_SECRET: 'x'.repeat(40),
    APP_BASE_URL: 'https://usesilsila.me',
    GOOGLE_CLIENT_ID: 'id',
    GOOGLE_CLIENT_SECRET: 'secret',
    AUTH_SECRET: Buffer.alloc(32, 7).toString('base64'),
  };
  it('accepts every documented mode', () => {
    for (const DATABASE_SSL of ['off', 'no-verify', 'verify-full'])
      expect(configProblems({ ...base, DATABASE_SSL })).toEqual([]);
  });
  it('names the variable for an invalid mode or a misplaced CA path', () => {
    expect(configProblems({ ...base, DATABASE_SSL: 'require' })).toEqual([
      expect.stringMatching(/^DATABASE_SSL: /),
    ]);
    expect(
      configProblems({
        ...base,
        DATABASE_SSL: 'no-verify',
        DATABASE_SSL_CA: '/ca.pem',
      }),
    ).toEqual([expect.stringMatching(/^DATABASE_SSL_CA: /)]);
  });
});
