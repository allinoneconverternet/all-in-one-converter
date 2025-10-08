# fix-canonicals-all.ps1
param([string]$Origin = "https://www.all-in-one-converter.net")

$PSDefaultParameterValues['Out-File:Encoding']    = 'utf8'
$PSDefaultParameterValues['Set-Content:Encoding'] = 'utf8'
$PSDefaultParameterValues['Add-Content:Encoding'] = 'utf8'

$root = (Get-Location).Path.TrimEnd('\','/')

function Get-RelDirUrl([string]$fullPath) {
  $rel = $fullPath.Substring($root.Length) -replace '^[\\/]+',''
  $rel = $rel -replace '\\','/'
  if ($rel -match '(?i)/?index\.html$') { $rel = $rel -replace '(?i)index\.html$','' }
  if ([string]::IsNullOrWhiteSpace($rel) -or $rel -eq "/") { return "/" }
  if (-not $rel.EndsWith('/')) { $rel = ([System.IO.Path]::GetDirectoryName($rel) -replace '\\','/') + '/' }
  return '/' + $rel.TrimStart('/')
}

$removeCanonical = '(?is)\s*<link[^>]*rel\s*=\s*["'']canonical["''][^>]*>\s*'

Get-ChildItem -Recurse -Filter index.html -File | ForEach-Object {
  $f = $_.FullName
  $html = Get-Content -Raw -Encoding utf8 $f
  $rel  = Get-RelDirUrl $f
  $canonTag = "<link rel=""canonical"" href=""$Origin$rel"" />"

  $new = [regex]::Replace($html, $removeCanonical, '')
  if ($new -match '</head>') {
    if ($new -notmatch [regex]::Escape($canonTag)) {
      $new = $new -replace '(?is)(</head>)', "`r`n$canonTag`r`n`$1"
    }
  } else {
    $new = "$canonTag`r`n$new"
  }

  if ($new -ne $html) {
    Set-Content -Path $f -Value $new -Encoding utf8
    Write-Host "Canonical set -> $f"
  }
}
Write-Host "Canonicals normalized." -ForegroundColor Green
