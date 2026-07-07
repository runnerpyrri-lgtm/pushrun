$PidFile = Join-Path $PSScriptRoot "pushrun-server.pid"

if (-not (Test-Path -LiteralPath $PidFile)) {
  Write-Host "PushRun server is not running."
  exit 0
}

$ServerPid = Get-Content -LiteralPath $PidFile -ErrorAction Stop
if ($ServerPid) {
  Stop-Process -Id ([int]$ServerPid) -Force -ErrorAction SilentlyContinue
}
Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
Write-Host "PushRun server stopped."
