@echo off
REM Build Naver News Crawler into a single exe and a zip for distribution.
cd /d "%~dp0"

python -m pip install --upgrade pyinstaller PyQt6 requests beautifulsoup4 openpyxl || goto :error

python -m PyInstaller --noconfirm --clean --onefile --windowed ^
    --name NaverNewsCrawler ^
    --icon app_icon.ico ^
    --add-data "app_icon.ico;." ^
    naver_news_crawler.py || goto :error

powershell -NoProfile -Command "Compress-Archive -Force -Path dist\NaverNewsCrawler.exe -DestinationPath dist\NaverNewsCrawler.zip" || goto :error

echo.
echo Build done:   dist\NaverNewsCrawler.exe
echo Release zip:  dist\NaverNewsCrawler.zip
exit /b 0

:error
echo Build failed.
exit /b 1
