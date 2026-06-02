# Extrae el texto de un .docx (que es un ZIP) a un .txt, preservando saltos de
# párrafo y tabulaciones. Uso:
#   powershell -File extract_docx.ps1 "raw\archivo.docx" "processed\archivo.txt"
param(
  [Parameter(Mandatory=$true)][string]$Src,
  [Parameter(Mandatory=$true)][string]$Out
)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$tmp = Join-Path $env:TEMP ("docx_" + [System.Guid]::NewGuid().ToString("N"))
[System.IO.Compression.ZipFile]::ExtractToDirectory($Src, $tmp)

function Convert-WordXml([string]$path) {
  if (-not (Test-Path $path)) { return "" }
  $xml = Get-Content $path -Raw -Encoding UTF8
  $xml = $xml -replace '</w:p>', "`n"          # fin de párrafo -> salto
  $xml = $xml -replace '<w:br[^>]*/>', "`n"     # salto de línea
  $xml = $xml -replace '<w:tab[^>]*/>', "`t"    # tabulación (separa celdas)
  $xml = $xml -replace '</w:tr>', "`n"          # fin de fila de tabla
  $t = [System.Text.RegularExpressions.Regex]::Replace($xml, '<[^>]+>', '')
  return [System.Net.WebUtility]::HtmlDecode($t)
}

try {
  # 1) Cuerpo principal
  $body = Convert-WordXml (Join-Path $tmp "word\document.xml")
  # 2) Notas al pie y notas al final (contenido sustantivo en las bases)
  $foot = Convert-WordXml (Join-Path $tmp "word\footnotes.xml")
  $end  = Convert-WordXml (Join-Path $tmp "word\endnotes.xml")

  $text = $body
  if ($foot.Trim().Length -gt 0) { $text += "`n`n===== NOTAS AL PIE (footnotes) =====`n" + $foot }
  if ($end.Trim().Length  -gt 0) { $text += "`n`n===== NOTAS AL FINAL (endnotes) =====`n" + $end }

  # Limpiar líneas en blanco excesivas
  $text = [System.Text.RegularExpressions.Regex]::Replace($text, '(\r?\n){3,}', "`n`n")
  Set-Content -Path $Out -Value $text -Encoding UTF8
  $chars = $text.Length
  $lines = ($text -split "`n").Count
  $fnotes = ($foot -split "`n" | Where-Object { $_.Trim().Length -gt 0 }).Count
  Write-Output ("OK -> $Out | chars: $chars | lineas: $lines | lineas-notas-al-pie: $fnotes")
}
finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
