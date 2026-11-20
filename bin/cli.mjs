#!/usr/bin/env node
import { defaultRoot, findAppDir, patch, restore, status, PATCH_VERSION } from '../lib/patcher.mjs';

const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith('-')) ?? 'patch';
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

const HELP = `kilo-latex-patch ${PATCH_VERSION}
Adds LaTeX math rendering to the Kilo Desktop chat (local patch, Windows).

Usage:
  kilo-latex-patch [patch]     patch the newest installed Kilo version
  kilo-latex-patch status      show whether it is patched
  kilo-latex-patch restore     undo the patch
  kilo-latex-patch patch --dry-run

Options:
  --app-dir <path>   a specific app-x.y.z folder instead of the newest
  --root <path>      Kilo install root (default %LOCALAPPDATA%\\KiloDesktop)

Quit Kilo Desktop before patch/restore. Re-run "patch" after every Kilo update.`;

try {
  if (cmd === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    process.exit(0);
  }
  const appDir = flag('--app-dir') ?? findAppDir(flag('--root') ?? defaultRoot());

  if (cmd === 'patch') {
    patch(appDir, { dryRun: args.includes('--dry-run') });
  } else if (cmd === 'restore') {
    restore(appDir);
  } else if (cmd === 'status') {
    const s = status(appDir);
    console.log(`app:      ${s.appDir}`);
    console.log(`patched:  ${s.patched ? `yes (patch ${s.state?.patchVersion ?? '?'}, ${s.state?.patchedAt ?? '?'})` : 'no'}`);
    console.log(`exe hash: ${s.exeMatchesAsar ? 'matches app.asar' : 'DOES NOT MATCH app.asar (app will not start)'}`);
  } else {
    console.error(`unknown command: ${cmd}\n\n${HELP}`);
    process.exit(2);
  }
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exit(1);
}
