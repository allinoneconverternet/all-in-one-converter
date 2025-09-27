$ErrorActionPreference = "Stop"

# Work on a short-lived branch
git fetch origin --prune
git switch -C fix/i18n-unmojibake origin/main

# Only these JSONs (update list if needed)
$targets = @(
  "i18n\strings\pt-BR.json",
  "i18n\strings\fr.json",
  "i18n\strings\es.json",
  "i18n\strings\de.json",
  "i18n\strings\pl.json",
  "i18n\strings\it.json"
) | ? { Test-Path $_ }

# CP1252->UTF8 repair for mojibake runs
$enc1252 = [System.Text.Encoding]::GetEncoding(1252)
$utf8    = [System.Text.Encoding]::UTF8
$pattern = [regex]'(Ã.|Â.|â[\x80-\xBF])+'  # typical mojibake clusters

function UnMojibake([string]$s){
  $bytes = $enc1252.GetBytes($s)
  return $utf8.GetString($bytes)
}

$changed = 0
foreach($p in $targets){
  $text = Get-Content -Raw -Encoding UTF8 $p
  $fixed = [regex]::Replace($text, $pattern, { param($m) (UnMojibake $m.Value) })
  # also drop stray leading "Â" before space or NBSP
  $fixed = [regex]::Replace($fixed, 'Â(?=[\u00A0 ])', '')

  if($fixed -ne $text){
    Set-Content -Encoding UTF8 $p $fixed
    Write-Host "fixed: $p"
    $changed++
  }
}

"Files changed: $changed"

git add i18n\strings\*.json
git commit -m "fix(i18n): un-mojibake locale JSON (CP1252→UTF-8) and strip stray Â"
git push -u origin fix/i18n-unmojibake

# Merge to main
git switch main
git pull --rebase origin main
git merge --ff-only fix/i18n-unmojibake 2>$null; if($LASTEXITCODE -ne 0){ git merge --no-ff -m "merge: fix/i18n-unmojibake" fix/i18n-unmojibake }
git push origin main

# Verify: re-scan these files for any remaining mojibake
$left = foreach($p in $targets){
  $t = Get-Content -Raw -Encoding UTF8 $p
  $n = ($pattern.Matches($t)).Count
  [pscustomobject]@{ File=$p; Matches=$n }
}
$left | Sort-Object Matches -Descending | Format-Table -AutoSize
