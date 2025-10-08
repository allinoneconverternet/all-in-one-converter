# add-hreflang-home.ps1
# Injects full hreflang clusters (x-default + all language homepages) before </head> on each homepage.
param(
  [string]$Origin = "https://www.all-in-one-converter.net"
)

$PSDefaultParameterValues['Out-File:Encoding']    = 'utf8'
$PSDefaultParameterValues['Set-Content:Encoding'] = 'utf8'
$PSDefaultParameterValues['Add-Content:Encoding'] = 'utf8'

$root = (Get-Location).Path

# Find language folders like ar, de, es, fr, ja, pt-BR, zh-CN — must contain index.html
$langDirs = Get-ChildItem -Directory | Where-Object {
  $_.Name -match '^[A-Za-z]{2}(-[A-Za-z]{2})?$'
} | Where-Object {
  Test-Path (Join-Path $_.FullName 'index.html')
}

# Build homepage list (root + each language)
$homes = @()
$homes += [pscustomobject]@{ code='x-default'; href="$Origin/"; file=(Join-Path $root 'index.html') }
foreach ($d in $langDirs) {
  $code = $d.Name.ToLower()
  $href = "$Origin/$code/"
  $file = Join-Path $d.FullName 'index.html'
  $homes += [pscustomobject]@{ code=$code; href=$href; file=$file }
}

# Render alternates (same set for every homepage)
$altLines = foreach($h in $homes){ "<link rel=""alternate"" hreflang=""$($h.code)"" href=""$($h.href)"" />" }
$altBlock = ($altLines -join "`r`n")

# Regex to remove any existing rel=alternate hreflang link tags
# Use a single-quoted here-string and **double** the inner single quotes to avoid parser errors.
$pattern = @'
(?is)\s*<link[^>]*rel\s*=\s*["'']alternate["''][^>]*hreflang\s*=\s*["''][^"'']+["''][^>]*>\s*
'@

$updated = 0
foreach($h in $homes){
  if (-not (Test-Path $h.file)) { continue }
  $html = Get-Content -Raw -Encoding utf8 $h.file

  # strip old alternates
  $html2 = [regex]::Replace($html, $pattern, '')

  # insert our block
  if ($html2 -match '</head>') {
    $html2 = $html2 -replace '(?is)(</head>)', "`r`n$altBlock`r`n`$1"
  } else {
    $html2 = "$altBlock`r`n$html2"
  }

  if ($html2 -ne $html) {
    Set-Content -Path $h.file -Value $html2 -Encoding utf8
    Write-Host "hreflang added -> $($h.file)"
    $updated++
  }
}

Write-Host "hreflang blocks injected on $updated homepage(s)." -ForegroundColor Green
