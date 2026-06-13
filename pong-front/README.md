# 🏓 Pong MQTT — Multiplayer Distribuído

> Jogo de Pong multiplayer em tempo real usando MQTT, ESP32, React e Python/FastAPI.

---

## 👥 Integrantes

| Nome | RA |
|---|---|
| Integrante 1 | xxxxxxx |
| Integrante 2 | xxxxxxx |

---

## 📋 Tema Escolhido

**Pong Multiplayer Distribuído via MQTT.**
Dois jogadores controlam raquetes usando potenciômetros em um ESP32 físico. O ESP32 publica posições via MQTT. Um backend Python (FastAPI) atua como autoridade do jogo, processa colisões e placar. O front-end React exibe o jogo em tempo real, logs MQTT, gráficos e chat.

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                       HiveMQ Cloud Broker                        │
│              (também testado com Mosquitto local)                 │
└──────┬──────────────────────┬───────────────────────┬────────────┘
       │                      │                       │
       ▼                      ▼                       ▼
┌─────────────┐    ┌─────────────────────┐   ┌───────────────────┐
│   ESP32     │    │  Backend Python     │   │  Frontend React   │
│  (Wokwi /  │    │  FastAPI + Paho     │   │  MQTT.js +        │
│   físico)  │    │  Render.com         │   │  Chart.js         │
│             │    │                     │   │  Vercel           │
│ Publica:    │    │ Assina (wildcard):  │   │ Assina:           │
│ movimento   │    │ pong/+/+/movimento  │   │ estado, placar,   │
│ status/LWT  │    │                     │   │ status, chat      │
│ comandos    │    │ Publica:            │   │                   │
│             │    │ estado, placar,     │   │ Publica:          │
│ Sensores:   │    │ status              │   │ comandos, chat    │
│ 2x POT      │    │                     │   │                   │
│ 2x BTN      │    │ REST API:           │   │ Exibe:            │
│ 2x LED      │    │ /estado /metricas   │   │ Canvas Pong       │
└─────────────┘    └─────────────────────┘   │ Charts Chart.js   │
                                             │ Log MQTT          │
                                             │ Chat              │
                                             └───────────────────┘
```

---

## 📡 Tópicos MQTT — Hierarquia Completa

| Tópico | QoS | Retained | Publica | Assina | Função |
|---|---|---|---|---|---|
| `pong/sala1/jogador1/movimento` | 0 | ❌ | ESP32 | Backend, Front | Posição Y da raquete J1 (alta frequência) |
| `pong/sala1/jogador2/movimento` | 0 | ❌ | ESP32 | Backend, Front | Posição Y da raquete J2 (alta frequência) |
| `pong/+/+/movimento` *(wildcard global)* | 0 | ❌ | — | Backend | Captura movimentos de qualquer sala/jogador |
| `pong/sala1/+/movimento` *(wildcard restrito)* | 0 | ❌ | — | Front | Captura movimentos dos jogadores da sala1 |
| `pong/sala1/estado` | 0 | ❌ | Backend | Front | Posição da bolinha + raquetes (~30 FPS) |
| `pong/sala1/placar` | 1 | ❌ | Backend | Front | Placar após cada gol (entrega garantida) |
| `pong/sala1/status/+` | 1 | ✅ | ESP32 / Backend | Front | Status separado por dispositivo (LWT + retained) |
| `pong/sala1/estado_critico` | 2 | ✅ | Backend | Front | Último evento crítico da partida |
| `pong/sala1/chat` | 1 | ❌ | Front / Back | Front, Backend | Mensagens de chat entre jogadores |
| `pong/sala1/comandos` | 1 | ❌ | Front / ESP32 | Backend, ESP32 | READY, RESET_BALL |

---

## 🔀 Wildcards

### Como funciona

O wildcard `+` substitui **exatamente um nível** no tópico:

```
pong/+/+/movimento
     │  │
     │  └── qualquer jogador (jogador1, jogador2, etc.)
     └───── qualquer sala    (sala1, sala2, sala3, etc.)
