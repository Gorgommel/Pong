/**
 * StatusBar.jsx — Barra de status superior
 * Exibe: conexão MQTT, status do ESP32, último comando, sala
 */
import { TOPICS } from "../hooks/useMqtt";

export default function StatusBar({ connected, espStatus, lastCmd, publish }) {
  return (
    <div className="w-full bg-gray-800 border border-gray-700 rounded-lg p-4
                    flex flex-wrap gap-4 items-center justify-between text-sm shadow-lg">
      {/* MQTT */}
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${connected ? "bg-green-400 shadow-[0_0_6px_#4ade80]" : "bg-red-500"}`} />
        <div>
          <p className="text-gray-400 text-xs uppercase tracking-wider">Broker MQTT</p>
          <p className="font-medium">{connected ? "HiveMQ Conectado 🟢" : "Desconectado 🔴"}</p>
        </div>
      </div>

      {/* ESP32 */}
      <div>
        <p className="text-gray-400 text-xs uppercase tracking-wider">Hardware (LWT)</p>
        <p className="font-medium">{espStatus}</p>
      </div>

      {/* Último comando */}
      <div>
        <p className="text-gray-400 text-xs uppercase tracking-wider">Último Comando</p>
        <p className={`font-medium ${lastCmd ? "text-yellow-400" : "text-gray-500"}`}>
          {lastCmd || "Aguardando..."}
        </p>
      </div>

      {/* Sala */}
      <div>
        <p className="text-gray-400 text-xs uppercase tracking-wider">Sala Ativa</p>
        <p className="font-mono text-cyan-400 font-medium">sala1</p>
      </div>

      {/* Botão READY */}
      <button
        onClick={() => publish("COMANDOS", { comando: "READY", player: "jogador1" })}
        className="bg-green-700 hover:bg-green-600 text-white font-bold text-xs
                   px-4 py-2 rounded transition-colors uppercase tracking-wider"
      >
        ▶ READY / Reiniciar
      </button>

      {/* Tópico wildcard visível */}
      <div className="hidden md:block text-right">
        <p className="text-gray-500 text-xs uppercase tracking-wider">Wildcard ativo</p>
        <p className="font-mono text-xs text-purple-400">{TOPICS.MOV_ALL}</p>
      </div>
    </div>
  );
}
