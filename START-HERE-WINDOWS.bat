@echo off
setlocal
cd /d "%~dp0"
if not defined CREATOR_EMPIRE_PORT set "CREATOR_EMPIRE_PORT=4173"

where py >nul 2>nul
if %errorlevel%==0 (
  if not "%CREATOR_EMPIRE_NO_BROWSER%"=="1" start "Creator Empire Simulator" http://127.0.0.1:%CREATOR_EMPIRE_PORT%
  py -3 creator_server.py --root dist --host 127.0.0.1 --port %CREATOR_EMPIRE_PORT%
  exit /b %errorlevel%
)

where python >nul 2>nul
if %errorlevel%==0 (
  if not "%CREATOR_EMPIRE_NO_BROWSER%"=="1" start "Creator Empire Simulator" http://127.0.0.1:%CREATOR_EMPIRE_PORT%
  python creator_server.py --root dist --host 127.0.0.1 --port %CREATOR_EMPIRE_PORT%
  exit /b %errorlevel%
)

echo Python 3 is required for SQLite storage. Install Python 3, then run this file again.
pause
exit /b 1
