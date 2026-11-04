@echo off
chcp 65001 >nul
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Exam Corner Sync.lnk" 2>nul
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*ExamCornerSync.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo Exam Corner Sync बंद कर दिया। अब laptop चालू होने पर अपने आप नहीं चलेगा।
pause
