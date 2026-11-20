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
$ProgressPreference = 'SilentlyContinue'
$Total = 4

function Write-Step([int]$n, [string]$msg) {
    Write-Host ("[{0}/{1}] " -f $n, $Total) -ForegroundColor Yellow -NoNewline
    Write-Host $msg
}
function Write-Note([string]$msg) { Write-Host "      $msg" -ForegroundColor DarkGray }

function Show-Result([bool]$ok, [string[]]$lines) {
    $color = if ($ok) { 'Green' } else { 'Red' }
    $title = if ($ok) { ' THÀNH CÔNG ' } else { ' THẤT BẠI ' }
    $width = [Math]::Max(46, ($lines | Measure-Object -Property Length -Maximum).Maximum + 4)
    Write-Host ''
    Write-Host ('+' + $title.PadRight($width - 2, '-') + '+') -ForegroundColor $color
    foreach ($l in $lines) { Write-Host ('| ' + $l.PadRight($width - 4) + ' |') -ForegroundColor $color }
    Write-Host ('+' + ('-' * ($width - 2)) + '+') -ForegroundColor $color
    Write-Host ''
}

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

# Prefer the Squirrel launcher (keeps auto-update working), else the exe itself.
function Get-KiloLauncher([string]$exePath) {
    if (-not $exePath) { return $null }
    $appDir = Split-Path $exePath -Parent
    $stub = Join-Path (Split-Path $appDir -Parent) 'kilo-desktop.exe'
    if ((Split-Path $appDir -Leaf) -match '^app-' -and (Test-Path $stub)) { return $stub }
    return $exePath
}

$verb = @{ patch = 'Vá'; restore = 'Gỡ vá'; status = 'Kiểm tra' }[$Action]
Write-Host ''
Write-Host "Kilo LaTeX Patch - $verb" -ForegroundColor Yellow
Write-Host ''

# 1. Node.js
Write-Step 1 'Kiểm tra Node.js'
$major = Get-NodeMajor
if ($major -lt 18) {
    Write-Note 'Chưa có Node.js 18 trở lên.'
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
        Show-Result $false @('Cần Node.js 18 trở lên.', 'Cài từ https://nodejs.org rồi chạy lại lệnh.')
        return
    }
    $ans = Read-Host '      Cài Node.js LTS bằng winget ngay bây giờ? [Y/n]'
    if ($ans -match '^[nN]') { Show-Result $false @('Đã huỷ: chưa có Node.js.'); return }
    & $winget.Source install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
    Update-PathFromRegistry
    $major = Get-NodeMajor
    if ($major -lt 18) {
        Show-Result $false @('Đã cài Node.js nhưng chưa nhận.', 'Mở cửa sổ PowerShell mới rồi chạy lại lệnh.')
        return
    }
}
Write-Note "Node.js v$major"

# 2. Kilo must be closed before patch/restore.
Write-Step 2 'Đóng Kilo Desktop nếu đang mở'
$launcher = $null
if ($Action -ne 'status') {
    $procs = @(Get-Process -Name 'kilo-desktop' -ErrorAction SilentlyContinue)
    if ($procs.Count -gt 0) {
        $ans = Read-Host '      Kilo đang mở. Đóng Kilo để tiếp tục? Chat đang chạy sẽ bị dừng. [Y/n]'
        if ($ans -match '^[nN]') { Show-Result $false @('Đã huỷ: Kilo vẫn đang mở.'); return }
        $launcher = Get-KiloLauncher (($procs | Where-Object { $_.Path } | Select-Object -First 1).Path)
        $procs | Stop-Process -Force -ErrorAction SilentlyContinue
        $deadline = (Get-Date).AddSeconds(15)
        while ((Get-Process -Name 'kilo-desktop' -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
            Start-Sleep -Milliseconds 300
        }
        Start-Sleep -Milliseconds 500
        Write-Note 'Đã đóng Kilo.'
    } else {
        Write-Note 'Kilo không chạy.'
    }
} else {
    Write-Note 'Bỏ qua (chỉ kiểm tra).'
}

# 3. Download the release (npm 12 refuses remote tarball URLs, so fetch it first).
Write-Step 3 'Tải bản vá mới nhất'
$url = 'https://github.com/QuangquyNguyenvo/kilo-latex-patch/releases/latest/download/kilo-latex-patch.tgz'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('kilo-latex-patch-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
$pkg = Join-Path $tmp 'kilo-latex-patch.tgz'
$code = 1
try {
    try {
        Invoke-WebRequest -Uri $url -OutFile $pkg -UseBasicParsing
    } catch {
        Show-Result $false @('Không tải được bản vá từ GitHub.', 'Kiểm tra mạng rồi chạy lại lệnh.')
        return
    }
    Write-Note ('{0:N0} KB' -f ((Get-Item $pkg).Length / 1KB))

    # 4. Run it. npx.cmd avoids execution-policy blocks on npx.ps1.
    Write-Step 4 @{ patch = 'Vá Kilo'; restore = 'Gỡ vá Kilo'; status = 'Xem trạng thái' }[$Action]
    $npx = (Get-Command npx.cmd -ErrorAction SilentlyContinue).Source
    if (-not $npx) { Show-Result $false @('Không tìm thấy npx.cmd (đi kèm Node.js).'); return }
    Write-Host ''
    & $npx --yes --loglevel=error --package="$pkg" kilo-latex-patch $Action
    $code = $LASTEXITCODE
} finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

# Reopen Kilo if we closed it.
if ($launcher -and (Test-Path $launcher)) {
    Start-Process $launcher
    $reopened = 'Đã mở lại Kilo.'
} else {
    $reopened = $null
}

if ($Action -eq 'status') {
    if ($code -ne 0) { Show-Result $false @('Không đọc được trạng thái (xem lỗi phía trên).') }
    return
}
if ($code -eq 0) {
    $lines = if ($Action -eq 'patch') {
        @('Chat Kilo giờ hiển thị được công thức LaTeX.', 'Mỗi lần Kilo cập nhật, chạy lại lệnh này.')
    } else {
        @('Kilo đã trở về bản gốc.')
    }
    if ($reopened) { $lines += $reopened }
    Show-Result $true $lines
} else {
    $lines = @('Xem dòng lỗi màu đỏ phía trên.', 'Kilo được giữ nguyên nếu bước vá chưa xong.')
    if ($reopened) { $lines += $reopened }
    Show-Result $false $lines
}
