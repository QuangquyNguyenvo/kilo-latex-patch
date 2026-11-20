import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'kilo-math');
const require = createRequire(import.meta.url);

fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });

await build({
  entryPoints: [path.join(root, 'src', 'entry.js')],
  outfile: path.join(out, 'kilo-math.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome120',
  minify: true,
  legalComments: 'eof',
});

const katexDist = path.join(path.dirname(require.resolve('katex/package.json')), 'dist');
fs.copyFileSync(path.join(katexDist, 'katex.min.css'), path.join(out, 'katex.min.css'));
for (const f of fs.readdirSync(path.join(katexDist, 'fonts'))) {
  // KaTeX lists woff2 first; woff/ttf are fallbacks Chromium never needs.
  if (f.endsWith('.woff2')) fs.copyFileSync(path.join(katexDist, 'fonts', f), path.join(out, 'fonts', f));
}

// MIT notices for the bundled third-party code.
const notices = ['katex', 'remark-math', 'rehype-katex']
  .map((name) => {
    const dir = path.join(root, 'node_modules', name);
    const lic = fs.readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
    return lic ? `===== ${name} =====\n${fs.readFileSync(path.join(dir, lic), 'utf8').trim()}\n` : '';
  })
  .join('\n');
fs.writeFileSync(path.join(out, 'THIRD_PARTY_LICENSES.txt'), notices);

// Drop the woff/ttf fallbacks from the CSS so it never requests missing files.
const cssPath = path.join(out, 'katex.min.css');
const css = fs
  .readFileSync(cssPath, 'utf8')
  .replace(/,url\(fonts\/[^)]+\.woff\) format\("woff"\)/g, '')
  .replace(/,url\(fonts\/[^)]+\.ttf\) format\("truetype"\)/g, '');
fs.writeFileSync(cssPath, css);

const files = fs.readdirSync(out, { recursive: true });
console.log(`built ${files.length} files into dist/kilo-math`);
