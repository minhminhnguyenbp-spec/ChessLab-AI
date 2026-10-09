@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title ChessLab AI - Khoi dong web

echo ==============================================
echo       CHESSLAB AI - CHOI VOI STOCKFISH
echo ==============================================
echo.
where node >nul 2>nul
if errorlevel 1 goto missing_node
where npm >nul 2>nul
if errorlevel 1 goto missing_node

if not exist "node_modules\vite\bin\vite.js" (
  echo [1/2] Dang cai cac thu vien lan dau. Can ket noi Internet.
  call npm install --no-audit --no-fund
  if errorlevel 1 goto install_failed
) else (
  echo [1/2] Thu vien da san sang.
)

if not exist "public\engine\stockfish-19-lite-single.js" (
  echo [2/2] Dang chuan bi Stockfish...
  call npm run postinstall
  if errorlevel 1 goto install_failed
)
if not exist "public\engine\stockfish-19-lite-single.wasm" goto install_failed

echo.
echo Dang mo website. Neu trinh duyet khong tu mo, vao http://localhost:5173/
echo Giu cua so nay mo khi dang choi co. Nhan Ctrl+C de dung.
start "" cmd /c "timeout /t 5 /nobreak >nul & start http://localhost:5173/"
call npm run dev
pause
exit /b

:missing_node
echo.
echo [LOI] Chua cai Node.js. Tai ban LTS tai https://nodejs.org/
echo Cai xong, dong va mo lai file CHAY_CHESSLAB.bat.
pause
exit /b 1

:install_failed
echo.
echo [LOI] Cai dat that bai. Kiem tra Internet, sau do thu trong Terminal:
echo npm install
echo npm run dev
echo Neu mang cham, vui long cho tai het goi Stockfish WASM.
pause
exit /b 1
