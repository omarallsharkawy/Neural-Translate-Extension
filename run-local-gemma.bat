@echo off
chcp 65001 >nul
title Neural Translate - Local Gemma-4 GPU Server
echo ====================================================================
echo   Neural Translate - Local AI GPU Server (Windows)
echo   Runs llama-server on port 28491 with Vulkan/CUDA
echo ====================================================================

set PORT=28491
set HOST=127.0.0.1
set SCRIPT_DIR=%~dp0

:: 1. Search for llama-server.exe
set "SERVER_BIN="
if exist "%SCRIPT_DIR%bin\llama-server.exe" set "SERVER_BIN=%SCRIPT_DIR%bin\llama-server.exe"
if not defined SERVER_BIN if exist "%LOCALAPPDATA%\llama.cpp\llama-server.exe" set "SERVER_BIN=%LOCALAPPDATA%\llama.cpp\llama-server.exe"
if not defined SERVER_BIN where llama-server.exe >nul 2>&1 && for /f "delims=" %%i in ('where llama-server.exe') do set "SERVER_BIN=%%i"

:: 2. Search for Model (.gguf)
set "MODEL_FILE="
if exist "%SCRIPT_DIR%models\gemma-4-E2B-it-Q4_K_M.gguf" set "MODEL_FILE=%SCRIPT_DIR%models\gemma-4-E2B-it-Q4_K_M.gguf"
if not defined MODEL_FILE (
    for %%f in ("%SCRIPT_DIR%models\*.gguf") do (
        set "MODEL_FILE=%%f"
        goto :FoundModel
    )
)
:FoundModel

if not defined SERVER_BIN (
    echo.
    echo [ERROR] llama-server.exe was not found!
    echo Please download llama-server from https://github.com/ggerganov/llama.cpp/releases
    echo and extract llama-server.exe into the "bin" folder.
    echo.
    pause
    exit /b 1
)

if not defined MODEL_FILE (
    echo.
    echo [ERROR] No .gguf model file found in "models" folder!
    echo Please download gemma-4-E2B-it-Q4_K_M.gguf (or any GGUF model) from Hugging Face
    echo and place it inside the "models" folder.
    echo.
    pause
    exit /b 1
)

echo.
echo Binary: %SERVER_BIN%
echo Model:  %MODEL_FILE%
echo Port:   %PORT%
echo Endpoint: http://%HOST%:%PORT%/v1/chat/completions
echo.
echo Starting server on GPU...
echo (You can minimize this window. Press Ctrl+C to stop).
echo.

"%SERVER_BIN%" --model "%MODEL_FILE%" --port %PORT% --host %HOST% -ngl 99 -fa on -c 12288 -t 6 -np 1 --reasoning off --reasoning-budget 0 --log-disable
pause

