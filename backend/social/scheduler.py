"""
Agendador em processo (APScheduler) que dispara o ciclo de post automático
de Instagram nos horários configurados por cada usuário na aba Mídia
Social - substitui a tarefa agendada externa que rodava fora do produto.

Cada login tem a própria automação (próprio token, própria identidade
visual, próprios horários - ver app_db.social_config), então os jobs são
por (usuario, índice do horário), não um conjunto único e global como
antes: `recarregar()` varre todos os usuários com automação ligada e
recria os jobs de todo mundo a partir do estado atual de cada um.

`iniciar()` é chamado uma vez, na subida do backend (ver api_server.py),
recebendo uma função que sabe buscar as decisões candidatas (o próprio
api_server, que tem acesso ao DataFrame) - assim este módulo não precisa
importar api_server (evita import circular).

`recarregar()` é chamado sempre que a configuração de qualquer usuário muda
(novos horários, ligar/desligar) - remove os jobs antigos e recria a partir
do estado atual de todos os usuários.
"""
from __future__ import annotations

import logging
import urllib.parse
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


def _rodar_ciclo_agendado(usuario: str) -> None:
    try:
        decisoes = _obter_decisoes() if _obter_decisoes else []
        resultado = executar_ciclo(usuario, decisoes, forcar=False)
        logger.info(
            "Ciclo de post automático concluído: usuario=%s status=%s",
            usuario, resultado.get("status"),
        )
    except Exception:
        logger.exception("Falha inesperada no ciclo agendado de post automático (usuario=%s)", usuario)


def _limpar_jobs() -> None:
    for job in _scheduler.get_jobs():
        if job.id.startswith(_JOB_PREFIXO):
            _scheduler.remove_job(job.id)


def _id_job(usuario: str, indice: int) -> str:
    # quote() escapa qualquer caractere especial do usuário (inclusive ":")
    # antes de concatenar com o índice - evita colisão de id entre usuários
    # diferentes mesmo que o nome de login contenha caracteres incomuns.
    return f"{_JOB_PREFIXO}{urllib.parse.quote(usuario, safe='')}:{indice}"


def recarregar() -> None:
    """Recria os jobs de todos os usuários a partir do `horarios` salvo na
    social_config de cada um - chame depois de qualquer alteração de
    configuração (PUT /social/config), de qualquer usuário."""
    _limpar_jobs()
    for usuario in app_db.listar_usuarios_social_ativos():
        config = app_db.obter_social_config(usuario)
        for i, horario in enumerate(config["horarios"]):
            try:
                hora, minuto = horario.split(":")
                hora, minuto = int(hora), int(minuto)
            except ValueError:
                logger.warning(
                    "Horário inválido ignorado na config de Mídia Social (usuario=%s): %r",
                    usuario, horario,
                )
                continue
            _scheduler.add_job(
                _rodar_ciclo_agendado,
                trigger=CronTrigger(hour=hora, minute=minuto, timezone=FUSO_HORARIO),
                id=_id_job(usuario, i),
                args=[usuario],
                replace_existing=True,
            )


def iniciar(obter_decisoes_callback: Callable[[], list[dict]]) -> None:
    """Chamado uma vez no startup do backend."""
    global _obter_decisoes
    _obter_decisoes = obter_decisoes_callback
    if not _scheduler.running:
        _scheduler.start()
    recarregar()
