/**
 * PongCanvas.jsx — Renderização do jogo
 */
import { useRef, useEffect } from "react";

const W = 800, H = 600;
const PADDLE_W = 16, PADDLE_H = 96;
const BALL_SIZE = 14;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export default function PongCanvas({ gameState, placar, gamePhase }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, W, H);

    // Fundo
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    // Linha central pontilhada
    ctx.setLineDash([12, 8]);
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);

    // Placar no canvas
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.font = "bold 72px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText(placar.j1, W / 2 - 100, 90);
    ctx.fillText(placar.j2, W / 2 + 100, 90);

    // Raquetes — clamp garante que nunca sai do canvas
    const y1 = clamp(gameState.pos_j1, 0, H - PADDLE_H);
    const y2 = clamp(gameState.pos_j2, 0, H - PADDLE_H);

    ctx.fillStyle = "#fff";
    ctx.shadowColor = "#6ee7f7";
    ctx.shadowBlur = 10;
    ctx.fillRect(16, y1, PADDLE_W, PADDLE_H);    // J1 esquerda
    ctx.fillRect(W - 16 - PADDLE_W, y2, PADDLE_W, PADDLE_H); // J2 direita
    ctx.shadowBlur = 0;

    // Bolinha
    const bx = clamp(gameState.ball_x, BALL_SIZE / 2, W - BALL_SIZE / 2);
    const by = clamp(gameState.ball_y, BALL_SIZE / 2, H - BALL_SIZE / 2);
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(bx, by, BALL_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Aviso de gol
    if (placar.lastGoal) {
      ctx.fillStyle = "#4ade80";
      ctx.font = "bold 32px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText(`⚽ Gol de ${placar.lastGoal === "jogador1" ? "J1" : "J2"}!`, W / 2, H / 2);
    }
    if (gamePhase === "pausado" || gamePhase === "encerrado") {
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = gamePhase === "pausado" ? "#facc15" : "#f87171";
      ctx.font = "bold 42px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText(gamePhase === "pausado" ? "JOGO PAUSADO" : "PARTIDA ENCERRADA", W / 2, H / 2);
    }
  }, [gameState, placar, gamePhase]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className="border-2 border-cyan-500 rounded shadow-2xl shadow-cyan-900/40"
      style={{ display: "block" }}
    />
    
  );
}
