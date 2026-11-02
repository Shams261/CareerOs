import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';

/**
 * Tailwind is the way new UI is styled (WI-137). The hand-written styles sit in Tailwind's
 * components layer, so a utility on an element wins over them. These guards keep that true:
 * - the layer order;
 * - no hand-written class that Tailwind would also make a utility (since the utility would now
 *   win, a `.w-40` or `.block` rule would silently change);
 * - the theme: Silsila's colours only.
 */
const ROOT = process.cwd();
const APP = join(ROOT, 'src/app');
const TW = join(ROOT, 'node_modules/tailwindcss');
const globals = readFileSync(join(APP, 'globals.css'), 'utf8');

async function tailwind() {
  // The real entry without the hand-written files: Tailwind, the variants and the theme.
  const css = globals
    .replace("@import './app.css' layer(components);", '')
    .replace("@import './design-tokens.css';", '');
  return compile(css, {
    base: APP,
    loadStylesheet: async (id, base) => {
      const path =
        id === 'tailwindcss'
          ? join(TW, 'index.css')
          : id.startsWith('tailwindcss/')
            ? join(TW, id.slice('tailwindcss/'.length))
            : resolve(base, id);
      return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
    },
  });
}
const utilities = (css: string) =>
  css.includes('@layer utilities')
    ? css.slice(css.indexOf('@layer utilities'))
    : '';

describe('Tailwind (WI-137)', () => {
  it('puts the hand-written styles below the utilities', () => {
    const lines = globals.split('\n').filter((l) => l.startsWith('@import'));
    expect(lines).toEqual([
      "@import 'tailwindcss';",
      "@import './design-tokens.css';",
      "@import './app.css' layer(components);",
    ]);
  });

  it('shares no class name between app.css and the utilities', async () => {
    const css = readFileSync(join(APP, 'app.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/url\([^)]*\)/g, '');
    const classes = [
      ...new Set(
        [...css.matchAll(/([^{};]+)\{/g)]
          .filter((m) => !m[1].trim().startsWith('@'))
          .flatMap((m) =>
            [...m[1].matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((c) => c[1]),
          ),
      ),
    ];
    const built = utilities((await tailwind()).build(classes));
    const shared = classes.filter((c) => built.includes(`.${c} {`));
    expect(shared).toEqual([]);
  });

  it('offers Silsila colours and not the default palette', async () => {
    const built = utilities(
      (await tailwind()).build([
        'bg-canvas',
        'text-ink',
        'text-meta',
        'border-divider',
        'bg-red-500',
        'text-gray-600',
      ]),
    );
    expect(built).toContain('background-color: var(--background)');
    expect(built).toContain('color: var(--text-muted)');
    expect(built).not.toContain('.bg-red-500');
    expect(built).not.toContain('.text-gray-600');
  });

  it('has the phone breakpoint of app.css', async () => {
    expect(utilities((await tailwind()).build(['phone:hidden']))).toContain(
      '@media (max-width: 700px)',
    );
  });
});
