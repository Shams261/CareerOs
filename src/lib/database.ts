import { PrismaPg } from '@prisma/adapter-pg';

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

/** One bounded pool per process; `max` keeps hosted PostgreSQL connection limits safe. */
export const createPgAdapter = (
  connectionString: string,
  pool: { max?: number } = {},
) =>
  new PrismaPg({
    connectionString: utcConnectionString(connectionString),
    max: pool.max ?? 5,
    idleTimeoutMillis: 30000,
  });

/** Host/port/database only, for logs. Never includes credentials. */
export function describeDatabase(connectionString: string) {
  const url = new URL(connectionString);
  return `${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
}
