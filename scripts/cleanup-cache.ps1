<#
.SYNOPSIS
    APEX (apex.windowasia.com) - Weekly Docker & Build Cache Cleanup Script (Windows)
.DESCRIPTION
    Removes unused Docker build cache, dangling images, stopped containers, unused networks,
    and local frontend/backend build caches (.next/cache, __pycache__, .pytest_cache)
    to keep disk usage minimal without affecting running containers or database volumes.
#>

param(
    [switch]$RegisterScheduledTask
)

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " APEX Weekly Cache & Build Garbage Cleanup (ISO 27001 Hygiene)" -ForegroundColor Cyan
Write-Host " Started at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

if ($RegisterScheduledTask) {
    $TaskName = "APEX-Weekly-Cache-Cleanup"
    $ScriptPath = $MyInvocation.MyCommand.Definition
    $Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""
    $Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 3am
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Description "Weekly Docker & Build Cache Cleanup for APEX" -Force
    Write-Host "[OK] Scheduled Task '$TaskName' registered to run every Sunday at 03:00 AM." -ForegroundColor Green
    exit 0
}

# 1. Docker Buildx / Builder Cache Cleanup
if (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Host "`n[1/4] Pruning Docker Builder / BuildKit Cache..." -ForegroundColor Yellow
    docker builder prune --all --force
    docker buildx prune --all --force 2>$null

    Write-Host "`n[2/4] Pruning Dangling Docker Images, Stopped Containers & Unused Networks (Safe for DB Volumes)..." -ForegroundColor Yellow
    docker image prune --force
    docker container prune --force
    docker network prune --force

    Write-Host "`n--- Current Docker Disk Usage ---" -ForegroundColor Gray
    docker system df
} else {
    Write-Host "`n[SKIP] Docker CLI not found or Docker Desktop is not running." -ForegroundColor DarkYellow
}

# 2. Frontend Next.js & Node Cache Cleanup
Write-Host "`n[3/4] Cleaning Frontend (.next/cache & .turbo) caches..." -ForegroundColor Yellow
$FrontendCachePaths = @(
    (Join-Path $ProjectRoot "frontend\.next\cache"),
    (Join-Path $ProjectRoot "frontend\.turbo")
)
foreach ($Path in $FrontendCachePaths) {
    if (Test-Path $Path) {
        Remove-Item -Path $Path -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  Removed: $Path" -ForegroundColor Green
    }
}

# 3. Backend Python Cache Cleanup (__pycache__, .pytest_cache, .mypy_cache, .ruff_cache)
Write-Host "`n[4/4] Cleaning Backend Python bytecode & test caches..." -ForegroundColor Yellow
$PythonCacheDirs = @("__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache")
foreach ($DirName in $PythonCacheDirs) {
    Get-ChildItem -Path $ProjectRoot -Directory -Filter $DirName -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch "\\node_modules\\" -and $_.FullName -notmatch "\\\.venv\\" } |
        ForEach-Object {
            Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "  Removed: $($_.FullName)" -ForegroundColor Green
        }
}

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host " Cleanup Completed Successfully at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
