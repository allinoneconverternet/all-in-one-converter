<# ============================== seo-fixes_v4.ps1 ==============================
Auto-detects the web root (.\Converter or .), creates a sibling backup, and
applies safe SEO fixes while preserving original text encodings.
#>

$ErrorActionPreference = 'Stop'

# --- 0) Detect project root and web root ---
$ProjectRoot = (Resolve-Path ".").Path
$CandidateA  = Join-Path $ProjectRoot 'Converter'
if (Test-Path $CandidateA -PathType Container) {
  $WebRoot = $CandidateA
} else {
  $WebRoot = $ProjectRoot
}

# Sanity check: ensure there are HTML files under $WebRoot
$anyHtml = Get-ChildItem $WebRoot -Recurse -Filter '*.html' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $anyHtml) {
  throw "Couldn't find any .html files under '$WebRoot'. Run this from your project folder."
}

# --- Backup next to the web root (sibling folder), not inside it ---
$LeafName    = Split-Path $WebRoot -Leaf
$BackupParent= Split-Path $WebRoot -Parent
$stamp       = Get-Date -Format 'yyyyMMdd_HHmmss'
$backup      = Join-Path $BackupParent ("{0}_backup_{1}" -f $LeafName,$stamp)
Write-Host "Creating backup at: $backup"
Copy-Item $WebRoot $backup -Recurse -Force

# --- 1) Helpers to preserve encodings (avoid mojibake) ---
function Get-FileEncoding([string]$Path) {
  $fs = [System.IO.File]::OpenRead($Path)
  try {
    $bom = New-Object byte[] 4; [void]$fs.Read($bom,0,4)
    switch -regex ([BitConverter]::ToString($bom)) {
      '^EF-BB-BF'    { return New-Object System.Text.UTF8Encoding($true) }          # UTF-8 BOM
      '^FF-FE-00-00' { return New-Object System.Text.UTF32Encoding($false,$true) } # UTF-32 LE
      '^00-00-FE-FF' { return New-Object System.Text.UTF32Encoding($true,$true) }  # UTF-32 BE
      '^FF-FE'       { return New-Object System.Text.UnicodeEncoding($false,$true) } # UTF-16 LE
      '^FE-FF'       { return New-Object System.Text.UnicodeEncoding($true,$true) }  # UTF-16 BE
      default        { return New-Object System.Text.UTF8Encoding($false) }        # UTF-8 (no BOM)
    }
  } finally { $fs.Dispose() }
}
function Read-Text([string]$Path) {
  $enc = Get-FileEncoding $Path
  return ,@($enc,[System.IO.File]::ReadAllText($Path, $enc))
}
function Write-Text([string]$Path, [string]$Text, $Encoding) {
  # Write bytes manually to avoid StreamWriter/WriteAllText overload issues.
  $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
  try {
    $pre = $Encoding.GetPreamble()
    if ($pre -and $pre.Length -gt 0) { $fs.Write($pre,0,$pre.Length) }
    $bytes = $Encoding.GetBytes($Text)
    $fs.Write($bytes,0,$bytes.Length)
  } finally { $fs.Dispose() }
}

# --- 2) Config ---
$Locales = @('en','de','fr','es','pt','pt-BR','ru','tr','uk','hi','ar','zh-CN')
$OgLocales = @{
  'en'='en_US'; 'de'='de_DE'; 'fr'='fr_FR'; 'es'='es_ES'; 'pt'='pt_PT'; 'pt-BR'='pt_BR'
  'ru'='ru_RU'; 'tr'='tr_TR'; 'uk'='uk_UA'; 'hi'='hi_IN'; 'ar'='ar_SA'; 'zh-CN'='zh_CN'
}
$Base = 'https://www.all-in-one-converter.net'

# --- 3) Fix malformed canonicals/og:url everywhere (adds missing "/") ---
$allHtml = Get-ChildItem $WebRoot -Recurse -Filter '*.html'
[int]$canonFixCount = 0
foreach ($f in $allHtml) {
  $enc,$html = Read-Text $f.FullName
  $new = $html
  $new = [regex]::Replace($new,'(?i)href="https://www\.all-in-one-converter\.net(?!/)', 'href="https://www.all-in-one-converter.net/')
  $new = [regex]::Replace($new,'(?i)content="https://www\.all-in-one-converter\.net(?!/)', 'content="https://www.all-in-one-converter.net/')
  if ($new -ne $html) { Write-Text $f.FullName $new $enc; $canonFixCount++ }
}
Write-Host "Canonical/og:url normalized in $canonFixCount files."

# --- 4) Ensure <html lang> is correct on each locale homepage ---
[int]$langFixCount = 0
foreach ($loc in $Locales) {
  $idx = Join-Path $WebRoot (Join-Path $loc 'index.html')
  if (-not (Test-Path $idx)) { continue }
  $enc,$html = Read-Text $idx
  $new = $html
  if ($new -match '(?i)<html\b[^>]*\blang\s*=') {
    $new = [regex]::Replace($new, '(?i)(<html\b[^>]*\blang\s*=\s*")[^"]*(")', "`$1$loc`$2", 1)
  } else {
    $new = [regex]::Replace($new, '(?i)<html\b', "<html lang=""$loc""", 1)
  }
  if ($new -ne $html) { Write-Text $idx $new $enc; $langFixCount++ }
}
Write-Host "<html lang> set/normalized on $langFixCount locale homepages."

