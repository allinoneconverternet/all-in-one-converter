$ErrorActionPreference = "Stop"

# UTF-8 helpers (no BOM)
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
function Read-Utf8([string]$p){ [IO.File]::ReadAllText((Resolve-Path $p), [Text.Encoding]::UTF8) }
function Write-Utf8([string]$p,[string]$t){ [IO.File]::WriteAllText((Resolve-Path $p), $t, $Utf8NoBom) }

# --- Load source (template) head from pt-BR\index.html ---
$srcPath = ".\pt-BR\index.html"
if(!(Test-Path $srcPath)){ throw "Source not found: $srcPath" }
$src = Read-Utf8 $srcPath

$srcHeadFull = [regex]::Match($src, '(?is)<head\b.*?</head>').Value
if([string]::IsNullOrWhiteSpace($srcHeadFull)){ throw "Could not extract <head> from $srcPath" }

# Small helper to ensure html lang="pt-BR"
function Ensure-LangPTBR([string]$htmlOpen){
  if([string]::IsNullOrWhiteSpace($htmlOpen)){ return '<html lang="pt-BR">' }
  $out = [regex]::Replace($htmlOpen,'(?is)(<html\b[^>]*\blang\s*=\s*["''])[^\\"'']+(["''])','$1pt-BR$2')
  if($out -eq $htmlOpen){
    $out = $out -replace '(?is)<html\b', '<html lang="pt-BR"'
  }
  return $out
}

# Clean/insert a single rel=canonical
function Set-Canonical([string]$head,[string]$url){
  $h = [regex]::Replace($head,'(?is)\s*<link\b[^>]*\brel\s*=\s*["'']canonical["''][^>]*>\s*','')
  return ($h -replace '(?is)</head>', '<link rel="canonical" href="' + $url + '"></head>')
}

# Replace or insert a named meta content
function Upsert-Meta([string]$head,[string]$name,[string]$content){
  if([string]::IsNullOrWhiteSpace($content)){ return $head }
  $pat = '(?is)<meta\s+name=["'']' + [regex]::Escape($name) + '["'']\s+content=["''][^"'']*["'']\s*/?>'
  if($head -match $pat){
    return [regex]::Replace($head, $pat, '<meta name="' + $name + '" content="' + $content + '">')
  } else {
    return ($head -replace '(?is)</head>', '<meta name="' + $name + '" content="' + $content + '"></head>')
  }
}

# Replace or insert an OG/Twitter property
function Upsert-Prop([string]$head,[string]$prop,[string]$content){
  if([string]::IsNullOrWhiteSpace($content)){ return $head }
  $pat = '(?is)<meta\s+(?:property|name)=["'']' + [regex]::Escape($prop) + '["'']\s+content=["''][^"'']*["'']\s*/?>'
  if($head -match $pat){
    return [regex]::Replace($head, $pat, '<meta ' + ($(if($prop -like 'twitter:*'){'name'}else{'property'})) + '="' + $prop + '" content="' + $content + '">')
  } else {
    return ($head -replace '(?is)</head>', '<meta ' + ($(if($prop -like 'twitter:*'){'name'}else{'property'})) + '="' + $prop + '" content="' + $content + '"></head>')
  }
}

# Compute canonical for a pt-BR subpage path
function Make-Canonical([string]$fullFilePath){
  $dir = (Split-Path $fullFilePath -Parent)
  $low = $dir.ToLower()
  $marker = '\pt-br\'
  $i = $low.IndexOf($marker)
  $tail = if($i -ge 0){ $dir.Substring($i + $marker.Length) } else { '' }
  $tail = $tail.Trim('\').Replace('\','/')
  if([string]::IsNullOrEmpty($tail)){ return 'https://www.all-in-one-converter.net/pt-BR/' }
  else { return 'https://www.all-in-one-converter.net/pt-BR/' + $tail + '/' }
}

# --- Process every pt-BR\**\index.html except the root one ---
$targets = Get-ChildItem -Recurse -File -Path .\pt-BR -Filter index.html |
           Where-Object { $_.FullName -notmatch '\\pt-BR\\index\.html$' }

foreach($t in $targets){
  $old = Read-Utf8 $t.FullName

  # Grab target pieces
  $htmlOpen = [regex]::Match($old,'(?is)<html\b[^>]*>').Value
  if([string]::IsNullOrWhiteSpace($htmlOpen)){ $htmlOpen = '<html lang="pt-BR">' }
  $htmlOpen = Ensure-LangPTBR $htmlOpen

  $bodyFull = [regex]::Match($old,'(?is)<body\b.*?</body>').Value
  if([string]::IsNullOrWhiteSpace($bodyFull)){
    Write-Warning "No <body> found -> skipping: $($t.FullName)"
    continue
  }

  # Keep page-specific title/description if present
  $oldTitle = [regex]::Match($old,'(?is)<title[^>]*>(.*?)</title>').Groups[1].Value.Trim()
  $oldDesc  = [regex]::Match($old,'(?is)<meta\s+name=["'']description["'']\s+content=["''](.*?)["'']\s*/?>').Groups[1].Value.Trim()

  # Start from template head and customize
  $head = $srcHeadFull
  if($oldTitle){
    $head = [regex]::Replace($head,'(?is)<title\b[^>]*>.*?</title>', '<title>' + $oldTitle + '</title>')
    $head = Upsert-Prop $head 'og:title' $oldTitle
    $head = Upsert-Prop $head 'twitter:title' $oldTitle
  }
  if($oldDesc){
    $head = Upsert-Meta $head 'description' $oldDesc
    $head = Upsert-Prop $head 'og:description' $oldDesc
    $head = Upsert-Prop $head 'twitter:description' $oldDesc
  }

  $canon = Make-Canonical $t.FullName
  $head = Set-Canonical $head $canon
  $head = Upsert-Prop $head 'og:url' $canon

  # Assemble final
  $newDoc = "<!doctype html>`n" + $htmlOpen + "`n" + $head + "`n" + $bodyFull + "`n</html>"

  Write-Utf8 $t.FullName $newDoc
  "Updated -> $($t.FullName)"
}
