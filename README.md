# Pong Multiplayer Distribuido via MQTT

Projeto academico com ESP32 fisico, backend Python/FastAPI, frontend React,
Chart.js e comunicacao MQTT real pelo HiveMQ Cloud.

## Componentes

- `pong-back`: backend autoritativo do jogo, API REST, Swagger e cliente Paho.
- `pong-front`: interface React, MQTT.js, jogo, logs, chat e graficos.
- `pong-esp32`: controle fisico com potenciometros e botoes.

## Documentacao

- [Arquitetura, requisitos e execucao](pong-front/README.md)
- [Guia de deploy no Render e Vercel](DEPLOY.md)

## Execucao rapida

Backend:

```powershell
cd pong-back
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn pong_backend:app --host 0.0.0.0 --port 8000
```

Frontend:

```powershell
cd pong-front
npm install
npm run dev
```

Swagger local: `http://127.0.0.1:8000/docs`.

Antes do deploy, configure credenciais separadas e limitadas para backend,
frontend e ESP32 no HiveMQ Cloud.

## Controles da partida

- `READY`: inicia uma nova partida e zera o placar.
- `PAUSE`: pausa somente uma partida em andamento.
- `RESUME`: retoma somente uma partida pausada.
- `RESET_BALL`: reposiciona a bola durante uma partida ativa.
- `EXIT`: encerra a partida, zera o placar e centraliza a bola.

Os comandos usam QoS 1 e possuem `command_id`, evitando que uma retransmissao
do MQTT execute a mesma acao duas vezes.

## Validacao de entradas

Frontend e backend aceitam somente os jogadores `jogador1` e `jogador2`, os
comandos listados acima e mensagens de chat com 1 a 280 caracteres. Payloads
malformados, topicos nao permitidos, caracteres de controle e movimentos com
valores invalidos sao rejeitados. O backend continua sendo a autoridade final,
mesmo quando uma mensagem e publicada diretamente no broker.
