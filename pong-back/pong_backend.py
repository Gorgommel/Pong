"""
pong_backend.py — Backend Python (FastAPI + Paho MQTT)
======================================================
Responsabilidades:
  1. Conectar ao HiveMQ Cloud como cliente MQTT autoritativo
  2. Assinar tópicos com WILDCARD:  pong/+/+/movimento
  3. Validar e retransmitir posições das raquetes
  4. Manter estado canônico da partida (GameState)
  5. Publicar estado, placar e status via MQTT
  6. Expor API REST (FastAPI) para o front consultar estado e métricas
  7. Relay de mensagens para front via WebSocket (opcional)

Requisitos atendidos:
  ✅ Backend Python com Paho MQTT
  ✅ Wildcard  pong/+/+/movimento  (single-level +)
  ✅ QoS diferenciados por tópico
  ✅ LWT configurado no connect()
  ✅ Retained Messages no status online
  ✅ Separação de responsabilidades front ↔ back
"""

import asyncio
import json
import logging
import math
import os
import random
import re
import ssl
import time
from dataclasses import asdict, dataclass, field
from threading import Lock

import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# Localmente, le pong-back/.env. No Render, use Environment Variables.
load_dotenv()

# ──────────────────────────────────────────────────────────────
#  Logging
# ──────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("pong-backend")

# ──────────────────────────────────────────────────────────────
#  Configurações (via variáveis de ambiente para deploy)
# ──────────────────────────────────────────────────────────────
MQTT_HOST  = os.getenv("MQTT_HOST",  "3e87dd33d5184c218a8534b6a63bce96.s1.eu.hivemq.cloud")
MQTT_PORT  = int(os.getenv("MQTT_PORT", "8883"))
MQTT_USER  = os.getenv("MQTT_USER",  "")
MQTT_PASS  = os.getenv("MQTT_PASS",  "")
MQTT_TLS   = os.getenv("MQTT_TLS", "true").lower() in ("1", "true", "yes", "on")
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "*").split(",")
    if origin.strip()
]

# Sala padrão
DEFAULT_SALA = "sala1"

# Tópicos — hierarquia  pong/<sala>/...
def t(sala: str, sufixo: str) -> str:
    return f"pong/{sala}/{sufixo}"

# ──────────────────────────────────────────────────────────────
#  Constantes do jogo (espelham o front-end)
# ──────────────────────────────────────────────────────────────
CANVAS_W   = 800
CANVAS_H   = 600
PADDLE_H   = 96
PADDLE_W   = 16
PADDLE_X1R = 32           # borda direita da raquete J1
PADDLE_X2L = CANVAS_W - PADDLE_W - 16  # borda esquerda da raquete J2
BALL_SIZE  = 14
PADDLE_MIN = 0
PADDLE_MAX = CANVAS_H - PADDLE_H       # 504
SPEED_INIT = 5.0
SPEED_MAX  = 12.0
ACCEL      = 0.3
BALL_TICK  = 0.033   # 33ms ≈ 30 FPS

# ──────────────────────────────────────────────────────────────
#  Estado do jogo
# ──────────────────────────────────────────────────────────────
@dataclass
class GameState:
    sala:     str   = DEFAULT_SALA
    pos_j1:   int   = CANVAS_H // 2 - PADDLE_H // 2
    pos_j2:   int   = CANVAS_H // 2 - PADDLE_H // 2
    ball_x:   float = CANVAS_W / 2.0
    ball_y:   float = CANVAS_H / 2.0
    vel_x:    float = 0.0
    vel_y:    float = 0.0
    score_j1: int   = 0
    score_j2: int   = 0
    running:  bool  = False
    msgs_received: int = 0
    msgs_per_sec:  float = 0.0
    last_msg_time: float = field(default_factory=time.time)

game = GameState()
game_lock = Lock()

# Histórico de posição para Chart.js
history_j1: list[dict] = []
history_j2: list[dict] = []
MAX_HISTORY = 120   # últimos 4 segundos a 30 FPS