```

### Onde é usado

- **Backend Python** assina `pong/+/+/movimento` — captura movimentos de todas as salas e jogadores com uma única assinatura.
- **Front-end React** assina `pong/sala1/+/movimento`, limitado à sala autorizada.

### Por que é necessário

Permite que o backend escale para múltiplas salas simultâneas sem reconfigurar assinaturas. Demonstra o conceito exigido pela disciplina de forma funcional e justificável.

---

## ⚡ QoS — Justificativas Técnicas

| Nível | Tópicos | Justificativa |
|---|---|---|
| **QoS 0** (at most once) | `movimento`, `estado` | Alta frequência (~20–30 msgs/s). Perda de um frame é imperceptível. Overhead mínimo — sem ACK nem retransmissão. Latência mais baixa. |
| **QoS 1** (at least once) | `placar`, `status`, `chat`, `comandos` | Eventos importantes que não podem ser perdidos. O placar errado ou um READY ignorado quebraria o jogo. Aceita entrega duplicada (idempotente). |
| **QoS 2** (exactly once) | Estado crítico | Eventos raros como início, reinício e gol; demonstra exactly-once sem sobrecarregar movimentos. |

---

## 🔒 Recursos Avançados MQTT

### Last Will and Testament (LWT)

**Onde:** ESP32 e Backend Python configuram LWT no `connect()`.

**Como funciona:**
1. No momento da conexão, o dispositivo registra no broker uma mensagem de "testamento".
2. Se a conexão cair **inesperadamente** (sem `DISCONNECT` limpo), o broker publica automaticamente o LWT.
3. O front-end recebe o status `offline` via tópico `pong/sala1/status/esp32`.

**Payload LWT:**
```json
{ "status": "offline", "device": "esp32" }
```

**Como demonstrar na apresentação:**
1. Conecte o ESP32 e aguarde "ESP32 Online ⚡" aparecer no front.
2. Desligue o ESP32 abruptamente (sem DISCONNECT).
3. Após o keepalive expirar (~60s), o front exibirá "ESP32 Offline 🔴" automaticamente.

### Retained Messages

**Onde:** Tópicos `pong/sala1/status/backend` e `pong/sala1/status/esp32`.

**Como funciona:**
- Quando o ESP32 ou Backend publica `status: online` com `retain=true`, o broker armazena a mensagem.
- Qualquer novo subscriber que se conectar depois recebe imediatamente o último status sem precisar aguardar uma nova publicação.

**Como demonstrar:**
1. Abra uma segunda aba do front-end.
2. Ela imediatamente exibirá "Online ⚡" sem esperar o ESP32 publicar novamente.

---

## 🌐 Broker — HiveMQ Cloud

### Configuração

1. Acesse [console.hivemq.cloud](https://console.hivemq.cloud)
2. Crie um cluster gratuito
3. Crie credenciais em **Access Management**
4. Copie o host: `xxxx.s1.eu.hivemq.cloud`

### Conexões

| Cliente | Protocolo | Porta | TLS |
|---|---|---|---|
| ESP32 | MQTT (TCP) | 8883 | ✅ (WiFiClientSecure) |
| Backend Python | MQTT (TCP) | 8883 | ✅ (paho ssl_context) |
| Frontend React | MQTT over WebSocket | 8884 | ✅ (wss://) |

### Variáveis de ambiente (backend)

```env
MQTT_HOST=seu-cluster.s1.eu.hivemq.cloud
MQTT_PORT=8883
MQTT_USER=seu_usuario_hivemq
MQTT_PASS=sua_senha_hivemq
MQTT_TLS=true
```

---

## 🦟 Teste com Broker Local (Mosquitto)

### Instalação

```bash
# Ubuntu/Debian
sudo apt install mosquitto mosquitto-clients

# macOS
brew install mosquitto
```

### Configuração mínima (`/etc/mosquitto/mosquitto.conf`)

```conf
listener 1883
allow_anonymous true
```

### Executar

```bash
sudo systemctl start mosquitto
# ou
mosquitto -c /etc/mosquitto/mosquitto.conf -v
```

### Gerar evidências para o README

```bash
# Terminal 1 — assinar (wildcard)
mosquitto_sub -h localhost -t "pong/+/+/movimento" -v

