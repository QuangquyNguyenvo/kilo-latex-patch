import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  readArchive,
  readEntry,
  getNode,
  ensureDir,
  integrityOf,
  sha256,
  writeArchive,
  writeRaw,
  encodeHeader,
} from './asar.mjs';
import { patchBundle, isPatched } from './bundle.mjs';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_SRC = path.join(PKG_ROOT, 'dist', 'kilo-math');
const RENDERER = '.vite/renderer/main_window';
const ASSET_DIR = `${RENDERER}/assets/kilo-math`;
const EXE_NAME = 'kilo-desktop.exe';
const STATE_DIR = 'kilo-latex-patch'; // inside resources/
export const PATCH_VERSION = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')).version;

// ---------- locating the install ----------

export function defaultRoot() {
  const local = process.env.LOCALAPPDATA;
  if (!local) throw new Error('LOCALAPPDATA is not set (this tool supports the Windows install only).');
  return path.join(local, 'KiloDesktop');
}

function parseVer(name) {
  const m = /^app-(\d+)\.(\d+)\.(\d+)(?:[-.](.*))?$/.exec(name);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ?? ''] : null;
}

export function findAppDir(root) {
  if (!fs.existsSync(root)) throw new Error(`Kilo Desktop not found at ${root}`);
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && parseVer(d.name))
    .map((d) => ({ name: d.name, v: parseVer(d.name) }))
    .filter((d) => fs.existsSync(path.join(root, d.name, 'resources', 'app.asar')))
    .sort((a, b) => {
      for (let i = 0; i < 3; i++) if (a.v[i] !== b.v[i]) return b.v[i] - a.v[i];
      if (a.v[3] === b.v[3]) return 0;
      if (!a.v[3]) return -1; // release beats prerelease
      if (!b.v[3]) return 1;
      return a.v[3] < b.v[3] ? 1 : -1;
    });
  if (!dirs.length) throw new Error(`no app-x.y.z folder with resources/app.asar under ${root}`);
  return path.join(root, dirs[0].name);
}

function pathsFor(appDir) {
  const resources = path.join(appDir, 'resources');
  return {
    appDir,
    asar: path.join(resources, 'app.asar'),
    exe: path.join(appDir, EXE_NAME),
    stateDir: path.join(resources, STATE_DIR),
    stateFile: path.join(resources, STATE_DIR, 'state.json'),
    origHead: path.join(resources, STATE_DIR, 'original-header.bin'),
  };
}

// ---------- process check ----------

// True if a kilo-desktop.exe from this app folder is running.
export function kiloRunning(appDir) {
  if (process.platform !== 'win32') return false;
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', "Get-Process -Name 'kilo-desktop' -ErrorAction SilentlyContinue | ForEach-Object { $_.Path }"],
      { encoding: 'utf8', windowsHide: true },
    );
    const target = path.resolve(appDir).toLowerCase() + path.sep;
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .some((exe) => path.resolve(exe).toLowerCase().startsWith(target));
  } catch {
    return false;
  }
}

function assertNotRunning(appDir) {
  if (kiloRunning(appDir)) {
    throw new Error('Kilo Desktop is running. Quit it completely (also from the system tray), then run again.');
  }
}

// ---------- exe integrity hash ----------

