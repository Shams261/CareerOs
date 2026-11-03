import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Module boundaries (WI-123). The kernel (`src/lib`, the owner lock and the action runner)
 * never imports a feature, and no client component pulls Zod into the browser except the
 * page forms listed below, which validate in place. A new import that breaks either rule
 * fails here; move the shared rule into the kernel or the words into a client-safe module.
 */
const SRC = join(process.cwd(), 'src');
function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'generated') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const files = new Map(walk(SRC).map((f) => [f, readFileSync(f, 'utf8')]));
const IMPORT =
  /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
function resolve(from: string, spec: string) {
  const base = spec.startsWith('@/')
    ? join(SRC, spec.slice(2))
    : spec.startsWith('.')
      ? normalize(join(dirname(from), spec))
      : null;
  if (!base) return spec;
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx'])
    if (files.has(base + ext)) return base + ext;
  return null;
}
/** Value imports only: `import type` is erased and never bundled. */
const deps = (file: string) =>
  [...(files.get(file) ?? '').matchAll(IMPORT)]
    .map((m) => resolve(file, m[1]))
    .filter((d): d is string => d !== null);
const directive = (file: string, word: string) =>
  (files.get(file) ?? '').trimStart().startsWith(`'${word}'`);
const rel = (f: string) => relative(SRC, f);

