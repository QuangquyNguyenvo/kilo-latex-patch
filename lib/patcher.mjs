import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readArchive, readEntry, getNode, ensureDir, integrityOf, sha256, writeArchive, encodeHeader } from './asar.mjs';
import { patchBundle, isPatched } from './bundle.mjs';
import { createUi } from './ui.mjs';

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
  if (!local) throw new Error('Không thấy biến LOCALAPPDATA (tool chỉ hỗ trợ Kilo bản Windows).');
  return path.join(local, 'KiloDesktop');
}

function parseVer(name) {
  const m = /^app-(\d+)\.(\d+)\.(\d+)(?:[-.](.*))?$/.exec(name);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ?? ''] : null;
}

export function findAppDir(root) {
  if (!fs.existsSync(root)) throw new Error(`Không tìm thấy Kilo Desktop ở ${root}. Máy đã cài Kilo chưa?`);
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
  if (!dirs.length) throw new Error(`Không thấy thư mục app-x.y.z nào có resources/app.asar trong ${root}.`);
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

export const versionOf = (appDir) => path.basename(appDir).replace(/^app-/, '');

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
    throw new Error('Kilo Desktop đang mở. Thoát hẳn Kilo (kể cả icon ở khay hệ thống) rồi chạy lại.');
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
    throw new Error(`${EXE_NAME} không chứa mã kiểm tra mong đợi. Dừng lại để tránh làm app không mở được.`);
  }
  if (buf.indexOf(oldB, first + 1) !== -1) throw new Error(`Mã kiểm tra xuất hiện nhiều lần trong ${EXE_NAME}; dừng lại.`);
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
  if (!m) throw new Error('Không tìm thấy file giao diện chính trong index.html (Kilo đã đổi cấu trúc).');
  return m[1];
}

function readHead(file, bytes) {
  const head = Buffer.alloc(bytes);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, head, 0, bytes, 0);
  } finally {
    fs.closeSync(fd);
  }
  return head;
}

// ---------- patch ----------

export function patch(appDir, { dryRun = false, ui = createUi() } = {}) {
  if (!fs.existsSync(path.join(ASSET_SRC, 'kilo-math.js'))) {
    throw new Error('Thiếu dist/kilo-math. Chạy `npm run build` trong thư mục gói trước.');
  }
  const p = pathsFor(appDir);
  ui.begin(5);

  ui.step(1, `Đọc Kilo ${versionOf(appDir)}`);
  const st = status(appDir);
  if (st.patched) {
    ui.info('Bản này đã được vá rồi, không cần làm gì.');
    return { changed: false, already: true };
  }
  if (!st.exeMatchesAsar) {
    throw new Error(`Mã kiểm tra trong ${EXE_NAME} không khớp app.asar. Cài lại Kilo hoặc chạy "restore" trước.`);
  }
  if (!dryRun) assertNotRunning(appDir);
  const archive = readArchive(p.asar);
  const header = JSON.parse(archive.headerString);
  const entryRel = `${RENDERER}/${st.entry}`;

  ui.step(2, 'Chèn bộ hiển thị LaTeX (KaTeX) vào giao diện');
  const patchedCode = Buffer.from(patchBundle(readEntry(archive, entryRel).toString('utf8')), 'utf8');
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
  walk(ASSET_SRC, ensureDir(header, ASSET_DIR));
  const newHeaderString = JSON.stringify(header);
  const newHash = sha256(Buffer.from(newHeaderString, 'utf8'));

  if (dryRun) {
    replaceExeHash(p.exe, archive.headerHash, newHash, true);
    ui.info(`Chạy thử: sẽ thêm ${appended.length} file. Chưa ghi gì.`);
    return { changed: false };
  }

  // Save what restore needs before touching anything.
  fs.mkdirSync(p.stateDir, { recursive: true });
  fs.writeFileSync(p.origHead, readHead(p.asar, archive.dataStart));
  const state = {
    patchVersion: PATCH_VERSION,
    patchedAt: new Date().toISOString(),
    appDir: path.basename(appDir),
    original: { totalSize: archive.totalSize, dataStart: archive.dataStart, headerHash: archive.headerHash },
    patched: { headerHash: newHash },
  };
  fs.writeFileSync(p.stateFile, JSON.stringify(state, null, 2));

  ui.step(3, `Ghi app.asar (${Math.round(archive.totalSize / 1048576)} MB)`);
  const tmp = `${p.asar}.kilo-latex.tmp`;
  try {
    writeArchive({
      head: encodeHeader(newHeaderString),
      src: p.asar,
      srcDataStart: archive.dataStart,
      keepDataBytes: archive.dataSize,
      appended,
      outFile: tmp,
      onProgress: (f) => ui.progress(f),
    });

    ui.step(4, 'Kiểm tra file vừa ghi');
    const check = readArchive(tmp);
    if (check.headerHash !== newHash || !readEntry(check, entryRel).equals(patchedCode)) {
      throw new Error('File app.asar mới không khớp. Đã huỷ, Kilo giữ nguyên.');
    }
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    fs.rmSync(p.stateDir, { recursive: true, force: true });
    throw err;
  }
  fs.renameSync(tmp, p.asar);

  ui.step(5, `Cập nhật mã kiểm tra trong ${EXE_NAME}`);
  try {
    replaceExeHash(p.exe, archive.headerHash, newHash, false);
  } catch (err) {
    // Put the original asar back so the app still starts.
    restoreAsarOnly(p, state, ui);
    fs.rmSync(p.stateDir, { recursive: true, force: true });
    throw err;
  }
  return { changed: true };
}

