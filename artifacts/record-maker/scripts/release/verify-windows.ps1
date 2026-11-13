param([Parameter(Mandatory=$true)][string[]]$Files)
$ErrorActionPreference = 'Stop'
$allowed = @($env:RECORD_MAKER_PUBLISHER_NAME.Split(';') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($allowed.Count -eq 0) { throw 'An approved signing publisher is required.' }
foreach ($file in $Files) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'A signed artifact is missing.' }
  $signature = Get-AuthenticodeSignature -LiteralPath $file
  if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate) {
    throw 'A release artifact does not have a valid Windows signature.'
  }
  $name = $signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
  if ($allowed -cnotcontains $name) { throw 'Release artifact publisher mismatch.' }
  if (-not $signature.TimeStamperCertificate) { throw 'Release signatures must be timestamped.' }
}
Write-Output 'Windows signatures, timestamps and approved publishers verified.'
