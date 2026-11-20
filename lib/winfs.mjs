// Windows helpers: find/close Kilo processes, and file writes that survive
// short-lived locks (antivirus scanning a file we just wrote).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const LOCK_CODES = new Set(['EPERM', 'EBUSY', 'EACCES', 'UNKNOWN']);
const DELAYS = [150, 300, 500, 800, 1200, 1600, 2000, 2500, 3000]; // ~12 s total

export function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export class LockedError extends Error {}

function lockedError(file) {
  return new LockedError(
    `Không ghi được ${path.basename(file)} vì file đang bị khoá. ` +
      'Thường do Kilo còn chạy ngầm hoặc phần mềm diệt virus đang quét file. ' +
      'Kilo được giữ nguyên. Tắt hẳn Kilo (kể cả icon ở khay hệ thống), đợi vài giây rồi chạy lại.',
  );
}

export function withRetry(file, fn) {
  for (let i = 0; ; i++) {
    try {
      return fn();
    } catch (err) {
      if (!LOCK_CODES.has(err.code)) throw err;
      if (i >= DELAYS.length) throw lockedError(file);
      sleepSync(DELAYS[i]);
    }
  }
}

// Fail fast (before any big write) if a file cannot be opened for writing.
export function assertWritable(file) {
  withRetry(file, () => fs.closeSync(fs.openSync(file, 'r+')));
}

// Overwrite `data` at `offset` without replacing the file (no rename needed).
export function writeAt(file, offset, data) {
  withRetry(file, () => {
    const fd = fs.openSync(file, 'r+');
    try {
      fs.writeSync(fd, data, 0, data.length, offset);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  });
  const check = Buffer.alloc(data.length);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, check, 0, data.length, offset);
  } finally {
    fs.closeSync(fd);
  }
  if (!check.equals(data)) throw new Error(`Ghi ${path.basename(file)} không thành công (đọc lại không khớp).`);
}

export function renameRetry(from, to) {
  withRetry(to, () => fs.renameSync(from, to));
}

export function removeQuiet(file) {
  try {
    fs.rmSync(file, { force: true });
  } catch {
    /* ignore */
  }
}

// ---------- processes ----------

function ps(script, env = {}) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
    env: { ...process.env, ...env },
  });
}

// Processes that keep files in this app folder busy: anything whose exe lives
// inside the folder (Kilo + its helpers), plus the Squirrel launcher next to
// it. Kilo installs elsewhere on the machine are left alone.
const LIST = `
$root = $env:KLP_ROOT.TrimEnd('\\') + '\\'
$stub = Join-Path (Split-Path $env:KLP_ROOT -Parent) 'kilo-desktop.exe'
Get-Process -ErrorAction SilentlyContinue | Where-Object {
  $_.Path -and ($_.Path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or
                [string]::Equals($_.Path, $stub, [StringComparison]::OrdinalIgnoreCase))
} | ForEach-Object { "$($_.Id)|$($_.ProcessName)|$($_.Path)" }
`;

export function kiloProcesses(appDir) {
  if (process.platform !== 'win32') return [];
  try {
    return ps(LIST, { KLP_ROOT: path.resolve(appDir) })
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [pid, name, exe] = l.split('|');
        return { pid: Number(pid), name, exe };
      })
      .filter((p) => p.pid && p.pid !== process.pid);
  } catch {
    return [];
  }
}

// Close every Kilo process for this folder and wait until they are gone.
export function closeKilo(appDir, { timeoutMs = 20000 } = {}) {
  const procs = kiloProcesses(appDir);
  if (!procs.length) return 0;
  try {
    // /T also ends child processes Kilo started (helpers, renderers).
    execFileSync('taskkill.exe', ['/F', '/T', ...procs.flatMap((p) => ['/PID', String(p.pid)])], {
      windowsHide: true,
      stdio: 'ignore',
    });
  } catch {
    /* some may already be gone */
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const left = kiloProcesses(appDir);
    if (!left.length) {
      sleepSync(800); // let Windows release file handles
      return procs.length;
    }
    try {
      execFileSync('taskkill.exe', ['/F', ...left.flatMap((p) => ['/PID', String(p.pid)])], { windowsHide: true, stdio: 'ignore' });
    } catch {
      /* ignore */
    }
    sleepSync(500);
  }
  const left = kiloProcesses(appDir);
  throw new Error(
    `Không tắt được Kilo (còn: ${left.map((p) => p.name).join(', ')}). Tắt bằng Task Manager rồi chạy lại.`,
  );
}
