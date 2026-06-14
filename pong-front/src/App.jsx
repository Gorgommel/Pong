/**
 * App.jsx — Pong Multiplayer Distribuído via MQTT
 * ================================================
 * Requisitos atendidos:
 *  ✅ Visualiza mensagens MQTT em tempo real (MqttLog)
 *  ✅ Publica comandos MQTT (botão READY, chat)
 *  ✅ Exibe o Pong funcionando (PongCanvas)
 *  ✅ Mostra status dos jogadores (StatusBar)
 *  ✅ Mostra placar (PongCanvas + Scoreboard)
 *  ✅ Mostra logs MQTT (MqttLog)
 *  ✅ Mostra informações do ESP32 (espStatus via LWT)
 *  ✅ Gráficos Chart.js (MetricsChart)
 *  ✅ Chat via tópico MQTT (ChatPanel)
 *  ✅ Wildcard visível na UI
 *  ✅ QoS informado em cada assinatura
 */

import { useMqtt }      from "./hooks/useMqtt";
import PongCanvas       from "./components/PongCanvas";
import StatusBar        from "./components/StatusBar";
import MetricsChart     from "./components/MetricsChart";
import MqttLog          from "./components/MqttLog";
import ChatPanel        from "./components/ChatPanel";

// Trocar para wss:// + host HiveMQ Cloud em produção
const BROKER_URL =
  import.meta.env.VITE_BROKER_URL ??
  "wss://3e87dd33d5184c218a8534b6a63bce96.s1.eu.hivemq.cloud:8884/mqtt";

export default function App() {
  const {
    connected, gameState, placar, espStatus,
    mqttLogs, chatMsgs, lastCmd, msgCount, gamePhase, uiError, publish,
  } = useMqtt(BROKER_URL);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col gap-4 p-4 md:p-6 font-sans">

      {/* ── Cabeçalho ─────────────────────────────────────────── */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-cyan-400">
            PONG <span className="text-white">MQTT</span>
          </h1>
          <p className="text-gray-500 text-xs">Multiplayer Distribuído via HiveMQ</p>
        </div>
        <div className="text-right text-xs text-gray-600 font-mono">
          <p>{new URL(BROKER_URL).hostname}</p>
          <p>wss port 8884</p>
        </div>
      </header>

      {/* ── Status Bar ────────────────────────────────────────── */}
      <StatusBar
        connected={connected}
        espStatus={espStatus}
        lastCmd={lastCmd}
        gamePhase={gamePhase}
        uiError={uiError}
        publish={publish}
      />

      {/* ── Placar ────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-10">
        <div className="text-center">
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Jogador 1</p>
          <p className="text-7xl font-mono font-black text-cyan-400">{placar.j1}</p>
        </div>
        <div className="text-4xl font-mono text-gray-600">·</div>
        <div className="text-center">
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Jogador 2</p>
          <p className="text-7xl font-mono font-black text-pink-400">{placar.j2}</p>
        </div>
      </div>

      {/* ── Canvas do Jogo ────────────────────────────────────── */}
      <div className="flex justify-center">
        <PongCanvas gameState={gameState} placar={placar} gamePhase={gamePhase} />
      </div>

      {/* ── Gráficos Chart.js ─────────────────────────────────── */}
      <MetricsChart
        gameState={gameState}
        msgCount={msgCount}
      />

      {/* ── Log MQTT + Chat ───────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MqttLog logs={mqttLogs} />
        <ChatPanel msgs={chatMsgs} publish={publish} />
      </div>

      {/* ── Tabela de tópicos (para apresentação/README) ─────── */}
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
        <p className="text-xs text-gray-400 uppercase tracking-wider font-bold mb-3">
          Tópicos MQTT Ativos
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-gray-500 pb-2 pr-4">Tópico</th>
                <th className="text-left text-gray-500 pb-2 pr-4">QoS</th>
                <th className="text-left text-gray-500 pb-2 pr-4">Publica</th>
                <th className="text-left text-gray-500 pb-2">Assina</th>
              </tr>
            </thead>
            <tbody className="space-y-1">
              {[
                ["pong/sala1/jogador1/movimento", "0", "ESP32",    "Backend, Front"],
                ["pong/sala1/jogador2/movimento", "0", "ESP32",    "Backend, Front"],
                ["pong/sala1/+/movimento (wildcard)", "0", "ESP32", "Front"],
                ["pong/sala1/estado",             "0", "Backend",  "Front"],
                ["pong/sala1/placar",             "1", "Backend",  "Front"],
                ["pong/sala1/status/+",           "1", "ESP32/Back","Front (retained)"],
                ["pong/sala1/estado_critico",     "2", "Backend",  "Front (retained)"],
                ["pong/sala1/chat",               "1", "Front/Back","Front"],
                ["pong/sala1/comandos",           "1", "Front/ESP32","Backend, ESP32"],
              ].map(([tpc, qos, pub, sub]) => (
                <tr key={tpc} className="border-b border-gray-800">
                  <td className={`py-1 pr-4 ${tpc.includes("+") ? "text-purple-400" : "text-cyan-300"}`}>
                    {tpc}
                  </td>
                  <td className={`py-1 pr-4 font-bold ${
                    qos === "0" ? "text-gray-400" :
                    qos === "1" ? "text-yellow-400" : "text-red-400"
                  }`}>{qos}</td>
                  <td className="py-1 pr-4 text-gray-400">{pub}</td>
                  <td className="py-1 text-gray-400">{sub}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="text-center text-gray-700 text-xs pb-2">
        Pong MQTT · React + FastAPI + ESP32 · HiveMQ Cloud
      </footer>
    </div>
  );
}
