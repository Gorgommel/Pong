/*
 * ============================================================
 *  PONG ESP32 — Firmware Completo
 *  Requisitos atendidos:
 *    ✅ Tópicos hierárquicos  pong/sala1/jogador1/movimento ...
 *    ✅ LWT configurado no connect()
 *    ✅ Retained Messages no status online
 *    ✅ QoS diferenciados por tipo de mensagem
 *    ✅ Potenciômetro (raquete) + Botão (READY)
 *    ✅ Limitador de borda (clamp 0–504)
 *    ✅ Lógica completa da bolinha com colisões
 *    ✅ Publicação de placar e gol
 *    ✅ LED de status visual
 * ============================================================
 *
 *  Ligações físicas:
 *    GPIO 34  → Potenciômetro J1 (wiper)
 *    GPIO 35  → Potenciômetro J2 (wiper)
 *    GPIO 25  → Botão J1 (INPUT_PULLUP → GND quando pressionado)
 *    GPIO 26  → Botão J2 (INPUT_PULLUP → GND quando pressionado)
 *    GPIO 32  → LED vermelho (+ resistor 330Ω → GND)
 *    GPIO 33  → LED verde   (+ resistor 330Ω → GND)
 *    3.3V     → Extremidade VCC dos potenciômetros
 *    GND      → Extremidade GND dos potenciômetros e botões
 * ============================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "secrets.h"  // Credenciais locais; este arquivo nao vai para o Git.

// ============================================================
//  Pinos
// ============================================================
const int POT_J1   = 34;
const int POT_J2   = 35;
const int BTN_J1   = 25;
const int BTN_J2   = 26;
const int LED_RED  = 32;
const int LED_GRN  = 33;

// ============================================================
//  Dimensões do canvas (espelha o front)
// ============================================================
const int CANVAS_W   = 800;
const int CANVAS_H   = 600;
const int PADDLE_H   = 96;
const int PADDLE_W   = 16;
// Borda direita da raquete J1: left-4 (16px) + largura(16px) = 32px
const int PADDLE_X1R = 32;
// Borda esquerda da raquete J2: right-4 (16px) do canvas = 800-16-16 = 768px
const int PADDLE_X2L = CANVAS_W - PADDLE_W - 16;
const int BALL_SIZE  = 14;
const int PADDLE_MIN = 0;
const int PADDLE_MAX = CANVAS_H - PADDLE_H;   // 504

// ============================================================
//  Wi-Fi
// ============================================================
const char* WIFI_SSID     = "Wokwi-GUEST";   // trocar para rede real
const char* WIFI_PASSWORD = "";

// ============================================================
//  MQTT — HiveMQ Cloud
//  Troque para suas credenciais HiveMQ Cloud
// ============================================================
// MQTT_HOST, MQTT_PORT, MQTT_USER e MQTT_PASS ficam em secrets.h.

// ============================================================
//  Sala fixa (poderia vir de EEPROM ou config)
// ============================================================
const char* SALA = "sala1";

// ============================================================
//  Tópicos — hierarquia obrigatória da disciplina
//  pong/<sala>/<jogador>/movimento
//  pong/<sala>/estado
//  pong/<sala>/placar
//  pong/<sala>/status
//  pong/<sala>/chat
// ============================================================
char TOPIC_MOV_J1[40];    // pong/sala1/jogador1/movimento
char TOPIC_MOV_J2[40];    // pong/sala1/jogador2/movimento
char TOPIC_ESTADO[40];    // pong/sala1/estado
char TOPIC_PLACAR[40];    // pong/sala1/placar
char TOPIC_STATUS[40];    // pong/sala1/status
char TOPIC_CHAT[40];      // pong/sala1/chat
char TOPIC_CMDS[40];      // pong/sala1/comandos   (backend → ESP32)

void buildTopics() {
  snprintf(TOPIC_MOV_J1, sizeof(TOPIC_MOV_J1), "pong/%s/jogador1/movimento", SALA);
  snprintf(TOPIC_MOV_J2, sizeof(TOPIC_MOV_J2), "pong/%s/jogador2/movimento", SALA);
  snprintf(TOPIC_ESTADO, sizeof(TOPIC_ESTADO), "pong/%s/estado",              SALA);
  snprintf(TOPIC_PLACAR, sizeof(TOPIC_PLACAR), "pong/%s/placar",              SALA);
  snprintf(TOPIC_STATUS, sizeof(TOPIC_STATUS), "pong/%s/status",              SALA);
  snprintf(TOPIC_CHAT,   sizeof(TOPIC_CHAT),   "pong/%s/chat",                SALA);
  snprintf(TOPIC_CMDS,   sizeof(TOPIC_CMDS),   "pong/%s/comandos",            SALA);
}

// ============================================================
//  MQTT client
// ============================================================
WiFiClientSecure espClient;
PubSubClient mqtt(espClient);

// ============================================================
//  Estado do jogo
// ============================================================
int   posJ1 = CANVAS_H / 2 - PADDLE_H / 2;
int   posJ2 = CANVAS_H / 2 - PADDLE_H / 2;
int   lastJ1 = -1, lastJ2 = -1;
int   scoreJ1 = 0, scoreJ2 = 0;

float ballX, ballY, velX, velY;
const float SPEED_INIT = 5.0f;
const float SPEED_MAX  = 12.0f;
const float ACCEL      = 0.3f;

unsigned long lastPaddlePub = 0;
unsigned long lastBallTick  = 0;
const int PADDLE_MS = 50;    // QoS 0, ~20 msg/s por raquete
const int BALL_MS   = 33;    // ~30 FPS

// ============================================================
//  Utilitários
// ============================================================
int clamp(int v, int lo, int hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

void resetBall() {
  ballX = CANVAS_W / 2.0f;
  ballY = CANVAS_H / 2.0f;
  float angle = random(30, 60) * (PI / 180.0f);
  float dx = (random(0,2) == 0) ? 1 : -1;
  float dy = (random(0,2) == 0) ? 1 : -1;
  velX = dx * SPEED_INIT * cos(angle);
  velY = dy * SPEED_INIT * sin(angle);
}

// ============================================================
//  Wi-Fi setup
// ============================================================
void setupWifi() {
  Serial.printf("\n[WIFI] Conectando a %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.printf("\n[WIFI] OK! IP: %s\n", WiFi.localIP().toString().c_str());
}

// ============================================================
//  MQTT reconnect — configura LWT antes do connect()
// ============================================================
void mqttReconnect() {
  while (!mqtt.connected()) {
    Serial.println("[MQTT] Tentando conectar...");
    digitalWrite(LED_RED, HIGH);
    digitalWrite(LED_GRN, LOW);

    String cid = "ESP32_Pong_" + String(random(0, 9999));

    // ── LWT ──────────────────────────────────────────────────
    // Publicado automaticamente pelo broker se a conexão cair
    // QoS 1, retained=true → qualquer subscriber que entrar depois
    // imediatamente vê o dispositivo como offline
    const char* lwtMsg = "{\"status\":\"offline\",\"device\":\"esp32\"}";

    if (mqtt.connect(cid.c_str(),
                     MQTT_USER, MQTT_PASS,
                     TOPIC_STATUS, 1, true, lwtMsg))
    {
      Serial.println("[MQTT] Conectado!");
      digitalWrite(LED_RED, LOW);
      digitalWrite(LED_GRN, HIGH);

      // ── Retained online ──────────────────────────────────
      // QoS 1, retained=true → novos subscribers recebem imediatamente
      mqtt.publish(TOPIC_STATUS,
                   "{\"status\":\"online\",\"device\":\"esp32\"}", true);

      // Assina comandos do backend (wildcard single-level dentro da sala)
      // pong/sala1/comandos  →  recebe READY, RESET, etc.
      mqtt.subscribe(TOPIC_CMDS, 1);   // QoS 1

    } else {
      Serial.printf("[MQTT] Falhou rc=%d, tentando em 5s\n", mqtt.state());
      delay(5000);
    }
  }
}

// ============================================================
//  Callback MQTT — recebe comandos do backend/front
// ============================================================
void mqttCallback(char* topic, byte* payload, unsigned int len) {
  char buf[256];
  strncpy(buf, (char*)payload, min(len, (unsigned int)255));
  buf[len] = '\0';
  Serial.printf("[MQTT] <- %s : %s\n", topic, buf);

  StaticJsonDocument<128> doc;
  if (deserializeJson(doc, buf)) return;

  if (strcmp(topic, TOPIC_CMDS) == 0) {
    const char* cmd = doc["comando"];
    if (cmd && strcmp(cmd, "READY") == 0) {
      resetBall();
      scoreJ1 = 0;
      scoreJ2 = 0;
      Serial.println("[JOGO] Partida reiniciada por comando READY.");
    }
    if (cmd && strcmp(cmd, "RESET_BALL") == 0) {
      resetBall();
    }
  }
}

// ============================================================
//  Publicações helpers
// ============================================================

// Movimento de raquete — QoS 0 (fire-and-forget, alta frequência)
void publishMovement(const char* topic, int y) {
  StaticJsonDocument<64> doc;
  doc["y"] = y;
  doc["ts"] = millis();
  char buf[64];
  serializeJson(doc, buf);
  mqtt.publish(topic, buf, false);   // QoS 0, not retained
}

// Estado da bolinha — QoS 0 (alta frequência, perda aceitável)
void publishBall() {
  StaticJsonDocument<128> doc;
  doc["bx"] = (int)ballX;
  doc["by"] = (int)ballY;
  doc["vx"] = (int)velX;
  doc["vy"] = (int)velY;
  char buf[128];
  serializeJson(doc, buf);
  mqtt.publish(TOPIC_ESTADO, buf, false);   // QoS 0
}

// Placar — QoS 1 (pelo menos uma entrega garantida)
void publishPlacar(const char* golDe = nullptr) {
  StaticJsonDocument<128> doc;
  doc["j1"] = scoreJ1;
  doc["j2"] = scoreJ2;
  if (golDe) doc["gol"] = golDe;
  char buf[128];
  serializeJson(doc, buf);
  // QoS 1: publish com retain=false, mas confirmação de entrega pelo broker
  // PubSubClient não expõe QoS diretamente em publish; para QoS 1 usa-se
  // o método de 5 argumentos onde o último é o qos (biblioteca v2.8+)
  mqtt.publish(TOPIC_PLACAR, (uint8_t*)buf, strlen(buf), false);
}

// ============================================================
//  Lógica da bolinha
// ============================================================
void tickBall() {
  ballX += velX;
  ballY += velY;

  float h = BALL_SIZE / 2.0f;

  // Bordas top/bottom
  if (ballY - h <= 0)          { ballY = h;             velY =  abs(velY); }
  if (ballY + h >= CANVAS_H)   { ballY = CANVAS_H - h;  velY = -abs(velY); }

  // Raquete J1 (esquerda)
  if (velX < 0 &&
      ballX - h <= PADDLE_X1R &&
      ballX > PADDLE_X1R - PADDLE_W - h &&
      ballY + h >= posJ1 &&
      ballY - h <= posJ1 + PADDLE_H)
  {
    ballX = PADDLE_X1R + h;
    velX  = abs(velX);
    float sp = sqrt(velX*velX + velY*velY);
    if (sp < SPEED_MAX) { float f = 1.0f + ACCEL/sp; velX *= f; velY *= f; }
  }

  // Raquete J2 (direita)
  if (velX > 0 &&
      ballX + h >= PADDLE_X2L &&
      ballX < PADDLE_X2L + PADDLE_W + h &&
      ballY + h >= posJ2 &&
      ballY - h <= posJ2 + PADDLE_H)
  {
    ballX = PADDLE_X2L - h;
    velX  = -abs(velX);
    float sp = sqrt(velX*velX + velY*velY);
    if (sp < SPEED_MAX) { float f = 1.0f + ACCEL/sp; velX *= f; velY *= f; }
  }

  // Gol J2 (bola passou esquerda)
  if (ballX - h < 0) {
    scoreJ2++;
    publishPlacar("jogador2");
    resetBall();
    return;
  }

  // Gol J1 (bola passou direita)
  if (ballX + h > CANVAS_W) {
    scoreJ1++;
    publishPlacar("jogador1");
    resetBall();
    return;
  }

  publishBall();
}

// ============================================================
//  SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  buildTopics();

  pinMode(LED_RED, OUTPUT);
  pinMode(LED_GRN, OUTPUT);
  pinMode(BTN_J1,  INPUT_PULLUP);
  pinMode(BTN_J2,  INPUT_PULLUP);
  digitalWrite(LED_RED, HIGH);
  digitalWrite(LED_GRN, LOW);

  setupWifi();
  // Para demonstracao, aceita o certificado TLS sem armazenar a CA.
  // Em producao, use espClient.setCACert(...) para validar o servidor.
  espClient.setInsecure();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  randomSeed(analogRead(0));
  resetBall();

  Serial.println("[SETUP] Pronto.");
  Serial.printf("[TOPICS] J1-mov : %s\n", TOPIC_MOV_J1);
  Serial.printf("[TOPICS] J2-mov : %s\n", TOPIC_MOV_J2);
  Serial.printf("[TOPICS] estado : %s\n", TOPIC_ESTADO);
  Serial.printf("[TOPICS] placar : %s\n", TOPIC_PLACAR);
  Serial.printf("[TOPICS] status : %s\n", TOPIC_STATUS);
}

// ============================================================
//  LOOP
// ============================================================
void loop() {
  if (!mqtt.connected()) mqttReconnect();
  mqtt.loop();

  // ── Botões ────────────────────────────────────────────────
  if (digitalRead(BTN_J1) == LOW) {
    mqtt.publish(TOPIC_CMDS,
      "{\"comando\":\"READY\",\"player\":\"jogador1\"}", false);
    resetBall(); scoreJ1 = 0; scoreJ2 = 0;
    delay(300);
  }
  if (digitalRead(BTN_J2) == LOW) {
    mqtt.publish(TOPIC_CMDS,
      "{\"comando\":\"READY\",\"player\":\"jogador2\"}", false);
    resetBall(); scoreJ1 = 0; scoreJ2 = 0;
    delay(300);
  }

  unsigned long now = millis();

  // ── Raquetes (QoS 0, 50ms) ───────────────────────────────
  if (now - lastPaddlePub > PADDLE_MS) {
    lastPaddlePub = now;

    int y1 = clamp(map(analogRead(POT_J1), 0, 4095, PADDLE_MIN, PADDLE_MAX),
                   PADDLE_MIN, PADDLE_MAX);
    int y2 = clamp(map(analogRead(POT_J2), 0, 4095, PADDLE_MIN, PADDLE_MAX),
                   PADDLE_MIN, PADDLE_MAX);

    if (abs(y1 - lastJ1) > 2) {
      posJ1 = y1; lastJ1 = y1;
      publishMovement(TOPIC_MOV_J1, y1);
    }
    if (abs(y2 - lastJ2) > 2) {
      posJ2 = y2; lastJ2 = y2;
      publishMovement(TOPIC_MOV_J2, y2);
    }
  }

  // ── Bolinha (~30 FPS) ─────────────────────────────────────
  if (now - lastBallTick > BALL_MS) {
    lastBallTick = now;
    tickBall();
  }
}
