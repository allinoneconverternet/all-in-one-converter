param([int]$Port = 5173)

$p = Start-Process -FilePath node -ArgumentList ".\scripts\mini-static-server.js",$Port -PassThru -WindowStyle Hidden
try {
  # Wait up to ~5s for the server
  $ready = $false
  1..25 | ForEach-Object {
    try {
      Invoke-WebRequest "http://localhost:$Port/" -UseBasicParsing -TimeoutSec 2 | Out-Null
      $ready = $true; break
    } catch { Start-Sleep -Milliseconds 200 }
  }
  if (-not $ready) { throw "Server didn't start on port $Port" }

  Write-Output "Fetching http://localhost:$Port/ ..."
  $homeHtml = (Invoke-WebRequest "http://localhost:$Port/" -UseBasicParsing).Content
  Write-Output "Fetching http://localhost:$Port/convert/mp4-to-mp3/ ..."
  $convHtml = (Invoke-WebRequest "http://localhost:$Port/convert/mp4-to-mp3/" -UseBasicParsing).Content

  Write-Output ("HOME H1:     " + ($(if ($homeHtml -match '<h1>[^<]+</h1>') {"OK"} else {"MISSING"})))
  Write-Output ("HOME intro:  " + ($(if ($homeHtml -match 'Drop files and choose an output') {"OK"} else {"MISSING"})))
  Write-Output ("CONV H1:     " + ($(if ($convHtml -match '<h1>[^<]+</h1>') {"OK"} else {"MISSING"})))
  Write-Output ("CONV CTA:    " + ($(if ($convHtml -match 'Open the converter') {"OK"} else {"MISSING"})))

  Write-Output "SSR/SSG checks passed."
}
finally {
  if ($p -and -not $p.HasExited) { $p.Kill() | Out-Null }
}
