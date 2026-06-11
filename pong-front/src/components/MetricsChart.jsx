/**
 * MetricsChart.jsx — Gráficos com Chart.js
 * ==========================================
 * Exibe:
 *  1. Posição das raquetes ao longo do tempo (Line Chart)
 *  2. Contagem de mensagens MQTT recebidas (Bar Chart)
 */
import { useEffect, useRef } from "react";
import {
  Chart,
  LineController, LineElement, PointElement,
  LinearScale, CategoryScale,
  BarController, BarElement,
  Tooltip, Legend, Filler,
} from "chart.js";

Chart.register(
  LineController, LineElement, PointElement,
  LinearScale, CategoryScale,
  BarController, BarElement,
  Tooltip, Legend, Filler,
);

const MAX_POINTS = 40;

function makeTimeLabels(n) {
  return Array.from({ length: n }, (_, i) => `${-(n - 1 - i) * 50}ms`);
}

export default function MetricsChart({ gameState, msgCount, mqttLogs }) {
  const posChartRef    = useRef(null);
  const posChartInst   = useRef(null);
  const msgChartRef    = useRef(null);
  const msgChartInst   = useRef(null);

  // Histórico de posições (mantém janela deslizante)
  const histJ1 = useRef([]);
  const histJ2 = useRef([]);
  const histMsg = useRef([]);

  // CORREÇÃO 1: Adicionado o "if (!posChartInst.current)" antes de manipular os dados
  useEffect(() => {
    // Só atualiza os arrays de histórico se o gameState for válido
    if (gameState) {
      histJ1.current.push(gameState.pos_j1);
      histJ2.current.push(gameState.pos_j2);
      if (histJ1.current.length > MAX_POINTS) histJ1.current.shift();
      if (histJ2.current.length > MAX_POINTS) histJ2.current.shift();
    }

    // TRAVA DE SEGURANÇA: Se o gráfico ainda não foi criado no DOM, sai da função
    if (!posChartInst.current) return;

    const chart = posChartInst.current;
    chart.data.labels           = makeTimeLabels(histJ1.current.length);
    chart.data.datasets[0].data = [...histJ1.current];
    chart.data.datasets[1].data = [...histJ2.current];
    chart.update("none");
  }, [gameState?.pos_j1, gameState?.pos_j2]); // Optional chaining prevenindo quebras extras

  // CORREÇÃO 2: Trava de segurança no histórico de mensagens por segundo
  useEffect(() => {
    const now = Date.now();
    histMsg.current.push({ t: now, v: msgCount });
    if (histMsg.current.length > MAX_POINTS) histMsg.current.shift();

    // TRAVA DE SEGURANÇA: Se o gráfico de barras não existir no DOM ainda, sai da função
    if (!msgChartInst.current) return;

    const chart = msgChartInst.current;
    chart.data.labels           = histMsg.current.map((_, i) => `${i}`);
    chart.data.datasets[0].data = histMsg.current.map(x => x.v);
    chart.update("none");
  }, [msgCount]);

  // Inicializa gráfico de posições
  useEffect(() => {
    if (!posChartRef.current) return;
    if (posChartInst.current) {
      posChartInst.current.destroy();
    }
    
    posChartInst.current = new Chart(posChartRef.current, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Raquete J1 (px)",
            data: [],
            borderColor: "#22d3ee",
            backgroundColor: "rgba(34,211,238,0.08)",
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2,
          },
          {
            label: "Raquete J2 (px)",
            data: [],
            borderColor: "#f472b6",
            backgroundColor: "rgba(244,114,182,0.08)",
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2,
          },
        ],
      },
      options: {
        animation:  false,
        responsive: true,
        scales: {
          y: {
            min: 0, max: 504,
            grid:  { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "#94a3b8", font: { size: 10 } },
          },
          x: {
            grid:  { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "#94a3b8", font: { size: 9 }, maxRotation: 0 },
          },
        },
        plugins: {
          legend: { labels: { color: "#94a3b8", font: { size: 11 } } },
          tooltip: { mode: "index", intersect: false },
        },
      },
    });

    // CORREÇÃO 3: Função de limpeza explícita ao desmontar o componente
    return () => {
      if (posChartInst.current) {
        posChartInst.current.destroy();
        posChartInst.current = null;
      }
    };
  }, []);

  // Inicializa gráfico de mensagens
  useEffect(() => {
    if (!msgChartRef.current) return;
    if (msgChartInst.current) {
      msgChartInst.current.destroy();
    }

    msgChartInst.current = new Chart(msgChartRef.current, {
      type: "bar",
      data: {
        labels: [],
        datasets: [{
          label: "Msgs MQTT recebidas",
          data: [],
          backgroundColor: "rgba(74,222,128,0.5)",
          borderColor: "#4ade80",
          borderWidth: 1,
        }],
      },
      options: {
        animation:  false,
        responsive: true,
        scales: {
          y: {
            grid:  { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "#94a3b8", font: { size: 10 } },
          },
          x: {
            display: false,
          },
        },
        plugins: {
          legend: { labels: { color: "#94a3b8", font: { size: 11 } } },
        },
      },
    });

    // CORREÇÃO 4: Função de limpeza explícita ao desmontar o componente
    return () => {
      if (msgChartInst.current) {
        msgChartInst.current.destroy();
        msgChartInst.current = null;
      }
    };
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">
          Posição das Raquetes (tempo real)
        </p>
        <canvas ref={posChartRef} />
      </div>
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">
          Mensagens MQTT Recebidas
        </p>
        <canvas ref={msgChartRef} />
        <p className="text-center text-2xl font-mono font-bold text-green-400 mt-2">
          {msgCount ? msgCount.toLocaleString() : 0}
        </p>
      </div>
    </div>
  );
}