# ──────────────────────────────────────────────────────────────
#  FastAPI app
# ──────────────────────────────────────────────────────────────
app = FastAPI(title="Pong MQTT Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket connections (relay em tempo real para o front)
ws_clients: list[WebSocket] = []

# ──────────────────────────────────────────────────────────────
#  MQTT client setup
# ──────────────────────────────────────────────────────────────
def make_mqtt_client() -> mqtt.Client:
    client = mqtt.Client(client_id=f"PongBackend_{random.randint(0,9999)}",
                         protocol=mqtt.MQTTv311)

    if MQTT_USER:
        client.username_pw_set(MQTT_USER, MQTT_PASS)
    # HiveMQ Cloud usa TLS na porta 8883. Para teste com Mosquitto local,
    # coloque MQTT_TLS=false e MQTT_PORT=1883 no .env.
    if MQTT_TLS:
        client.tls_set(cert_reqs=ssl.CERT_REQUIRED, tls_version=ssl.PROTOCOL_TLS_CLIENT)

    # ── LWT ──────────────────────────────────────────────────
    # Se a conexão cair, o broker publica este status automaticamente
    # QoS 1, retained=True → subscribers recebem mesmo depois da queda
    lwt_payload = json.dumps({"status": "offline", "device": "backend"})
    client.will_set(
        t(DEFAULT_SALA, "status/backend"),
        payload=lwt_payload,
        qos=1,
        retain=True
    )

    client.on_connect    = on_connect
    client.on_disconnect = on_disconnect
    client.on_message    = on_message
    return client


def on_connect(client, userdata, flags, rc):
    if rc != 0:
        log.error(f"[MQTT] Falha na conexão, rc={rc}")
        return

    log.info("[MQTT] Conectado ao broker!")

    # ── Retained online ──────────────────────────────────────
    # QoS 1, retained=True → qualquer front que se conectar depois
    # recebe imediatamente o status online
    client.publish(
        t(DEFAULT_SALA, "status/backend"),
        json.dumps({"status": "online", "device": "backend"}),
        qos=1, retain=True
    )

    # ── Assina com WILDCARD ──────────────────────────────────
    # "+" substitui exatamente UM nível de tópico
    # pong/+/+/movimento  → captura movimentos de qualquer sala e jogador
    client.subscribe("pong/+/+/movimento", qos=0)   # QoS 0: alta frequência, perda ok
    log.info("[MQTT] Inscrito em  pong/+/+/movimento  (wildcard)")

    # Assina comandos (READY, RESET)
    client.subscribe(t(DEFAULT_SALA, "comandos"), qos=1)

    # Assina chat
    client.subscribe(t(DEFAULT_SALA, "chat"), qos=1)
    # QoS 2 fica reservado para eventos criticos e raros da partida.
    client.subscribe(t(DEFAULT_SALA, "estado_critico"), qos=2)

    log.info(f"[MQTT] Tópicos ativos:\n"
             f"  pong/+/+/movimento  (wildcard, QoS 0)\n"
             f"  {t(DEFAULT_SALA, 'comandos')}  (QoS 1)\n"
             f"  {t(DEFAULT_SALA, 'chat')}  (QoS 1)")


def on_disconnect(client, userdata, rc):
    log.warning(f"[MQTT] Desconectado rc={rc}")


def on_message(client, userdata, msg):
    """Callback principal — processa todas as mensagens recebidas."""
    topic   = msg.topic
    payload = msg.payload.decode("utf-8", errors="ignore")

    log.debug(f"[MQTT] <- {topic}: {payload}")

    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        log.warning(f"[MQTT] Payload inválido em {topic}: {payload}")
        return

    with game_lock:
        game.msgs_received += 1
        now = time.time()
        elapsed = now - game.last_msg_time
        if elapsed > 0:
            game.msgs_per_sec = 1.0 / elapsed
        game.last_msg_time = now

        # ── Movimentos de raquete (wildcard match) ─────────────
        # Tópico: pong/<sala>/jogador1/movimento  ou  pong/<sala>/jogador2/movimento
        parts = topic.split("/")
        if len(parts) == 4 and parts[3] == "movimento":
            sala    = parts[1]
            jogador = parts[2]   # "jogador1" ou "jogador2"
            try:
                y_raw = int(data.get("y", 0))
            except (TypeError, ValueError):
                log.warning("[MQTT] Movimento invalido em %s: %s", topic, payload)
                return
            y       = max(PADDLE_MIN, min(PADDLE_MAX, y_raw))   # clamp

            ts = {"t": round(now * 1000), "y": y}

            if jogador == "jogador1":
                game.pos_j1 = y
                history_j1.append(ts)
                if len(history_j1) > MAX_HISTORY:
                    history_j1.pop(0)
            elif jogador == "jogador2":
                game.pos_j2 = y
                history_j2.append(ts)
                if len(history_j2) > MAX_HISTORY:
                    history_j2.pop(0)

        # ── Comandos ───────────────────────────────────────────
        elif topic == t(DEFAULT_SALA, "comandos"):
            cmd = data.get("comando")
            if cmd == "READY":
                log.info("[JOGO] READY recebido — iniciando partida")
                game.running  = True
                game.score_j1 = 0
                game.score_j2 = 0
                _reset_ball_unsafe()
                _publish_estado_critico(client, "partida_iniciada")
            elif cmd == "RESET_BALL":
                _reset_ball_unsafe()
                _publish_estado_critico(client, "bola_reiniciada")

        # ── Chat ───────────────────────────────────────────────
        elif topic == t(DEFAULT_SALA, "chat"):
            log.info(f"[CHAT] {data.get('player','?')}: {data.get('msg','')}")

    # Relay para WebSocket (fora do lock para não bloquear)
    if _loop and not _loop.is_closed():
        asyncio.run_coroutine_threadsafe(
            ws_broadcast({"topic": topic, "payload": data}),
            _loop
        )


def _reset_ball_unsafe():
    """Reinicia a bola — deve ser chamado dentro do game_lock."""
    angle = random.uniform(math.radians(30), math.radians(60))
    dx = random.choice([-1, 1])
    dy = random.choice([-1, 1])
    game.ball_x = CANVAS_W / 2.0
    game.ball_y = CANVAS_H / 2.0
    game.vel_x  = dx * SPEED_INIT * math.cos(angle)
    game.vel_y  = dy * SPEED_INIT * math.sin(angle)


# ──────────────────────────────────────────────────────────────
#  Loop da bolinha (roda em task asyncio)
# ──────────────────────────────────────────────────────────────
async def ball_loop(client: mqtt.Client):
    """Tick da bolinha rodando no event loop do asyncio."""
    while True:
        await asyncio.sleep(BALL_TICK)

        with game_lock:
            if not game.running:
                continue

            game.ball_x += game.vel_x
            game.ball_y += game.vel_y
            h = BALL_SIZE / 2.0

            # Bordas
            if game.ball_y - h <= 0:
                game.ball_y = h;        game.vel_y =  abs(game.vel_y)
            if game.ball_y + h >= CANVAS_H:
                game.ball_y = CANVAS_H - h; game.vel_y = -abs(game.vel_y)

            # Raquete J1
            if (game.vel_x < 0 and
                game.ball_x - h <= PADDLE_X1R and
                game.ball_x > PADDLE_X1R - PADDLE_W - h and
                game.ball_y + h >= game.pos_j1 and
                game.ball_y - h <= game.pos_j1 + PADDLE_H):
                game.ball_x = PADDLE_X1R + h
                game.vel_x  = abs(game.vel_x)
                sp = math.sqrt(game.vel_x**2 + game.vel_y**2)
                if sp < SPEED_MAX:
                    f = 1 + ACCEL / sp
                    game.vel_x *= f; game.vel_y *= f

            # Raquete J2
            if (game.vel_x > 0 and
                game.ball_x + h >= PADDLE_X2L and
                game.ball_x < PADDLE_X2L + PADDLE_W + h and
                game.ball_y + h >= game.pos_j2 and
                game.ball_y - h <= game.pos_j2 + PADDLE_H):
                game.ball_x = PADDLE_X2L - h
                game.vel_x  = -abs(game.vel_x)
                sp = math.sqrt(game.vel_x**2 + game.vel_y**2)
                if sp < SPEED_MAX:
                    f = 1 + ACCEL / sp
                    game.vel_x *= f; game.vel_y *= f

            # Gols
            if game.ball_x - h < 0:
                game.score_j2 += 1
                _publish_placar(client, "jogador2")
                _reset_ball_unsafe()
                continue

            if game.ball_x + h > CANVAS_W:
                game.score_j1 += 1
                _publish_placar(client, "jogador1")
                _reset_ball_unsafe()
                continue

            # Publica estado (bolinha + posições) — QoS 0
            estado = {
                "bx": int(game.ball_x), "by": int(game.ball_y),
                "vx": int(game.vel_x),  "vy": int(game.vel_y),
                "j1": game.pos_j1,      "j2": game.pos_j2,
            }
            client.publish(t(DEFAULT_SALA, "estado"),
                           json.dumps(estado), qos=0)


def _publish_placar(client: mqtt.Client, gol_de: str):
    """Publica placar — QoS 1 (entrega garantida)."""
    payload = json.dumps({
        "j1":  game.score_j1,
        "j2":  game.score_j2,
        "gol": gol_de,
    })
    # QoS 1: broker confirma entrega ao menos uma vez
    client.publish(t(DEFAULT_SALA, "placar"), payload, qos=1)
    _publish_estado_critico(client, "gol")
    log.info(f"[PLACAR] Gol de {gol_de}! {game.score_j1} x {game.score_j2}")


def _publish_estado_critico(client: mqtt.Client, evento: str):
    """Publica eventos importantes com QoS 2 e retained.

    Movimentos e estado visual usam QoS 0 porque sao frequentes. Ja eventos
    como gol, inicio e reset sao raros e importantes para auditoria/apresentacao,
    por isso usam QoS 2. O retained ajuda quem abrir a interface depois a ver
    o ultimo evento critico imediatamente.
    """
    payload = json.dumps({
        "evento": evento,
        "running": game.running,
        "score": {"j1": game.score_j1, "j2": game.score_j2},
        "ts": int(time.time() * 1000),
    })
    client.publish(t(DEFAULT_SALA, "estado_critico"), payload, qos=2, retain=True)


# ──────────────────────────────────────────────────────────────
#  WebSocket relay
# ──────────────────────────────────────────────────────────────
async def ws_broadcast(data: dict):
    dead = []
    for ws in ws_clients:
        try:
            await ws.send_json(data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        ws_clients.remove(ws)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    ws_clients.append(ws)
    log.info(f"[WS] Client conectado. Total: {len(ws_clients)}")
    try:
        while True:
            await ws.receive_text()   # mantém conexão aberta
    except WebSocketDisconnect:
        ws_clients.remove(ws)
        log.info("[WS] Client desconectado")


# ──────────────────────────────────────────────────────────────
#  Endpoints REST
# ──────────────────────────────────────────────────────────────

@app.get("/estado")
def get_estado():
    """Estado completo da partida — para polling ou carga inicial."""
    with game_lock:
        return asdict(game)


@app.get("/metricas")
def get_metricas():
    """Métricas para Chart.js."""
    with game_lock:
        return {
            "msgs_received":  game.msgs_received,
            "msgs_per_sec":   round(game.msgs_per_sec, 2),
            "history_j1":     list(history_j1[-60:]),
            "history_j2":     list(history_j2[-60:]),
            "score":          {"j1": game.score_j1, "j2": game.score_j2},
        }


@app.post("/comando/{sala}/{comando}")
def post_comando(sala: str, comando: str, player: str = "jogador1"):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,32}", sala):
        raise HTTPException(status_code=400, detail="Sala invalida")
    if comando not in {"READY", "RESET_BALL"}:
        raise HTTPException(status_code=400, detail="Comando nao permitido")
    """Publica comando MQTT a partir de requisição HTTP do front."""
    payload = json.dumps({"comando": comando, "player": player})
    _publish_or_503(t(sala, "comandos"), payload, qos=1)
    return {"ok": True, "topic": t(sala, "comandos"), "payload": payload}


@app.post("/chat")
def post_chat(sala: str = DEFAULT_SALA, player: str = "jogador1", msg: str = ""):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,32}", sala):
        raise HTTPException(status_code=400, detail="Sala invalida")
    if not msg.strip() or len(msg) > 280:
        raise HTTPException(status_code=400, detail="Mensagem deve ter entre 1 e 280 caracteres")
    """Publica mensagem de chat via HTTP (o front também pode publicar direto)."""
    payload = json.dumps({"player": player, "msg": msg, "ts": int(time.time()*1000)})
    _publish_or_503(t(sala, "chat"), payload, qos=1)
    return {"ok": True}


