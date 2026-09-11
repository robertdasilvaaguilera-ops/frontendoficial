# ATLAS Engine — Sprint 1

Coletor automático de oportunidades tributárias, societárias e financeiras
a partir de fontes oficiais. Sem IA nesta fase (proposital — ver estratégia
combinada). Sem custo.

---

## ⚠️ Aviso importante de transparência

Este código foi escrito em um ambiente **sem acesso à internet** — não
consegui executar e testar as chamadas reais aos feeds. As URLs de RSS
foram confirmadas por busca (não por teste direto), exceto onde indicado.
Status real de cada fonte:

| Fonte | Status | Observação |
|---|---|---|
| Receita Federal | 🟡 URL provável, não testada | Segue o padrão gov.br/Plone (`/RSS` no final) |
| PGFN | 🟡 URL provável, não testada | Mesmo padrão gov.br/Plone |
| STJ | 🟢 URL confirmada na página oficial de RSS do tribunal | Duas fontes: notícias + Informativo de Jurisprudência |
| STF | 🔴 Não automatizado | RSS exige cadastro prévio (STF Push) — ver `collectors/stf.py` |
| CARF | 🔴 Não automatizado | Não encontrei API/RSS pública — ver `collectors/carf.py` |
| Diário Oficial da União | ⚪ Não incluído neste Sprint 1 | Existe uma ferramenta open-source pronta para isso — ver seção abaixo |

**Primeira coisa a fazer:** rode o programa e me cole aqui o que aparecer
no terminal. Se dois dos `[AVISO] feed vazio` aparecerem, eu ajusto a URL
na hora — é rápido de corrigir, só preciso do erro real.

---

## Sobre o Diário Oficial da União

Antes de programar um coletor do zero para o DOU, vale usar o
**Ro-DOU** (https://github.com/gestaogovbr/Ro-dou) — ferramenta open-source
já pronta, mantida por órgãos do governo, que faz exatamente o que
descrevemos: monitora o DOU por palavra-chave e notifica por e-mail/Slack.
Reaproveitar é mais rápido do que reescrever a mesma coisa.

---

## Instalação

```bash
cd atlas
pip install -r requirements.txt
```

## Uso

```bash
python main.py
```

Isso vai:
1. Consultar Receita Federal, PGFN, STJ (STF e CARF ainda avisam e pulam)
2. Filtrar apenas notícias com palavras-chave relevantes (`filters/keywords.py`)
3. Classificar por categoria (tributário/societário/financeiro/setor)
4. Salvar tudo em `reports/oportunidades.xlsx`
5. Lembrar o que já viu (`logs/vistos.json`) — rodar de novo não duplica

## Estrutura

```
atlas/
├── collectors/       → um arquivo por fonte oficial
├── filters/
│   └── keywords.py   → palavras-chave (edite aqui para afinar o filtro)
├── database/         → reservado para Sprint 2 (SQLite)
├── reports/          → oportunidades.xlsx é gerado aqui
├── logs/             → controle de duplicidade
└── main.py
```

## API + Copiloto (chat com Claude)

`api_server.py` expõe a API REST consumida pelo frontend (`/opportunities`,
`/news`, `/clients`, `/summary`) e o endpoint do chat do Copiloto ATLAS:

```bash
uvicorn api_server:app --reload --port 8000
```

`POST /copilot/chat` recebe `{"pergunta": "...", "historico": [...]}`,
busca as decisões coletadas mais relevantes para a pergunta (ranking por
palavra-chave em `_buscar_decisoes_relevantes`, sem custo) e manda esse
contexto para a Claude API responder com fundamento, citando qual decisão
sustenta cada afirmação. Devolve `{"resposta": "...", "fontes": [...]}`.

Configure a chave da Anthropic antes de rodar:

```bash
export ANTHROPIC_API_KEY="sua-chave-aqui"   # console.anthropic.com/settings/keys
# opcional: outro modelo (padrão claude-sonnet-5)
export ATLAS_CLAUDE_MODEL="claude-sonnet-5"
```

Sem `ANTHROPIC_API_KEY` configurada, o endpoint responde `503` explicando
o que falta — o resto da API continua funcionando normalmente.

## Próximos passos (conforme o plano combinado)

- **Sprint 1 (este):** coleta + Excel, sem IA — em andamento
- **Sprint 2:** trocar Excel por SQLite + dashboard simples
- **Sprint 3:** IA classifica e prioriza oportunidades (API da OpenAI)
- **Sprint 4:** geração e publicação automática de posts

## Se algo der erro

Cole aqui a mensagem completa do terminal — como não tenho acesso à rede
neste ambiente, o teste real só acontece na sua máquina, e eu ajusto o
código com base no erro exato (URL errada, formato de feed diferente,
biblioteca faltando, etc.).
