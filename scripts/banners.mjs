// Generates assets/header.svg and assets/footer.svg for the README.
// Kilo look: near-black surface, #ffdd00 brand yellow, Manrope headings,
// Source Code Pro mono. Fonts are subset + embedded so GitHub renders them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'assets');
fs.mkdirSync(out, { recursive: true });

const C = {
  bg: '#141414',
  panel: '#1f1f1f',
  line: '#2b2b2b',
  text: '#f5f5f5',
  muted: '#8a8a8a',
  yellow: '#ffdd00',
  ink: '#1f1f1f',
};

// ---------- content ----------
const TITLE = 'kilo-latex-patch';
const SUB = 'LaTeX cho chat Kilo Desktop';
const RAW = '$$ \\sum_{k=1}^{n} k^2 = \\frac{n(n+1)(2n+1)}{6} $$';
const TEX = '\\sum_{k=1}^{n} k^2 = \\frac{n(n+1)(2n+1)}{6}';
const TAG_RAW = 'trước';
const TAG_OK = 'sau khi vá';
const BADGE = 'Kilo #70 fix';
const FOOT = 'unofficial · MIT · not affiliated with Kilo';

// ---------- fonts ----------
async function fontFace(family, file, text, wght) {
  const buf = fs.readFileSync(path.join(root, 'node_modules', file));
  const sub = await subsetFont(buf, text, { targetFormat: 'woff2', variationAxes: { wght } });
  return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${sub.toString('base64')}) format('woff2');font-weight:${wght}}`;
}
const MANROPE = '@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2';
const MONO = '@fontsource-variable/source-code-pro/files/source-code-pro-latin-wght-normal.woff2';
const MONO_VI = '@fontsource-variable/source-code-pro/files/source-code-pro-vietnamese-wght-normal.woff2';

// ---------- math ----------
function texToSvg(tex) {
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const doc = mathjax.document('', {
    InputJax: new TeX({ packages: AllPackages }),
    OutputJax: new SVG({ fontCache: 'none' }),
  });
  const node = doc.convert(tex, { display: true });
  const svg = adaptor.innerHTML(node);
  const vb = /viewBox="([^"]+)"/.exec(svg)[1].split(/\s+/).map(Number);
  const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return { vb, inner };
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- header ----------
async function header() {
  const W = 960;
  const H = 300;
  const monoText = RAW + TAG_RAW + TAG_OK + BADGE;
  const css = [
    await fontFace('Manrope', MANROPE, TITLE, 800),
    await fontFace('Mono', MONO, monoText + SUB, 500),
    await fontFace('MonoVi', MONO_VI, TAG_RAW + TAG_OK + SUB, 500),
  ].join('');

  const math = texToSvg(TEX);
  // Fit the rendered formula into the right half of the panel.
  const mathH = 64;
  const mathW = (math.vb[2] / math.vb[3]) * mathH;

  // Panel geometry
  const px = 40;
  const py = 150;
  const pw = W - 80;
  const ph = 110;
  const cx = px + pw / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="kilo-latex-patch: LaTeX cho chat Kilo Desktop">
<style>${css}
.t{font-family:Manrope,sans-serif;font-weight:800;fill:${C.text};letter-spacing:-1.5px}
.m{font-family:Mono,MonoVi,ui-monospace,monospace;font-weight:500}
.raw{animation:raw 7s infinite}
.ok{animation:ok 7s infinite}
.tagRaw{animation:raw 7s infinite}
.tagOk{animation:ok 7s infinite}
.cur{animation:blink 1s steps(1) infinite}
.px rect{animation:px 1.4s infinite}
.px rect:nth-child(2){animation-delay:.15s}.px rect:nth-child(3){animation-delay:.3s}.px rect:nth-child(4){animation-delay:.45s}
@keyframes raw{0%,38%{opacity:1;transform:translateY(0)}46%,92%{opacity:0;transform:translateY(-8px)}100%{opacity:1;transform:translateY(0)}}
@keyframes ok{0%,40%{opacity:0;transform:translateY(8px)}50%,90%{opacity:1;transform:translateY(0)}98%,100%{opacity:0;transform:translateY(8px)}}
@keyframes blink{0%,50%{opacity:1}51%,100%{opacity:0}}
@keyframes px{0%,100%{opacity:.25}40%{opacity:1}}
@media (prefers-reduced-motion:reduce){.raw,.tagRaw{opacity:0;animation:none}.ok,.tagOk{opacity:1;animation:none}.cur,.px rect{animation:none}}
</style>
<rect width="${W}" height="${H}" rx="16" fill="${C.bg}"/>
<g class="px" transform="translate(40 52)">
  <rect x="0" y="0" width="14" height="14" fill="${C.yellow}"/>
  <rect x="18" y="0" width="14" height="14" fill="${C.yellow}"/>
  <rect x="0" y="18" width="14" height="14" fill="${C.yellow}"/>
  <rect x="18" y="18" width="14" height="14" fill="${C.yellow}"/>
</g>
<text x="90" y="80" class="t" font-size="44">${esc(TITLE)}</text>
<text x="92" y="112" class="m" font-size="17" fill="${C.muted}">${esc(SUB)}</text>
<rect x="${W - 196}" y="52" width="156" height="32" rx="16" fill="${C.yellow}"/>
<text x="${W - 118}" y="73" class="m" font-size="14" fill="${C.ink}" text-anchor="middle">${esc(BADGE)}</text>

<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="12" fill="${C.panel}" stroke="${C.line}"/>
<g class="tagRaw" style="transform-box:fill-box;transform-origin:center"><text x="${px + 20}" y="${py + 26}" class="m" font-size="12" fill="${C.muted}">${esc(TAG_RAW)}</text></g>
<g class="tagOk" style="transform-box:fill-box;transform-origin:center"><text x="${px + 20}" y="${py + 26}" class="m" font-size="12" fill="${C.yellow}">${esc(TAG_OK)}</text></g>
<g class="raw">
  <text x="${cx}" y="${py + 68}" class="m" font-size="19" fill="${C.text}" text-anchor="middle">${esc(RAW)}</text>
</g>
<g class="ok">
  <svg x="${cx - mathW / 2}" y="${py + 24}" width="${mathW}" height="${mathH}" viewBox="${math.vb.join(' ')}" color="${C.text}" style="color:${C.text}">${math.inner}</svg>
</g>
</svg>
`;
}