function replaceExeHash(exePath, oldHash, newHash, dryRun) {
  const buf = fs.readFileSync(exePath);
  const oldB = Buffer.from(oldHash, 'ascii');
  const first = buf.indexOf(oldB);
  if (first === -1) {
    const already = buf.indexOf(Buffer.from(newHash, 'ascii')) !== -1;
    if (already) return 'already';
    throw new Error(
      `${EXE_NAME} does not contain the expected app.asar integrity hash ${oldHash}. ` +
        'Refusing to continue (the app would fail to start).',
    );
  }
  if (buf.indexOf(oldB, first + 1) !== -1) throw new Error(`integrity hash appears more than once in ${EXE_NAME}`);
  if (dryRun) return 'would-replace';
  Buffer.from(newHash, 'ascii').copy(buf, first);
  const tmp = `${exePath}.kilo-latex.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, exePath);
  return 'replaced';
}

// ---------- status ----------

export function status(appDir) {
  const p = pathsFor(appDir);
  const archive = readArchive(p.asar);
  const html = readEntry(archive, `${RENDERER}/index.html`).toString('utf8');
  const entry = entryScript(html);
  const code = readEntry(archive, `${RENDERER}/${entry}`).toString('utf8');
  const state = fs.existsSync(p.stateFile) ? JSON.parse(fs.readFileSync(p.stateFile, 'utf8')) : null;
  const exeHas = fs.readFileSync(p.exe).includes(Buffer.from(archive.headerHash, 'ascii'));
  return { ...p, entry, patched: isPatched(code), state, headerHash: archive.headerHash, exeMatchesAsar: exeHas };
}

function entryScript(html) {
  const m = /<script[^>]*type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"/.exec(html);
  if (!m) throw new Error('could not find the renderer entry script in index.html');
  return m[1];
}

// ---------- patch ----------

export function patch(appDir, { dryRun = false, log = console.log } = {}) {
  if (!fs.existsSync(path.join(ASSET_SRC, 'kilo-math.js'))) {
    throw new Error('dist/kilo-math is missing. Run `npm run build` in the package first.');
  }
  const p = pathsFor(appDir);
  const st = status(appDir);
  if (st.patched) {
    log(`Already patched (${path.basename(appDir)}). Use "restore" first to re-apply.`);
    return { changed: false };
  }
  if (!st.exeMatchesAsar) {
    throw new Error(`${EXE_NAME} integrity hash does not match app.asar. Reinstall Kilo or run "restore" first.`);
  }
  if (!dryRun) assertNotRunning(appDir);

  const archive = readArchive(p.asar);
  const header = JSON.parse(archive.headerString);
  const entryRel = `${RENDERER}/${st.entry}`;

  const original = readEntry(archive, entryRel).toString('utf8');
  const patchedCode = Buffer.from(patchBundle(original), 'utf8');

  // Collect files to append: patched entry + KaTeX assets.
  const appended = [];
  let cursor = archive.dataSize;
  const add = (node, buf) => {
    Object.assign(node, { size: buf.length, offset: String(cursor), integrity: integrityOf(buf) });
    delete node.unpacked;
    delete node.executable;
    appended.push(buf);
    cursor += buf.length;
  };

  add(getNode(header, entryRel), patchedCode);

  const assetDirNode = ensureDir(header, ASSET_DIR);
  const walk = (srcDir, dirNode) => {
    for (const d of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const full = path.join(srcDir, d.name);
      if (d.isDirectory()) {
        dirNode.files[d.name] ??= { files: {} };
        walk(full, dirNode.files[d.name]);
      } else {
        dirNode.files[d.name] = {};
        add(dirNode.files[d.name], fs.readFileSync(full));
      }
    }
  };
  walk(ASSET_SRC, assetDirNode);

  const newHeaderString = JSON.stringify(header);
  const newHash = sha256(Buffer.from(newHeaderString, 'utf8'));
  log(`app:        ${appDir}`);
  log(`entry:      ${st.entry}`);
  log(`appending:  ${appended.length} files, ${(appended.reduce((a, b) => a + b.length, 0) / 1024).toFixed(0)} KB`);
  log(`asar hash:  ${archive.headerHash} -> ${newHash}`);

  if (dryRun) {
    replaceExeHash(p.exe, archive.headerHash, newHash, true);
    log('dry run: nothing written.');
    return { changed: false };
  }

  // Save what restore needs before touching anything.
  fs.mkdirSync(p.stateDir, { recursive: true });
  const head = Buffer.alloc(archive.dataStart); // header bytes only
  const fd = fs.openSync(p.asar, 'r');
  try {
    fs.readSync(fd, head, 0, head.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  fs.writeFileSync(p.origHead, head);
  const state = {
    patchVersion: PATCH_VERSION,
    patchedAt: new Date().toISOString(),
    appDir: path.basename(appDir),
    original: { totalSize: archive.totalSize, dataStart: archive.dataStart, headerHash: archive.headerHash },
    patched: { headerHash: newHash },
  };
  fs.writeFileSync(p.stateFile, JSON.stringify(state, null, 2));

  const tmp = `${p.asar}.kilo-latex.tmp`;
  writeArchive({
    src: p.asar,
    srcDataStart: archive.dataStart,
    keepDataBytes: archive.dataSize,
    headerString: newHeaderString,
    appended,
    outFile: tmp,
  });
  const check = readArchive(tmp);
  if (check.headerHash !== newHash) throw new Error('verification of the new app.asar failed');
  if (!readEntry(check, entryRel).equals(patchedCode)) throw new Error('verification of the patched entry failed');

  fs.renameSync(tmp, p.asar);
  try {
    replaceExeHash(p.exe, archive.headerHash, newHash, false);
  } catch (err) {
    // Put the original asar back so the app still starts.
    restoreAsarOnly(p, state);
    throw err;
  }
  log('patched. Start Kilo Desktop and ask for a formula to check.');
  return { changed: true };
}

// ---------- restore ----------

function restoreAsarOnly(p, state) {
  const cur = readArchive(p.asar);
  const head = fs.readFileSync(p.origHead);
  if (head.length !== state.original.dataStart) throw new Error('backup header has the wrong size');
  const keep = state.original.totalSize - state.original.dataStart;
  if (keep > cur.dataSize) throw new Error('current app.asar is smaller than the original data; cannot restore');
  const tmp = `${p.asar}.kilo-latex.tmp`;
  writeRaw({ head, src: p.asar, srcDataStart: cur.dataStart, keepDataBytes: keep, outFile: tmp });
  const check = readArchive(tmp);
  if (check.headerHash !== state.original.headerHash || check.totalSize !== state.original.totalSize) {
    fs.rmSync(tmp, { force: true });
    throw new Error('restored app.asar does not match the original; left the current file in place');
  }
  fs.renameSync(tmp, p.asar);
  return cur.headerHash;
}

export function restore(appDir, { log = console.log } = {}) {
  const p = pathsFor(appDir);
  if (!fs.existsSync(p.stateFile)) {
    log(`Nothing to restore in ${path.basename(appDir)} (no patch state found).`);
    return { changed: false };
  }
  assertNotRunning(appDir);
  const state = JSON.parse(fs.readFileSync(p.stateFile, 'utf8'));
  const cur = readArchive(p.asar);
  if (cur.headerHash !== state.original.headerHash) {
    restoreAsarOnly(p, state);
  }
  const r = replaceExeHash(p.exe, cur.headerHash, state.original.headerHash, false);
  if (r !== 'replaced' && r !== 'already') throw new Error(`unexpected exe state: ${r}`);
  fs.rmSync(p.stateDir, { recursive: true, force: true });
  log(`restored ${path.basename(appDir)} to the original.`);
  return { changed: true };
}

export { encodeHeader };