# --- 5) Rebuild hreflang + self-canonical on each locale homepage ---
[int]$hreflangApplied = 0
foreach ($loc in $Locales) {
  $idx = Join-Path $WebRoot (Join-Path $loc 'index.html')
  if (-not (Test-Path $idx)) { continue }
  $enc,$html = Read-Text $idx
  $new = $html

  # self-canonical
  $selfCanonical = "$Base/$loc/"
  if ($new -match '(?i)<link[^>]+rel\s*=\s*"canonical"[^>]*>') {
    $new = [regex]::Replace($new, '(?i)(<link[^>]+rel\s*=\s*"canonical"[^>]*\bhref\s*=\s*")[^"]*(")', "`$1$selfCanonical`$2", 1)
  } else {
    $new = [regex]::Replace($new, '(?i)</head>', "<link rel=""canonical"" href=""$selfCanonical"" />`r`n</head>", 1)
  }

  # remove existing hreflang alternates
  $new = [regex]::Replace($new, '(?is)<link\b[^>]*\brel\s*=\s*"alternate"[^>]*\bhreflang\s*=\s*"[^"]+"[^>]*>\s*', '')

  # insert fresh block
  $lines = @("<link rel=""alternate"" hreflang=""x-default"" href=""$Base/"" />")
  foreach ($l in $Locales) { $lines += "<link rel=""alternate"" hreflang=""$l"" href=""$Base/$l/"" />" }
  $hreflangBlock = ($lines -join "`r`n")
  $new = [regex]::Replace($new, '(?i)</head>', "$hreflangBlock`r`n</head>", 1)

  if ($new -ne $html) { Write-Text $idx $new $enc; $hreflangApplied++ }
}
Write-Host "hreflang + canonical applied on $hreflangApplied locale homepages."

# --- 6) Robots/OG meta (only if missing) on locale homepages ---
[int]$metaAdded = 0
foreach ($loc in $Locales) {
  $idx = Join-Path $WebRoot (Join-Path $loc 'index.html')
  if (-not (Test-Path $idx)) { continue }
  $enc,$html = Read-Text $idx
  $new = $html
  $insert = @()
  if ($new -notmatch '(?i)<meta\s+name\s*=\s*"robots"[^>]*>') {
    $insert += '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">'
  }
  if ($new -notmatch '(?i)<meta\s+property\s*=\s*"og:site_name"[^>]*>') {
    $insert += '<meta property="og:site_name" content="All-in-One Converter">'
  }
  $ogLoc = $OgLocales[$loc]
  if ($ogLoc -and $new -notmatch '(?i)<meta\s+property\s*=\s*"og:locale"[^>]*>') {
    $insert += ('<meta property="og:locale" content="{0}">' -f $ogLoc)
  }
  if ($insert.Count -gt 0) {
    $block = ($insert -join "`r`n")
    $new = [regex]::Replace($new, '(?i)</head>', "$block`r`n</head>", 1)
  }
  if ($new -ne $html) { Write-Text $idx $new $enc; $metaAdded++ }
}
Write-Host "Robots/OG meta added on $metaAdded locale homepages."

# --- 7) De-duplicate hreflang alternates everywhere (keep first seen) ---
[int]$dedupCount = 0
$pattern = New-Object System.Text.RegularExpressions.Regex('(?is)<link\b[^>]*\brel\s*=\s*"alternate"[^>]*\bhreflang\s*=\s*"(?<lang>[^"]+)"[^>]*\bhref\s*=\s*"(?<href>[^"]+)"[^>]*>')
foreach ($f in $allHtml) {
  $enc,$html = Read-Text $f.FullName
  $seen = New-Object System.Collections.Generic.HashSet[string]
  $new  = $pattern.Replace($html, {
    param($m)
    $lang = $m.Groups['lang'].Value.ToLowerInvariant()
    if ($seen.Add($lang)) { $m.Value } else { '' }
  })
  if ($new -ne $html) { Write-Text $f.FullName $new $enc; $dedupCount++ }
}
Write-Host "Removed duplicate hreflang tags in $dedupCount files."

# --- 8) Add 'defer' to external <script src> tags (skip JSON-LD & inline) ---
[int]$deferCount = 0
$scriptOpen = New-Object System.Text.RegularExpressions.Regex('(?is)<script(?<attrs>[^>]*)>')
foreach ($f in $allHtml) {
  $enc,$html = Read-Text $f.FullName
  $new = $scriptOpen.Replace($html, {
    param($m)
    $attrs = $m.Groups['attrs'].Value
    if ($attrs -match 'type\s*=\s*"(?:application/ld\+json)"') { return $m.Value } # keep JSON-LD intact
    if ($attrs -notmatch '\bsrc\s*=' ) { return $m.Value }                          # inline script -> leave as-is
    if ($attrs -match '\b(async|defer)\b') { return $m.Value }                      # already async/defer
    return "<script$attrs defer>"
  })
  if ($new -ne $html) { Write-Text $f.FullName $new $enc; $deferCount++ }
}
Write-Host "Added 'defer' to script tags in $deferCount files."

Write-Host "Done. Backup is here: $backup"
# ============================ end seo-fixes_v4.ps1 =============================#
