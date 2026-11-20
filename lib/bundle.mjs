// Text patches for Kilo's minified renderer entry bundle. They target the
// react-markdown internals (stable library code), not Kilo's own code, and match
// minified identifiers by shape so they survive rebuilds.

export const IMPORT_LINE =
  'import{r as __kmR,k as __kmK,p as __kmP}from"./kilo-math/kilo-math.js";';
export const MARKER = '/*kilo-latex-patch*/';

const ID = '[\\w$]+';

// react-markdown createProcessor(options):
//   let t=e.rehypePlugins||D,n=e.remarkPlugins||D,r=e.remarkRehypeOptions?{...e.remarkRehypeOptions,...X}:X;
//   return unified().use(remarkParse).use(n).use(remarkRehype,r).use(t)
const PROCESSOR = new RegExp(
  `(\\{let (${ID})=(${ID})\\.rehypePlugins\\|\\|(${ID}),(${ID})=\\3\\.remarkPlugins\\|\\|\\4,(${ID})=\\3\\.remarkRehypeOptions\\?\\{\\.\\.\\.\\3\\.remarkRehypeOptions,\\.\\.\\.(${ID})\\}:\\7;return ${ID}\\(\\)\\.use\\(${ID}\\)\\.use\\(\\5\\))(\\.use\\(${ID},\\6\\))(\\.use\\(\\2\\)\\})`,
  'g',
);

// react-markdown createFile(options):
//   let t=e.children||``,n=new VFile;return typeof t==`string`?n.value=t:...
const CREATE_FILE = new RegExp(
  `(\\{let (${ID})=(${ID})\\.children\\|\\|(?:\`\`|""|''),(${ID})=new ${ID};return typeof \\2==(?:\`string\`|"string"|'string')\\?\\4\\.value=)\\2:`,
  'g',
);

export function isPatched(code) {
  return code.includes(MARKER);
}

export function patchBundle(code) {
  if (isPatched(code)) throw new Error('bundle already patched');

  const procMatches = [...code.matchAll(PROCESSOR)];
  if (procMatches.length !== 1) {
    throw new Error(
      `could not find react-markdown processor (found ${procMatches.length} matches). ` +
        'Kilo changed its bundle; the patch needs an update.',
    );
  }
  const fileMatches = [...code.matchAll(CREATE_FILE)];
  if (fileMatches.length !== 1) {
    throw new Error(
      `could not find react-markdown createFile (found ${fileMatches.length} matches). ` +
        'Kilo changed its bundle; the patch needs an update.',
    );
  }

  let out = code.replace(PROCESSOR, (_m, pre, _t, _e, _d, _n, _r, _x, rehype, tail) =>
    `${pre}.use(__kmR)${rehype}.use(__kmK)${tail}`,
  );
  out = out.replace(CREATE_FILE, (_m, pre, t) => `${pre}__kmP(${t}):`);
  return `${IMPORT_LINE}${MARKER}${out}`;
}
