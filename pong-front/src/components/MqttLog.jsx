/**
 * MqttLog.jsx — Painel de log de mensagens MQTT em tempo real
 * Exibe: timestamp, tópico, payload
 * Requisito: "Visualizar mensagens MQTT em tempo real"
 */
export default function MqttLog({ logs }) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
        <span className="text-xs text-gray-400 uppercase tracking-wider font-bold">
          Log MQTT em Tempo Real
        </span>
        <span className="text-xs text-gray-500">{logs.length} msgs</span>
      </div>
      <div className="h-48 overflow-y-auto font-mono text-xs">
        {logs.length === 0 ? (
          <p className="text-gray-600 p-3">Aguardando mensagens...</p>
        ) : (
          logs.map(entry => (
            <div
              key={entry.id}
              className="flex gap-2 px-3 py-1 border-b border-gray-800 hover:bg-gray-800/40"
            >
              <span className="text-gray-500 shrink-0">{entry.time}</span>
              <span className="text-cyan-400 shrink-0 truncate max-w-[220px]">
                {entry.topic}
              </span>
              <span className="text-gray-300 truncate">{entry.payload}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
