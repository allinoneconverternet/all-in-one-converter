$exts = @('html','htm','css','js','json','md','txt','xml','csv','mjs','yml','yaml')
$bad  = @('Ã—','Ã·','â€“','â€”','â€˜','â€™','â€œ','â€�','â€¦','â€¢','â‚¬','â„¢','Â°','Â©','Â®','Â±','Â·','Â£','Â¥','Â ')
$files = Get-ChildItem -Recurse -File | Where-Object {
  $exts -contains $_.Extension.TrimStart('.').ToLower() -and
  $_.FullName -notmatch '\\(archives|vendor|node_modules|\.git|\.github|tests|\.backups)\\' -and
  $_.Name -notmatch '\.bak$'
}
$pat = [string]::Join('|', ($bad | ForEach-Object { [regex]::Escape($_) }))
$report = foreach($f in $files){
  $t = Get-Content -Raw -Encoding UTF8 $f.FullName
  $n = [regex]::Matches($t,$pat).Count
  if($n){ [pscustomobject]@{ File=$f.FullName; Matches=$n } }
}
$report | Sort-Object Matches -Descending | Format-Table -AutoSize
$report | Export-Csv .\reports\mojibake-report.csv -NoTypeInformation
