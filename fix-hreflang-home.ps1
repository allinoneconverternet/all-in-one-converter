# fix-hreflang-home.ps1
# Cleans duplicate/old hreflang tags and reinjects a single canonical block on each homepage.

param(
  [string]$Origin = "https://www.all-in-one-converter.net"
)

$PSDefaultParameterValues['Out-File:Encoding']    = 'utf8'
$PSDefaultParameterValues['Set-Content:Encoding'] = 'utf8'
$PSDefaultParameterValues['Add-Content:Encoding'] = 'utf8'

$root = (Get-Location).Path

# Find language folders (must contain index.html). Preserve folder casing for hreflang value.
$langDirs = Get-ChildItem -Directory | Where-Object {
  $_.Name -match '^[A-Za-z]{2}(-[A-Za-z]{2})?$'
} | Where-Object {
  Test-Path (Join-Path $_.FullName 'index.html')
}

# Build homepage list (root + each language)
$homes = @()
$homes += [pscustomobject]@{ code='x-default'; href="$Origin/"; file=(Join-Path $root 'index.html') }
foreach ($d in $langDirs) {
  $code = $d.Name  # keep case (e.g., pt-BR, zh-CN)
  $href = "$Origin/$code/"
  $file = Join-Path $d.FullName 'index.html'
  $homes += [pscustomobject]@{ code=$code; href=$href; file=$file }
}

# Generate canonical alternate block (same for every homepage)
$altLines = foreach($h in $homes){ "<link rel=""alternate"" hreflang=""$($h.code)"" href=""$($h.href)"" />" }
$altBlock = ($altLines -join "`r`n")

# Strong remover: any <link> tag that has BOTH rel="alternate" AND hreflang="..."
$remover = @'
(?is)\s*<link(?=[^>]*\brel\s*=\s*["'']alternate["''])(?=[^>]*\bhreflang\s*=\s*["''][^"'']+["''])[^>]*>\s*
'@

$updated = 0
foreach($h in $homes){
  if (-not (Test-Path $h.file)) { continue }
  $html = Get-Content -Raw -Encoding utf8 $h.file

  # Remove any existing hreflang alternates (order-independent)
  $html2 = [regex]::Replace($html, $remover, '')

  # Insert fresh block once
  if ($html2 -match '</head>') {
    $html2 = $html2 -replace '(?is)(</head>)', "`r`n$altBlock`r`n`$1"
  } else {
    $html2 = "$altBlock`r`n$html2"
  }

  if ($html2 -ne $html) {
    Set-Content -Path $h.file -Value $html2 -Encoding utf8
    Write-Host "hreflang normalized -> $($h.file)"
    $updated++
  }
}

Write-Host "hreflang normalized on $updated homepage(s)." -ForegroundColor Green
