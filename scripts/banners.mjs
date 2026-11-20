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
const RAW = '$$\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}$$';
const TEX = '\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}';
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
  const H = 340;
  const monoText = RAW + TAG_RAW + TAG_OK + BADGE;
  const css = [
    await fontFace('Manrope', MANROPE, TITLE, 800),
    await fontFace('Mono', MONO, monoText + SUB, 500),
    await fontFace('MonoVi', MONO_VI, TAG_RAW + TAG_OK + SUB, 500),
  ].join('');

  const math = texToSvg(TEX);
  const mathH = 74;
  const mathW = (math.vb[2] / math.vb[3]) * mathH;

  // Two cards side by side: raw LaTeX typed out (before) -> rendered (after).
  const cy = 150;
  const ch = 150;
  const cw = 380;
  const lx = 40;
  const rx = W - 40 - cw;
  const fs = 14;
  const charW = fs * 0.6; // Source Code Pro advance width
  const rawW = RAW.length * charW;
  const rawX = lx + (cw - rawW) / 2;
  const rawY = cy + ch / 2 + 22;
  const T = 6; // loop length (s); typing 0-30%, result 38-46%, hold, reset 92%+
  const steps = RAW.length;
  const widths = Array.from({ length: steps + 1 }, (_, i) => (i * charW).toFixed(1)).join(';');
  const times = Array.from({ length: steps + 1 }, (_, i) => ((0.3 * i) / steps).toFixed(4)).join(';');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="kilo-latex-patch: LaTeX cho chat Kilo Desktop">
<style>${css}
.t{font-family:Manrope,sans-serif;font-weight:800;fill:${C.text};letter-spacing:-1.5px}
.m{font-family:Mono,MonoVi,ui-monospace,monospace;font-weight:500}
.px rect{animation:px 1.4s infinite}
.px rect:nth-child(2){animation-delay:.15s}.px rect:nth-child(3){animation-delay:.3s}.px rect:nth-child(4){animation-delay:.45s}
@keyframes px{0%,100%{opacity:.25}40%{opacity:1}}
.ok{animation:ok ${T}s infinite}
@keyframes ok{0%,38%{opacity:0;transform:translateY(10px)}46%,90%{opacity:1;transform:translateY(0)}97%,100%{opacity:0;transform:translateY(0)}}
.arrow{animation:arrow ${T}s infinite}
@keyframes arrow{0%,30%{opacity:.3}38%,100%{opacity:1}}
.okCard{animation:okCard ${T}s infinite}
@keyframes okCard{0%,38%{stroke:${C.line}}46%,90%{stroke:${C.yellow}}97%,100%{stroke:${C.line}}}
@media (prefers-reduced-motion:reduce){.px rect,.ok,.arrow,.okCard{animation:none}.ok{opacity:1}.okCard{stroke:${C.yellow}}}
</style>
<defs><clipPath id="type"><rect x="${rawX}" y="${rawY - 24}" height="34" width="${rawW}">
<animate attributeName="width" dur="${T}s" repeatCount="indefinite" calcMode="discrete" values="${widths};${rawW.toFixed(1)}" keyTimes="${times};1"/>
</rect></clipPath></defs>
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

<rect x="${lx}" y="${cy}" width="${cw}" height="${ch}" rx="12" fill="${C.panel}" stroke="${C.line}" stroke-width="1.5"/>
<text x="${lx + 20}" y="${cy + 30}" class="m" font-size="13" fill="${C.muted}">${esc(TAG_RAW)}</text>
<g clip-path="url(#type)"><text x="${rawX}" y="${rawY}" class="m" font-size="${fs}" fill="${C.text}">${esc(RAW)}</text></g>

<g class="arrow" transform="translate(${W / 2 - 22} ${cy + ch / 2 - 11})">
<rect x="0" y="8" width="30" height="6" fill="${C.yellow}"/>
<path d="M26 0 L44 11 L26 22 Z" fill="${C.yellow}"/>
</g>

<rect class="okCard" x="${rx}" y="${cy}" width="${cw}" height="${ch}" rx="12" fill="${C.panel}" stroke="${C.line}" stroke-width="1.5"/>
<text x="${rx + 20}" y="${cy + 30}" class="m" font-size="13" fill="${C.yellow}">${esc(TAG_OK)}</text>
<g class="ok">
<svg x="${rx + (cw - mathW) / 2}" y="${cy + 50}" width="${mathW}" height="${mathH}" viewBox="${math.vb.join(' ')}" color="${C.text}" style="color:${C.text}">${math.inner}</svg>
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
