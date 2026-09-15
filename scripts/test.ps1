# Run All Tests & Lint Checks Across Monorepo
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Running Monorepo Test & Quality Suites " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Backend Checks
Write-Host "`n[1/4] Running Backend Tests (pytest)..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\..\backend"
.venv\Scripts\pytest
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n[2/4] Running Backend Linter (ruff)..." -ForegroundColor Yellow
.venv\Scripts\ruff check .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n[3/4] Running Backend Type Checker (mypy)..." -ForegroundColor Yellow
.venv\Scripts\mypy app
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 2. Frontend Checks
Write-Host "`n[4/4] Running Frontend Type Check & Build..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\..\frontend"
npm run typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Set-Location "$PSScriptRoot\.."
Write-Host "`nAll tests, lint checks, and type checks passed successfully!" -ForegroundColor Green
