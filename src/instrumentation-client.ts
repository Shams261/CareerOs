/**
 * Runs in the browser before any page code (WI-145). Zod's object parser probes `new Function`
 * once to decide whether to compile a fast path; the nonce CSP blocks it, and Firefox reports
 * the caught probe as a CSP violation in the console. `jitless` skips the probe. Zod keeps its
 * config on this global, so setting it here costs no Zod import in the shell; it must be set
 * before the first schema is built, which this file runs ahead of.
 */
const g = globalThis as { __zod_globalConfig?: { jitless?: boolean } };
(g.__zod_globalConfig ??= {}).jitless = true;
