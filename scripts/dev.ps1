# Builds the engine then starts the gateway, which launches the engine itself.
# Use this for everyday local work. Deployment comes much later.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$binary = "engine\build\campus_engine.exe"

# make is not installed on windows here, so call the compiler directly.
# the flags match engine/Makefile on purpose, include path included.
Write-Host "building engine..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "engine\build" | Out-Null

$sources = Get-ChildItem "engine\src\*.cpp" | ForEach-Object { $_.FullName }
& g++ -std=c++20 -O2 -Wall -Wextra -Wpedantic -Iengine\include $sources -o $binary -lws2_32
if ($LASTEXITCODE -ne 0) { throw "engine build failed" }
Write-Host "engine built" -ForegroundColor Green

if (-not (Test-Path "api\data\graph.campus")) {
    throw "no graph at api\data\graph.campus, run python -m pipeline.transform"
}

$python = ".\.venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Host "no venv yet, creating one..." -ForegroundColor Cyan
    & python -m venv .venv
    & $python -m pip install --quiet --upgrade pip
    & $python -m pip install --quiet -r api\requirements.txt
}

Write-Host ""
Write-Host "gateway starting on http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "health check at http://127.0.0.1:8000/api/health" -ForegroundColor Green
Write-Host ""

& $python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload
