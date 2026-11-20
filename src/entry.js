// Bundled into dist/kilo-math/kilo-math.js and imported by Kilo's renderer.
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { preprocessMath } from './preprocess.js';

function injectCss() {
  try {
    if (typeof document === 'undefined') return;
    if (document.getElementById('kilo-latex-patch-css')) return;
    const link = document.createElement('link');
    link.id = 'kilo-latex-patch-css';
    link.rel = 'stylesheet';
    link.href = new URL('./katex.min.css', import.meta.url).href;
    document.head.appendChild(link);

    const style = document.createElement('style');
    style.id = 'kilo-latex-patch-style';
    style.textContent = [
      '.aui-md .katex-display{overflow-x:auto;overflow-y:hidden;padding:2px 0;margin:0.6em 0}',
      '.aui-md .katex{font-size:1.1em}',
      '.aui-md .katex-error{color:inherit!important;opacity:.75;font-family:ui-monospace,monospace;font-size:.9em}',
    ].join('\n');
    document.head.appendChild(style);
  } catch {
    /* never break the app */
  }
}

injectCss();

const remarkMathPlugin = function () {
  return remarkMath.call(this, { singleDollarTextMath: false });
};

const rehypeKatexPlugin = function () {
  const transform = rehypeKatex.call(this, {
    throwOnError: false,
    strict: 'ignore',
    output: 'htmlAndMathml',
  });
  return function (tree, file) {
    try {
      return transform(tree, file);
    } catch {
      return tree;
    }
  };
};

function safePreprocess(text) {
  try {
    return preprocessMath(text);
  } catch {
    return text;
  }
}

export { remarkMathPlugin as r, rehypeKatexPlugin as k, safePreprocess as p };
