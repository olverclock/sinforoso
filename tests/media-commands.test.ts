/**
 * Comandos de figurinha e download pelo fluxo real. A mídia "do WhatsApp" é criptografada com o
 * próprio Baileys (encryptedStream) e servida por um fetch falso; o bot baixa, descriptografa e
 * processa com ffmpeg/sharp/webpmux de verdade.
 */
import { test, before, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import axios from "axios";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { Ytdl } from "@distube/ytdl-core";
import { fileTypeFromBuffer } from "file-type";
import { fakeClient, setupBot, setupGroup, send, user, waMedia } from "./helpers/harness.js";
import { Readable } from "node:stream";
import { ytDlp } from "../src/utils/download.util.js";
import { GroupController } from "../src/controllers/group.controller.js";
import { createSticker } from "../src/utils/sticker.util.js";

const ROOT = process.env.SINFOROSO_PROJECT_ROOT ?? process.cwd();
const PNG = fs.readFileSync(path.join(ROOT, "src", "media", "cara.png"));
const G = "120363100000000401@g.us";
const ADMIN = user(601), MEMBER = user(602);
let MP4: Buffer, SHORT_MP4: Buffer;

before(async () => {
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmd-midia-"));
  const out = (n: string) => path.join(dir, n);
  execFileSync(ffmpegInstaller.path, ["-y", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=12", "-f", "lavfi", "-i", "sine=duration=12", "-shortest", "-pix_fmt", "yuv420p", out("long.mp4")], { stdio: "ignore" });
  execFileSync(ffmpegInstaller.path, ["-y", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=2", "-pix_fmt", "yuv420p", out("short.mp4")], { stdio: "ignore" });
  MP4 = fs.readFileSync(out("long.mp4")); SHORT_MP4 = fs.readFileSync(out("short.mp4"));
  fs.rmSync(dir, { recursive: true, force: true });
  await setupBot();
  await setupGroup(G, [{ id: ADMIN, admin: true }, { id: MEMBER }]);
});
afterEach(() => mock.restoreAll());

const stickers = (f: ReturnType<typeof fakeClient>) => f.sent.filter(s => s.content.sticker);
const mime = async (b: unknown) => (await fileTypeFromBuffer(b as Buffer))?.mime;

test("!s em imagem gera figurinha (normal, círculo e contida)", async () => {
  for (const arg of ["", " 1", " 2"]) {
    const f = fakeClient();
    await send(f, { from: MEMBER, chat: G, message: await waMedia("image", PNG, { caption: `!s${arg}` }) });
    assert.equal(stickers(f).length, 1, `!s${arg}`);
    assert.equal(await mime(stickers(f)[0].content.sticker), "image/webp");
  }
});

test("!s respondendo a uma imagem citada", async () => {
  const f = fakeClient();
  const quoted = await waMedia("image", PNG);
  await send(f, { from: MEMBER, chat: G, text: "!s", quoted: { stanzaId: "Q1", participant: ADMIN, quotedMessage: quoted } });
  assert.equal(stickers(f).length, 1);
});

test("!s em vídeo curto gera figurinha animada; vídeo longo é recusado", async () => {
  const f = fakeClient();
  await send(f, { from: MEMBER, chat: G, message: await waMedia("video", SHORT_MP4, { caption: "!s", seconds: 2 }) });
  assert.equal(stickers(f).length, 1);
  f.reset();
  await send(f, { from: MEMBER, chat: G, message: await waMedia("video", MP4, { caption: "!s", seconds: 12 }) });
  assert.equal(stickers(f).length, 0);
  assert.match(f.output(), /segundos|limite|9/i);
});

test("!s sem mídia explica o uso", async () => {
  const f = fakeClient();
  await send(f, { from: MEMBER, chat: G, text: "!s" });
  assert.equal(stickers(f).length, 0);
  assert.ok(f.texts().length >= 1);
});

test("!snome renomeia e !simg converte a figurinha citada", async () => {
  const sticker = await createSticker(PNG, { pack: "A", author: "B" });
  const quoted = { stanzaId: "Q2", participant: ADMIN, quotedMessage: await waMedia("sticker", sticker) };
  const f = fakeClient();
  await send(f, { from: MEMBER, chat: G, text: "!snome Meu Pacote, Eu", quoted });
  assert.equal(stickers(f).length, 1);
  f.reset();
  await send(f, { from: MEMBER, chat: G, text: "!simg", quoted: { ...quoted, quotedMessage: await waMedia("sticker", sticker) } });
  assert.ok(f.sent.some(s => s.content.image), "enviou a imagem");
});

test("!emojimix combina emojis em figurinha", async () => {
  mock.method(axios, "get", async () => ({ data: PNG }));
  const f = fakeClient();
  await send(f, { from: MEMBER, chat: G, text: "!emojimix 😀+😎" });
  assert.equal(stickers(f).length, 1);
});

test("auto-figurinha no grupo transforma imagens sem comando", async () => {
  await new GroupController().setAutoSticker(G, true);
  const f = fakeClient();
  await send(f, { from: MEMBER, chat: G, message: await waMedia("image", PNG) });
  assert.equal(stickers(f).length, 1);
  await new GroupController().setAutoSticker(G, false);
});

/**
 * YouTube simulado: metadados pelo ytdl-core e download pelo download() nativo dele, que devolve um
 * stream (vídeo e áudio separados, juntados pelo ffmpeg real).
 */
function mockYoutube(lengthSeconds: number, media: () => Buffer = () => MP4) {
  mock.method(Ytdl.prototype, "getInfo", async () => ({ videoDetails: { title: "Vídeo Teste", description: "", lengthSeconds, isLive: false, author: { name: "Canal" }, thumbnails: [{ url: "https://i.ytimg.com/x.jpg" }] }, formats: [] }));
  return mock.method(Ytdl.prototype, "download", () => Readable.from([media()]));
}

test("!yt baixa vídeo e áudio pelo ytdl-core, junta com ffmpeg e envia o MP4", async () => {
  const download = mockYoutube(30);
  const f = fakeClient();
  await send(f, { from: MEMBER, text: "!yt https://youtu.be/dQw4w9WgXcQ" });
  const video = f.sent.find(s => s.content.video);
  assert.ok(video, "enviou o vídeo");
  assert.equal(await mime(video!.content.video), "video/mp4");
  assert.equal(download.mock.callCount(), 2, "baixou vídeo e áudio separados");
  assert.match(f.output(), /Vídeo Teste/, "avisou o título antes de baixar");
});

test("!yt usa o yt-dlp como reserva quando o download do ytdl-core falha", async () => {
  mockYoutube(30);
  mock.method(Ytdl.prototype, "download", () => { throw new Error("403") });
  const reserva = mock.method(ytDlp, "downloadToBuffer", async () => MP4);
  const f = fakeClient();
  await send(f, { from: MEMBER, text: "!yt https://youtu.be/dQw4w9WgXcQ" });
  assert.equal(reserva.mock.callCount(), 1);
  assert.ok(f.sent.some(s => s.content.video), "enviou o vídeo da reserva");
});

test("!play extrai e envia o áudio em mp3", async () => {
  mockYoutube(30);
  const f = fakeClient();
  await send(f, { from: MEMBER, text: "!play https://youtu.be/dQw4w9WgXcQ" });
  const audio = f.sent.find(s => s.content.audio);
  assert.ok(audio, "enviou o áudio");
  assert.equal(await mime(audio!.content.audio), "audio/mpeg");
});

test("!play por texto busca o vídeo no YouTube", async () => {
  mockYoutube(30);
  const busca = mock.method(Ytdl.prototype, "search", async () => [{ id: "dQw4w9WgXcQ", title: "Achado" }]);
  const f = fakeClient();
  await send(f, { from: MEMBER, text: "!play nome da musica" });
  assert.equal(busca.mock.calls[0].arguments[0], "nome da musica");
  assert.ok(f.sent.some(s => s.content.audio));
});

test("!ig envia vídeos pelo yt-dlp e explica posts só de foto", async () => {
  mock.method(ytDlp, "run", async () => ({ stdout: Buffer.from(JSON.stringify({ uploader: "NASA", channel: "nasa", description: "Lançamento", like_count: 10, formats: [{}], webpage_url: "https://www.instagram.com/p/X/" })), stderr: "" }));
  mock.method(ytDlp, "downloadToBuffer", async () => MP4);
  const f = fakeClient();
  await send(f, { from: MEMBER, text: "!ig https://www.instagram.com/p/X/" });
  assert.match(f.output(), /NASA/);
  assert.ok(f.sent.some(s => s.content.video), "enviou o vídeo");

  mock.method(ytDlp, "run", async () => { throw new Error("ERROR: [Instagram] X: No video formats found!") });
  f.reset();
  await send(f, { from: MEMBER, text: "!ig https://www.instagram.com/p/Y/" });
  assert.match(f.output(), /apenas fotos/);
});

test("!yt recusa vídeos acima de 6 minutos e sem argumento mostra o uso", async () => {
  mockYoutube(400);
  const f = fakeClient();
  await send(f, { from: MEMBER, text: "!yt https://youtu.be/dQw4w9WgXcQ" });
  assert.equal(f.sent.filter(s => s.content.video).length, 0);
  assert.match(f.output(), /6 minutos|limite|360|duração/i);
  f.reset();
  await send(f, { from: MEMBER, text: "!yt" });
  assert.match(f.output(), /yt/i);
});
