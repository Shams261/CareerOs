/** Runs once when the Node.js server starts. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // Production refuses to start with missing or invalid configuration (names only, never values).
  const { configProblems } = await import('./lib/env');
  const problems = configProblems();
  if (problems.length) {
    const report = `CareerOS configuration invalid:\n- ${problems.join('\n- ')}`;
    if (process.env.NODE_ENV === 'production') {
      // Fail fast: the process manager shows a crash instead of the app serving 500s.
      console.error(report);
      const { exit } = await import('node:process');
      exit(1);
    }
    console.warn(report);
  }
  const { verifyDatabaseTime } = await import('./server/db');
  // A non-UTC application session corrupts writes, so it stops the server. Connectivity problems
  // only warn; request handling reports them as usual.
  await verifyDatabaseTime().catch((error: unknown) => {
    if (error instanceof Error && error.message.includes('must use UTC'))
      throw error;
    console.warn('[careeros] Database time check skipped:', error);
  });
}
