@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title ChessLab - Dang web len GitHub
where git >nul 2>nul
if errorlevel 1 (
  echo [LOI] May chua cai Git for Windows. Cai tai https://git-scm.com/downloads/win
  pause
  exit /b 1
)
echo ========================================
echo    DANG CHESSLAB AI LEN GITHUB
 echo ========================================
echo Truoc het, tao repository PUBLIC rong tai: https://github.com/new
 echo Ten de nghi: ChessLab-AI
 echo KHONG chon Add README khi tao repo.
 echo.
set /p USERNAME=Nhap ten tai khoan GitHub cua ban: 
if "%USERNAME%"=="" (
  echo [LOI] Chua nhap username.
  pause
  exit /b 1
)
set /p REPO=Nhap ten repository (Enter de dung ChessLab-AI): 
if "%REPO%"=="" set REPO=ChessLab-AI
if not exist .git git init || goto fail
git add . || goto fail
git diff --cached --quiet
if errorlevel 1 git commit -m "Deploy ChessLab AI" || goto fail
git branch -M main || goto fail
git remote get-url origin >nul 2>nul
if errorlevel 1 (
  git remote add origin https://github.com/%USERNAME%/%REPO%.git || goto fail
) else (
  git remote set-url origin https://github.com/%USERNAME%/%REPO%.git || goto fail
)
git push -u origin main || goto fail
echo.
echo XONG! Vao https://github.com/%USERNAME%/%REPO%/settings/pages
 echo Chon Source = GitHub Actions. Cho build hoan tat.
 echo Link du kien: https://%USERNAME%.github.io/%REPO%/
pause
exit /b 0
:fail
echo.
echo [LOI] Khong the day ma nguon. Xem thong bao ben tren.
pause
exit /b 1
