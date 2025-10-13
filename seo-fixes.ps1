<# 
seo-fixes.ps1
Run from your project root. It safely backs up your repo, fixes broken canonicals, sets og:url,
adds per-format meta on English converter pages, dedupes hreflang alternates, and removes client-side
"Redirecting..." HTML pages (moves them to ___trash_redirects). Files are written as UTF-8.

Usage (preview):  pwsh -NoProfile -ExecutionPolicy Bypass -File .\seo-fixes.ps1 -Domain 'https://www.all-in-one-converter.net' -WhatIf
Usage (apply):    pwsh -NoProfile -ExecutionPolicy Bypass -File .\seo-fixes.ps1 -Domain 'https://www.all-in-one-converter.net'
#>

param(
  [Parameter(Mandatory=$false)]
  [string]$Domain = 'https://www.all-in-one-converter.net',
  [switch]$WhatIf
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = (Get-Location).Path
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupZip = Join-Path $root ("backup-seo-$timestamp.zip")
Write-Host "Creating backup -> $backupZip"
# Create a quick zip backup (excludes the backup zip itself if rerun)
$itemsToZip = Get-ChildItem -Force | Where-Object { $_.Name -ne (Split-Path $backupZip -Leaf) }
Compress-Archive -Path $itemsToZip -DestinationPath $backupZip -Force -CompressionLevel Optimal

$trashDir = Join-Path $root '___trash_redirects'
if (-not (Test-Path $trashDir)) { New-Item -ItemType Directory -Path $trashDir | Out-Null }

# All HTML files
$files = Get-ChildItem -Recurse -File -Include *.html | Where-Object { $_.FullName -notmatch '\\___trash_redirects\\' }

function Get-RelUrl([IO.FileInfo]$f, [string]$rootPath) {
  $rel = $f.FullName.Substring($rootPath.Length).TrimStart('\')
  $rel = $rel -replace '\\','/'
  if ($rel -match '/index\.html$') { $rel = $rel -replace '/index\.html$','/' }
  if (-not $rel.StartsWith('/')) { $rel = '/' + $rel }
  return $rel
}

# Regex options
$IgnoreCase = [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
$Singleline  = [System.Text.RegularExpressions.RegexOptions]::Singleline

[int]$updated = 0
[int]$movedRedirects = 0

foreach ($f in $files) {
  $content = Get-Content -Raw -Encoding utf8 $f.FullName
  $relUrl = Get-RelUrl -f $f -rootPath $root
  $canonicalUrl = "$Domain$relUrl"

  # 1) Remove client-side redirect pages (move to trash folder)
  if ($content -match 'location\.replace\(' -or $content -match '<title>\s*Redirecting') {
     $relFile = $f.FullName.Substring($root.Length).TrimStart('\')
     $dest = Join-Path $trashDir $relFile
     $destDir = Split-Path $dest -Parent
     if (-not $WhatIf) {
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
        Move-Item -Force -Path $f.FullName -Destination $dest
     }
     $movedRedirects++
     Write-Host ("{0} redirect page: {1}" -f ($WhatIf ? "[WhatIf] Would move" : "[Moved]"), $relFile)
     continue
  }

  $orig = $content

  # 2) Ensure we have a <head> to inject into
  if ($content -notmatch '<head\b') { continue }

  # ---- Canonical --------------------------------------------------------------
  $content = $content -replace '<link\s+rel=["'']canonical["''][^>]*>\s*', ''
  $content = [regex]::Replace($content, '(<head[^>]*>)', "`$1`r`n    <link rel=""canonical"" href=""$canonicalUrl"">", 1)

  # ---- OG URL -----------------------------------------------------------------
  $content = $content -replace '<meta\s+property=["'']og:url["''][^>]*>\s*', ''
  $content = [regex]::Replace($content, '(<head[^>]*>)', "`$1`r`n    <meta property=""og:url"" content=""$canonicalUrl"">", 1)

  # ---- English converter pages: opinionated title/description + OG ------------
  if ($relUrl -like '/en/*/*/') {
     $segments = $relUrl.TrimEnd('/') -split '/'
     $format = $segments[-1]
     if ($format -match '^[a-z0-9\-]+$') {
        $FORMAT = $format.ToUpperInvariant()
        $newTitle = "Convert to $FORMAT - Fast, private, in-browser (no uploads)"
        $newDesc  = "Convert files to $FORMAT locally in your browser - fast, private, and free. No uploads; supports popular formats."

        # <title>
        if ($content -match '<title>') {
           $content = [regex]::Replace($content, '<title>.*?</title>', "<title>$newTitle</title>", $IgnoreCase -bor $Singleline)
        } else {
           $content = [regex]::Replace($content, '(<head[^>]*>)', "`$1`r`n    <title>$newTitle</title>", 1)
        }

        # <meta name="description">
        if ($content -match '<meta\s+name=["'']description["'']') {
          $content = [regex]::Replace($content, '<meta\s+name=["'']description["'']\s+content=["''][^"'']*["'']\s*/?>', "<meta name=""description"" content=""$newDesc"">", $IgnoreCase -bor $Singleline)
        } else {
          $content = [regex]::Replace($content, '(<head[^>]*>)', "`$1`r`n    <meta name=""description"" content=""$newDesc"">", 1)
        }

        # OG title/description
        $content = $content -replace '<meta\s+property=["'']og:title["''][^>]*>\s*', ''
        $content = $content -replace '<meta\s+property=["'']og:description["''][^>]*>\s*', ''
        $content = [regex]::Replace($content, '(<head[^>]*>)', "`$1`r`n    <meta property=""og:title"" content=""$newTitle"">`r`n    <meta property=""og:description"" content=""$newDesc"">", 1)

        # OG image: prefer /og/{format}.png if it exists; else /og/cover.png
        $ogCandidate = Join-Path $root ("og/" + $format + ".png")
        if (Test-Path $ogCandidate) { $ogUrl = "$Domain/og/$format.png" } else { $ogUrl = "$Domain/og/cover.png" }
        $content = $content -replace '<meta\s+property=["'']og:image["''][^>]*>\s*', ''
        $content = [regex]::Replace($content, '(<head[^>]*>)', "`$1`r`n    <meta property=""og:image"" content=""$ogUrl"">", 1)

        # Twitter card
        $content = $content -replace '<meta\s+name=["'']twitter:card["''][^>]*>\s*', ''
        $content = [regex]::Replace($content, '(<head[^>]*>)', "`$1`r`n    <meta name=""twitter:card"" content=""summary_large_image"">", 1)
     }
  }

  # ---- Deduplicate <link rel="alternate" hreflang="..."> ----------------------
  # (Keeps first unique full line; avoids duplicate en entries without guessing URLs)
  $content = [regex]::Replace($content, '(?is)(?<all>(?:\s*<link\s+rel=["'']alternate["'']\s+hreflang=["''][^"'']+["'']\s+href=["''][^"'']+["''][^>]*>\s*){2,})',
    {
      param($m)
      $lines = [regex]::Matches($m.Value, '<link\s+rel=["'']alternate["'']\s+hreflang=["''][^"'']+["'']\s+href=["''][^"'']+["''][^>]*>', $IgnoreCase) | ForEach-Object { $_.Value }
      $seen = @{}
      $kept = New-Object System.Collections.Generic.List[string]
      foreach ($line in $lines) {
        if (-not $seen.ContainsKey($line)) {
          $seen[$line] = $true
          [void]$kept.Add($line)
        }
      }
      return "`r`n" + ($kept -join "`r`n") + "`r`n"
    })

  if ($content -ne $orig) {
     if ($WhatIf) {
        Write-Host "[WhatIf] Would update $($f.FullName.Substring($root.Length).TrimStart('\'))"
     } else {
        Set-Content -LiteralPath $f.FullName -Value $content -Encoding utf8 -NoNewline
        $updated++
     }
  }
}

Write-Host "--------------------------------------------------------------------------------"
Write-Host ("Updated files: {0}" -f $updated)
Write-Host ("Redirect pages moved to ___trash_redirects: {0}" -f $movedRedirects)
Write-Host "Done."
