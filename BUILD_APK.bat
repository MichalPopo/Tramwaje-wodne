@echo off
echo ============================================
echo   Tramwaje Wodne - Build APK (standalone)
echo ============================================
echo.

cd /d "%~dp0mobile"

:: 1. Export JS bundle
echo [1/3] Eksportuje JS bundle...
call npx expo export --platform android
if errorlevel 1 (
    echo BLAD: Export JS nie powiodl sie!
    pause
    exit /b 1
)

:: 2. Copy bundle to Android assets
echo [2/3] Kopiuje bundle do APK...
mkdir android\app\src\main\assets 2>nul

:: Find the .hbc file dynamically
for /f "delims=" %%f in ('dir /b /s dist\_expo\static\js\android\*.hbc 2^>nul') do (
    copy /Y "%%f" "android\app\src\main\assets\index.android.bundle" >nul
)

if not exist "android\app\src\main\assets\index.android.bundle" (
    echo BLAD: Nie znaleziono bundle!
    pause
    exit /b 1
)

:: 3. Build debug APK via Gradle
echo [3/3] Buduje APK...
cd android
call gradlew.bat assembleDebug
if errorlevel 1 (
    echo BLAD: Build APK nie powiodl sie!
    pause
    exit /b 1
)

echo.
echo ============================================
echo   APK gotowe!
echo   Plik: mobile\android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo   Zainstaluj na telefonie:
echo     adb install app\build\outputs\apk\debug\app-debug.apk
echo ============================================
pause
