#!/usr/bin/env node
/**
 * Gera as animações dos sorteios (MP4 H.264 curtos, sem áudio) em src/media/. Rodado uma vez no
 * desenvolvimento; os arquivos prontos vão no projeto, então o servidor nunca renderiza vídeo a cada
 * sorteio (economiza CPU e memória no Orange Pi). Desenho próprio (sem marcas ou assets de terceiros).
 *
 * Uso: node scripts/render-giveaway-animations.mjs   (precisa do ffmpeg no PATH ou em FFMPEG_PATH)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "media");
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const SIZE = 480, FPS = 24;
const FONT = "DejaVu Sans, Arial, Helvetica, sans-serif";
const COLORS = ["#ff5252", "#ffb300", "#66bb6a", "#29b6f6", "#ab47bc", "#ff7043", "#26a69a", "#5c6bc0"];
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function slicePath(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${cx},${cy} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 0,1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`;
}

/** Roleta: gira rápido e desacelera; o ponteiro dourado fica no topo. */
function rouletteFrame(i, total) {
  const t = Math.min(1, i / (total * 0.8));
  const angle = easeOut(t) * 360 * 5;
  const cx = SIZE / 2, cy = SIZE / 2 + 20, r = 175;
  const slices = COLORS.map((c, k) => `<path d="${slicePath(cx, cy, r, (k * 45 - 90) * Math.PI / 180, ((k + 1) * 45 - 90) * Math.PI / 180)}" fill="${c}" stroke="#1b1b2f" stroke-width="3"/>`).join("");
  const glow = 0.35 + 0.25 * Math.sin(i / 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
    <defs><radialGradient id="bg" cx="50%" cy="45%" r="70%"><stop offset="0%" stop-color="#2d2b55"/><stop offset="100%" stop-color="#0f0e1f"/></radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <text x="50%" y="52" font-family="${FONT}" font-size="34" font-weight="bold" fill="#ffd54f" text-anchor="middle">SORTEANDO...</text>
    <circle cx="${cx}" cy="${cy}" r="${r + 14}" fill="none" stroke="#ffd54f" stroke-width="6" opacity="${glow.toFixed(2)}"/>
    <g transform="rotate(${angle.toFixed(2)} ${cx} ${cy})">${slices}</g>
    <circle cx="${cx}" cy="${cy}" r="34" fill="#1b1b2f" stroke="#ffd54f" stroke-width="5"/>
    <text x="${cx}" y="${cy + 9}" font-family="${FONT}" font-size="26" font-weight="bold" fill="#ffd54f" text-anchor="middle">S</text>
    <polygon points="${cx - 18},${cy - r - 26} ${cx + 18},${cy - r - 26} ${cx},${cy - r + 8}" fill="#ffd54f" stroke="#1b1b2f" stroke-width="3"/>
  </svg>`;
}

/** Vencedor: troféu dourado, brilho e confetes caindo (determinísticos, sem piscar forte). */
const CONFETTI = Array.from({ length: 46 }, (_, k) => ({ x: (k * 97) % SIZE, delay: (k * 13) % 30, speed: 5 + (k % 5), color: COLORS[k % COLORS.length], w: 6 + (k % 3) * 3, rot: (k * 37) % 360 }));
function winnerFrame(i) {
  const pop = Math.min(1, i / 10);
  const scale = (0.6 + 0.4 * easeOut(pop)).toFixed(3);
  const confetti = CONFETTI.map((c) => {
    const y = -20 + Math.max(0, i - c.delay) * c.speed;
    return y > SIZE + 20 ? "" : `<rect x="${c.x}" y="${y}" width="${c.w}" height="${c.w * 1.8}" fill="${c.color}" transform="rotate(${(c.rot + i * 8) % 360} ${c.x} ${y})"/>`;
  }).join("");
  const cx = SIZE / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
    <defs><radialGradient id="bg" cx="50%" cy="45%" r="70%"><stop offset="0%" stop-color="#3a2f00"/><stop offset="100%" stop-color="#120d00"/></radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff176"/><stop offset="100%" stop-color="#f9a825"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    ${confetti}
    <g transform="translate(${cx} 230) scale(${scale}) translate(${-cx} -230)">
      <path d="M${cx - 80},120 h160 v40 a80,80 0 0,1 -160,0 z" fill="url(#gold)" stroke="#5d4037" stroke-width="4"/>
      <path d="M${cx - 80},140 a40,40 0 0,0 0,60" fill="none" stroke="url(#gold)" stroke-width="14"/>
      <path d="M${cx + 80},140 a40,40 0 0,1 0,60" fill="none" stroke="url(#gold)" stroke-width="14"/>
      <rect x="${cx - 14}" y="238" width="28" height="44" fill="url(#gold)" stroke="#5d4037" stroke-width="3"/>
      <rect x="${cx - 60}" y="280" width="120" height="26" rx="6" fill="url(#gold)" stroke="#5d4037" stroke-width="3"/>
    </g>
    <text x="50%" y="385" font-family="${FONT}" font-size="38" font-weight="bold" fill="#ffd54f" text-anchor="middle" opacity="${pop.toFixed(2)}">TEMOS UM</text>
    <text x="50%" y="432" font-family="${FONT}" font-size="44" font-weight="bold" fill="#ffffff" text-anchor="middle" opacity="${pop.toFixed(2)}">VENCEDOR!</text>
  </svg>`;
}

async function render(name, frames, draw) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `sinforoso-${name}-`));
  try {
    for (let i = 0; i < frames; i++) {
      await sharp(Buffer.from(draw(i, frames))).png().toFile(path.join(dir, `f${String(i).padStart(4, "0")}.png`));
    }
    const out = path.join(OUT, `${name}.mp4`);
    execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(dir, "f%04d.png"),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "baseline", "-crf", "30", "-movflags", "+faststart", "-an", out]);
    console.log(`✔ ${path.relative(ROOT, out)} — ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

await render("giveaway-roulette", FPS * 3, rouletteFrame);
await render("giveaway-winner", Math.round(FPS * 2.5), winnerFrame);
