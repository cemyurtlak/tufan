@echo off
chcp 65001 >nul
title TUFAN - Gezegen Savunma Gorevi
cd /d "%~dp0"

rem --- Gercek Python'u bul (Microsoft Store kisayolunu atla) ---
set PY=
py -3 --version >nul 2>nul
if not errorlevel 1 set PY=py -3

if not defined PY (
  python --version >nul 2>nul
  if not errorlevel 1 set PY=python
)

if not defined PY (
  for %%P in (
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    "%ProgramFiles%\Python312\python.exe"
    "%ProgramFiles%\Python313\python.exe"
    "C:\Python312\python.exe"
  ) do (
    if not defined PY if exist %%P set PY=%%P
  )
)

if not defined PY (
  echo.
  echo  Python bulunamadi.
  echo  Cozum: PyCharm'da index.html dosyasina sag tiklayip
  echo  "Open In" ^> "Browser" secin. Ya da Python'u kurarken
  echo  "Add python.exe to PATH" kutusunu isaretleyin.
  echo.
  pause
  exit /b 1
)

echo.
echo  ==============================================
echo    TUFAN - Gezegen Savunma Gorevi
echo    Python: %PY%
echo    Yerel sunucu: http://localhost:8000
echo    Oyunu kapatmak icin bu pencereyi kapatin.
echo  ==============================================
echo.

start "" /min cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8000/index.html"
%PY% -m http.server 8000
echo.
echo  Sunucu durdu. (8000 portu baska bir program tarafindan kullaniliyor olabilir.)
pause
