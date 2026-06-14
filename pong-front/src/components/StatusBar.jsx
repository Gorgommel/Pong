import { TOPICS } from "../hooks/useMqtt";

export default function StatusBar({
  connected, espStatus, lastCmd, gamePhase, uiError, publish,
}) {
  const command = (comando) => publish("COMANDOS", { comando, player: "jogador1" });
  const paused = gamePhase === "pausado";

  return (
    <div className="w-full bg-gray-800 border border-gray-700 rounded-lg p-4 flex flex-wrap gap-4 items-center justify-between text-sm shadow-lg">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${connected ? "bg-green-400" : "bg-red-500"}`} />
        <div>
          <p className="text-gray-400 text-xs uppercase">Broker MQTT</p>
          <p className="font-medium">{connected ? "HiveMQ conectado" : "Desconectado"}</p>
        </div>
      </div>

      <div>
        <p className="text-gray-400 text-xs uppercase">Hardware (LWT)</p>
        <p className="font-medium">{espStatus}</p>
      </div>

      <div>
        <p className="text-gray-400 text-xs uppercase">Último evento</p>
        <p className={lastCmd ? "font-medium text-yellow-400" : "font-medium text-gray-500"}>
          {lastCmd || "Aguardando..."}
        </p>
      </div>

      <div>
        <p className="text-gray-400 text-xs uppercase">Partida</p>
        <p className="font-mono text-cyan-400 font-medium">{gamePhase.replace("_", " ")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => command("READY")} disabled={!connected}
          className="bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white font-bold text-xs px-3 py-2 rounded uppercase">
          Iniciar
        </button>
        <button onClick={() => command(paused ? "RESUME" : "PAUSE")} disabled={!connected || !["em_jogo", "pausado"].includes(gamePhase)}
          className="bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 text-white font-bold text-xs px-3 py-2 rounded uppercase">
          {paused ? "Retomar" : "Pausar"}
        </button>
        <button onClick={() => command("RESET_BALL")} disabled={!connected || gamePhase !== "em_jogo"}
          className="bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white font-bold text-xs px-3 py-2 rounded uppercase">
          Reiniciar bola
        </button>
        <button onClick={() => command("EXIT")} disabled={!connected || gamePhase === "encerrado"}
          className="bg-red-800 hover:bg-red-700 disabled:opacity-40 text-white font-bold text-xs px-3 py-2 rounded uppercase">
          Sair
        </button>
      </div>

      <div className="hidden md:block text-right">
        <p className="text-gray-500 text-xs uppercase">Wildcard ativo</p>
        <p className="font-mono text-xs text-purple-400">{TOPICS.MOV_ALL}</p>
      </div>

      {uiError && <p className="w-full text-red-400 text-xs">{uiError}</p>}
    </div>
  );
}
