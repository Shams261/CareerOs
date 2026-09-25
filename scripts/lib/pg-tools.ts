import { spawnSync } from 'node:child_process';

/** Connection settings for pg_dump/pg_restore via PG* variables, so passwords never hit argv/logs. */
export function pgEnv(url: string) {
  const u = new URL(url);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
  };
  if (u.password) env.PGPASSWORD = decodeURIComponent(u.password);
  const ssl = u.searchParams.get('sslmode');
  if (ssl) env.PGSSLMODE = ssl;
  return env;
}
export const dbName = (url: string) =>
  decodeURIComponent(new URL(url).pathname.slice(1));
export function withDb(url: string, name: string) {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}
export function run(cmd: string, args: string[], env: NodeJS.ProcessEnv) {
  const r = spawnSync(cmd, args, {
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (r.error)
    throw new Error(
      `${cmd} not found: install PostgreSQL client tools matching the server major version.`,
    );
  if (r.status !== 0) throw new Error(`${cmd} exited with ${r.status}`);
}
