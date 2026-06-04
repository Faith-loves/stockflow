@echo off
cd /d "%~dp0"
echo Starting StockFlow...
echo.
echo Keep this window open while you use the app.
echo The app will be available at http://localhost:5173
echo.
call npm.cmd run dev
echo.
echo StockFlow stopped. Press any key to close this window.
pause >nul
