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
  PLACAR:   `pong/${SALA}/placar`,
  STATUS:   `pong/${SALA}/status`,
  CHAT:     `pong/${SALA}/chat`,
  COMANDOS: `pong/${SALA}/comandos`,
  // Wildcard: captura movimentos de qualquer sala/jogador
  MOV_ALL:  `pong/+/+/movimento`,
};

const MAX_LOGS = 100;

export function useMqtt(brokerUrl = "ws://broker.hivemq.com:8000/mqtt") {
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
    });
    clientRef.current = client;

    client.on("connect", () => {
      setConnected(true);

      // ── Assinatura com wildcard (QoS 0) ────────────────────
      // Captura movimentos de QUALQUER sala e jogador
      // Demonstra o uso de wildcard + exigido pela disciplina
      client.subscribe(TOPICS.MOV_ALL,   { qos: 0 });

      // ── Demais tópicos ──────────────────────────────────────
      client.subscribe(TOPICS.ESTADO,   { qos: 0 });   // posição bolinha, alta freq
      client.subscribe(TOPICS.PLACAR,   { qos: 1 });   // placar: garante entrega
      client.subscribe(TOPICS.STATUS,   { qos: 1 });   // LWT/online: garante entrega
      client.subscribe(TOPICS.CHAT,     { qos: 1 });   // chat: garante entrega
      client.subscribe(TOPICS.COMANDOS, { qos: 1 });   // comandos: garante entrega
    });

    client.on("error",      () => setConnected(false));
    client.on("close",      () => setConnected(false));
    client.on("disconnect", () => setConnected(false));

    client.on("message", (topic, message) => {
      let payload;
      try { payload = JSON.parse(message.toString()); }
      catch { return; }

      addLog(topic, payload);

      // ── Roteamento por tópico ────────────────────────────
      // Usa endsWith para tratar wildcard corretamente
      if (topic.endsWith("/movimento")) {
        const parts = topic.split("/");
        const jogador = parts[2];
        const y = Math.max(0, Math.min(504, Number(payload.y)));
        setGameState(s => ({
          ...s,
          pos_j1: jogador === "jogador1" ? y : s.pos_j1,
          pos_j2: jogador === "jogador2" ? y : s.pos_j2,
        }));
      }
      else if (topic.endsWith("/estado")) {
        setGameState(s => ({
          ...s,
          ball_x: Number(payload.bx ?? s.ball_x),
          ball_y: Number(payload.by ?? s.ball_y),
          vel_x:  Number(payload.vx ?? s.vel_x),
          vel_y:  Number(payload.vy ?? s.vel_y),
          pos_j1: payload.j1 !== undefined ? Number(payload.j1) : s.pos_j1,
          pos_j2: payload.j2 !== undefined ? Number(payload.j2) : s.pos_j2,
        }));
      }
      else if (topic.endsWith("/placar")) {
        setPlacar({
          j1:       Number(payload.j1 ?? 0),
          j2:       Number(payload.j2 ?? 0),
          lastGoal: payload.gol ?? "",
        });
        if (payload.gol) {
          setTimeout(() => setPlacar(p => ({ ...p, lastGoal: "" })), 3000);
        }
      }
      else if (topic.endsWith("/status")) {
        const st = payload.status === "online" ? "Online ⚡" : "Offline 🔴";
        setEspStatus(`${payload.device ?? "ESP32"} ${st}`);
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
    if (!client?.connected) return;
    const topic = TOPICS[topicKey] ?? topicKey;
    client.publish(topic, JSON.stringify(data), { qos });
    addLog(`↑ ${topic}`, data);
  }, [addLog]);

  return {
    connected, gameState, placar, espStatus,
    mqttLogs, chatMsgs, lastCmd, msgCount, publish,
  };
}
