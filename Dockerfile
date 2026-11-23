# syntax=docker/dockerfile:1
# Sinforoso WhatsApp: imagem multi-arquitetura (arm64 do Orange Pi 5, amd64 etc.)
# Base: Debian 13 "trixie" (estável atual), com glibc. O sharp e o yt-dlp para ARM64 precisam do
# glibc, então Alpine não serve. Node 24 = mesma versão em que o projeto é desenvolvido e testado
# (LTS em manutenção até abril de 2028).

# ---------- 1) Compilação do TypeScript ----------
FROM node:24-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: mesmo comportamento do npm 12 no desenvolvimento (nenhum script de instalação roda).
# O cache do npm fica num cache do BuildKit, fora da imagem.
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- 2) Imagem final ----------
FROM node:24-trixie-slim
ENV NODE_ENV=production \
    TZ=America/Sao_Paulo \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    XDG_CACHE_HOME=/tmp/.cache \
    OMP_THREAD_LIMIT=2

# ffmpeg atual do Debian (no lugar do binário 4.1 do npm), certificados e fuso horário.
# Motor de documentos (tudo local): qpdf, Ghostscript, Poppler, Tesseract (português + inglês) e
# LibreOffice sem interface (Writer e Calc). Reconstrua a imagem com frequência para receber as
# correções de segurança do Debian (ver docs/DOCUMENTOS.md).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates tzdata python3 \
      qpdf ghostscript poppler-utils \
      tesseract-ocr tesseract-ocr-por tesseract-ocr-eng \
      libreoffice-writer-nogui libreoffice-calc-nogui fonts-dejavu-core fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts --no-audit --no-fund

# yt-dlp oficial, com o SHA-256 conferido. No Linux, a versão "zipimport" (recomendada pelo projeto
# para Linux), que roda no python3 do Debian: o standalone (PyInstaller) não iniciava no ARM64
# (código 127). O instalador também testa se o yt-dlp executa e falha o build se não executar.
COPY scripts/install-yt-dlp.mjs ./scripts/
RUN YT_DLP_BUILD=zipimport node scripts/install-yt-dlp.mjs

COPY --from=build /app/dist ./dist
COPY LICENSE ./

# Sessão do WhatsApp e bancos de dados ficam aqui; backups automáticos em /app/backups (monte como volumes)
VOLUME ["/app/storage", "/app/backups"]

# Acerta o dono da pasta montada e roda o bot como o usuário "node" (sem root). O setpriv (util-linux)
# não muda variáveis de ambiente, então HOME é ajustado para a pasta do usuário node.
ENTRYPOINT ["/bin/sh", "-c", "mkdir -p /app/storage /app/backups && chown -R node:node /app/storage /app/backups && exec setpriv --reuid=node --regid=node --init-groups env HOME=/home/node node dist/app.js"]
