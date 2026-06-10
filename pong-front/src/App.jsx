import { useEffect, useState } from "react";
import mqtt from "mqtt";

function App() {
  // Estado das raquetes (começam no meio da tela - 300px)
  const [posJ1, setPosJ1] = useState(300);
  const [posJ2, setPosJ2] = useState(300);

  // Status de conexão e hardware
  const [statusMqtt, setStatusMqtt] = useState("Conectando...");
  const [statusEsp, setStatusEsp] = useState("Desconhecido");
  const [msgBotao, setMsgBotao] = useState("");

  useEffect(() => {
    // ATENÇÃO: Navegadores usam ws:// e porta 8000 para MQTT
    const client = mqtt.connect("ws://broker.hivemq.com:8000/mqtt");

    client.on("connect", () => {
      setStatusMqtt("Conectado ao HiveMQ 🟢");

      // Se inscreve nos mesmos tópicos do ESP32
      client.subscribe("jogo/pong/posicao");
      client.subscribe("jogo/pong/status");
      client.subscribe("jogo/pong/comandos");
    });

    client.on("message", (topic, message) => {
      const payload = JSON.parse(message.toString());

      if (topic === "jogo/pong/posicao") {
        // Atualiza a posição no eixo Y
        if (payload.player === "jogador1") setPosJ1(payload.y);
        if (payload.player === "jogador2") setPosJ2(payload.y);
      } else if (topic === "jogo/pong/status") {
        // Recebe o LWT ou status de online do ESP32
        setStatusEsp(
          payload.status === "online" ? "ESP32 Online ⚡" : "ESP32 Offline 🔴",
        );
      } else if (topic === "jogo/pong/comandos") {
        // Feedback visual do botão
        setMsgBotao(`${payload.player} apertou READY!`);
        setTimeout(() => setMsgBotao(""), 2000); // Apaga a mensagem após 2s
      }
    });

    // Limpa a conexão se o componente for desmontado
    return () => client.end();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-8 font-sans">
      {/* Painel do Professor (Para impressionar na banca) */}
      <div className="w-full max-w-4xl bg-gray-800 p-4 rounded-lg mb-6 flex justify-between shadow-lg border border-gray-700">
        <div>
          <h2 className="text-gray-400 text-sm font-bold uppercase tracking-wider">
            Status Front-end
          </h2>
          <p className="text-lg">{statusMqtt}</p>
        </div>
        <div>
          <h2 className="text-gray-400 text-sm font-bold uppercase tracking-wider">
            Status Hardware (LWT)
          </h2>
          <p className="text-lg">{statusEsp}</p>
        </div>
        <div>
          <h2 className="text-gray-400 text-sm font-bold uppercase tracking-wider">
            Último Comando
          </h2>
          <p className="text-lg text-yellow-400">
            {msgBotao || "Aguardando..."}
          </p>
        </div>
      </div>

      {/* A Tela do Jogo */}
      {/* 800px de largura por 600px de altura, com position relative para as raquetes absolutas */}
      <div className="relative w-[800px] h-[600px] bg-black border-4 border-white rounded shadow-2xl overflow-hidden">
        {/* Linha do meio pontilhada */}
        <div className="absolute top-0 bottom-0 left-1/2 w-2 bg-transparent border-l-4 border-dashed border-white transform -translate-x-1/2"></div>

        {/* Raquete Jogador 1 (Esquerda) */}
        <div
          className="absolute left-4 w-4 h-24 bg-white rounded-sm transition-all duration-75"
          style={{ top: `${posJ1}px` }}
        ></div>

        {/* Raquete Jogador 2 (Direita) */}
        <div
          className="absolute right-4 w-4 h-24 bg-white rounded-sm transition-all duration-75"
          style={{ top: `${posJ2}px` }}
        ></div>
      </div>
    </div>
  );
}

export default App;