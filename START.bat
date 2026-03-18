@echo off
echo ========================================
echo   Tramwaje Wodne - Start serwera
echo ========================================
echo.

cd /d "%~dp0"

:: Start backend
echo [1/2] Uruchamiam serwer API...
cd server
start "Tramwaje API" cmd /c "npx tsx src/index.ts"
cd ..

:: Start frontend (dev mode)
echo [2/2] Uruchamiam frontend...
cd client
start "Tramwaje Frontend" cmd /c "npm run dev -- --host 0.0.0.0"
cd ..

echo.
echo ==========================================
echo   Serwer uruchomiony!
echo   Frontend:  http://localhost:5173
echo   API:       http://localhost:3001
echo.
echo   Dla innych w sieci: http://TWOJE_IP:5173
echo ==========================================
echo.
echo Nie zamykaj tego okna.
pause
