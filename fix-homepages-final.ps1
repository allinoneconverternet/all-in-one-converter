# fix-homepages-final.ps1
# - Dedupe stylesheet links to styles(.min).css on homepages (root + language folders)
# - Hard-clean any existing hreflang <link> variants and inject one clean block
# - Normalize canonical link to self URL
# All IO in UTF-8 (safe for Arabic/European/Japanese chars)

param(
  [string]$Origin = "https://www.all-in-one-converter.net"
)

$PSDefaultParameterValues['Out-File:Encoding']    = 'utf8'
$PSDefaultParameterValues['Set-Content:Encoding'] = 'utf8'
$PSDefaultParameterValues['Add-Content:Encoding'] = 'utf8'

$root = (Get-Location).Path.TrimEnd('\','/')

function Get-RelDirUrl([string]$fullPath) {
  $rel = $fullPath.Substring($root.Length) -replace '^[\\/]+',''
  $rel = $rel -replace '\\','/'
  if ($rel -match '(?i)/?index\.html$') { $rel = $rel -replace '(?i)index\.html$','' }
  if ([string]::IsNullOrWhiteSpace($rel) -or $rel -eq "/") { return "/" }
  if (-not $rel.EndsWith('/')) {
    $rel = ([System.IO.Path]::GetDirectoryName($rel) -replace '\\','/') + '/'
  }
  return '/' + $rel.TrimStart('/')
}

# Detect canonical root stylesheet; fall back to /styles.css
$cssDetectPattern = @'
(?is)<link[^>]+rel\s*=\s*["'']stylesheet["''][^>]+href\s*=\s*["'']([^"'']*styles(?:\.min)?\.css(?:\?[^"'']*)?)["'']
'@
$rootCss = (Select-String -Path (Join-Path $root 'index.html') -Pattern $cssDetectPattern -AllMatches).Matches |
           ForEach-Object { $_.Groups[1].Value } | Select-Object -First 1
if (-not $rootCss) { $rootCss = "/styles.css" }
if ($rootCss -notmatch '^(https?:|//|/)') { $rootCss = "/$rootCss" }

# Homepages = root + any immediate child folder with index.html
$homes = @()
$homes += [pscustomobject]@{ code='x-default'; file=(Join-Path $root 'index.html') }
$langDirs = Get-ChildItem -Directory | Where-Object { $_.Name -match '^[A-Za-z]{2}(-[A-Za-z]{2})?$' } |
            Where-Object { Test-Path (Join-Path $_.FullName 'index.html') }
foreach ($d in $langDirs) {
  $homes += [pscustomobject]@{ code=$d.Name; file=(Join-Path $d.FullName 'index.html') }
}

# Build hreflang block (preserve folder casing like pt-BR, zh-CN)
$altLines = foreach($h in $homes){
  # Map x-default to site root, others to /<code>/
  $href = if ($h.code -eq 'x-default') { "$Origin/" } else { "$Origin/$($h.code)/" }
  "<link rel=""alternate"" hreflang=""$($h.code)"" href=""$href"" />"
}
$altBlock = ($altLines -join "`r`n")

# Removers (robust to attribute order, quotes, and newlines)
$removeAnyHreflang = @'
(?is)\s*<link\b[^>]*(?:\brel\s*=\s*(?:"alternate"|'alternate'|alternate)|\bhreflang\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))[^>]*>\s*
'@
$removeStylesLinks = @'
(?is)\s*<link[^>]+rel\s*=\s*["'']stylesheet["''][^>]+href\s*=\s*["''][^"'']*styles(?:\.min)?\.css(?:\?[^"'']*)?["''][^>]*>\s*
'@
$removeCanonical = @'
(?is)\s*<link[^>]*rel\s*=\s*["'']canonical["''][^>]*>\s*
'@

$updated = 0
$cssFixed = 0
$hreFixed = 0
$canonFixed = 0

foreach ($h in $homes) {
  if (-not (Test-Path $h.file)) { continue }
  $html = Get-Content -Raw -Encoding utf8 $h.file
  $orig = $html

  # 1) Remove all hreflang alternates and re-insert clean cluster
  $html = [regex]::Replace($html, $removeAnyHreflang, '')
  if ($html -match '</head>') {
    # ensure only one cluster by first removing any we might have inserted previously
    $html = [regex]::Replace($html, [regex]::Escape($altBlock), '')
    $html = $html -replace '(?is)(</head>)', "`r`n$altBlock`r`n`$1"
    $hreFixed++
  } else {
    $html = "$altBlock`r`n$html"
    $hreFixed++
  }

  # 2) Stylesheet dedupe: remove all styles(.min).css links, then insert one canonical
  $html = [regex]::Replace($html, $removeStylesLinks, '')
  $cssTag = "<link rel=""stylesheet"" href=""$rootCss"">"
  if ($html -match '</head>') {
    # insert once (avoid duplication if identical already present)
    if ($html -notmatch [regex]::Escape($cssTag)) {
      $html = $html -replace '(?is)(</head>)', "`r`n$cssTag`r`n`$1"
    }
  } else {
    $html = "$cssTag`r`n$html"
  }
  $cssFixed++

  # 3) Canonical fix: self-canonical per homepage
  $rel = Get-RelDirUrl $h.file
  $expectedCanon = "$Origin$rel"
  $html = [regex]::Replace($html, $removeCanonical, '')
  $canonTag = "<link rel=""canonical"" href=""$expectedCanon"" />"
  if ($html -match '</head>') {
    # avoid adding if identical already present
    if ($html -notmatch [regex]::Escape($canonTag)) {
      $html = $html -replace '(?is)(</head>)', "`r`n$canonTag`r`n`$1"
    }
  } else {
    $html = "$canonTag`r`n$html"
  }
  $canonFixed++

  if ($html -ne $orig) {
    Set-Content -Path $h.file -Value $html -Encoding utf8
    Write-Host "Fixed -> $($h.file)"
    $updated++
  }
}

Write-Host "Updated files: $updated" -ForegroundColor Green
Write-Host "Hreflang refreshed: $hreFixed  |  CSS normalized: $cssFixed  |  Canonicals set: $canonFixed"
