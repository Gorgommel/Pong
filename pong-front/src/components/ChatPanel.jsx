/**
 * ChatPanel.jsx — Chat em tempo real via tópico  pong/sala1/chat
 * Requisito: pong/sala1/chat
 */
import { useState } from "react";
import { TOPICS } from "../hooks/useMqtt";

export default function ChatPanel({ msgs, publish }) {
  const [input, setInput]   = useState("");
  const [player, setPlayer] = useState("jogador1");

  const send = () => {
    const msg = input.trim();
    if (!msg) return;
    publish("CHAT", { player, msg });
    setInput("");
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden flex flex-col h-64">
      <div className="px-4 py-2 border-b border-gray-700">
        <span className="text-xs text-gray-400 uppercase tracking-wider font-bold">
          Chat · {TOPICS.CHAT}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-1 text-sm">
        {msgs.length === 0 ? (
          <p className="text-gray-600 text-xs">Sem mensagens ainda...</p>
        ) : (
          msgs.map(m => (
            <div key={m.id} className="flex gap-2">
              <span className="text-gray-500 text-xs shrink-0">{m.time}</span>
              <span className={`font-bold shrink-0 ${m.player === "jogador1" ? "text-cyan-400" : "text-pink-400"}`}>
                {m.player === "jogador1" ? "J1" : "J2"}:
              </span>
              <span className="text-gray-200">{m.msg}</span>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-gray-700 p-2 flex gap-2">
        <select
          value={player}
          onChange={e => setPlayer(e.target.value)}
          className="bg-gray-800 text-xs text-gray-300 border border-gray-600 rounded px-2 py-1"
        >
          <option value="jogador1">J1</option>
          <option value="jogador2">J2</option>
        </select>
        <input
          className="flex-1 bg-gray-800 text-sm text-white border border-gray-600 rounded px-3 py-1
                     placeholder-gray-500 focus:outline-none focus:border-cyan-500"
          placeholder="Mensagem..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
        />
        <button
          onClick={send}
          className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold px-3 py-1 rounded
                     transition-colors"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
