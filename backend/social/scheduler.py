"""
Agendador em processo (APScheduler) que dispara o ciclo de post automático
de Instagram nos horários configurados pelo usuário na aba Mídia Social -
substitui a tarefa agendada externa que rodava fora do produto.

`iniciar()` é chamado uma vez, na subida do backend (ver api_server.py),
recebendo uma função que sabe buscar as decisões candidatas (o próprio
api_server, que tem acesso ao DataFrame) - assim este módulo não precisa
importar api_server (evita import circular).

`recarregar()` é chamado sempre que a configuração muda (novos horários,
ligar/desligar) - remove os jobs antigos e recria a partir do estado atual.
"""
from __future__ import annotations

import logging
from typing import Callable

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

import app_db
from social.pipeline import executar_ciclo

logger = logging.getLogger("social.scheduler")

FUSO_HORARIO = "America/Sao_Paulo"
_JOB_PREFIXO = "social_post_"

_scheduler = BackgroundScheduler(timezone=FUSO_HORARIO)
_obter_decisoes: Callable[[], list[dict]] | None = None


def _rodar_ciclo_agendado() -> None:
    try:
        decisoes = _obter_decisoes() if _obter_decisoes else []
        resultado = executar_ciclo(decisoes, forcar=False)
        logger.info("Ciclo de post automático concluído: status=%s", resultado.get("status"))
    except Exception:
        logger.exception("Falha inesperada no ciclo agendado de post automático")


def _limpar_jobs() -> None:
    for job in _scheduler.get_jobs():
        if job.id.startswith(_JOB_PREFIXO):
            _scheduler.remove_job(job.id)


def recarregar() -> None:
    """Recria os jobs a partir do `horarios` salvo em social_config - chame
    depois de qualquer alteração de configuração (PUT /social/config)."""
    _limpar_jobs()
    config = app_db.obter_social_config()
    if not config["ativo"]:
        return
    for i, horario in enumerate(config["horarios"]):
        try:
            hora, minuto = horario.split(":")
            hora, minuto = int(hora), int(minuto)
        except ValueError:
            logger.warning("Horário inválido ignorado na config de Mídia Social: %r", horario)
            continue
        _scheduler.add_job(
            _rodar_ciclo_agendado,
            trigger=CronTrigger(hour=hora, minute=minuto, timezone=FUSO_HORARIO),
            id=f"{_JOB_PREFIXO}{i}",
            replace_existing=True,
        )


def iniciar(obter_decisoes_callback: Callable[[], list[dict]]) -> None:
    """Chamado uma vez no startup do backend."""
    global _obter_decisoes
    _obter_decisoes = obter_decisoes_callback
    if not _scheduler.running:
        _scheduler.start()
    recarregar()