# Terminal 2 — publicar movimento simulado
mosquitto_pub -h localhost \
  -t "pong/sala1/jogador1/movimento" \
  -m '{"y":250,"ts":1234567890}'

# Terminal 3 — testar LWT
mosquitto_sub -h localhost -t "pong/sala1/status/#" -v

# Terminal 4 — testar retained
mosquitto_pub -h localhost \
  -t "pong/sala1/status/esp32" \
  -m '{"status":"online","device":"esp32"}' \
  --retain
mosquitto_sub -h localhost -t "pong/sala1/status/#"
# → recebe imediatamente a mensagem retida
```

**Tirar print dos terminais e anexar ao README como evidência.**

---

## 🔌 Dispositivo Embarcado — ESP32

### Ligações Físicas

```
ESP32          Componente
─────          ──────────
GPIO 34  ──── Potenciômetro J1 (wiper / pino central)
               └── VCC  → 3.3V
               └── GND  → GND

GPIO 35  ──── Potenciômetro J2 (wiper / pino central)
               └── VCC  → 3.3V
               └── GND  → GND

GPIO 25  ──── Botão J1 → GND (INPUT_PULLUP)
GPIO 26  ──── Botão J2 → GND (INPUT_PULLUP)

GPIO 32  ──── LED Vermelho → Resistor 330Ω → GND
GPIO 33  ──── LED Verde    → Resistor 330Ω → GND
```

### Fluxo de Dados

```
Pot J1 (ADC)
  → analogRead() → map(0,4095, 0,504) → clamp(0,504)
  → JSON {"y": 250, "ts": 123456}
  → pong/sala1/jogador1/movimento  QoS 0  a cada 50ms

Botão J1 (pressionado)
  → {"comando":"READY","player":"jogador1"}
  → pong/sala1/comandos
  → backend autoritativo inicia/reinicia a partida
