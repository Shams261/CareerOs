import { readFileSync } from 'node:fs';

/**
 * TLS towards PostgreSQL (ADR-013). Managed providers such as Heroku require TLS but inject a
 * `DATABASE_URL` without SSL parameters, and node-postgres treats `sslmode=require` as full
 * certificate verification, which provider-signed certificates fail. The mode is therefore an
 * explicit setting applied to every connection this code base opens:
 *
 * - `off`: nothing is added; a `sslmode` in the URL (if any) stays in charge. Local and CI default.
 * - `no-verify`: encrypted, certificate not verified (the provider's documented mode).
 * - `verify-full`: encrypted and verified, optionally against the CA bundle in `DATABASE_SSL_CA`.
 */
export const DATABASE_SSL_MODES = ['off', 'no-verify', 'verify-full'] as const;
export type DatabaseSslMode = (typeof DATABASE_SSL_MODES)[number];
export type DatabaseSsl = { mode: DatabaseSslMode; caFile?: string };

export function parseDatabaseSsl(
  mode: string | undefined,
  caFile: string | undefined,
): DatabaseSsl {
  const value = (mode?.trim() || 'off') as DatabaseSslMode;
  if (!DATABASE_SSL_MODES.includes(value))
    throw new Error(
      `DATABASE_SSL must be one of ${DATABASE_SSL_MODES.join(', ')}`,
    );
  const ca = caFile?.trim() || undefined;
  if (ca && value !== 'verify-full')
    throw new Error(
      'DATABASE_SSL_CA is only used with DATABASE_SSL=verify-full',
    );
  return { mode: value, caFile: ca };
}

/** Reads DATABASE_SSL / DATABASE_SSL_CA; throws with names only, never values. */
export const databaseSslFromEnv = (
  source: Record<string, string | undefined> = process.env,
) => parseDatabaseSsl(source.DATABASE_SSL, source.DATABASE_SSL_CA);

/** The `ssl` option for node-postgres clients and pools. */
export function pgSslOption(ssl: DatabaseSsl) {
  switch (ssl.mode) {
    case 'off':
      return undefined;
    case 'no-verify':
      return { rejectUnauthorized: false };
    case 'verify-full':
      return ssl.caFile
        ? { rejectUnauthorized: true, ca: readFileSync(ssl.caFile, 'utf8') }
        : { rejectUnauthorized: true };
  }
}
