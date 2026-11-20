#!/usr/bin/env node
import { findAppDir, patch, restore, status, versionOf, PATCH_VERSION } from '../lib/patcher.mjs';
import { locateKilo, isKiloAppDir } from '../lib/locate.mjs';
import { createUi, color } from '../lib/ui.mjs';

const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith('-')) ?? 'patch';
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

const HELP = `kilo-latex-patch ${PATCH_VERSION}
Thêm hiển thị công thức LaTeX vào chat Kilo Desktop (Windows).

Cách dùng:
  kilo-latex-patch [patch]     vá bản Kilo mới nhất trên máy
  kilo-latex-patch status      xem đã vá chưa
  kilo-latex-patch restore     gỡ vá, trả về bản gốc
  kilo-latex-patch patch --dry-run

Tuỳ chọn:
  --app-dir <path>   chọn một thư mục app-x.y.z cụ thể
  --root <path>      thư mục cài Kilo (mặc định: tự tìm)

Thoát Kilo trước khi patch/restore. Chạy lại "patch" sau mỗi lần Kilo cập nhật.`;

const started = Date.now();
const secs = () => ((Date.now() - started) / 1000).toFixed(1);

try {
  if (cmd === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    process.exit(0);
  }
  const ui = createUi();
  let appDir;
  if (flag('--app-dir')) {
    appDir = flag('--app-dir');
    if (!isKiloAppDir(appDir)) throw new Error(`${appDir} không phải thư mục Kilo (cần có kilo-desktop.exe và resources\\app.asar).`);
  } else if (flag('--root')) {
    appDir = findAppDir(flag('--root'));
  } else {
    appDir = locateKilo({ log: (m) => ui.info(m) }).appDir;
  }
  const ver = versionOf(appDir);

  if (cmd === 'patch') {
    const r = patch(appDir, { dryRun: args.includes('--dry-run'), ui });
    if (r.changed) ui.ok(`\nĐã vá Kilo ${ver} (${secs()} giây).`);
  } else if (cmd === 'restore') {
    const r = restore(appDir, { ui });
    if (r.changed) ui.ok(`\nĐã gỡ vá, Kilo ${ver} trở về bản gốc (${secs()} giây).`);
  } else if (cmd === 'status') {
    const s = status(appDir);
    console.log(`Kilo:      ${ver}  ${color.dim(s.appDir)}`);
    console.log(
      `Trạng thái: ${s.patched ? color.green(`đã vá (bản vá ${s.state?.patchVersion ?? '?'})`) : color.yellow('chưa vá')}`,
    );
    if (!s.exeMatchesAsar) console.log(color.red('Cảnh báo: mã kiểm tra trong exe không khớp app.asar, Kilo sẽ không mở được.'));
  } else {
    console.error(`Lệnh không hợp lệ: ${cmd}\n\n${HELP}`);
    process.exit(2);
  }
} catch (err) {
  console.error(`\n${color.red(`Lỗi: ${err.message}`)}`);
  process.exit(1);
}
