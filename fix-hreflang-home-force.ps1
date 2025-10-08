# fix-hreflang-home-force.ps1
# Removes ALL <link> tags that are either rel="alternate" OR contain hreflang="..."
# Then injects a single canonical hreflang block on each homepage (x-default + all languages).

param(
  [string]$Origin = "https://www.all-in-one-converter.net"
)

$PSDefaultParameterValues['Out-File:Encoding']    = 'utf8'
$PSDefaultParameterValues['Set-Content:Encoding'] = 'utf8'
$PSDefaultParameterValues['Add-Content:Encoding'] = 'utf8'

$root = (Get-Location).Path

# Language folders that contain index.html (preserve folder casing: pt-BR, zh-CN, etc.)
$langDirs = Get-ChildItem -Directory | Where-Object {
  $_.Name -match '^[A-Za-z]{2}(-[A-Za-z]{2})?$'
} | Where-Object {
  Test-Path (Join-Path $_.FullName 'index.html')
}

# Build homepage list (root + each language)
$homes = @()
$homes += [pscustomobject]@{ code='x-default'; href="$Origin/"; file=(Join-Path $root 'index.html') }
foreach ($d in $langDirs) {
  $code = $d.Name
  $href = "$Origin/$code/"
  $file = Join-Path $d.FullName 'index.html'
  $homes += [pscustomobject]@{ code=$code; href=$href; file=$file }
}

# One hreflang block (same for all)
$altLines = foreach($h in $homes){ "<link rel=""alternate"" hreflang=""$($h.code)"" href=""$($h.href)"" />" }
$altBlock = ($altLines -join "`r`n")

# Strongest remover: any <link ...> that has rel="alternate" OR hreflang="..."
$removeAltOrHreflang = @'
(?is)\s*<link\b[^>]*(?:\brel\s*=\s*["'']alternate["'']|\bhreflang\s*=\s*["''][^"'']+["''])[^>]*>\s*
'@

$updated = 0
foreach($h in $homes){
  if (-not (Test-Path $h.file)) { continue }
  $html = Get-Content -Raw -Encoding utf8 $h.file

  # Remove ALL previous alt/hreflang link tags
  $html2 = [regex]::Replace($html, $removeAltOrHreflang, '')

  # Insert a single fresh block
  if ($html2 -match '</head>') {
    $html2 = $html2 -replace '(?is)(</head>)', "`r`n$altBlock`r`n`$1"
  } else {
    $html2 = "$altBlock`r`n$html2"
  }

  if ($html2 -ne $html) {
    Set-Content -Path $h.file -Value $html2 -Encoding utf8
    Write-Host "hreflang re-written -> $($h.file)"
    $updated++
  }
}

Write-Host "hreflang re-written on $updated homepage(s)." -ForegroundColor Green
