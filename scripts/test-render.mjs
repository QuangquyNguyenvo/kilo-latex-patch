// Renders sample LLM answers through the same pipeline shape Kilo uses
// (remark-parse + gfm + remark-rehype) plus the patch, and checks the output.
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { preprocessMath } from '../src/preprocess.js';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const proc = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath, { singleDollarTextMath: false })
  .use(remarkRehype)
  .use(rehypeKatex, { throwOnError: false, strict: 'ignore' })
  .use(rehypeStringify);

const render = (md) => String(proc.processSync(preprocessMath(md)));
const count = (html, cls) => (html.match(new RegExp(`class="${cls}"`, 'g')) || []).length;

let failed = 0;
function check(name, md, { display = 0, inline = 0, contains = [], absent = [] }) {
  const html = render(md);
  const d = count(html, 'katex-display');
  const all = count(html, 'katex');
  const i = all - d;
  const problems = [];
  if (d !== display) problems.push(`display=${d} want ${display}`);
  if (i !== inline) problems.push(`inline=${i} want ${inline}`);
  for (const c of contains) if (!html.includes(c)) problems.push(`missing ${JSON.stringify(c)}`);
  for (const c of absent) if (html.includes(c)) problems.push(`unexpected ${JSON.stringify(c)}`);
  if (problems.length) {
    failed++;
    console.log(`FAIL ${name}: ${problems.join('; ')}\n  in:  ${JSON.stringify(md)}\n  pre: ${JSON.stringify(preprocessMath(md))}`);
  } else console.log(`ok   ${name}`);
}

check('screenshot answer', 'Tổng bình phương:\n\n$$ \\sum_{k=1}^{n} k^2 = \\frac{n(n+1)(2n+1)}{6} $$\n\nVí dụ, với \\(n=3\\): \\(1^2 + 2^2 + 3^2 = 14\\).', { display: 1, inline: 2 });
check('multi-line $$', 'A\n\n$$\nE = mc^2\n$$\n\nB', { display: 1 });
check('\\[ \\]', 'Xem: \\[ a^2+b^2=c^2 \\] xong', { display: 1 });
check('single $ inline', 'Cho $x^2$ và $\\alpha_1$.', { inline: 2 });
check('prices stay text', 'Giá $5 đến $10 mỗi tháng.', { contains: ['$5 đến $10'] });
check('shell var stays text', 'Đặt biến $HOME rồi chạy.', { contains: ['$HOME'] });
check('code block untouched', '```bash\necho $HOME $(pwd) \\(x\\)\n$$ y $$\n```', { contains: ['echo $HOME $(pwd) \\(x\\)', '$$ y $$'] });
check('inline code untouched', 'Dùng `$x$` và `\\(y\\)` nhé', { contains: ['<code>$x$</code>', '<code>\\(y\\)</code>'] });
check('matrix keeps \\\\', '$$\n\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}\n$$', { display: 1, absent: ['katex-error'] });
check('underscores not italic', 'Ta có $a_1 + a_2$ và $b_1*b_2*c$.', { inline: 2, absent: ['<em>'] });
check('escaped dollar', 'Giá là \\$5 và \\$x\\$.', { contains: ['$5'] });
check('table with math', '| a | b |\n|---|---|\n| $x^2$ | $\\sqrt{y}$ |', { inline: 2 });
check('bad latex no crash', '$$\\frac{1}{$$', {});
check('streaming partial stays text', 'Đang gõ: $$\n\\sum_{i=1}', { absent: ['katex-error'] });
check('streaming partial block', 'Xem:\n\n$$\n\\sum_{i=1}', { display: 1 });

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
