@echo off
chcp 65001 >nul
set "KETIME_PREVIEW=%~dp0android\dist\刻时-Android-Edge预览.html"
if not exist "%KETIME_PREVIEW%" (
 echo 找不到 Edge 预览文件，请先生成预览版。
 pause
 exit /b 1
)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
 start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%KETIME_PREVIEW%"
 exit /b 0
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
 start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "%KETIME_PREVIEW%"
 exit /b 0
)
echo 未找到默认路径的 Edge，正在用系统默认浏览器打开。
start "" "%KETIME_PREVIEW%"
