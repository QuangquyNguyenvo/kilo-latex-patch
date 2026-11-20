// Small console UI: numbered steps, a progress bar for long copies, colours.
const tty = Boolean(process.stdout.isTTY);
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
export const color = { green: c('32'), red: c('31'), yellow: c('33'), dim: c('90'), bold: c('1') };

export function createUi({ silent = false } = {}) {
  let total = 0;
  let lastPct = -1;
  let lastBucket = 0;
  let barOpen = false;
  const out = (s) => {
    if (!silent) process.stdout.write(s);
  };
  const closeBar = () => {
    if (barOpen) {
      out('\n');
      barOpen = false;
    }
  };
  return {
    begin(n) {
      total = n;
    },
    step(i, msg) {
      closeBar();
      lastPct = -1;
      lastBucket = 0;
      out(`${color.yellow(`[${i}/${total}]`)} ${msg}\n`);
    },
    progress(frac) {
      const pct = Math.max(0, Math.min(100, Math.floor(frac * 100)));
      if (pct === lastPct) return;
      lastPct = pct;
      if (!tty) {
        const bucket = Math.floor(pct / 25);
        if (bucket > lastBucket) {
          lastBucket = bucket;
          out(`      ${bucket * 25}%\n`);
        }
        return;
      }
      const w = 28;
      const f = Math.round((pct / 100) * w);
      out(`\r      ${color.yellow('█'.repeat(f))}${color.dim('░'.repeat(w - f))} ${String(pct).padStart(3)}%`);
      barOpen = true;
      if (pct === 100) closeBar();
    },
    info(msg) {
      closeBar();
      out(`      ${color.dim(msg)}\n`);
    },
    ok(msg) {
      closeBar();
      out(`${color.green(msg)}\n`);
    },
    warn(msg) {
      closeBar();
      out(`${color.yellow(msg)}\n`);
    },
  };
}
