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

  it('no client component bundles Zod beyond the known page forms', () => {
    // Page forms that still share their feature's schemas; shrink this list, never grow it.
    const known = new Set([
      'features/ai/grill.tsx',
      'features/dsa/library-filters.tsx',
      'features/jobs/stage-row.tsx',
      'features/listen/listen.tsx',
      'features/prep/panel.tsx',
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
});
