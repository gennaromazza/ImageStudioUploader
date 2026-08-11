@echo off
cd /d "%~dp0"
set "npm_config_cache=H:\sync_gallery\.cache\npm"
set "ELECTRON_BUILDER_CACHE=H:\sync_gallery\.cache\electron-builder"
set "ELECTRON_CACHE=H:\sync_gallery\.cache\electron"
call npm run build:win
