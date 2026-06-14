/**
 * useMqtt.js — Hook React para conexão MQTT
 * ==========================================
 * Gerencia:
 *  - Conexão com HiveMQ Cloud via WebSocket (ws/wss)
 *  - Assinaturas com wildcard:  pong/+/estado
 *  - QoS diferenciados por tópico
 *  - Log de mensagens recebidas
 */

import { useEffect, useRef, useState, useCallback } from "react";
import mqtt from "mqtt";

const SALA = "sala1";

// Tópicos — espelha a hierarquia do backend
export const TOPICS = {
  MOV_J1:   `pong/${SALA}/jogador1/movimento`,
  MOV_J2:   `pong/${SALA}/jogador2/movimento`,
  ESTADO:   `pong/${SALA}/estado`,
  ESTADO_CRITICO: `pong/${SALA}/estado_critico`,
  PLACAR:   `pong/${SALA}/placar`,
  STATUS_ALL: `pong/${SALA}/status/+`,
  CHAT:     `pong/${SALA}/chat`,
  COMANDOS: `pong/${SALA}/comandos`,
  // Wildcard restrito à sala do frontend. O backend demonstra o wildcard global.
  MOV_ALL:  `pong/${SALA}/+/movimento`,
};

const MAX_LOGS = 100;
const VALID_COMMANDS = new Set(["READY", "PAUSE", "RESUME", "RESET_BALL", "EXIT"]);
const VALID_PLAYERS = new Set(["jogador1", "jogador2"]);

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function useMqtt(
  brokerUrl = "wss://3e87dd33d5184c218a8534b6a63bce96.s1.eu.hivemq.cloud:8884/mqtt"
) {
  const clientRef = useRef(null);
  const [connected, setConnected]   = useState(false);
  const [gameState, setGameState]   = useState({
    pos_j1: 252, pos_j2: 252,
    ball_x: 400, ball_y: 300,
    vel_x: 0, vel_y: 0,
    score_j1: 0, score_j2: 0,
  });
  const [placar, setPlacar]         = useState({ j1: 0, j2: 0, lastGoal: "" });
  const [espStatus, setEspStatus]   = useState("Desconhecido");
  const [mqttLogs, setMqttLogs]     = useState([]);
  const [chatMsgs, setChatMsgs]     = useState([]);
  const [lastCmd, setLastCmd]       = useState("");
  const [msgCount, setMsgCount]     = useState(0);
  const [gamePhase, setGamePhase]   = useState("aguardando");
  const [uiError, setUiError]       = useState("");

  const addLog = useCallback((topic, payload) => {
    const entry = {
      id:      Date.now() + Math.random(),
      time:    new Date().toLocaleTimeString("pt-BR", { hour12: false }),
      topic,
      payload: JSON.stringify(payload).slice(0, 80),
    };
    setMqttLogs(prev => [entry, ...prev].slice(0, MAX_LOGS));
    setMsgCount(c => c + 1);
  }, []);

  useEffect(() => {
    const client = mqtt.connect(brokerUrl, {
      clientId: `PongFront_${Math.random().toString(36).slice(2, 8)}`,
      clean:    true,
      reconnectPeriod: 3000,
      // No Vercel, estas variaveis sao definidas em Environment Variables.
      username: import.meta.env.VITE_MQTT_USER,
      password: import.meta.env.VITE_MQTT_PASS,
    });
    clientRef.current = client;

    client.on("connect", () => {
      setConnected(true);
      setUiError("");

      // ── Assinatura com wildcard (QoS 0) ────────────────────
      // Captura movimentos de QUALQUER sala e jogador
      // Demonstra o uso de wildcard + exigido pela disciplina
      client.subscribe(TOPICS.MOV_ALL,   { qos: 0 });

      // ── Demais tópicos ──────────────────────────────────────
      client.subscribe(TOPICS.ESTADO,   { qos: 0 });   // posição bolinha, alta freq
      client.subscribe(TOPICS.PLACAR,   { qos: 1 });   // placar: garante entrega
      client.subscribe(TOPICS.STATUS_ALL, { qos: 1 }); // status por dispositivo
      client.subscribe(TOPICS.ESTADO_CRITICO, { qos: 2 }); // eventos importantes
      client.subscribe(TOPICS.CHAT,     { qos: 1 });   // chat: garante entrega
      client.subscribe(TOPICS.COMANDOS, { qos: 1 });   // comandos: garante entrega
    });

    client.on("error",      (error) => {
      setConnected(false);
      setUiError(`Falha MQTT: ${error.message}`);
    });
    client.on("close",      () => setConnected(false));
    client.on("disconnect", () => setConnected(false));

    client.on("message", (topic, message) => {
      let payload;
      try { payload = JSON.parse(message.toString()); }
      catch {
        setUiError(`Payload JSON inválido recebido em ${topic}.`);
        return;
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        setUiError(`Payload inválido recebido em ${topic}.`);
        return;
      }

      addLog(topic, payload);

      // ── Roteamento por tópico ────────────────────────────
      // Usa endsWith para tratar wildcard corretamente
      if (topic.endsWith("/movimento")) {
        const parts = topic.split("/");
        const jogador = parts[2];
        setGameState(s => {
          const current = jogador === "jogador1" ? s.pos_j1 : s.pos_j2;
          const y = Math.max(0, Math.min(504, finiteNumber(payload.y, current)));
          return {
            ...s,
            pos_j1: jogador === "jogador1" ? y : s.pos_j1,
            pos_j2: jogador === "jogador2" ? y : s.pos_j2,
          };
        });
      }
      else if (topic.endsWith("/estado")) {
        setGameState(s => ({
          ...s,
          ball_x: finiteNumber(payload.bx, s.ball_x),
          ball_y: finiteNumber(payload.by, s.ball_y),
          vel_x:  finiteNumber(payload.vx, s.vel_x),
          vel_y:  finiteNumber(payload.vy, s.vel_y),
          pos_j1: finiteNumber(payload.j1, s.pos_j1),
          pos_j2: finiteNumber(payload.j2, s.pos_j2),
        }));
      }
      else if (topic.endsWith("/placar")) {
        setPlacar({
          j1:       finiteNumber(payload.j1, 0),
          j2:       finiteNumber(payload.j2, 0),
          lastGoal: payload.gol ?? "",
        });
        if (payload.gol) {
          setTimeout(() => setPlacar(p => ({ ...p, lastGoal: "" })), 3000);
        }
      }
      else if (topic.includes("/status/") && payload.device === "esp32") {
        if (!["online", "offline"].includes(payload.status)) return;
        const st = payload.status === "online" ? "Online ⚡" : "Offline 🔴";
        setEspStatus(`${payload.device ?? "ESP32"} ${st}`);
      }
      else if (topic.endsWith("/estado_critico")) {
        // O backend publica este evento com QoS 2 e retained.
        setLastCmd(`Evento critico: ${payload.evento ?? "atualizacao"}`);
        if (typeof payload.phase === "string") setGamePhase(payload.phase);
        setTimeout(() => setLastCmd(""), 2500);
      }
      else if (topic.endsWith("/chat")) {
        setChatMsgs(prev => [...prev, {
          id:     Date.now(),
          player: payload.player ?? "?",
          msg:    payload.msg ?? "",
          time:   new Date().toLocaleTimeString("pt-BR", { hour12: false }),
        }].slice(-50));
      }
      else if (topic.endsWith("/comandos")) {
        if (!VALID_COMMANDS.has(String(payload.comando ?? "").toUpperCase())
            || !VALID_PLAYERS.has(payload.player)) return;
        const label = payload.player === "jogador1" ? "Jogador 1" : "Jogador 2";
        setLastCmd(`${label}: ${payload.comando}`);
        setTimeout(() => setLastCmd(""), 2500);
      }
    });

    return () => { client.end(); };
  }, [brokerUrl, addLog]);

  // Publicar comando (READY, RESET_BALL, etc.)
  const publish = useCallback((topicKey, data, qos = 1) => {
    const client = clientRef.current;
    if (!client?.connected) {
      setUiError("Broker MQTT desconectado.");
      return { ok: false, error: "Broker MQTT desconectado." };
    }
    const topic = TOPICS[topicKey] ?? topicKey;
    if (!Object.values(TOPICS).includes(topic)) {
      setUiError("Tópico não permitido.");
      return { ok: false, error: "Tópico não permitido." };
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      setUiError("Payload inválido.");
      return { ok: false, error: "Payload inválido." };
    }
    if (topic === TOPICS.COMANDOS) {
      const command = String(data.comando ?? "").toUpperCase();
      if (!VALID_COMMANDS.has(command) || !VALID_PLAYERS.has(data.player)) {
        setUiError("Comando ou jogador inválido.");
        return { ok: false, error: "Comando ou jogador inválido." };
      }
      data = {
        comando: command,
        player: data.player,
        command_id: `${Date.now()}-${crypto.randomUUID()}`,
      };
    }
    if (topic === TOPICS.CHAT) {
      const msg = typeof data.msg === "string" ? data.msg.trim() : "";
      if (!VALID_PLAYERS.has(data.player) || !msg || msg.length > 280) {
        setUiError("Mensagem inválida. Use entre 1 e 280 caracteres.");
        return { ok: false, error: "Mensagem inválida." };
      }
      data = { player: data.player, msg };
    }
    client.publish(topic, JSON.stringify(data), { qos });
    addLog(`↑ ${topic}`, data);
  }, [addLog]);

  return {
    connected, gameState, placar, espStatus,
    mqttLogs, chatMsgs, lastCmd, msgCount, gamePhase, uiError, publish,
  };
}
