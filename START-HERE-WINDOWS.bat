@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  start "Creator Empire Simulator" http://127.0.0.1:4173
  py -3 creator_server.py --root dist --host 127.0.0.1 --port 4173
  exit /b %errorlevel%
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "Creator Empire Simulator" http://127.0.0.1:4173
  python creator_server.py --root dist --host 127.0.0.1 --port 4173
  exit /b %errorlevel%
)
echo Python 3 is required for SQLite storage. Install Python 3, then run this file again.
pause