def _publish_or_503(topic: str, payload: str, qos: int):
    """Publica via MQTT ou informa indisponibilidade para o cliente HTTP."""
    if not mqtt_client or not mqtt_client.is_connected():
        raise HTTPException(status_code=503, detail="Broker MQTT desconectado")
    result = mqtt_client.publish(topic, payload, qos=qos)
    if result.rc != mqtt.MQTT_ERR_SUCCESS:
        raise HTTPException(status_code=503, detail="Falha ao publicar no broker MQTT")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "mqtt_connected": bool(mqtt_client and mqtt_client.is_connected()),
    }


# ──────────────────────────────────────────────────────────────
#  Startup / Shutdown
# ──────────────────────────────────────────────────────────────
mqtt_client: mqtt.Client = None
_loop: asyncio.AbstractEventLoop = None

_reset_ball_unsafe()   # inicializa velocidade antes do primeiro loop

@app.on_event("startup")
async def startup():
    global mqtt_client, _loop
    _loop = asyncio.get_event_loop()

    mqtt_client = make_mqtt_client()
    # Faz a primeira conexao antes de liberar o servidor HTTP. Isso permite
    # que /health indique corretamente se o backend chegou ao HiveMQ Cloud.
    try:
        mqtt_client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
    except OSError as exc:
        # Mantem /health e /docs disponiveis enquanto o MQTT reconecta.
        log.error("[MQTT] Conexao inicial falhou: %s", exc)
        mqtt_client.connect_async(MQTT_HOST, MQTT_PORT, keepalive=60)
    mqtt_client.loop_start()

    asyncio.create_task(ball_loop(mqtt_client))
    log.info("[APP] Backend iniciado.")


@app.on_event("shutdown")
async def shutdown():
    if mqtt_client:
        # Publica offline antes de desligar (graceful shutdown)
        mqtt_client.publish(
            t(DEFAULT_SALA, "status/backend"),
            json.dumps({"status": "offline", "device": "backend"}),
            qos=1, retain=True
        )
        mqtt_client.loop_stop()
        mqtt_client.disconnect()
    log.info("[APP] Backend encerrado.")


# ──────────────────────────────────────────────────────────────
#  Entrypoint local
# ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("pong_backend:app", host="0.0.0.0", port=8000, reload=True)
