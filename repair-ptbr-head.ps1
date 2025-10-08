# repair-ptbr-head.ps1
param([string]$Origin = "https://www.all-in-one-converter.net")

$PSDefaultParameterValues['Out-File:Encoding']    = 'utf8'
$PSDefaultParameterValues['Set-Content:Encoding'] = 'utf8'
$PSDefaultParameterValues['Add-Content:Encoding'] = 'utf8'

$path = ".\pt-BR\index.html"
if (-not (Test-Path $path)) { throw "File not found: $path" }
$html = Get-Content -Raw -Encoding utf8 $path

# --- 0) Keep ONLY the first <head>…</head>; remove any additional head blocks
$firstHead = [regex]::Match($html, '(?is)<head[^>]*>.*?</head>')
if (-not $firstHead.Success) { throw "No <head> block found in $path" }

$before = $html.Substring(0, $firstHead.Index)
$head   = $firstHead.Value
$after  = $html.Substring($firstHead.Index + $firstHead.Length)

# Remove any other <head>…</head> blocks from the remainder
$after  = [regex]::Replace($after, '(?is)<head[^>]*>.*?</head>', '')

# --- 1) Clean the head: strip comments that contain hreflang or stylesheet
$head = [regex]::Replace($head, '(?is)<!--.*?-->', { param($m)
  if ($m.Value -match 'hreflang|rel\s*=\s*["'']stylesheet["'']') { '' } else { $m.Value }
})

# Remove ALL styles(.min).css links (any attr order/quotes) from head
$rmCss = '(?is)\s*<link\b(?=[^>]*\brel\s*=\s*["'']stylesheet["''])(?=[^>]*\bhref\s*=\s*["''][^"'']*styles(?:\.min)?\.css(?:\?[^"'']*)?["''])[^>]*>\s*'
$head  = [regex]::Replace($head, $rmCss, '')

# Remove ALL hreflang alternates (robust: by rel=alternate and by hreflang=)
$head  = [regex]::Replace($head, '(?is)\s*<link\b[^>]*\brel\s*=\s*["'']alternate["''][^>]*>\s*', '')
$head  = [regex]::Replace($head, '(?is)\s*<link\b[^>]*\bhreflang\s*=\s*["''][^"'']+["''][^>]*>\s*', '')

# Remove any existing canonical
$head  = [regex]::Replace($head, '(?is)\s*<link[^>]*rel\s*=\s*["'']canonical["''][^>]*>\s*', '')

# --- 2) Build fresh blocks
# A) Stylesheet (use the same as your other homepages)
$cssTag = '<link rel="stylesheet" href="/styles.css">'

# B) Hreflang cluster from actual folders (preserve case of pt-BR, zh-CN, etc.)
$langDirs = Get-ChildItem -Directory | Where-Object {
  $_.Name -match '^[A-Za-z]{2}(-[A-Za-z]{2})?$' -and (Test-Path (Join-Path $_.FullName 'index.html'))
}
$homes = @([pscustomobject]@{ code='x-default'; href="$Origin/" })
$homes += $langDirs | ForEach-Object { [pscustomobject]@{ code=$_.Name; href="$Origin/$($_.Name)/" } }
$altBlock = ($homes | ForEach-Object { "<link rel=""alternate"" hreflang=""$($_.code)"" href=""$($_.href)"" />" }) -join "`r`n"

# C) Canonical for pt-BR
$canonTag = '<link rel="canonical" href="https://www.all-in-one-converter.net/pt-BR/" />'

# --- 3) Insert blocks before the (first) </head>
$insert = "$cssTag`r`n$altBlock`r`n$canonTag"
$head   = $head -replace '(?is)(</head>)', "`r`n$insert`r`n`$1"

# --- 4) Reassemble and save
$newHtml = $before + $head + $after
Set-Content -Path $path -Value $newHtml -Encoding utf8
Write-Host "pt-BR head deduped and normalized." -ForegroundColor Green
