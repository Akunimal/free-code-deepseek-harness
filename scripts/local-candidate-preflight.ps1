param([switch]$PrepareRuntime, [switch]$FreeCodeIsClosed)
$ErrorActionPreference = 'Stop'

function Read-Sha256([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose(); $stream.Dispose() }
}

# Default is verification only. Never detect, stop, or launch product processes.
if ($PrepareRuntime -and -not $FreeCodeIsClosed) {
  throw 'Close FreeCode yourself, then explicitly pass -FreeCodeIsClosed. Nothing was changed.'
}
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'local-candidate.json') -Raw | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or $manifest.platform -ne 'win32-x64' -or
    $manifest.version -notmatch '^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$' -or
    $manifest.runtime.version -notmatch '^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$' -or
    $manifest.runtime.nodeModuleVersion -ne '149') { throw 'Invalid local candidate manifest' }
$expected = @(
  "FreeCode-DeepSeek-Harness-$($manifest.version)-win-x64-setup.exe",
  "FreeCode-DeepSeek-Harness-$($manifest.version)-win-x64-portable.exe",
  "deepseek-harness-runtime-$($manifest.runtime.version)-win32-x64.tar.gz"
)
if ($manifest.artifacts.Count -ne 3) { throw 'Candidate must contain exactly three artifacts' }
foreach ($name in $expected) {
  $entries = @($manifest.artifacts | Where-Object { $_.name -ceq $name })
  if ($entries.Count -ne 1) { throw "Missing or duplicate artifact: $name" }
  $entry = $entries[0]
  $file = Join-Path $PSScriptRoot $name
  if ($entry.sha256 -notmatch '^[a-fA-F0-9]{64}$' -or
      (Get-Item -LiteralPath $file).Length -ne $entry.size -or
      (Read-Sha256 $file) -ine $entry.sha256) {
    throw "SHA-256 or size mismatch: $name"
  }
}
if ($manifest.runtime.assetName -cne $expected[2]) { throw 'Wrong runtime asset name' }
Write-Output "Verified FreeCode $($manifest.version), DSH $($manifest.runtime.version), ABI 149."
if (-not $PrepareRuntime) { Write-Output 'CHECK ONLY: no installed files or cache changed.'; exit 0 }
if (-not $env:APPDATA) { throw 'APPDATA is required' }

$cache = [IO.Path]::GetFullPath((Join-Path $env:APPDATA '@freecode\shell\harness-runtime'))
$appData = [IO.Path]::GetFullPath($env:APPDATA).TrimEnd('\') + '\'
if (-not $cache.StartsWith($appData, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe cache path' }
if ((Test-Path -LiteralPath $cache) -and ((Get-Item -LiteralPath $cache).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
  throw 'Refusing a redirected runtime cache'
}
$stage = Join-Path ([IO.Path]::GetTempPath()) ('freecode-local-runtime-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($stage) | Out-Null
try {
  $archive = Join-Path $PSScriptRoot $expected[2]
  $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
  & $tar -xzf $archive -C $stage
  if ($LASTEXITCODE -ne 0) { throw 'Runtime extraction failed' }
  $nextManifest = Join-Path $stage 'runtime-manifest.json'
  $runtime = Get-Content -LiteralPath $nextManifest -Raw | ConvertFrom-Json
  if ($runtime.version -cne $manifest.runtime.version -or $runtime.nodeModuleVersion -ne '149' -or
      $runtime.cli -cne 'dsh/apps/cli/lib/bin.js') { throw 'Extracted runtime does not match candidate' }
  foreach ($part in @('dsh\package.json', 'dsh\apps\cli\lib\bin.js', 'dsh\packages', 'dsh\node_modules')) {
    if (-not (Test-Path -LiteralPath (Join-Path $stage $part))) { throw "Incomplete runtime: $part" }
  }
  [IO.Directory]::CreateDirectory($cache) | Out-Null
  $current = Join-Path $cache 'dsh'
  $currentManifest = Join-Path $cache 'runtime-manifest.json'
  $stamp = [Guid]::NewGuid().ToString('N')
  $backup = Join-Path $cache ('.dsh-backup-' + $stamp)
  $backupManifest = Join-Path $cache ('.runtime-manifest-backup-' + $stamp)
  $backed = $false; $manifestBacked = $false; $promoted = $false; $manifestPromoted = $false
  try {
    if (Test-Path -LiteralPath $current) { Move-Item -LiteralPath $current -Destination $backup; $backed = $true }
    if (Test-Path -LiteralPath $currentManifest) { Move-Item -LiteralPath $currentManifest -Destination $backupManifest; $manifestBacked = $true }
    Move-Item -LiteralPath (Join-Path $stage 'dsh') -Destination $current; $promoted = $true
    Move-Item -LiteralPath $nextManifest -Destination $currentManifest; $manifestPromoted = $true
  } catch {
    # Move new files back into our owned stage, then restore the untouched old cache.
    if ($manifestPromoted) { Move-Item -LiteralPath $currentManifest -Destination $nextManifest }
    if ($promoted) { Move-Item -LiteralPath $current -Destination (Join-Path $stage 'dsh') }
    if ($manifestBacked) { Move-Item -LiteralPath $backupManifest -Destination $currentManifest }
    if ($backed) { Move-Item -LiteralPath $backup -Destination $current }
    throw
  }
  Write-Output 'Exact runtime prepared. Previous cache backups retained. Setup and FreeCode were NOT started.'
} finally {
  $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  if (-not ([IO.Path]::GetFullPath($stage)).StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe stage cleanup' }
  Remove-Item -LiteralPath $stage -Recurse -Force
}
