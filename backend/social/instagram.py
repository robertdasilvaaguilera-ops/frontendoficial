"""
Publicação de carrossel (2 imagens) no Instagram via Graph API da Meta -
mesma lógica validada na automação externa (ver histórico: publicado com
sucesso em @atlas.tributos), só que parametrizada por token/conta em vez de
ler direto do ambiente, para funcionar com as credenciais que o usuário
configurar na aba Mídia Social (ver app_db.social_config).
"""
from __future__ import annotations

import time

import requests

GRAPH = "https://graph.facebook.com/v21.0"

# Depois de criado, o container do Instagram fica "IN_PROGRESS" enquanto a
# Meta baixa/processa as imagens - publicar antes disso terminar dá HTTP 400
# "Media ID is not available" (code 9007, subcode 2207027). Espera até
# "FINISHED" (ou desiste em erro/expirado/timeout) antes de publicar -
# padrão recomendado pela própria documentação da Content Publishing API.
_POLL_INTERVALO_SEGUNDOS = 3
_POLL_TENTATIVAS_MAXIMAS = 20  # ~1 minuto no total


class ErroGraphAPI(Exception):
    def __init__(self, etapa: str, status_code: int, resposta: object):
        self.etapa = etapa
        self.status_code = status_code
        self.resposta = resposta
        super().__init__(f"{etapa}: HTTP {status_code} - {resposta}")


def _erro(resp: requests.Response, etapa: str) -> None:
    try:
        detalhe = resp.json()
    except ValueError:
        detalhe = resp.text
    raise ErroGraphAPI(etapa, resp.status_code, detalhe)


def testar_conexao(token: str, conta_id: str) -> dict:
    """Chamada leve e só-leitura pra validar token + id da conta profissional
    do Instagram antes de salvar a configuração - devolve username/nome se
    a credencial for válida."""
    resp = requests.get(
        f"{GRAPH}/{conta_id}",
        params={"fields": "username,name", "access_token": token},
        timeout=30,
    )
    if resp.status_code != 200:
        _erro(resp, "testar_conexao")
    return resp.json()


def _aguardar_container_pronto(container_id: str, token: str) -> None:
    for _ in range(_POLL_TENTATIVAS_MAXIMAS):
        resp = requests.get(
            f"{GRAPH}/{container_id}",
            params={"fields": "status_code", "access_token": token},
            timeout=30,
        )
        if resp.status_code != 200:
            _erro(resp, "consultar_status_container")
        status = resp.json().get("status_code")
        if status == "FINISHED":
            return
        if status in ("ERROR", "EXPIRED"):
            raise ErroGraphAPI(
                "processar_container", 0,
                f"A Meta reportou status '{status}' ao processar a mídia (container {container_id}).",
            )
        time.sleep(_POLL_INTERVALO_SEGUNDOS)

    raise ErroGraphAPI(
        "processar_container", 0,
        f"A mídia (container {container_id}) não ficou pronta após "
        f"{_POLL_TENTATIVAS_MAXIMAS * _POLL_INTERVALO_SEGUNDOS}s de espera - tente publicar de novo.",
    )


def publicar_carrossel(token: str, conta_id: str, imagem1_url: str, imagem2_url: str, legenda: str) -> dict:
    """Publica um carrossel de 2 imagens + legenda na conta profissional do
    Instagram (`conta_id`), em 3 chamadas (criar os 2 itens do carrossel,
    criar o container, publicar) + 1 chamada best-effort pro permalink.
    Lança ErroGraphAPI com a etapa e a resposta bruta da Meta em caso de
    falha - o chamador decide o que fazer (não republica sozinho)."""
    ids_itens = []
    for url_imagem in (imagem1_url, imagem2_url):
        resp = requests.post(
            f"{GRAPH}/{conta_id}/media",
            data={"image_url": url_imagem, "is_carousel_item": "true", "access_token": token},
            timeout=60,
        )
        if resp.status_code != 200:
            _erro(resp, "criar_item_carrossel")
        ids_itens.append(resp.json()["id"])

    resp = requests.post(
        f"{GRAPH}/{conta_id}/media",
        data={
            "media_type": "CAROUSEL",
            "caption": legenda,
            "children": ",".join(ids_itens),
            "access_token": token,
        },
        timeout=60,
    )
    if resp.status_code != 200:
        _erro(resp, "criar_container_carrossel")
    container_id = resp.json()["id"]

    _aguardar_container_pronto(container_id, token)

    resp = requests.post(
        f"{GRAPH}/{conta_id}/media_publish",
        data={"creation_id": container_id, "access_token": token},
        timeout=60,
    )
    if resp.status_code != 200:
        _erro(resp, "publicar_container")
    post_id = resp.json().get("id")

    permalink = None
    try:
        resp = requests.get(
            f"{GRAPH}/{post_id}", params={"fields": "permalink", "access_token": token}, timeout=30
        )
        if resp.status_code == 200:
            permalink = resp.json().get("permalink")
    except requests.RequestException:
        pass  # publicado com sucesso mesmo assim - só não temos o link à mão

    return {"post_id": post_id, "permalink": permalink}
