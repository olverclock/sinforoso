#!/usr/bin/env node
/**
 * Baixa o executável OFICIAL do yt-dlp (github.com/yt-dlp/yt-dlp/releases) para bin/, na versão
 * fixada abaixo, e confere o SHA-256 contra o arquivo SHA2-256SUMS publicado no mesmo release.
 * Usado pelo !ig (e como reserva do !yt/!play). Uso: npm run setup:yt-dlp
 *
 * Para atualizar: troque YT_DLP_VERSION por um release estável publicado há pelo menos 14 dias.
 *
 * Linux: usa o "yt-dlp" zipimport, o RECOMENDADO pelo projeto para Linux/BSD (README, seção
 * Installation), que roda no Python do sistema. O executável standalone (PyInstaller) descompacta
 * bibliotecas numa pasta temporária ao iniciar e falhava no container do ARM64 com código 127.
 * Sem Python 3.11+ (ex.: instalação local sem Python), cai no standalone. YT_DLP_BUILD=standalone
 * ou YT_DLP_BUILD=zipimport força a escolha.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const YT_DLP_VERSION = "2026.10.26";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Python 3.11+ disponível? (mínimo exigido pelo yt-dlp) */
function hasPython311() {
  try {
    const out = execFileSync("python3", ["-c", "import sys; print(sys.version_info >= (3, 11))"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.trim() === "True";
  } catch {
    return false;
  }
}

const forced = process.env.YT_DLP_BUILD?.trim().toLowerCase();
const useZipimport = process.platform === "linux" && (forced === "zipimport" || (forced !== "standalone" && hasPython311()));
if (forced === "zipimport" && !hasPython311()) { console.error("YT_DLP_BUILD=zipimport exige Python 3.11+ (python3) instalado."); process.exit(1); }

const ASSETS = { win32: "yt-dlp.exe", linux: useZipimport ? "yt-dlp" : (process.arch === "arm64" ? "yt-dlp_linux_aarch64" : "yt-dlp_linux"), darwin: "yt-dlp_macos" };
const asset = ASSETS[process.platform];
if (!asset) { console.error(`Plataforma não suportada: ${process.platform}`); process.exit(1); }

const base = `https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}`;
const target = path.join(ROOT, "bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

const download = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": "sinforoso-setup" }, redirect: "follow" });
  if (!res.ok) throw new Error(`Falha ao baixar ${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
};

const sums = (await download(`${base}/SHA2-256SUMS`)).toString("utf8");
const expected = sums.split("\n").map(l => l.trim().split(/\s+/)).find(([, name]) => name === asset)?.[0];
if (!expected) throw new Error(`Checksum de ${asset} não encontrado no SHA2-256SUMS`);

const binary = await download(`${base}/${asset}`);
const actual = crypto.createHash("sha256").update(binary).digest("hex");
if (actual !== expected) throw new Error(`SHA-256 não confere para ${asset}: esperado ${expected}, obtido ${actual}`);

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, binary, { mode: 0o755 });
console.log(`✔ yt-dlp ${YT_DLP_VERSION} (${asset}) instalado em ${path.relative(ROOT, target)} — SHA-256 ${actual}`);

// Confere que o yt-dlp realmente executa nesta máquina (falha aqui, no build, e não no WhatsApp)
try {
  const version = execFileSync(target, ["--version"], { encoding: "utf8", timeout: 60_000 }).trim();
  console.log(`✔ yt-dlp executa normalmente (versão ${version})`);
} catch (err) {
  console.error(`✖ O yt-dlp foi baixado mas não executa nesta máquina: ${err.message}`);
  process.exit(1);
}
