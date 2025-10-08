# seo-health-check.ps1  (ASCII-safe)
param(
  [string]$Origin = "https://www.all-in-one-converter.net"
)

# UTF-8 IO
$PSDefaultParameterValues['Out-File:Encoding']    = 'utf8'
$PSDefaultParameterValues['Set-Content:Encoding'] = 'utf8'
$PSDefaultParameterValues['Add-Content:Encoding'] = 'utf8'

$rootPath = (Get-Location).Path.TrimEnd('\','/')

function Get-RelDirUrl([string]$fullPath) {
  $rel = $fullPath.Substring($rootPath.Length) -replace '^[\\/]+',''
  $rel = $rel -replace '\\','/'
  if ($rel -match '(?i)/?index\.html$') { $rel = $rel -replace '(?i)index\.html$','' }
  if ([string]::IsNullOrWhiteSpace($rel) -or $rel -eq "/") { return "/" }
  if (-not $rel.EndsWith('/')) { $rel = ([System.IO.Path]::GetDirectoryName($rel) -replace '\\','/') + '/' }
  return '/' + $rel.TrimStart('/')
}

# Collect files
$indexFiles = Get-ChildItem -Path . -Filter 'index.html' -Recurse -File

# Patterns (single-quoted here-strings; double inner single-quotes)
$noindexPattern = @'
(?is)<meta[^>]*name\s*=\s*["'']robots["''][^>]*noindex
'@
$refreshPattern = @'
(?is)<meta[^>]*http-equiv\s*=\s*["'']refresh["'']
'@
$canonicalPattern = @'
(?is)<link[^>]*rel\s*=\s*["'']canonical["''][^>]*href\s*=\s*["'']([^"'']+)["'']
'@
$cssPattern = @'
(?is)<link[^>]+rel\s*=\s*["'']stylesheet["''][^>]+href\s*=\s*["'']([^"'']*styles(?:\.min)?\.css(?:\?[^"'']*)?)["'']
'@
$hreflangFind = @'
(?is)<link[^>]*rel\s*=\s*["'']alternate["''][^>]*hreflang\s*=\s*["'']([^"'']+)["''][^>]*>
'@

function Is-Indexable([string]$filePath) {
  $html = Get-Content -Raw -Path $filePath -Encoding utf8
  return ($html -notmatch $noindexPattern) -and ($html -notmatch $refreshPattern)
}

# Indexable URLs (from disk)
$indexable = foreach($f in $indexFiles){
  if(Is-Indexable $f.FullName){
    [pscustomobject]@{ File=$f.FullName; Url="$Origin$(Get-RelDirUrl $f.FullName)" }
  }
}

# SITEMAPS
$issues = @()
$smapUrls = @()
if (Test-Path .\sitemap-index.xml) {
  try {
    [xml]$idx = Get-Content -Raw -Encoding utf8 .\sitemap-index.xml
    $idxLocs = @($idx.sitemapindex.sitemap.loc) | Where-Object { $_ }
    if ($idxLocs.Count -eq 0) { $issues += "Sitemap index has 0 <sitemap> entries." }
    foreach($loc in $idxLocs){
      $name = Split-Path -Leaf $loc
      if (-not (Test-Path ".\$name")) { $issues += "Sitemap index points to missing local file: $name"; continue }
      [xml]$sm = Get-Content -Raw -Encoding utf8 ".\$name"
      $urls = @($sm.urlset.url) | Where-Object { $_ }
      foreach($u in $urls){
        $smapUrls += [pscustomobject]@{ Loc = $u.loc; Lastmod = $u.lastmod }
        if ($u.loc -notmatch '^https://www\.all-in-one-converter\.net/') { $issues += "Sitemap URL wrong host: $($u.loc)" }
        if ($u.loc -match 'https://[^/]+//') { $issues += "Sitemap URL has double slash: $($u.loc)" }
      }
    }
  } catch {
    $issues += "Could not parse sitemap-index.xml: $($_.Exception.Message)"
  }
} else {
  $issues += "Missing sitemap-index.xml at site root."
}

# Compare sitemap vs disk
$diskSet  = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$smapSet  = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$indexable.Url | ForEach-Object { [void]$diskSet.Add($_) }
$smapUrls.Loc  | ForEach-Object { [void]$smapSet.Add($_) }
$missingInSitemap = $indexable.Url | Where-Object { -not $smapSet.Contains($_) }
$extraInSitemap   = $smapUrls.Loc  | Where-Object { -not $diskSet.Contains($_) }

# robots.txt
$robotsOK = $false
if (Test-Path .\robots.txt) {
  $robots = Get-Content -Encoding utf8 .\robots.txt
  $sitemapLines = $robots | Where-Object { $_ -match '^\s*Sitemap\s*:' }
  if ($sitemapLines.Count -ne 1) { $issues += "robots.txt should have exactly 1 Sitemap: line (found $($sitemapLines.Count))." }
  elseif ($sitemapLines -notmatch [regex]::Escape("Sitemap: $Origin/sitemap-index.xml")) {
    $issues += "robots.txt Sitemap points somewhere else: $($sitemapLines -join ' | ')"
  } else { $robotsOK = $true }
} else {
  $issues += "Missing robots.txt at site root."
}

# HTML checks
$badCharset = @()
$badRobots  = @()
$hasRefresh = @()
$badCanon   = @()

foreach ($f in $indexFiles) {
  $html = Get-Content -Raw -Path $f.FullName -Encoding utf8

  if ($html -notmatch '(?i)<meta\s+charset=["'']utf-8["'']') { $badCharset += $f.FullName }
  if ($html -match $noindexPattern) { $badRobots += $f.FullName }
  if ($html -match $refreshPattern) { $hasRefresh += $f.FullName }

  $rel = Get-RelDirUrl $f.FullName
  $expectCanon = "$Origin$rel"
  $canonMatch = [regex]::Match($html, $canonicalPattern)
  if (-not $canonMatch.Success) {
    $badCanon += "$($f.FullName) - missing canonical"
  } else {
    $canonHref = $canonMatch.Groups[1].Value
    if ($canonHref -ne $expectCanon) { $badCanon += "$($f.FullName) - canonical '$canonHref' != '$expectCanon'" }
    if ($canonHref -match 'https://[^/]+//') { $badCanon += "$($f.FullName) - canonical has double slash" }
  }
}

# CSS audit (homepages)
$cssAudits = @()
$rootCss = (Select-String -Path .\index.html -Pattern $cssPattern -AllMatches).Matches |
           ForEach-Object { $_.Groups[1].Value } | Select-Object -First 1
if ($rootCss -and $rootCss -notmatch '^(https?:|//|/)') { $rootCss = "/$rootCss" }

$homeFiles = @((Join-Path $rootPath 'index.html'))
$homeFiles += Get-ChildItem -Directory | ForEach-Object {
  $f = Join-Path $_.FullName 'index.html'
  if (Test-Path $f) { $f }
}

foreach ($hf in $homeFiles) {
  $hrefs = (Select-String -Path $hf -Pattern $cssPattern -AllMatches).Matches |
           ForEach-Object { $_.Groups[1].Value }
  $hrefsAbs = $hrefs | ForEach-Object { if ($_ -notmatch '^(https?:|//|/)') { "/$_" } else { $_ } }
  $usesMin = ($hrefsAbs -match 'styles\.min\.css') -contains $true
  $isAbs   = ($hrefs -match '^(https?:|//|/)') -contains $true
  $cssAudits += [pscustomobject]@{
    File        = $hf
    Hrefs       = ($hrefs -join ' ; ')
    MatchesRoot = ($rootCss -and ($hrefsAbs -contains $rootCss))
    Absolute    = $isAbs
    Minified    = $usesMin
  }
}

# Hreflang cluster (homepages)
$langDirs = Get-ChildItem -Directory | Where-Object { $_.Name -match '^[A-Za-z]{2}(-[A-Za-z]{2})?$' } |
            Where-Object { Test-Path (Join-Path $_.FullName 'index.html') }

$homes = @()
$homes += [pscustomobject]@{ code='x-default'; file=(Join-Path $rootPath 'index.html') }
foreach ($d in $langDirs) { $homes += [pscustomobject]@{ code=$d.Name; file=(Join-Path $d.FullName 'index.html') } }
$totalCodes = $homes.code.Count

$hreflangIssues = @()
foreach ($h in $homes) {
  if (-not (Test-Path $h.file)) { $hreflangIssues += "Missing homepage file: $($h.file)"; continue }
  $html = Get-Content -Raw -Encoding utf8 $h.file
  $alts = [regex]::Matches($html, $hreflangFind)
  $codes = @($alts | ForEach-Object { $_.Groups[1].Value })
  if ($codes.Count -ne $totalCodes) {
    $hreflangIssues += "$($h.file) - has $($codes.Count) alternates, expected $totalCodes"
  } else {
    foreach ($code in $homes.code) {
      if ($codes -notcontains $code) { $hreflangIssues += "$($h.file) - missing hreflang '$code'" }
    }
  }
}

# REPORT
Write-Host ""
Write-Host "=== SEO Health Check ===" -ForegroundColor Cyan
Write-Host ("Indexable pages on disk: {0}" -f $indexable.Count)
Write-Host ("Sitemap URLs total:      {0}" -f $smapUrls.Count)
if ($missingInSitemap.Count) { Write-Host ("Missing in sitemap:       {0}" -f $missingInSitemap.Count) -ForegroundColor Yellow }
if ($extraInSitemap.Count)   { Write-Host ("Extra in sitemap:         {0}" -f $extraInSitemap.Count) -ForegroundColor Yellow }
if ($robotsOK)               { Write-Host "robots.txt: OK (single correct Sitemap line)" -ForegroundColor Green }

if ($badCharset.Count) { Write-Host ("Missing UTF-8 charset tags: {0}" -f $badCharset.Count) -ForegroundColor Yellow }
if ($badRobots.Count)  { Write-Host ("Still 'noindex' pages:       {0}" -f $badRobots.Count) -ForegroundColor Yellow }
if ($hasRefresh.Count) { Write-Host ("Pages with meta refresh:     {0}" -f $hasRefresh.Count) -ForegroundColor Yellow }
if ($badCanon.Count)   { Write-Host ("Canonical issues:            {0}" -f $badCanon.Count) -ForegroundColor Yellow }

Write-Host ""
Write-Host "-- CSS audit (homepages) --"
$cssAudits | Format-Table -AutoSize

if ($hreflangIssues.Count) {
  Write-Host ""
  Write-Host "Hreflang issues:" -ForegroundColor Yellow
  $hreflangIssues | Select-Object -First 50 | ForEach-Object { $_ }
} else {
  Write-Host ""
  Write-Host ("Hreflang clusters on homepages: OK (all {0} alternates present everywhere)" -f $totalCodes) -ForegroundColor Green
}

if ($missingInSitemap.Count) { "`nExample missing in sitemap:`n" + ($missingInSitemap | Select-Object -First 5 -Unique | Out-String) | Out-Host }
if ($extraInSitemap.Count)   { "`nExample extra in sitemap:`n"    + ($extraInSitemap   | Select-Object -First 5 -Unique | Out-String) | Out-Host }
if ($badCanon.Count)         { "`nCanonical problems (first 5):`n" + ($badCanon | Select-Object -First 5 | Out-String) | Out-Host }
