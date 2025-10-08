# fix-hreflang-home-hard.ps1
# Nukes ALL existing <link ... hreflang="..."> tags on each homepage,
# then injects one canonical hreflang block (x-default + all languages).

param(
  [string]$Origin = "https://www.all-in-one-converter.net"
)

$PSDefaultParameterValues['Out-File:Encoding']    = 'utf8'
$PSDefaultParameterValues['Set-Content:Encoding'] = 'utf8'
$PSDefaultParameterValues['Add-Content:Encoding'] = 'utf8'

$root = (Get-Location).Path

# Language folders that contain index.html (preserve folder casing like pt-BR, zh-CN)
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

# One block for all
$altLines = foreach($h in $homes){ "<link rel=""alternate"" hreflang=""$($h.code)"" href=""$($h.href)"" />" }
$altBlock = ($altLines -join "`r`n")

# Strongest remover: remove ANY <link> that has hreflang=... (order/casing/newlines don’t matter)
$removeAnyHreflang = @'
(?is)\s*<link[^>]*\bhreflang\s*=\s*["''][^"'']+["''][^>]*>\s*
'@

$updated = 0
foreach($h in $homes){
  if (-not (Test-Path $h.file)) { continue }
  $html = Get-Content -Raw -Encoding utf8 $h.file

  # remove all existing hreflang link tags (whatever the rel is)
  $html2 = [regex]::Replace($html, $removeAnyHreflang, '')

  # insert fresh canonical block
  if ($html2 -match '</head>') {
    $html2 = $html2 -replace '(?is)(</head>)', "`r`n$altBlock`r`n`$1"
  } else {
    $html2 = "$altBlock`r`n$html2"
  }

  if ($html2 -ne $html) {
    Set-Content -Path $h.file -Value $html2 -Encoding utf8
    Write-Host "hreflang hard-normalized -> $($h.file)"
    $updated++
  }
}

Write-Host "hreflang hard-normalized on $updated homepage(s)." -ForegroundColor Green
