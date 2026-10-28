<#
.SYNOPSIS
    APEX (apex.windowasia.com) - Drive C: Space Saver, Docker & Build Cache Cleanup Script (Windows)
.DESCRIPTION
    1. Moves npm cache off Drive C: to D:\Python\.cache\npm (if Drive D: exists) so Drive C: is not wasted.
    2. Purges C:\Users\<User>\AppData\Local\npm-cache and temporary Node/V8 compile caches in %TEMP%.
    3. Removes unused Docker build cache, unused/dangling images (docker image prune -a), stopped containers,
       and unused networks without affecting running containers or database volumes.
    4. Cleans local frontend/backend build caches (.next/cache, __pycache__, .pytest_cache).
#>

param(
    [switch]$RegisterScheduledTask
)

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

function Get-DriveCFreeGB {
    $drive = Get-PSDrive -Name C -ErrorAction SilentlyContinue
    if ($drive) {
        return [math]::Round($drive.Free / 1GB, 2)
    }
    return 0
}

$FreeBefore = Get-DriveCFreeGB

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " APEX Drive C: Space Saver & Cache Cleanup (ISO 27001 Hygiene)" -ForegroundColor Cyan
Write-Host " Started at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host " Drive C: Free Space (Before): $FreeBefore GB" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

if ($RegisterScheduledTask) {
    $TaskName = "APEX-Weekly-Cache-Cleanup"
    $ScriptPath = $MyInvocation.MyCommand.Definition
    $Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""
    $Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 3am
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Description "Weekly Drive C: & Docker Cache Cleanup for APEX" -Force
    Write-Host "[OK] Scheduled Task '$TaskName' registered to run every Sunday at 03:00 AM." -ForegroundColor Green
}

# 1. Redirect npm cache off Drive C: to D:\Python\.cache\npm and clean old Drive C: npm-cache
Write-Host "`n[1/5] Protecting Drive C: from npm & Node.js cache bloat..." -ForegroundColor Yellow
if (Test-Path "D:\") {
    $DriveDCache = "D:\Python\.cache\npm"
    if (-not (Test-Path $DriveDCache)) {
        New-Item -ItemType Directory -Path $DriveDCache -Force | Out-Null
    }
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        npm config set cache $DriveDCache --global 2>$null
        Write-Host "  [OK] Configured npm cache to use Drive D: ($DriveDCache)" -ForegroundColor Green
    }
}

$DriveCNpmCachePaths = @(
    "$env:LOCALAPPDATA\npm-cache",
    "$env:APPDATA\npm-cache"
)
foreach ($CachePath in $DriveCNpmCachePaths) {
    if (Test-Path $CachePath) {
        Remove-Item -Path $CachePath -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  Removed Drive C: npm cache: $CachePath" -ForegroundColor Green
    }
}

# Clean Node/V8/npm temporary folders in C:\Users\<User>\AppData\Local\Temp
$TempPatterns = @("npm-*", "v8-compile-cache*", "node-compile-cache*", "tsx-*")
foreach ($Pattern in $TempPatterns) {
    Get-ChildItem -Path $env:TEMP -Filter $Pattern -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
}
Write-Host "  [OK] Cleaned Node/V8 temporary files in $env:TEMP" -ForegroundColor Green

# 2. Docker Buildx / Builder Cache & Unused Images Cleanup
if (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Host "`n[2/5] Pruning Docker Builder / BuildKit Cache..." -ForegroundColor Yellow
    docker builder prune --all --force 2>$null
    docker buildx prune --all --force 2>$null

    Write-Host "`n[3/5] Pruning All Unused & Dangling Docker Images, Stopped Containers & Unused Networks..." -ForegroundColor Yellow
    docker container prune --force 2>$null
    docker image prune --all --force 2>$null
    docker network prune --force 2>$null

    Write-Host "`n--- Current Docker Disk Usage ---" -ForegroundColor Gray
    docker system df 2>$null
} else {
    Write-Host "`n[2/5 & 3/5] [SKIP] Docker CLI not installed or Docker Desktop is not running (No Docker bloat on Drive C:)." -ForegroundColor DarkYellow
}

# 3. Frontend Next.js & Node Cache Cleanup
Write-Host "`n[4/5] Cleaning Frontend (.next/cache & .turbo) caches..." -ForegroundColor Yellow
$FrontendCachePaths = @(
    (Join-Path $ProjectRoot "frontend\.next\cache"),
    (Join-Path $ProjectRoot "frontend\.turbo"),
    (Join-Path $ProjectRoot "app\.cache")
)
foreach ($Path in $FrontendCachePaths) {
    if (Test-Path $Path) {
        Remove-Item -Path $Path -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  Removed: $Path" -ForegroundColor Green
    }
}

# 4. Backend Python Cache Cleanup (__pycache__, .pytest_cache, .mypy_cache, .ruff_cache)
Write-Host "`n[5/5] Cleaning Backend Python bytecode & test caches..." -ForegroundColor Yellow
$PythonCacheDirs = @("__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache")
foreach ($DirName in $PythonCacheDirs) {
    Get-ChildItem -Path $ProjectRoot -Directory -Filter $DirName -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch "\\node_modules\\" -and $_.FullName -notmatch "\\\.venv\\" } |
        ForEach-Object {
            Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "  Removed: $($_.FullName)" -ForegroundColor Green
        }
}

$FreeAfter = Get-DriveCFreeGB
$Reclaimed = [math]::Round(($FreeAfter - $FreeBefore), 2)

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host " Cleanup Completed Successfully at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Green
Write-Host " Drive C: Free Space (After):  $FreeAfter GB (Reclaimed: $Reclaimed GB)" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
