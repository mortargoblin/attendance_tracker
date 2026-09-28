@echo off
rem Builds the Java backend, then starts it and the frontend in their own windows.
rem Database settings come from DB_URL, DB_USER and DB_PASSWORD if you have set them
rem (see README.md); otherwise the backend's defaults are used.

setlocal
cd /d "%~dp0"

where java >nul 2>nul || (echo Java was not found. Install JDK 21 or newer and try again. & pause & exit /b 1)
where npx >nul 2>nul || (echo npx was not found. Install Node.js and try again. & pause & exit /b 1)

echo Building the backend...
pushd server
call .\mvnw.cmd -B -q -DskipTests package
if errorlevel 1 (
    popd
    echo.
    echo Backend build failed, see the output above.
    pause
    exit /b 1
)
popd

echo Starting the backend on http://localhost:3000 ...
start "Attendance Tracker backend" /d "%~dp0server" cmd /k java -jar target\attendance-tracker-server.jar

echo Starting the frontend on http://127.0.0.1:1337 ...
start "Attendance Tracker frontend" /d "%~dp0client" cmd /k npx --yes serve . -l tcp://127.0.0.1:1337

rem give serve a moment to come up before opening the browser
timeout /t 3 /nobreak >nul
start "" http://127.0.0.1:1337

endlocal
