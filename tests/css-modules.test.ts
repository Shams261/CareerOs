import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CSS Modules (WI-135, WI-136): a module renames its keyframes, so an animation that uses a
 * keyframes name from `app.css` must say `global(name)`, or it silently stops running. Every
 * module's own classes are also used by the code beside it.
 */
const ROOT = process.cwd();
function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.module.css')) out.push(p);
  }
  return out;
}
const modules = walk(join(ROOT, 'src'));
function code(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) code(p, out);
    else if (name.endsWith('.tsx')) out.push(readFileSync(p, 'utf8'));
  }
  return out;
}
const tsx = code(join(ROOT, 'src'));
const source = (file: string) =>
  readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('CSS Modules (WI-136)', () => {
  it('exist', () => {
    expect(modules.length).toBeGreaterThan(0);
  });

  it('name keyframes from app.css as global(…)', () => {
    const wrong = modules.flatMap((file) => {
      const css = source(file);
      const own = new Set(
        [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]),
      );
      return [...css.matchAll(/animation(?:-name)?\s*:\s*([a-z][\w-]*)/g)]
        .map((m) => m[1])
        .filter(
          (name) =>
            !['global', 'none', 'inherit', 'initial', 'unset'].includes(name) &&
            !own.has(name),
        )
        .map((name) => `${relative(ROOT, file)}: ${name}`);
    });
    expect(wrong).toEqual([]);
  });

  it('style only classes the code reads', () => {
    // The files that import the module, wherever they live (the roadmap page reads its feature's).
    const reading = (file: string) => {
      const name = file.split('/').pop()!;
      return tsx.filter((t) => t.includes(`/${name}'`)).join('\n');
    };
    const unread = modules.flatMap((file) => {
      const css = source(file).replace(/:global\([^)]*\)/g, '');
      const local = new Set(
        [...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]),
      );
      const ts = reading(file);
      return [...local]
        .filter(
          (c) => !ts.includes(`styles['${c}']`) && !ts.includes(`styles.${c}`),
        )
        .map((c) => `${relative(ROOT, file)}: ${c}`);
    });
    expect(unread).toEqual([]);
  });
});
