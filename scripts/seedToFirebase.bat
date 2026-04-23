@echo off
REM Firestore Seeding Script for Windows
REM Double-click this file to seed data to Firebase

cls
echo.
echo ========================================
echo   Firebase Firestore Seeding Script
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Run the seed script
echo Running seeding script...
echo.
node "%~dp0seedToFirebase.js"

REM Keep window open if there was an error
if %errorlevel% neq 0 (
    echo.
    echo Press any key to close...
    pause >nul
    exit /b 1
)

exit /b 0
