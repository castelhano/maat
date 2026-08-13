@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set PORT=3000
set URL=http://localhost:%PORT%

echo Verificando se o sistema ja esta rodando...
netstat -ano | findstr ":%PORT% " | findstr "LISTENING" >nul
if errorlevel 1 goto :iniciar
goto :abrir

:iniciar
if exist ".next\BUILD_ID" goto :subir
echo Nenhuma build de producao encontrada. Gerando build...
call pnpm build
if errorlevel 1 (
    echo Falha ao gerar a build. Verifique os erros acima.
    pause
    exit /b 1
)

:subir
echo Iniciando o servidor...
start "Maat - Servidor" /min cmd /c "pnpm start"

set /a TENTATIVAS=0
:aguardar
set /a TENTATIVAS+=1
curl -s -o nul -w "%%{http_code}" %URL% > "%TEMP%\maat_status.txt" 2>nul
set /p STATUS=<"%TEMP%\maat_status.txt"
if "!STATUS!"=="200" goto :abrir
if "!STATUS!"=="307" goto :abrir
if !TENTATIVAS! GEQ 30 goto :abrir
timeout /t 1 /nobreak >nul
goto :aguardar

:abrir
echo Abrindo o sistema...
where msedge >nul 2>nul
if %errorlevel%==0 (
    start "" msedge --app=%URL%
) else (
    start "" chrome --app=%URL%
)

endlocal
