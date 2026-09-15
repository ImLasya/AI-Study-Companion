# Run FastAPI Backend Server
Write-Host "Starting AI Study Companion Backend (FastAPI)..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\..\backend"

if (Test-Path ".venv\Scripts\activate.ps1") {
    & .venv\Scripts\activate.ps1
    uvicorn app.main:app --reload --port 8000 --host 127.0.0.1
} else {
    uv run uvicorn app.main:app --reload --port 8000 --host 127.0.0.1
}
