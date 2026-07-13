@echo off
setlocal
cd /d "%~dp0"

set "RUNTIME_NODE_ROOT=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node"
set "FALLBACK_NODE=%RUNTIME_NODE_ROOT%\bin\node.exe"
set "FALLBACK_PNPM_CLI=%RUNTIME_NODE_ROOT%\node_modules\pnpm\bin\pnpm.mjs"

for /f "delims=" %%I in ('where node.exe 2^>nul') do if not defined NODE set "NODE=%%I"
if defined NODE goto node_ready
if not exist "%FALLBACK_NODE%" goto node_missing
set "NODE=%FALLBACK_NODE%"
set "PATH=%RUNTIME_NODE_ROOT%\bin;%PATH%"

:node_ready
for /f "delims=" %%I in ('where pnpm.cmd 2^>nul') do if not defined PNPM set "PNPM=%%I"
if not defined PNPM for /f "delims=" %%I in ('where pnpm.exe 2^>nul') do if not defined PNPM set "PNPM=%%I"

if exist "node_modules" goto dependencies_ready
echo Installing demo dependencies...
if defined PNPM goto install_with_system_pnpm
if not exist "%FALLBACK_PNPM_CLI%" goto pnpm_missing
"%NODE%" "%FALLBACK_PNPM_CLI%" install --ignore-scripts
if errorlevel 1 goto install_failed
goto dependencies_ready

:install_with_system_pnpm
call "%PNPM%" install --ignore-scripts
if errorlevel 1 goto install_failed

:dependencies_ready
if not exist "node_modules\next\dist\bin\next" goto next_missing
echo Starting Sony allocation demo at http://localhost:3000 ...
"%NODE%" "node_modules\next\dist\bin\next" dev --hostname 0.0.0.0
exit /b %errorlevel%

:node_missing
echo ERROR: Node.js was not found. Install Node.js or provide the Codex runtime under:
echo %RUNTIME_NODE_ROOT%
exit /b 1

:pnpm_missing
echo ERROR: pnpm was not found. Install pnpm or provide the Codex runtime under:
echo %RUNTIME_NODE_ROOT%
exit /b 1

:next_missing
echo ERROR: Next.js is missing from node_modules. Delete node_modules and run this script again.
exit /b 1

:install_failed
echo ERROR: Dependency installation failed.
exit /b 1
