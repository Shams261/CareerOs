import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';

const root = process.cwd();
function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? markdownFiles(path)
      : extname(path) === '.md'
        ? [path]
        : [];
  });
}
const files = [
  ...readdirSync(root)
    .filter((name) => name.endsWith('.md'))
    .map((name) => resolve(root, name)),
  ...markdownFiles(resolve(root, 'docs')),
  ...markdownFiles(resolve(root, '.github')),
];
let failures = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const match of text.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;
    const local = decodeURIComponent(target.split('#')[0]);
    const path = resolve(dirname(file), local);
    if (
      !existsSync(path) ||
      (!statSync(path).isFile() && !statSync(path).isDirectory())
    ) {
      console.error(`${file}: broken local link ${target}`);
      failures++;
    }
  }
}
if (failures) process.exit(1);
console.log(
  `Validated local file targets in ${files.length} Markdown files. External URLs, headings and Mermaid rendering require review.`,
);
