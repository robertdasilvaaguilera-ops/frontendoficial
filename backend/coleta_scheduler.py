"""
Agendador em processo (APScheduler) que roda a coleta diária de decisões
(main.py - CARF, STJ, STF, PGFN, Receita, TRF4, DJEN) dentro do próprio
serviço da API, 3x/dia - substitui o Agendador de Tarefas do Windows que
rodava isso só no computador local.

Roda no mesmo serviço da API (não um serviço Railway separado) de
propósito: o volume persistente (ATLAS_DATA_DIR=/data) só pode estar
montado em UM serviço por vez, e é nele que o Excel de decisões e o
banco do app precisam viver. Ver paths.py.
"""
import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

import main as atlas_engine

logger = logging.getLogger("coleta_scheduler")

# 3x/dia (mesma cadência do post automático de Instagram), 30 min ANTES de
# cada horário de post (11h/15h/23h UTC - ver a rotina "Atlas - Post diário
# Instagram") - garante decisões frescas disponíveis antes de cada
# publicação, em vez de rodarem ao mesmo tempo.
_HORARIOS_UTC = [(10, 30), (14, 30), (22, 30)]

_scheduler = BackgroundScheduler(timezone="UTC")


def _rodar_coleta() -> None:
    try:
        atlas_engine.main()
        logger.info("Coleta diária de decisões concluída com sucesso")
    except Exception:
        logger.exception("Falha na coleta diária agendada de decisões")


def iniciar() -> None:
    """Chamado uma vez no startup do backend (ver api_server.py)."""
    if _scheduler.running:
        return
    for i, (hora, minuto) in enumerate(_HORARIOS_UTC):
        _scheduler.add_job(
            _rodar_coleta,
            trigger=CronTrigger(hour=hora, minute=minuto, timezone="UTC"),
            id=f"coleta_decisoes_{i}",
            replace_existing=True,
        )
    _scheduler.start()