// ---------- footer ----------
async function footer() {
  const W = 960;
  const H = 64;
  const css = await fontFace('Mono', MONO, FOOT, 500);
  const n = 12;
  const blocks = Array.from({ length: n }, (_, i) =>
    `<rect x="${40 + i * 14}" y="27" width="10" height="10" fill="${C.yellow}" style="animation-delay:${(i * 0.12).toFixed(2)}s"/>`,
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(FOOT)}">
<style>${css}
.m{font-family:Mono,ui-monospace,monospace;font-weight:500}
.b rect{opacity:.2;animation:b 2.4s infinite}
@keyframes b{0%,100%{opacity:.2}20%{opacity:1}45%{opacity:.2}}
@media (prefers-reduced-motion:reduce){.b rect{animation:none;opacity:1}}
</style>
<rect width="${W}" height="${H}" rx="14" fill="${C.bg}"/>
<g class="b">${blocks}</g>
<text x="${W - 40}" y="37" class="m" font-size="14" fill="${C.muted}" text-anchor="end">${FOOT.replace(/·/g, '<tspan fill="#ffdd00">·</tspan>')}</text>
</svg>
`;
}

fs.writeFileSync(path.join(out, 'header.svg'), await header());
fs.writeFileSync(path.join(out, 'footer.svg'), await footer());
for (const f of ['header.svg', 'footer.svg']) {
  console.log(f, (fs.statSync(path.join(out, f)).size / 1024).toFixed(1), 'KB');
}
