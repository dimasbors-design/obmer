@echo off
rem Sozdat yarlyk "Masterskaya ochistki" na rabochem stole so znachkom
set "MO_ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$r=$env:MO_ROOT.TrimEnd('\'); $n=-join [char[]](1052,1072,1089,1090,1077,1088,1089,1082,1072,1103,32,1086,1095,1080,1089,1090,1082,1080,46,108,110,107); $ws=New-Object -ComObject WScript.Shell; $s=$ws.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) $n)); $s.TargetPath=(Join-Path $r 'START.bat'); $s.WorkingDirectory=$r; $s.IconLocation=(Join-Path $r 'assets\master.ico')+',0'; $s.WindowStyle=7; $s.Save()"
echo Gotovo: yarlyk na rabochem stole.
timeout /t 3 >nul
