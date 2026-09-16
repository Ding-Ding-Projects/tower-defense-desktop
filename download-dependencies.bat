@echo off
REM One click, from a machine with nothing installed, to every dependency this
REM project needs. No prompts, no "install X and run me again".
REM
REM   download-dependencies.bat            interactive
REM   download-dependencies.bat /s         silent, exits non-zero on the first failure
REM
REM Everything it installs lands user-scoped. It never needs administrator rights and
REM never touches a machine-wide toolchain.

setlocal
set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\download-dependencies.ps1" %*
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
  echo.
  echo Dependency fetch FAILED with exit code %RESULT%.
)
exit /b %RESULT%
