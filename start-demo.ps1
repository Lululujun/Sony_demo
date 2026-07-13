$ErrorActionPreference = "Stop"

Set-Location -LiteralPath $PSScriptRoot

$runtimeNodeRoot = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node"
$fallbackNode = Join-Path $runtimeNodeRoot "bin\node.exe"
$fallbackPnpmCli = Join-Path $runtimeNodeRoot "node_modules\pnpm\bin\pnpm.mjs"

$systemNode = Get-Command "node.exe" -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($systemNode) {
  $node = $systemNode.Source
} elseif (Test-Path -LiteralPath $fallbackNode) {
  $node = $fallbackNode
  $env:Path = "$(Split-Path -Parent $fallbackNode);$env:Path"
} else {
  throw "Node.js was not found. Install Node.js or provide the Codex runtime under $runtimeNodeRoot."
}

$systemPnpm = Get-Command "pnpm.cmd", "pnpm.exe" -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not (Test-Path -LiteralPath "node_modules")) {
  Write-Host "Installing demo dependencies..."
  if ($systemPnpm) {
    & $systemPnpm.Source install --ignore-scripts
  } elseif (Test-Path -LiteralPath $fallbackPnpmCli) {
    & $node $fallbackPnpmCli install --ignore-scripts
  } else {
    throw "pnpm was not found. Install pnpm or provide the Codex runtime under $runtimeNodeRoot."
  }

  if ($LASTEXITCODE -ne 0) {
    throw "Dependency installation failed with exit code $LASTEXITCODE."
  }
}

$nextCli = Join-Path $PSScriptRoot "node_modules\next\dist\bin\next"
if (-not (Test-Path -LiteralPath $nextCli)) {
  throw "Next.js is missing from node_modules. Delete node_modules and run this script again."
}

Write-Host "Starting Sony allocation demo at http://localhost:3000 ..."
& $node $nextCli dev --hostname 0.0.0.0

