@echo off
cd /d "%USERPROFILE%\Documents\ATLAS\atlas"
echo. >> logs\execucao.log
echo ================================================ >> logs\execucao.log
echo Execucao agendada iniciada: %date% %time% >> logs\execucao.log
echo ================================================ >> logs\execucao.log
python main.py >> logs\execucao.log 2>&1
echo Execucao agendada finalizada: %date% %time% >> logs\execucao.log
