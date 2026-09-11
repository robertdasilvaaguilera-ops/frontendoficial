@echo off
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 goto :sempython

echo Instalando dependencias do backend (so demora na primeira vez)...
python -m pip install -r requirements.txt

echo.
echo ============================================================
echo  Backend do Copiloto ATLAS rodando em http://localhost:8000
echo  Deixe esta janela ABERTA enquanto usar o site.
echo  Para parar: feche esta janela ou aperte Ctrl+C.
echo ============================================================
echo.
python -m uvicorn api_server:app --port 8000
goto :fim

:sempython
echo Python nao encontrado. Instale em https://www.python.org/downloads/
echo IMPORTANTE: marque a caixa "Add Python to PATH" durante a instalacao.

:fim
pause
