// Find the Kilo Desktop install even when it is not in the default
// %LOCALAPPDATA%\KiloDesktop folder.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readArchive, readEntry } from './asar.mjs';

const EXE = 'kilo-desktop.exe';
const APP_DIR_RE = /^app-(\d+)\.(\d+)\.(\d+)(?:[-.](.*))?$/;

function parseVer(name) {
  const m = APP_DIR_RE.exec(name);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ?? ''] : null;
}

function cmpVer(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  if (a[3] === b[3]) return 0;
  if (!a[3]) return 1;
  if (!b[3]) return -1;
  return a[3] < b[3] ? -1 : 1;
}

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};
const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

// An "app dir" holds kilo-desktop.exe + resources/app.asar and really is Kilo.
function isKiloAppDir(dir) {
  const asar = path.join(dir, 'resources', 'app.asar');
  if (!isFile(asar) || !isFile(path.join(dir, EXE))) return false;
  try {
    const pkg = JSON.parse(readEntry(readArchive(asar), 'package.json').toString('utf8'));
    return /kilo/i.test(`${pkg.name} ${pkg.productName}`);
  } catch {
    return false;
  }
}

// Version of an app dir: from the app-x.y.z folder name, else package.json.
function appVersion(dir) {
  const v = parseVer(path.basename(dir));
  if (v) return v;
  try {
    const pkg = JSON.parse(readEntry(readArchive(path.join(dir, 'resources', 'app.asar')), 'package.json').toString('utf8'));
    return parseVer(`app-${pkg.version}`) ?? [0, 0, 0, ''];
  } catch {
    return [0, 0, 0, ''];
  }
}

// Every Kilo app dir reachable from a candidate path (file or folder):
// the folder itself, its app-x.y.z children (Squirrel root), or a parent.
function appDirsFrom(candidate) {
  if (!candidate) return [];
  let p = candidate.replace(/^"|"$/g, '').replace(/,\d+$/, '').trim();
  if (!p) return [];
  if (isFile(p)) p = path.dirname(p);
  if (!isDir(p)) return [];
  const found = [];
  const tryRoot = (root) => {
    if (isKiloAppDir(root)) found.push(root);
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of entries) {
      if (d.isDirectory() && parseVer(d.name)) {
        const sub = path.join(root, d.name);
        if (isKiloAppDir(sub)) found.push(sub);
      }
    }
  };
  tryRoot(p);
  if (!found.length) tryRoot(path.dirname(p)); // e.g. candidate was resources\ or app-x.y.z\resources
  return found;
}

// Ask Windows where Kilo might be: running processes, uninstall registry
// entries and Start menu / Desktop shortcuts. One PowerShell call.
function windowsCandidates() {
  if (process.platform !== 'win32') return [];
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
Get-Process -Name 'kilo-desktop' | ForEach-Object { $_.Path }
$keys = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
        'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
        'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
Get-ItemProperty $keys | Where-Object { $_.DisplayName -match 'kilo' } | ForEach-Object { $_.InstallLocation; $_.DisplayIcon; $_.UninstallString }
$shell = New-Object -ComObject WScript.Shell
$dirs = [Environment]::GetFolderPath('StartMenu'), [Environment]::GetFolderPath('CommonStartMenu'),
        [Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory')
Get-ChildItem $dirs -Recurse -Filter '*.lnk' | Where-Object { $_.BaseName -match 'kilo' } | ForEach-Object { $shell.CreateShortcut($_.FullName).TargetPath }
`;
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 30000,
    });
    // UninstallString looks like: "C:\...\Update.exe" --uninstall
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => (l.startsWith('"') ? l.slice(1, l.indexOf('"', 1)) : l.replace(/\s+--?\w.*$/, '')));
  } catch {
    return [];
  }
}

function commonFolders() {
  const env = process.env;
  const bases = [env.LOCALAPPDATA, env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs'), env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean);
  const out = [];
  for (const b of bases) {
    try {
      for (const d of fs.readdirSync(b, { withFileTypes: true })) {
        if (d.isDirectory() && /kilo/i.test(d.name)) out.push(path.join(b, d.name));
      }
    } catch {
      /* ignore */
    }
  }
  return out;
}

// Returns { appDir, source } for the newest Kilo found, or throws.
export function locateKilo({ log } = {}) {
  const sources = [
    ['thư mục mặc định', () => (process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, 'KiloDesktop')] : [])],
    ['Windows (tiến trình, app đã cài, shortcut)', windowsCandidates],
    ['các thư mục cài phổ biến', commonFolders],
  ];
  for (const [label, get] of sources) {
    const dirs = [...new Set(get().flatMap(appDirsFrom).map((d) => path.resolve(d)))];
    if (dirs.length) {
      dirs.sort((a, b) => cmpVer(appVersion(b), appVersion(a)));
      if (label !== 'thư mục mặc định') log?.(`Tìm thấy Kilo qua ${label}: ${dirs[0]}`);
      return { appDir: dirs[0], source: label };
    }
  }
  throw new Error(
    'Không tìm thấy Kilo Desktop trên máy. Nếu bạn đã cài ở chỗ khác, chỉ đường dẫn tới thư mục chứa kilo-desktop.exe:\n' +
      '  kilo-latex-patch --app-dir "D:\\duong\\dan\\toi\\app-1.0.0"',
  );
}

export { parseVer, isKiloAppDir };
