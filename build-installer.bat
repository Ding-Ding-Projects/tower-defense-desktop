@echo off
REM Produce the same installer the release workflow publishes.
REM
REM   build-installer.bat        build the installer and report what it is
REM   build-installer.bat /s     silent, non-zero on first failure
REM
REM The installer is permanently UNSIGNED and Windows will show an unknown publisher
REM warning. The script verifies that rather than asserting it, and says so in its own
REM output. It never publishes, tags or pushes anything.

setlocal
set "SCRIPT_DIR=%~dp0"

call "%SCRIPT_DIR%download-dependencies.bat" %*
if not "%ERRORLEVEL%"=="0" (
  echo.
  echo Dependencies could not be prepared. Stopping before packaging.
  exit /b %ERRORLEVEL%
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\build-installer.ps1" %*
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
  echo.
  echo Installer build FAILED with exit code %RESULT%.
)
exit /b %RESULT%
