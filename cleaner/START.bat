@echo off
rem Master ochistki Windows - zapusk. Sam poprosit prava administratora.
cd /d "%~dp0"
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0MasterOchistki.ps1"
