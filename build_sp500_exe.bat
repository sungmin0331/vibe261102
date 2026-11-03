@echo off
REM Build S&P 500 Analysis GUI into a single exe and a zip for distribution.
cd /d "%~dp0"

python -m pip install --upgrade pyinstaller PyQt6 pandas matplotlib || goto :error

REM Exclude other Qt bindings so matplotlib's Qt backend only bundles PyQt6,
REM and optional packages pandas/matplotlib pick up but this app never uses.
python -m PyInstaller --noconfirm --clean --onefile --windowed ^
    --name SP500Analysis ^
    --icon app_icon.ico ^
    --add-data "app_icon.ico;." ^
    --exclude-module PySide6 ^
    --exclude-module PySide2 ^
    --exclude-module PyQt5 ^
    --exclude-module tkinter ^
    --exclude-module scipy ^
    --exclude-module IPython ^
    --exclude-module jedi ^
    --exclude-module zmq ^
    --exclude-module seaborn ^
    sp500_analysis.py || goto :error

powershell -NoProfile -Command "Compress-Archive -Force -Path dist\SP500Analysis.exe -DestinationPath dist\SP500Analysis.zip" || goto :error

echo.
echo Build done:   dist\SP500Analysis.exe
echo Release zip:  dist\SP500Analysis.zip
exit /b 0

:error
echo Build failed.
exit /b 1
