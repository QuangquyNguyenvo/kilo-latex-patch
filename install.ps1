# kilo-latex-patch installer
#
#   irm https://raw.githubusercontent.com/QuangquyNguyenvo/kilo-latex-patch/main/install.ps1 | iex
#
# Other actions:
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/QuangquyNguyenvo/kilo-latex-patch/main/install.ps1))) restore
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/QuangquyNguyenvo/kilo-latex-patch/main/install.ps1))) status

param(
    [ValidateSet('patch', 'restore', 'status')]
    [string]$Action = 'patch'
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Bad($msg) { Write-Host "  x $msg" -ForegroundColor Red }

function Update-PathFromRegistry {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

function Get-NodeMajor {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) { return 0 }
    $v = & $node.Source --version 2>$null
    if ($v -match '^v(\d+)') { return [int]$Matches[1] }
    return 0
}

# 1. Node.js
if ((Get-NodeMajor) -lt 18) {
    Write-Bad 'Cần Node.js 18 trở lên (không tìm thấy hoặc phiên bản quá cũ).'
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
        Write-Host '  Cài Node.js LTS từ https://nodejs.org rồi chạy lại lệnh này.'
        return
    }
    $ans = Read-Host '  Cài Node.js LTS bằng winget ngay bây giờ? [Y/n]'
    if ($ans -match '^[nN]') { return }
    & $winget.Source install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
    Update-PathFromRegistry
    if ((Get-NodeMajor) -lt 18) {
        Write-Bad 'Đã cài nhưng chưa thấy node. Mở cửa sổ PowerShell mới rồi chạy lại lệnh này.'
        return
    }
}

# 2. Kilo must be closed before patch/restore.
$wasRunning = $false
if ($Action -ne 'status') {
    $procs = Get-Process -Name 'kilo-desktop' -ErrorAction SilentlyContinue
    if ($procs) {
        $ans = Read-Host 'Kilo Desktop đang mở. Đóng Kilo để vá? Chat đang chạy sẽ bị dừng. [Y/n]'
        if ($ans -match '^[nN]') { Write-Host 'Đã huỷ.'; return }
        Write-Step 'Đang đóng Kilo Desktop'
        $procs | Stop-Process -Force
        $deadline = (Get-Date).AddSeconds(15)
        while ((Get-Process -Name 'kilo-desktop' -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
            Start-Sleep -Milliseconds 300
        }
        Start-Sleep -Milliseconds 500
        $wasRunning = $true
    }
}

# 3. Run the patcher (npx.cmd avoids PowerShell execution-policy blocks on npx.ps1).
Write-Step "kilo-latex-patch $Action"
$npx = (Get-Command npx.cmd -ErrorAction SilentlyContinue).Source
if (-not $npx) { Write-Bad 'Không tìm thấy npx.cmd (đi kèm Node.js).'; return }
# npm 12 refuses remote tarball URLs by default, so download the release first.
$url = 'https://github.com/QuangquyNguyenvo/kilo-latex-patch/releases/latest/download/kilo-latex-patch.tgz'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("kilo-latex-patch-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
$pkg = Join-Path $tmp 'kilo-latex-patch.tgz'
try {
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $url -OutFile $pkg -UseBasicParsing
    & $npx --yes --package="$pkg" kilo-latex-patch $Action
    $code = $LASTEXITCODE
} finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

# 4. Reopen Kilo if we closed it.
$launcher = Join-Path $env:LOCALAPPDATA 'KiloDesktop\kilo-desktop.exe'
if ($wasRunning -and (Test-Path $launcher)) {
    Write-Step 'Mở lại Kilo Desktop'
    Start-Process $launcher
}

if ($code -ne 0) { Write-Bad "Thất bại (mã lỗi $code)." }
elseif ($Action -eq 'patch') { Write-Host 'Xong. Mỗi lần Kilo tự cập nhật, hãy chạy lại lệnh này.' -ForegroundColor Green }
