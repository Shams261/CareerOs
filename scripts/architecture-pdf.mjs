/**
 * Builds docs/architecture/SILSILA-ARCHITECTURE.pdf from SILSILA-ARCHITECTURE.md (WI-145).
 *
 *   node scripts/architecture-pdf.mjs          # sync the diagrams into the Markdown, build the PDF
 *   node scripts/architecture-pdf.mjs --sync   # only copy diagrams/*.mmd into the Markdown
 *
 * The diagrams' sources are docs/architecture/diagrams/*.mmd. In the Markdown each sits between
 * `<!-- diagram: name -->` and `<!-- /diagram -->`; this script replaces what is between them,
 * so edit the .mmd file, never the copy. The page is rendered in Playwright's Chromium with
 * `marked` and `mermaid` from jsDelivr at pinned versions (no new dependency), the app's own
 * fonts, a cover, a contents page with page numbers (two passes, read back with poppler's
 * `pdftotext` when it is installed) and numbered pages.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const DIR = 'docs/architecture';
const MD = join(DIR, 'SILSILA-ARCHITECTURE.md');
const PDF = join(DIR, 'SILSILA-ARCHITECTURE.pdf');
const MARKED = 'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js';
const MERMAID =
  'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js';

function sync() {
  const diagrams = Object.fromEntries(
    readdirSync(join(DIR, 'diagrams'))
      .filter((f) => f.endsWith('.mmd'))
      .map((f) => [
        f.replace(/\.mmd$/, ''),
        readFileSync(join(DIR, 'diagrams', f), 'utf8').trimEnd(),
      ]),
  );
  const md = readFileSync(MD, 'utf8').replace(
    /<!-- diagram: ([\w-]+) -->[\s\S]*?<!-- \/diagram -->/g,
    (whole, name) => {
      if (!diagrams[name]) throw new Error(`No diagrams/${name}.mmd`);
      return `<!-- diagram: ${name} -->\n\n\`\`\`mermaid\n${diagrams[name]}\n\`\`\`\n\n<!-- /diagram -->`;
    },
  );
  writeFileSync(MD, md);
  return md;
}

const font = (file) =>
  `data:font/woff2;base64,${readFileSync(join('src/assets/fonts', file)).toString('base64')}`;

function html(md, pages) {
  const date = new Date().toISOString().slice(0, 10);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Silsila architecture</title>
<style>
@font-face { font-family: Inter; src: url(${font('inter-latin.woff2')}) format('woff2'); font-weight: 400 700; }
@font-face { font-family: Cormorant; src: url(${font('cormorant-garamond-600.woff2')}) format('woff2'); font-weight: 600; }
:root { --ink:#1B1A16; --ink2:#4F4B44; --meta:#716C63; --teal:#1E6B5B; --border:#E6E1D7; --canvas:#F4F1EA; --soft:#FBF9F4; }
@page { size: A4; margin: 18mm 16mm 20mm; }
html { font-family: Inter, -apple-system, sans-serif; color: var(--ink); font-size: 10pt; line-height: 1.5; }
body { margin: 0; }
h1, h2, h3 { font-family: Cormorant, Georgia, serif; font-weight: 600; color: var(--ink); line-height: 1.15; text-wrap: balance; }
h2 { font-size: 22pt; margin: 0 0 8pt; padding-top: 2pt; border-bottom: 1px solid var(--border); padding-bottom: 4pt; break-before: page; }
h3 { font-size: 14.5pt; margin: 16pt 0 6pt; break-after: avoid; }
h4 { font-size: 10.5pt; margin: 12pt 0 4pt; break-after: avoid; }
p, li { orphans: 3; widows: 3; }
a { color: var(--teal); text-decoration: none; }
code { font-family: ui-monospace, Menlo, monospace; font-size: 8.6pt; background: var(--soft); border: 1px solid var(--border); border-radius: 3px; padding: 0 2px; }
pre:not(.mermaid) { background: var(--soft); border: 1px solid var(--border); border-radius: 6px; padding: 8pt; font-size: 8pt; overflow: hidden; white-space: pre-wrap; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 8.6pt; break-inside: auto; }
th, td { border-bottom: 1px solid var(--border); padding: 4pt 5pt; text-align: left; vertical-align: top; }
th { color: var(--ink2); font-weight: 600; background: var(--soft); }
tr { break-inside: avoid; }
.figure { break-inside: avoid; margin: 8pt 0 12pt; padding: 8pt; border: 1px solid var(--border); border-radius: 8px; text-align: center; }
.figure svg { width: 100% !important; max-width: 100% !important; height: auto; max-height: 228mm; }
.cover { height: 257mm; display: flex; flex-direction: column; justify-content: space-between; break-after: page; }
.cover .band { background: var(--canvas); border-radius: 12px; padding: 28mm 16mm; }
.cover h1 { font-size: 44pt; margin: 0 0 6pt; }
.cover .tag { font-size: 13pt; color: var(--teal); margin: 0 0 18pt; }
.cover .sub { font-size: 11pt; color: var(--ink2); max-width: 130mm; }
.cover .meta { font-size: 9pt; color: var(--meta); }
.toc h2 { break-before: auto; }
.toc ol { list-style: none; padding: 0; margin: 0; }
.toc li { display: flex; gap: 6pt; padding: 3pt 0; border-bottom: 1px dotted var(--border); font-size: 10.5pt; }
.toc li.sub { padding-left: 14pt; font-size: 9.2pt; color: var(--ink2); }
.toc .t { flex: 1; }
.toc .n { color: var(--meta); font-variant-numeric: tabular-nums; }
</style>
<script src="${MARKED}"></script><script src="${MERMAID}"></script>
</head><body>
<section class="cover"><div class="band">
<h1>Silsila</h1>
<p class="tag">Plan once. Show up daily.</p>
<p class="sub">Architecture of a single-owner execution system: modules, data, flows, deployment, security and the trade-offs behind them. Written from the repository as it stands.</p>
</div>
<p class="meta">usesilsila.me · release 3.0.0 + Unreleased (WI-120 to WI-145) · ${date}</p></section>
<section class="toc"><h2>Contents</h2><ol id="toc"></ol></section>
<main id="doc"></main>
<script>
const PAGES = ${JSON.stringify(pages ?? {})};
const md = ${JSON.stringify(md)};
document.getElementById('doc').innerHTML = marked.parse(
  md.replace(/^# .*\\n/, '').replace(/<!-- \\/?diagram[^>]*-->/g, ''),
);
// The Markdown's own intro is its first section; the PDF opens on the cover instead.
const toc = document.getElementById('toc');
for (const h of document.querySelectorAll('#doc h2, #doc h3')) {
  const li = document.createElement('li');
  if (h.tagName === 'H3') li.className = 'sub';
  // First pass: a placeholder, so no contents line reads exactly like its heading.
  const n = PAGES[h.textContent.trim()] ?? '00';
  li.innerHTML = '<span class="t"></span><span class="n">' + n + '</span>';
  li.firstChild.textContent = h.textContent;
  toc.appendChild(li);
}
for (const code of document.querySelectorAll('pre code.language-mermaid')) {
  const div = document.createElement('div');
  div.className = 'figure';
  const pre = document.createElement('pre');
  pre.className = 'mermaid';
  pre.textContent = code.textContent;
  div.appendChild(pre);
  code.parentElement.replaceWith(div);
}
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  securityLevel: 'strict',
  themeVariables: {
    fontFamily: 'Inter, sans-serif', fontSize: '15px',
    primaryColor: '#FBF9F4', primaryBorderColor: '#1E6B5B', primaryTextColor: '#1B1A16',
    lineColor: '#4F4B44', secondaryColor: '#E8F1EE', tertiaryColor: '#F4F1EA',
    clusterBkg: '#F4F1EA', clusterBorder: '#E6E1D7',
    actorBkg: '#FBF9F4', actorBorder: '#1E6B5B', noteBkgColor: '#F4F1EA', noteBorderColor: '#E6E1D7',
  },
  flowchart: { htmlLabels: true, useMaxWidth: true },
  sequence: { useMaxWidth: true, wrap: true },
  er: { useMaxWidth: true },
});
// Parse each diagram first, so a syntax error names its diagram.
(async () => {
  // Measure labels in the embedded fonts, or Mermaid sizes boxes for a fallback and clips text.
  await document.fonts.load('15px Inter');
  await document.fonts.ready;
  for (const pre of document.querySelectorAll('pre.mermaid')) {
    try {
      await mermaid.parse(pre.textContent);
    } catch (e) {
      document.body.dataset.error =
        pre.textContent.split('\\n').slice(0, 3).join(' | ') + ' :: ' + (e?.message ?? String(e));
      document.body.dataset.ready = 'error';
      return;
    }
  }
  await mermaid.run({ querySelector: '.mermaid' });
  document.body.dataset.ready = '1';
})().catch((e) => {
  document.body.dataset.error = e?.message ?? String(e);
  document.body.dataset.ready = 'error';
});
</script></body></html>`;
}

async function render(page, md, pages) {
  page.removeAllListeners('pageerror');
  page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
  await page.setContent(html(md, pages), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.dataset.ready, null, {
    timeout: 180_000,
  });
  const state = await page.evaluate(() => document.body.dataset);
  if (state.ready === 'error') throw new Error(`mermaid: ${state.error}`);
  await page.pdf({
    path: PDF,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate:
      '<div style="width:100%;font:8px Inter,sans-serif;color:#716C63;padding:0 16mm;display:flex;justify-content:space-between"><span>Silsila architecture</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
  });
}

/** The page each heading landed on, read back from the first pass. */
function headingPages(md) {
  try {
    const text = execFileSync('pdftotext', ['-layout', PDF, '-'], {
      encoding: 'utf8',
    });
    const pages = text.split('\f');
    const found = {};
    const heads = [...md.matchAll(/^#{2,3} (.+)$/gm)].map((m) =>
      m[1].replace(/`/g, '').trim(),
    );
    for (const h of heads) {
      // Skip the cover and the contents, which list every heading.
      const i = pages.findIndex(
        (p, n) => n > 1 && p.split('\n').some((l) => l.trim() === h),
      );
      if (i >= 0) found[h] = i + 1;
    }
    return found;
  } catch {
    return null;
  }
}

const md = sync();
if (!process.argv.includes('--sync')) {
  const browser = await chromium.launch();
  await render(await browser.newPage(), md, null);
  const pages = headingPages(md);
  if (pages) await render(await browser.newPage(), md, pages);
  await browser.close();
  console.log(
    `${PDF} written${pages ? `, contents numbered (${Object.keys(pages).length} headings)` : ', contents without numbers (pdftotext not found)'}`,
  );
  if (!existsSync(PDF)) process.exit(1);
}