// ---------- restore ----------

function restoreAsarOnly(p, state, ui) {
  const cur = readArchive(p.asar);
  const head = fs.readFileSync(p.origHead);
  if (head.length !== state.original.dataStart) throw new Error('File sao lưu header sai kích thước; không gỡ được.');
  const keep = state.original.totalSize - state.original.dataStart;
  if (keep > cur.dataSize) throw new Error('app.asar hiện tại nhỏ hơn bản gốc; không gỡ được.');
  const tmp = `${p.asar}.kilo-latex.tmp`;
  writeArchive({ head, src: p.asar, srcDataStart: cur.dataStart, keepDataBytes: keep, outFile: tmp, onProgress: (f) => ui.progress(f) });
  const check = readArchive(tmp);
  if (check.headerHash !== state.original.headerHash || check.totalSize !== state.original.totalSize) {
    fs.rmSync(tmp, { force: true });
    throw new Error('Bản khôi phục không khớp bản gốc; giữ nguyên file hiện tại.');
  }
  fs.renameSync(tmp, p.asar);
}

export function restore(appDir, { ui = createUi() } = {}) {
  const p = pathsFor(appDir);
  ui.begin(3);
  ui.step(1, `Đọc Kilo ${versionOf(appDir)}`);
  if (!fs.existsSync(p.stateFile)) {
    ui.info('Bản này chưa được vá, không có gì để gỡ.');
    return { changed: false, already: true };
  }
  assertNotRunning(appDir);
  const state = JSON.parse(fs.readFileSync(p.stateFile, 'utf8'));
  const cur = readArchive(p.asar);

  ui.step(2, 'Khôi phục app.asar gốc');
  if (cur.headerHash !== state.original.headerHash) restoreAsarOnly(p, state, ui);
  else ui.info('app.asar đã là bản gốc.');

  ui.step(3, `Khôi phục mã kiểm tra trong ${EXE_NAME}`);
  const r = replaceExeHash(p.exe, cur.headerHash, state.original.headerHash, false);
  if (r !== 'replaced' && r !== 'already') throw new Error(`Trạng thái exe lạ: ${r}`);
  fs.rmSync(p.stateDir, { recursive: true, force: true });
  return { changed: true };
}