describe('module boundaries (WI-123)', () => {
  it('the kernel imports no feature', () => {
    const kernel = [...files.keys()].filter(
      (f) =>
        rel(f).startsWith('lib/') ||
        ['server/lock.ts', 'server/action.ts'].includes(rel(f)),
    );
    const offenders = kernel.flatMap((f) =>
      deps(f)
        .filter((d) => d.startsWith(join(SRC, 'features')))
        .map((d) => `${rel(f)} → ${rel(d)}`),
    );
    expect(offenders).toEqual([]);
  });

  it('pages and components read through loaders, never the database directly (WI-129, WI-130)', () => {
    const direct = [...files.keys()]
      .filter((f) => f.endsWith('.tsx'))
      .filter((f) => /\bdb\(\)/.test(files.get(f) ?? ''))
      .map(rel);
    expect(direct).toEqual([]);
  });

  it('no client component bundles Zod beyond the known page forms', () => {
    // Page forms that still share their feature's schemas; shrink this list, never grow it.
    const known = new Set([
      'features/ai/grill.tsx',
      'features/jobs/stage-row.tsx',
      'features/listen/listen.tsx',
      'features/prep/panel.tsx',
      // Split from week-items.tsx in WI-139: the same item form, now in the item's own file.
      'features/roadmap/item-body.tsx',
      'features/roadmap/item-form.tsx',
      'features/roadmap/study-prompt.tsx',
      'features/roadmap/week-items.tsx',
    ]);
    const reachesZod = (root: string) => {
      const seen = new Set([root]);
      const queue = [root];
      while (queue.length) {
        const file = queue.shift()!;
        // A client's import of a server action is a reference, never bundled code.
        if (file !== root && directive(file, 'use server')) continue;
        for (const d of deps(file)) {
          if (d === 'zod') return true;
          if (!seen.has(d) && files.has(d)) {
            seen.add(d);
            queue.push(d);
          }
        }
      }
      return false;
    };
    const leaking = [...files.keys()]
      .filter((f) => directive(f, 'use client') && reachesZod(f))
      .map(rel)
      .filter((f) => !known.has(f));
    expect(leaking).toEqual([]);
    // The shell on every page, /privacy included, stays free of Zod.
    for (const shell of [
      'features/agent/drawer.tsx',
      'features/agent/rumi-button.tsx',
      'components/navigation.tsx',
      'features/command/bar.tsx',
      'components/action-form.tsx',
      'components/toast.tsx',
    ])
      expect(reachesZod(join(SRC, shell)), shell).toBe(false);
  });

  it('features depend on each other in one direction, apart from the pairs listed (WI-139)', () => {
    // Two features that import each other are one tangle. These pairs are the ones left at
    // WI-139; the list may only shrink. A client's import of a server action is a reference
    // to an endpoint, not a dependency of code, so it does not count.
    const LEFT = [
      'agent ↔ jobs',
      'agent ↔ nudges',
      'agent ↔ prep',
      'agent ↔ review',
      'ai ↔ roadmap',
      'calendar ↔ schedule',
      'deletes ↔ schedule',
      'dsa ↔ roadmap',
      'execution ↔ schedule',
      'jobs ↔ prep',
      'jobs ↔ roadmap',
      'notifications ↔ nudges',
      'notifications ↔ review',
    ];
    const feature = (f: string) => {
      const parts = rel(f).split('/');
      return parts[0] === 'features' && parts.length > 2 ? parts[1] : null;
    };
    const edges = new Set<string>();
    for (const f of files.keys()) {
      const from = feature(f);
      if (!from) continue;
      for (const d of deps(f)) {
        const to = feature(d);
        if (!to || to === from) continue;
        if (directive(f, 'use client') && directive(d, 'use server')) continue;
        edges.add(`${from}→${to}`);
      }
    }
    const pairs = [...edges]
      .map((e) => e.split('→'))
      .filter(([a, b]) => a < b && edges.has(`${b}→${a}`))
      .map(([a, b]) => `${a} ↔ ${b}`)
      .sort();
    expect(pairs).toEqual(LEFT);
  });

  it('every server action answers through the action runner, apart from the files listed (WI-139)', () => {
    // runAction / failure (WI-122) keep an unexpected error's text off the screen, log it with
    // a reference and refresh every page. These files do without, each for its reason.
    const WITHOUT: Record<string, string> = {
      'features/theme-actions.ts':
        'a cookie for this browser, no record and no message',
      'features/setup/actions.ts':
        'a cookie for this browser, no record and no message',
      'features/listen/actions.ts':
        'answers with the monthly budget beside the words; only its own AI refusals speak, the rest is logged by name',
    };
    const without = [...files.keys()]
      .filter((f) => directive(f, 'use server'))
      .filter((f) => !/\b(runAction|failure)\(/.test(files.get(f) ?? ''))
      .map(rel)
      .sort();
    expect(without).toEqual(Object.keys(WITHOUT).sort());
  });

  it('every exported action answers its own errors, apart from the ones listed (WI-145)', () => {
    // Per function, not per file: an action that catches must hand the error to the runner,
    // `failure` or `unstable_rethrow` (directly or through a helper in its file), so the sign-in
    // redirect goes through and nothing unexpected reaches the screen by its words. One that
    // never catches lets Next's error page answer, which only these may.
    const UNCAUGHT: Record<string, string> = {
      'features/auth/actions.ts signInAction': 'a redirect to Google',
      'features/auth/actions.ts signOutAction': 'a redirect to the login',
      'features/calendar/actions.ts connectCalendarAction':
        'a redirect to Google',
      'features/agent/actions.ts voiceStateAction':
        'a read for the composer; its caller falls back to no microphone',
      'features/nudges/actions.ts dismissNudgesCardAction':
        'a cookie for this browser',
      'features/today/actions.ts hideFirstStepsAction':
        'a cookie for this browser',
      'features/setup/actions.ts hideSetupAction': 'a cookie for this browser',
      'features/theme-actions.ts saveTheme': 'a cookie for this browser',
      'features/theme-actions.ts saveTextSize': 'a cookie for this browser',
    };
    const handled = /\b(runAction|failure|unstable_rethrow)\(/;
    const loose: string[] = [];
    for (const f of [...files.keys()].filter((f) =>
      directive(f, 'use server'),
    )) {
      const source = files.get(f) ?? '';
      const parts = source.split(
        /\n(?=export |const |function |async function )/,
      );
      // Helpers in the file that pass the error on: `failed(error)` counts as handled.
      const helpers = parts
        .filter((p) => !p.startsWith('export ') && handled.test(p))
        .map((p) => /^(?:const|function|async function) (\w+)/.exec(p)?.[1])
        .filter((n): n is string => !!n);
      const ok = new RegExp(
        `\\b(runAction|failure|unstable_rethrow${helpers.map((h) => `|${h}`).join('')})\\(`,
      );
      for (const part of parts.filter((p) => p.startsWith('export '))) {
        const name = /^export (?:async )?(?:function|const) (\w+)/.exec(
          part,
        )?.[1];
        if (!name || /^export const (runtime|dynamic)\b/.test(part)) continue;
        if (!ok.test(part)) loose.push(`${rel(f)} ${name}`);
      }
    }
    expect(loose.sort()).toEqual(Object.keys(UNCAUGHT).sort());
  });
});
