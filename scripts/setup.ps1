# AI Study Companion Setup Script (Windows PowerShell)
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Setting up AI Study Companion Monorepo  " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Root .env setup
if (-Not (Test-Path ".env")) {
    Write-Host "`nCreating root .env from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
}

# 2. Backend Setup
Write-Host "`nSetting up Python backend environment..." -ForegroundColor Yellow
Set-Location backend
if (-Not (Test-Path ".venv")) {
    uv venv --python 3.11
}
uv pip install -e ".[dev]"
Set-Location ..

# 3. Frontend Setup
Write-Host "`nSetting up Next.js frontend environment..." -ForegroundColor Yellow
Set-Location frontend
if (-Not (Test-Path ".env.local")) {
    Copy-Item ".env.example" ".env.local"
}
npm install
Set-Location ..

Write-Host "`nSetup complete! You can now run scripts/dev-backend.ps1 and scripts/dev-frontend.ps1." -ForegroundColor Green
