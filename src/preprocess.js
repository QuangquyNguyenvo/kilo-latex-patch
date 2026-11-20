// Normalise the math delimiters LLMs actually emit into the ones remark-math
// understands, without touching code blocks or inline code.
//
//   \[ ... \]          -> display block  ($$ on their own lines)
//   \( ... \)          -> inline math    ($$...$$ inside a line = inline)
//   $$ ... $$ (1 line) -> display block
//   $...$              -> inline math, only with pandoc's rules so "$5 and $10"
//                         stays plain text: no space after the opening $, no
//                         space before the closing $, no digit right after it.
//
// remark-math is configured with singleDollarTextMath:false, so every inline
// formula is rewritten to $$...$$ here, where the heuristics above apply.

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

export function preprocessMath(text) {
  if (typeof text !== 'string' || text.length === 0) return text;
  if (!/[$\\]/.test(text)) return text;

  const lines = text.split('\n');
  const out = [];
  let prose = [];
  let fence = null;

  const flush = () => {
    if (prose.length) {
      out.push(transformProse(prose.join('\n')));
      prose = [];
    }
  };

  for (const line of lines) {
    if (fence) {
      out.push(line);
      const m = FENCE.exec(line);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) {
        fence = null;
      }
      continue;
    }
    const m = FENCE.exec(line);
    if (m) {
      flush();
      fence = m[1];
      out.push(line);
      continue;
    }
    prose.push(line);
  }
  flush();
  return out.join('\n');
}

// Split prose into inline-code spans (left untouched) and text.
function transformProse(src) {
  let result = '';
  let i = 0;
  while (i < src.length) {
    const tick = src.indexOf('`', i);
    if (tick === -1) {
      result += transformText(src.slice(i));
      break;
    }
    result += transformText(src.slice(i, tick));
    let run = 1;
    while (src[tick + run] === '`') run++;
    const fenceStr = '`'.repeat(run);
    let close = -1;
    let search = tick + run;
    while (true) {
      const c = src.indexOf(fenceStr, search);
      if (c === -1) break;
      if (src[c + run] === '`') {
        let k = c;
        while (src[k] === '`') k++;
        search = k;
        continue;
      }
      close = c;
      break;
    }
    if (close === -1) {
      // Unclosed backticks: treat literally.
      result += fenceStr;
      i = tick + run;
    } else {
      result += src.slice(tick, close + run);
      i = close + run;
    }
  }
  return result;
}

function isEscaped(s, idx) {
  let n = 0;
  for (let k = idx - 1; k >= 0 && s[k] === '\\'; k--) n++;
  return n % 2 === 1;
}

function transformText(s) {
  if (!/[$\\]/.test(s)) return s;

  // \[ ... \]  -> display
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (m, body, off, str) => {
    if (isEscaped(str, off)) return m;
    return `\n$$\n${body.trim()}\n$$\n`;
  });

  // \( ... \)  -> inline
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (m, body, off, str) => {
    if (isEscaped(str, off)) return m;
    return inlineMath(body.trim());
  });

  // A line that is only "$$ ... $$" -> display block.
  s = s.replace(/^([ \t]*)\$\$(?!\$)([^\n]*?[^\s$][^\n]*?)\$\$[ \t]*$/gm, (m, indent, body) => {
    return `${indent}$$\n${body.trim()}\n$$`;
  });

  // Single-dollar inline math with pandoc's heuristics.
  s = convertSingleDollar(s);
  return s;
}

function inlineMath(body) {
  // remark-math inline uses a run of $; content must not contain that run.
  // $$...$$ is enough unless the body itself contains "$$".
  const fenceStr = body.includes('$$') ? '$$$' : '$$';
  const pad = body.startsWith('$') || body.endsWith('$') ? ' ' : '';
  return `${fenceStr}${pad}${body}${pad}${fenceStr}`;
}

function convertSingleDollar(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch !== '$') {
      out += ch;
      i++;
      continue;
    }
    // Skip over existing $$ runs (already remark-math syntax) verbatim.
    if (s[i + 1] === '$') {
      let j = i;
      while (s[j] === '$') j++;
      const runStr = s.slice(i, j);
      const close = s.indexOf(runStr, j);
      if (close === -1) {
        out += runStr;
        i = j;
      } else {
        let end = close;
        while (s[end] === '$') end++;
        out += s.slice(i, end);
        i = end;
      }
      continue;
    }
    if (isEscaped(s, i)) {
      out += ch;
      i++;
      continue;
    }
    const next = s[i + 1];
    if (next === undefined || /\s/.test(next)) {
      out += ch;
      i++;
      continue;
    }
    // Find a valid closing $ on the same line.
    let j = i + 1;
    let close = -1;
    while (j < s.length && s[j] !== '\n') {
      if (s[j] === '$' && !isEscaped(s, j)) {
        if (s[j + 1] === '$') break; // hit a $$, give up
        const prev = s[j - 1];
        const after = s[j + 1];
        if (!/\s/.test(prev) && !(after !== undefined && /[0-9]/.test(after))) {
          close = j;
        }
        break;
      }
      j++;
    }
    if (close === -1) {
      out += ch;
      i++;
      continue;
    }
    out += inlineMath(s.slice(i + 1, close));
    i = close + 1;
  }
  return out;
}