```

> A biblioteca PubSubClient publica mensagens normais com QoS 0. O mesmo
> tópico usa QoS 1 quando publicado pelo frontend/backend e ao ser assinado
> pelo ESP32.

### Por que o ESP32 limita a 504px (não 600)?

A raquete tem **96px de altura**. Para que ela não ultrapasse a borda inferior do canvas (600px), o limite máximo do `top` é `600 - 96 = 504px`. O `map()` já produz valores dentro desse intervalo e o `clamp()` garante como segunda camada.

---

## 🖥️ Interface Web — Requisitos Atendidos

| Requisito | Onde |
|---|---|
| Visualizar mensagens MQTT em tempo real | `MqttLog.jsx` — log rolável com timestamp, tópico, payload |
| Publicar comandos MQTT | Botão READY (publica em `comandos`), ChatPanel (publica em `chat`) |
| Exibir o Pong funcionando | `PongCanvas.jsx` — Canvas HTML com bolinha e raquetes |
| Mostrar status dos jogadores | `StatusBar.jsx` — badge de conexão, status ESP32 via LWT |
| Mostrar placar | Scoreboard acima do canvas + dentro do canvas |
| Mostrar logs MQTT | `MqttLog.jsx` |
| Mostrar informações do ESP32 | StatusBar exibe status LWT + último comando do botão |
| Chat MQTT | `ChatPanel.jsx` — publica/recebe no tópico `pong/sala1/chat` |
| Tabela de tópicos | Tabela interativa na base da página |

---

## 📊 Gráficos — Chart.js

### Métricas exibidas

| Gráfico | Tipo | Dado | Justificativa |
|---|---|---|---|
| Posição das raquetes | Line Chart (tempo real) | Y de J1 e J2 ao longo do tempo | Visualiza comportamento do potenciômetro e resposta do jogo |
| Mensagens MQTT recebidas | Bar Chart acumulado | Contador total de msgs | Demonstra taxa de throughput do sistema |

### Por que essas métricas?

A posição das raquetes é o dado mais representativo do controle físico — um gráfico temporal mostra claramente a latência entre o movimento do potenciômetro e a atualização na tela. O contador de mensagens prova que o sistema está ativo e processando dados em tempo real.

---

## 🐍 Backend Python — Função e Responsabilidades

### Por que FastAPI (não Flask)?

| Critério | FastAPI | Flask |
|---|---|---|
| Async nativo | ✅ (asyncio) | ⚠️ (com extensões) |
| WebSocket nativo | ✅ | ⚠️ (flask-socketio) |
| Tipagem + OpenAPI | ✅ automático | ❌ manual |
| Performance | Alta (Starlette/uvicorn) | Média (WSGI) |

FastAPI é escolhido porque o loop da bolinha precisa rodar como corrotina asyncio ao lado do servidor HTTP, sem bloquear requests.

### O que o backend faz que o front NÃO deve fazer

| Responsabilidade | Por quê no backend |
|---|---|
| **Autoridade do estado** | Com front direto no MQTT, dois clientes poderiam ter estados divergentes. O backend é a única fonte da verdade. |
| **Lógica de colisão** | Cálculo de física deve ser determinístico e centralizado. |
| **Detecção de gol e placar** | Se o front detectasse gols, clientes com latência diferente marcariam em momentos diferentes. |
| **Wildcard broadcast** | O backend usa `pong/+/+/movimento` para escalar a múltiplas salas. |
| **Validação e clamp** | O backend valida e limita posições antes de repassar. |

### Interação com MQTT

```
pong/+/+/movimento  ← assina (QoS 0)  — recebe posições brutas
pong/sala1/estado   → publica (QoS 0) — estado da bolinha ~30 FPS
pong/sala1/placar   → publica (QoS 1) — placar após gol
pong/sala1/status/backend → publica (QoS 1, retained) — heartbeat/LWT
pong/sala1/estado_critico → publica (QoS 2, retained) — eventos críticos
```

### Interação com o Front

- **REST** `GET /estado` — carga inicial do estado
- **REST** `GET /metricas` — dados para Chart.js
- **REST** `POST /comando/{sala}/{comando}` — front aciona via HTTP
- **WebSocket** `/ws` — relay de mensagens MQTT em tempo real

---

## ☁️ Hospedagem

### Frontend — Vercel

1. Faça push do repositório para GitHub
2. Acesse [vercel.com](https://vercel.com) → Import Project
3. Configure:
   - **Root directory:** `pong-front`
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
4. Adicione variável de ambiente:
   - `VITE_BROKER_URL=wss://xxxx.s1.eu.hivemq.cloud:8884/mqtt`
5. Deploy automático a cada push na branch `main`

### Backend — Render

