/** Runs once when the Node.js server starts. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { verifyDatabaseTime } = await import('./server/db');
  // A non-UTC application session corrupts writes, so it stops the server. Connectivity problems
  // only warn; request handling reports them as usual.
  await verifyDatabaseTime().catch((error: unknown) => {
    if (error instanceof Error && error.message.includes('must use UTC'))
      throw error;
    console.warn('[careeros] Database time check skipped:', error);
  });
}
