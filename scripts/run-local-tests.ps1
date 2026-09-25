# Local suite for machines where solana-test-validator cannot create symlinks.
# --log skips the validator.log symlink. --ticks-per-slot 400 keeps the
# slot-100 snapshot, which also needs a symlink, from landing during the suite.
$ErrorActionPreference = 'Continue'
$solanaBin = Join-Path $env:USERPROFILE 'solana-2.3.0\solana-release\bin'
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if (Test-Path $solanaBin) { $env:PATH = $solanaBin + ';' + $env:PATH }
if (Test-Path $cargoBin) { $env:PATH = $cargoBin + ';' + $env:PATH }
$env:ANCHOR_PROVIDER_URL = 'http://127.0.0.1:8899'
$env:ANCHOR_WALLET = Join-Path $env:USERPROFILE '.config\solana\id.json'
Set-Location (Join-Path $PSScriptRoot '..')

$log = Join-Path $env:TEMP 'recess-validator.log'
$err = Join-Path $env:TEMP 'recess-validator.err'
$proc = Start-Process -FilePath solana-test-validator -ArgumentList @(
  '--reset', '--log', '--ticks-per-slot', '400',
  '--bpf-program', 'target/deploy/recess-keypair.json', 'target/deploy/recess.so'
) -RedirectStandardOutput $log -RedirectStandardError $err -PassThru
Write-Output ('VALIDATOR ' + $proc.Id)

$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  & solana cluster-version --url localhost 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ready) {
  Write-Output 'FAILED validator'
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  exit 1
}

Write-Output 'VALIDATOR_UP'
& npx ts-mocha -p ./tsconfig.json -t 1000000 tests/recess.ts
$code = $LASTEXITCODE
Write-Output ('MOCHA_EXIT ' + $code)
Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
exit $code
