@echo off
REM One click, from a fresh checkout on a machine with nothing installed, to a built
REM and verified program.
REM
REM   build.bat                 build, then ask whether to launch
REM   build.bat --run           build, then launch, but only after it succeeded
REM   build.bat /s              silent: no prompts, no launch, non-zero on first failure
REM
REM It fetches its own dependencies rather than assuming somebody already ran the
REM fetcher, and it verifies what it built rather than trusting an exit code.

setlocal
set "SCRIPT_DIR=%~dp0"

echo Tower Defence Desktop - build
echo.

call "%SCRIPT_DIR%download-dependencies.bat" %*
if not "%ERRORLEVEL%"=="0" (
  echo.
  echo Dependencies could not be prepared. Stopping before the build.
  exit /b %ERRORLEVEL%
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\build-local.ps1" %*
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
  echo.
  echo Build FAILED with exit code %RESULT%.
)
exit /b %RESULT%
