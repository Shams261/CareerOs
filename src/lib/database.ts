import { PrismaPg } from '@prisma/adapter-pg';
import { pgSslOption, type DatabaseSsl } from './database-ssl';

export {
  DATABASE_SSL_MODES,
  databaseSslFromEnv,
  parseDatabaseSsl,
  pgSslOption,
  type DatabaseSsl,
  type DatabaseSslMode,
} from './database-ssl';

/**
 * Every CareerOS PostgreSQL session runs in UTC (ADR-009).
 *
 * @prisma/adapter-pg sends a Date as its UTC wall clock without an offset and, on read, discards the
 * offset PostgreSQL returns. Both conversions are only exact when the session TimeZone is UTC, so the
 * zone is pinned per connection instead of trusting server, OS or provider defaults.
 */
export const SESSION_TIME_ZONE = 'UTC';

/**
 * Adds `-c TimeZone=UTC` to the connection's startup `options`, keeping any existing options
 * (for example a search_path). PostgreSQL applies options left to right, so the pin wins over a
 * TimeZone supplied earlier in the URL. The URL is used because pg lets connection-string
 * parameters override separate config fields.
 */
export function utcConnectionString(connectionString: string) {
  const url = new URL(connectionString);
  const existing = url.searchParams.get('options')?.trim();
  url.searchParams.set(
    'options',
    [existing, `-c TimeZone=${SESSION_TIME_ZONE}`].filter(Boolean).join(' '),
  );
  return url.toString();
}

/**
 * The Prisma CLI (migrate, db seed) parses its own URL parameters and does not know
 * node-postgres' `no-verify`; this builds the equivalent URL for `prisma.config.ts`.
 */
export function prismaCliConnectionString(
  connectionString: string,
  ssl: DatabaseSsl,
) {
  const url = new URL(utcConnectionString(connectionString));
  if (ssl.mode === 'no-verify') {
    url.searchParams.set('sslmode', 'require');
    url.searchParams.set('sslaccept', 'accept_invalid_certs');
  } else if (ssl.mode === 'verify-full') {
    url.searchParams.set('sslmode', 'verify-full');
    if (ssl.caFile) url.searchParams.set('sslcert', ssl.caFile);
  }
  return url.toString();
}

/** One bounded pool per process; `max` keeps hosted PostgreSQL connection limits safe. */
export const createPgAdapter = (
  connectionString: string,
  pool: { max?: number; ssl?: DatabaseSsl } = {},
) =>
  new PrismaPg({
    connectionString: utcConnectionString(connectionString),
    max: pool.max ?? 5,
    idleTimeoutMillis: 30000,
    ssl: pgSslOption(pool.ssl ?? { mode: 'off' }),
  });

/** PostgreSQL spellings of UTC (`SHOW TimeZone` on Docker/Debian images reports `Etc/UTC`). */
export const isUtcZone = (zone: string) =>
  ['UTC', 'Etc/UTC', 'Etc/Universal', 'Universal', 'Etc/Zulu', 'Zulu'].includes(
    zone.trim(),
  );

/** Host/port/database only, for logs. Never includes credentials. */
export function describeDatabase(connectionString: string) {
  const url = new URL(connectionString);
  return `${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
}