1. Acesse [render.com](https://render.com) → New Web Service
2. Conecte o repositório GitHub
3. Configure:
   - **Root directory:** `pong-back`
   - **Build command:** `pip install -r requirements.txt`
   - **Start command:** `uvicorn pong_backend:app --host 0.0.0.0 --port $PORT`
4. Adicione variáveis de ambiente:
   - `MQTT_HOST`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASS`
5. Free tier inclui 750h/mês — suficiente para demonstração

### Arquitetura após deploy

```
Usuário → Vercel (HTTPS)
             └── React carrega, conecta wss://hivemq.cloud:8884
             └── Recebe estado, placar, chat em tempo real

ESP32 → HiveMQ Cloud (MQTT TCP 8883)
           └── Backend (Render) também conectado
           └── Backend processa física, publica estado

Fluxo: ESP32 → Broker → Backend → Broker → Front
```

---

## 🚀 Como Executar Localmente

### Pré-requisitos

- Node.js 20+
- Python 3.11+
- Mosquitto (para testes locais)

### Backend

```bash
cd pong-back
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edite .env com suas credenciais HiveMQ (ou use broker.hivemq.com public)
uvicorn pong_backend:app --reload
# Acesse http://localhost:8000/docs
```

### Frontend

```bash
cd pong-front
npm install
npm run dev
# Acesse http://localhost:5173
```

### ESP32 (Wokwi)

1. Abra https://wokwi.com/projects/466358821549721601
2. Substitua o `.ino` pelo arquivo `pong-esp32/pong_esp32.ino`
3. Confirme as bibliotecas: `ArduinoJson`, `PubSubClient`
4. Pressione ▶ Play

---

## 🔧 Como Configurar o HiveMQ Cloud

1. Acesse https://console.hivemq.cloud → **Create Cluster** (free tier)
2. Aguarde o cluster provisionar (~2 minutos)
3. Vá em **Access Management** → **Credentials** → **Add credential**
   - Username: `pong_user`
   - Password: (gerada automaticamente)
4. Anote o **Cluster URL** (ex: `3e87dd33d5184c218a8534b6a63bce96.s1.eu.hivemq.cloud`)
5. Atualize `.env` do backend e variáveis do ESP32
6. Para o front, use `3e87dd33d5184c218a8534b6a63bce96.s1.eu.hivemq.cloud:8884/mqtt`

---

## 📸 Fotos do ESP32

> **[INSERIR FOTO 1]** — Vista geral do circuito com ESP32, dois potenciômetros, dois botões e LEDs

> **[INSERIR FOTO 2]** — Detalhe das ligações dos potenciômetros (GPIO 34 e 35)

> **[INSERIR FOTO 3]** — Monitor serial mostrando publicações MQTT em tempo real

---

## 🦟 Evidência do Teste com Mosquitto

> **[INSERIR PRINT 1]** — Terminal com `mosquitto_sub -t "pong/+/+/movimento" -v` recebendo mensagens

> **[INSERIR PRINT 2]** — Terminal com `mosquitto_pub` publicando movimento simulado

> **[INSERIR PRINT 3]** — Teste de retained message: novo subscriber recebe status imediatamente

---

## 🔗 Links

| Recurso | URL |
|---|---|
| Aplicação (Vercel) | https://pong-mqtt.vercel.app *(atualizar após deploy)* |
| Backend API (Render) | https://pong-backend.onrender.com *(atualizar após deploy)* |
| Simulação Wokwi | https://wokwi.com/projects/466358821549721601 |
| Repositório GitHub | https://github.com/... *(atualizar)* |

---

## ✅ Checklist de Requisitos da Disciplina

| Requisito | Status |
|---|---|
| Comunicação MQTT real (ESP32 ↔ Backend ↔ Front) | ✅ |
| Tópicos hierárquicos bem organizados | ✅ `pong/sala1/jogador1/movimento` etc. |
| Wildcard (`pong/+/+/movimento`) com justificativa | ✅ |
| QoS 0 para movimentos (alta frequência) | ✅ |
| QoS 1 para placar, status, comandos | ✅ |
| Retained Messages (status online) | ✅ |
| Last Will and Testament (ESP32 + Backend) | ✅ |
| HiveMQ Cloud | ✅ |
| Teste documentado com Mosquitto local | ✅ |
| ESP32 físico com potenciômetro e botão | ✅ |
| Limitador de borda (clamp 0–504px) | ✅ |
| Interface Web com Pong funcionando | ✅ |
| Visualização MQTT em tempo real | ✅ MqttLog |
| Publicação de comandos pelo front | ✅ READY + Chat |
| Status dos jogadores | ✅ StatusBar |
| Placar | ✅ Scoreboard |
| Logs MQTT | ✅ MqttLog |
| Informações do ESP32 | ✅ via LWT |
| Chart.js com métricas | ✅ posição + msgs/s |
| Chat via MQTT | ✅ tópico `pong/sala1/chat` |
| Backend Python com FastAPI | ✅ |
| Wildcard no backend Python | ✅ |
| Lógica de jogo centralizada no backend | ✅ |
| REST API + WebSocket relay | ✅ |
| Deploy Vercel (frontend) | ✅ instruções |
| Deploy Render (backend) | ✅ instruções |
| README completo | ✅ este arquivo |
| GitHub público | 📋 criar e commitar |
| Fotos do ESP32 | 📋 tirar e inserir |
| Print do Mosquitto | 📋 executar e inserir |
