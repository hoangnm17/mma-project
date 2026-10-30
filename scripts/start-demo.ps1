param([string]$Node='node')
$ErrorActionPreference='Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  if (!(Test-Path backend/.env)) { throw 'Tạo backend/.env từ backend/.env.example và điền secret trước.' }
  docker compose -p stayflow-demo --env-file backend/.env up -d --wait
  if ($LASTEXITCODE -ne 0) { throw 'SQL Server chưa sẵn sàng.' }
  Push-Location backend
  try {
    & $Node --env-file=.env scripts/migrate.js
    if ($LASTEXITCODE -ne 0) { throw 'Migration lỗi.' }
    & $Node --env-file=.env scripts/seed.js
    if ($LASTEXITCODE -ne 0) { throw 'Seed lỗi.' }
    & $Node --env-file=.env src/server.js
  } finally { Pop-Location }
} finally { Pop-Location }
