param(
  [int]$Port = 4173,
  [string]$BindAddress = "0.0.0.0"
)

$Root = Join-Path $PSScriptRoot "pushrun-site"
$RootFull = [System.IO.Path]::GetFullPath($Root)
$DisplayHost = if ($BindAddress -eq "0.0.0.0") { "127.0.0.1" } else { $BindAddress }
$Prefix = "http://$DisplayHost`:$Port/"
$PidFile = Join-Path $PSScriptRoot "pushrun-server.pid"

$MimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png" = "image/png"
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg" = "image/svg+xml"
}

try {
  $Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse($BindAddress), $Port)
  $Listener.Start()
  Set-Content -LiteralPath $PidFile -Value $PID -Encoding ascii
  Write-Host "PushRun is running at $Prefix"
  Write-Host "Press Ctrl+C to stop."

  while ($true) {
    $Client = $Listener.AcceptTcpClient()
    try {
      $Stream = $Client.GetStream()
      $Reader = [System.IO.StreamReader]::new($Stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $RequestLine = $Reader.ReadLine()

      while ($true) {
        $HeaderLine = $Reader.ReadLine()
        if ($null -eq $HeaderLine -or $HeaderLine -eq "") {
          break
        }
      }

      if ([string]::IsNullOrWhiteSpace($RequestLine)) {
        continue
      }

      $Parts = $RequestLine.Split(" ")
      if ($Parts.Count -lt 2) {
        $Body = [System.Text.Encoding]::UTF8.GetBytes("Bad Request")
        $Header = [System.Text.Encoding]::ASCII.GetBytes("HTTP/1.1 400 Bad Request`r`nContent-Length: $($Body.Length)`r`nConnection: close`r`n`r`n")
        $Stream.Write($Header, 0, $Header.Length)
        $Stream.Write($Body, 0, $Body.Length)
        continue
      }

      $RequestPath = $Parts[1].Split("?")[0].TrimStart("/")
      $RequestPath = [System.Uri]::UnescapeDataString($RequestPath)
      if ([string]::IsNullOrWhiteSpace($RequestPath)) {
        $RequestPath = "index.html"
      }

      $Candidate = [System.IO.Path]::GetFullPath((Join-Path $RootFull $RequestPath))
      if (-not $Candidate.StartsWith($RootFull)) {
        $Body = [System.Text.Encoding]::UTF8.GetBytes("Forbidden")
        $Header = [System.Text.Encoding]::ASCII.GetBytes("HTTP/1.1 403 Forbidden`r`nContent-Length: $($Body.Length)`r`nConnection: close`r`n`r`n")
        $Stream.Write($Header, 0, $Header.Length)
        $Stream.Write($Body, 0, $Body.Length)
        continue
      }

      if (-not (Test-Path -LiteralPath $Candidate -PathType Leaf)) {
        $Body = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
        $Header = [System.Text.Encoding]::ASCII.GetBytes("HTTP/1.1 404 Not Found`r`nContent-Length: $($Body.Length)`r`nConnection: close`r`n`r`n")
        $Stream.Write($Header, 0, $Header.Length)
        $Stream.Write($Body, 0, $Body.Length)
        continue
      }

      $Bytes = [System.IO.File]::ReadAllBytes($Candidate)
      $Extension = [System.IO.Path]::GetExtension($Candidate).ToLowerInvariant()
      $ContentType = $MimeTypes[$Extension]
      if (-not $ContentType) {
        $ContentType = "application/octet-stream"
      }

      $Header = [System.Text.Encoding]::ASCII.GetBytes("HTTP/1.1 200 OK`r`nContent-Type: $ContentType`r`nContent-Length: $($Bytes.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n")
      $Stream.Write($Header, 0, $Header.Length)
      $Stream.Write($Bytes, 0, $Bytes.Length)
    }
    finally {
      $Client.Close()
    }
  }
}
finally {
  if ($Listener) {
    $Listener.Stop()
  }
  if (Test-Path -LiteralPath $PidFile) {
    Remove-Item -LiteralPath $PidFile -Force
  }
}
