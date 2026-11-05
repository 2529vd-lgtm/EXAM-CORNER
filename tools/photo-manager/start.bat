@echo off
chcp 65001 >nul
title Photo Manager
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

rem ---- Python ढूँढें ----
set PY=
where py >nul 2>nul && set PY=py -3
if "%PY%"=="" ( where python >nul 2>nul && set PY=python )
if "%PY%"=="" (
  echo Python नहीं मिला। अब install कर रहे हैं ^(free^)...
  winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
  echo.
  echo Python install हो गया। यह window बंद करके start.bat दोबारा double-click करें।
  pause
  exit /b
)

rem ---- पहली बार: ज़रूरी चीज़ें install ----
if not exist ".venv\Scripts\python.exe" (
  echo पहली बार setup हो रहा है, 2-5 मिनट लगेंगे...
  %PY% -m venv .venv || goto :fail
)
".venv\Scripts\python.exe" -c "import flask, PIL, numpy, cv2, send2trash" >nul 2>nul
if errorlevel 1 (
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt || goto :fail
)

".venv\Scripts\python.exe" app.py
pause
exit /b

:fail
echo.
echo कुछ गड़बड़ हुई। Internet चालू है ना? ऊपर का message देखिए।
pause
