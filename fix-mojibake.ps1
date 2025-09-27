$ErrorActionPreference = "Stop"

function FromCp1252([string]$hex) {
  $bytes = $hex -split '\s+' | ForEach-Object { [Convert]::ToByte($_,16) }
  [Text.Encoding]::GetEncoding(1252).GetString($bytes)
}
function U([string]$hex) {
  ($hex -split '\s+' | ForEach-Object { [char]([Convert]::ToInt32($_,16)) }) -join ''
}

git fetch origin --prune
git switch -C fix/mojibake main

$exts = @('html','htm','css','js','json','md','txt','xml','csv','mjs','yml','yaml')
$files = Get-ChildItem -Recurse -File | Where-Object {
  $exts -contains $_.Extension.TrimStart('.').ToLower() -and
  $_.FullName -notmatch '\\(archives|vendor|node_modules|\.git|\.github|tests|\.backups)\\' -and
  $_.Name -notmatch '\.bak$'
}

$map = @(
  @{ bad = FromCp1252 'E2 80 93'; good = U '2013' } # en dash
  @{ bad = FromCp1252 'E2 80 94'; good = U '2014' } # em dash
  @{ bad = FromCp1252 'E2 80 98'; good = U '2018' } # left single quote
  @{ bad = FromCp1252 'E2 80 99'; good = U '2019' } # right single/apostrophe
  @{ bad = FromCp1252 'E2 80 9C'; good = U '201C' } # left double quote
  @{ bad = FromCp1252 'E2 80 9D'; good = U '201D' } # right double quote
  @{ bad = FromCp1252 'E2 80 A6'; good = U '2026' } # ellipsis
  @{ bad = FromCp1252 'E2 80 A2'; good = U '2022' } # bullet
  @{ bad = FromCp1252 'C2 A0';    good = ' '     }  # NBSP -> space
  @{ bad = FromCp1252 'C2 A9';    good = U '00A9' } # ©
  @{ bad = FromCp1252 'C2 AE';    good = U '00AE' } # ®
  @{ bad = FromCp1252 'C2 B0';    good = U '00B0' } # °
  @{ bad = FromCp1252 'C2 B1';    good = U '00B1' } # ±
  @{ bad = FromCp1252 'C2 B7';    good = U '00B7' } # ·
  @{ bad = FromCp1252 'C2 A3';    good = U '00A3' } # £
  @{ bad = FromCp1252 'C2 A5';    good = U '00A5' } # ¥
  @{ bad = FromCp1252 'E2 82 AC'; good = U '20AC' } # €
  @{ bad = FromCp1252 'E2 84 A2'; good = U '2122' } # ™
  @{ bad = FromCp1252 'C3 97';    good = U '00D7' } # ×
  @{ bad = FromCp1252 'C3 B7';    good = U '00F7' } # ÷
)

$changed = 0
foreach($f in $files){
  $path = $f.FullName
  $text = Get-Content -Raw -Encoding UTF8 $path
  $orig = $text

  foreach($r in $map){
    if ($text.Contains($r.bad)) { $text = $text -replace [regex]::Escape($r.bad), [regex]::Escape($r.good) -replace '\\','\' }
  }

  # Extra: remove stray leading "Â" before normal space or NBSP, if any remain
  $text = [regex]::Replace($text, 'Â(?=[\u00A0 ])', '')

  if($text -ne $orig){
    Set-Content -Encoding UTF8 $path $text
    $changed++
    Write-Host "fixed: $path"
  }
}

"Files changed: $changed"

git add -A
git commit -m 'fix(encoding): remove mojibake and normalize UTF-8 punctuation' 2>$null
git push -u origin fix/mojibake

git switch main
git merge --ff-only fix/mojibake 2>$null
if ($LASTEXITCODE -ne 0) { git merge --no-ff -m 'merge: fix/mojibake' fix/mojibake }
git push origin main
