@echo off
REM Build KOSPI200 Crawler GUI into a single exe and a zip for distribution.
cd /d "%~dp0"

python -m pip install --upgrade pyinstaller PyQt6 requests openpyxl || goto :error

python -m PyInstaller --noconfirm --clean --onefile --windowed ^
    --name Kospi200Crawler ^
    --icon app_icon.ico ^
    --add-data "app_icon.ico;." ^
    kospi200_gui.py || goto :error

powershell -NoProfile -Command "Compress-Archive -Force -Path dist\Kospi200Crawler.exe -DestinationPath dist\Kospi200Crawler.zip" || goto :error

echo.
echo Build done:   dist\Kospi200Crawler.exe
echo Release zip:  dist\Kospi200Crawler.zip
exit /b 0

:error
echo Build failed.
exit /b 1
