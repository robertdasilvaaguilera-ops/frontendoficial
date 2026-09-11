@echo off
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 goto :semnode

echo Instalando dependencias do site (so demora na primeira vez, pode levar alguns minutos)...
call npm install

echo.
echo ============================================================
echo  Site ATLAS rodando. O terminal vai mostrar o endereco
echo  (geralmente http://localhost:5173) - abra esse endereco
echo  no navegador.
echo  IMPORTANTE: o backend (iniciar_copiloto.bat) precisa estar
echo  rodando em outra janela ao mesmo tempo.
echo  Para parar: feche esta janela ou aperte Ctrl+C.
echo ============================================================
echo.
call npm run dev
goto :fim

:semnode
echo Node.js nao encontrado. Instale em https://nodejs.org (versao LTS) e reabra este arquivo.

:fim
pause
