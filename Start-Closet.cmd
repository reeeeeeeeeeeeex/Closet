@echo off
cd /d "%~dp0"
if not exist node_modules (
  call npx --yes pnpm@11.25.0 install --frozen-lockfile
  if errorlevel 1 goto failed
)
if not exist .next\BUILD_ID (
  node scripts/local-server.mjs build
  if errorlevel 1 goto failed
)
node scripts/local-server.mjs start
if errorlevel 1 goto failed
exit /b 0
:failed
echo Closet could not start. See the error above.
pause
exit /b 1
