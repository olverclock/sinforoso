/**
 * Comandos restantes pelo fluxo real: grupo (marcar todos, apagar, link, foto, adicionar), admin
 * (foto/recado/entrar em grupo/limpar sessão em 3 etapas), utilitários de áudio/imagem (com mídia
 * criptografada e serviços simulados), downloads sem rede, jogos grátis, notícias e leilão.
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
import { fakeClient, setupBot, setupGroup, send, user, waMedia, serveFetch, OWNER, HOST } from "./helpers/harness.js";
import { CardGameService } from "../src/services/cardgame.service.js";
import { db as sessionDb } from "../src/helpers/session.auth.helper.js";
import { hfSpaces } from "../src/utils/hf-spaces.util.js";

const ROOT = process.env.SINFOROSO_PROJECT_ROOT ?? process.cwd();
const PNG = fs.readFileSync(path.join(ROOT, "src", "media", "cara.png"));
const G = "120363100000000601@g.us";
const ADMIN = user(801), MEMBER = user(802), OTHER = user(803);
let MP3: Buffer, MP4: Buffer;

before(async () => {
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mais-"));
  execFileSync(ffmpegInstaller.path, ["-y", "-f", "lavfi", "-i", "sine=frequency=500:duration=2", path.join(dir, "a.mp3")], { stdio: "ignore" });
  execFileSync(ffmpegInstaller.path, ["-y", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=2", "-f", "lavfi", "-i", "sine=duration=2", "-shortest", "-pix_fmt", "yuv420p", path.join(dir, "v.mp4")], { stdio: "ignore" });
  MP3 = fs.readFileSync(path.join(dir, "a.mp3")); MP4 = fs.readFileSync(path.join(dir, "v.mp4"));
  fs.rmSync(dir, { recursive: true, force: true });
  await setupBot();
  await setupGroup(G, [{ id: ADMIN, admin: true }, { id: MEMBER }, { id: OTHER }]);
});
afterEach(() => mock.restoreAll());

/** Intercepta só as URLs com o prefixo dado; o resto (ex.: mídia do WhatsApp) segue para o fetch do harness. */
function interceptFetch(prefix: string, handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const passthrough = globalThis.fetch;
  return mock.method(globalThis, "fetch", (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return url.startsWith(prefix) ? handler(url, init) : passthrough(input, init);
  });
}

const quote = async (kind: "image" | "video" | "audio" | "sticker", buffer: Buffer, extra: Record<string, unknown> = {}) =>
  ({ stanzaId: "Q", participant: OTHER, quotedMessage: await waMedia(kind, buffer, extra) });

test("grupo: marcar todos/membros, apagar citada, redefinir link e foto do grupo", async () => {
  const f = fakeClient();
  await send(f, { from: ADMIN, chat: G, text: "!mt Atenção" });
  const mt = f.sent.find(s => s.chatId === G && Array.isArray(s.content.mentions));
  assert.ok(mt && (mt.content.mentions as string[]).includes(MEMBER) && (mt.content.mentions as string[]).includes(ADMIN), "marca todos");
  f.reset();
  await send(f, { from: ADMIN, chat: G, text: "!mm" });
  const mm = f.sent.find(s => Array.isArray(s.content.mentions));
  assert.ok(mm && !(mm.content.mentions as string[]).includes(ADMIN), "só membros");

  f.reset();
  await send(f, { from: ADMIN, chat: G, text: "!apg", quoted: { stanzaId: "Q9", participant: MEMBER, quotedMessage: { conversation: "apagar" } } });
  assert.ok(f.sent.some(s => (s.content as { delete?: { id?: string } }).delete?.id === "Q9"), "apagou a mensagem citada");

  f.reset();
  await send(f, { from: ADMIN, chat: G, text: "!rlink" });
  assert.ok(f.calls.some(c => c.method === "groupRevokeInvite"));

  f.reset();
  await send(f, { from: ADMIN, chat: G, message: await waMedia("image", PNG, { caption: "!fotogrupo" }) });
  assert.ok(f.calls.some(c => c.method === "updateProfilePicture" && c.args[0] === G), "atualizou a foto do grupo");
});

test("grupo: adicionar por número", async () => {
  const f = fakeClient();
  await send(f, { from: ADMIN, chat: G, text: "!add +55 11 98888-7777" });
  assert.ok(f.calls.some(c => c.method === "groupParticipantsUpdate" && c.args[2] === "add"), "tentou adicionar");
});

test("admin: foto do bot, recado e entrar em grupo por link", async () => {
  const f = fakeClient();
  await send(f, { from: OWNER, message: await waMedia("image", PNG, { caption: "!fotobot" }) });
  assert.ok(f.calls.some(c => c.method === "updateProfilePicture" && c.args[0] === HOST));
  f.reset();
  await send(f, { from: OWNER, text: "!recado Em manutenção" });
  assert.ok(f.calls.some(c => c.method === "updateProfileStatus" && c.args[0] === "Em manutenção"));
  f.reset();
  await send(f, { from: OWNER, text: "!entrargrupo https://chat.whatsapp.com/ABCdef123456" });
  assert.ok(f.calls.some(c => c.method === "groupAcceptInvite" && c.args[0] === "ABCdef123456"));
});

test("admin: limpar sessão exige 3 confirmações e só então apaga as credenciais", async () => {
  await sessionDb.insertAsync({ key: "creds", data: "{}" });
  const f = fakeClient();
  await send(f, { from: OWNER, text: "!limparsessao" });
  assert.match(f.output(), /1\/3/);
  assert.ok(await sessionDb.findOneAsync({ key: "creds" }), "ainda não apagou");
  await send(f, { from: OWNER, text: "!limparsessao" });
  assert.match(f.output(), /2\/3/);
  assert.ok(await sessionDb.findOneAsync({ key: "creds" }), "ainda não apagou");
  await send(f, { from: OWNER, text: "!limparsessao" });
  assert.match(f.output(), /3\/3/);
  // A limpeza roda num timer de 2 s depois do aviso ("O bot será encerrado em 2 segundos").
  const deadline = Date.now() + 5000;
  while (await sessionDb.findOneAsync({ key: "creds" }) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  assert.equal(await sessionDb.findOneAsync({ key: "creds" }), null, "credenciais apagadas");
  assert.ok(f.calls.some(c => c.method === "end"), "e o bot é desligado");
});

test("áudio: extrair de vídeo, aplicar efeito e efeito inválido", async () => {
  const f = fakeClient();
  await send(f, { from: MEMBER, text: "!audio", quoted: await quote("video", MP4, { seconds: 2 }) });
  assert.ok(f.sent.some(s => s.content.audio), "extraiu o áudio do vídeo");
  f.reset();
  await send(f, { from: MEMBER, text: "!efeitoaudio grave", quoted: await quote("audio", MP3, { seconds: 2 }) });
  assert.ok(f.sent.some(s => s.content.audio), "aplicou o efeito");
  f.reset();
  await send(f, { from: MEMBER, text: "!efeitoaudio robô", quoted: await quote("audio", MP3, { seconds: 2 }) });
  assert.ok(!f.sent.some(s => s.content.audio) && f.texts().length >= 1, "efeito desconhecido mostra o uso");
});

test("ouvir: Groq quando há chave; sem chave ou com falha, usa os Spaces do Hugging Face", async () => {
  const f = fakeClient();
  process.env.GROQ_API_KEY = "gsk_teste";
  const seen: { auth?: string, model?: unknown, language?: unknown }[] = [];
  interceptFetch("https://api.groq.com/", async (url, init) => {
    assert.equal(url, "https://api.groq.com/openai/v1/audio/transcriptions");
    const body = init?.body as FormData;
    seen.push({ auth: (init?.headers as Record<string, string>)?.Authorization, model: body.get("model"), language: body.get("language") });
    return new Response(JSON.stringify({ text: " olá mundo pela Groq " }), { status: 200 });
  });
  await send(f, { from: MEMBER, text: "!ouvir", quoted: await quote("audio", MP3, { seconds: 2 }) });
  assert.match(f.output(), /olá mundo pela Groq/);
  assert.deepEqual(seen[0], { auth: "Bearer gsk_teste", model: "whisper-large-v3-turbo", language: "pt" });

  mock.restoreAll();
  interceptFetch("https://api.groq.com/", async () => new Response("limite", { status: 429 }));
  const spaces = mock.method(hfSpaces, "transcribe", async () => "texto pelos Spaces");
  f.reset();
  await send(f, { from: MEMBER, text: "!ouvir", quoted: await quote("audio", MP3, { seconds: 2 }) });
  assert.match(f.output(), /texto pelos Spaces/, "Groq falhou: usou a reserva");
  assert.equal(spaces.mock.callCount(), 1);
  delete process.env.GROQ_API_KEY;
});

test("qualmusica pelo Shazam e rbg pelos Spaces (remoção de fundo)", async () => {
  interceptFetch("https://amp.shazam.com/", async () => new Response(JSON.stringify({ matches: [{}], track: { title: "Canção", subtitle: "Banda", sections: [] } }), { status: 200 }));
  const f = fakeClient();
  await send(f, { from: MEMBER, text: "!qualmusica", quoted: await quote("audio", MP3, { seconds: 2 }) });
  assert.match(f.output(), /Canção/);
  mock.restoreAll();

  const rbg = mock.method(hfSpaces, "removeBackground", async () => PNG);
  f.reset();
  await send(f, { from: MEMBER, message: await waMedia("image", PNG, { caption: "!rbg" }) });
  assert.equal(rbg.mock.callCount(), 1);
  assert.ok(f.sent.some(s => s.content.image), "enviou a imagem sem fundo");

  rbg.mock.mockImplementation(async () => { throw new Error("You have exceeded your ZeroGPU runs limit") });
  f.reset();
  await send(f, { from: MEMBER, message: await waMedia("image", PNG, { caption: "!rbg" }) });
  assert.match(f.output(), /limite gratuito/, "cota esgotada vira mensagem clara");
});

test("qualanime com imagem citada e trace.moe simulado", async () => {
  mock.method(axios, "post", async () => ({ data: { result: [{ from: 1, to: 2, episode: 7, similarity: 0.95, video: "https://v.test/x.mp4", anilist: { title: { english: "Anime X", romaji: "X" } } }] } }));
  mock.method(axios, "get", async () => ({ data: MP4 }));
  const f = fakeClient();
  await send(f, { from: MEMBER, text: "!qualanime", quoted: await quote("image", PNG) });
  assert.match(f.output(), /Anime X/);
});

test("mangas com dados simulados; !steamverde foi removido", async () => {
  mock.method(axios, "get", async (url: string) => {
    if (url.includes("mangadex")) return { data: { result: "ok", data: [{ id: "c", attributes: { chapter: "5" }, relationships: [{ type: "manga", attributes: { title: { en: "Mangá Z" } } }] }] } };
    return { data: { name: "Biblioteca", downloads: [{ title: "Portal 2", uploadDate: "2026-01-01", fileSize: "8 GB", uris: ["magnet:?xt=1"] }] } };
  });
  const f = fakeClient();
  await send(f, { from: MEMBER, text: "!steamverde portal 2" });
  assert.doesNotMatch(f.output(), /Portal 2|magnet/, "comando removido não responde com links");
  f.reset();
  await send(f, { from: MEMBER, text: "!mangas" });
  assert.match(f.output(), /Mangá Z/);
});

test("downloads sem rede respondem com erro amigável; sem link mostram o uso", async () => {
  const f = fakeClient();
  for (const command of ["!tk https://www.tiktok.com/@a/video/1", "!ig https://www.instagram.com/p/x/", "!fb https://www.facebook.com/watch?v=1", "!x https://x.com/a/status/1", "!img gatos"]) {
    f.reset();
    await send(f, { from: MEMBER, text: command });
    assert.ok(f.texts().length >= 1, `${command} responde`);
  }
  for (const command of ["!tk", "!ig", "!fb", "!x", "!img"]) {
    f.reset();
    await send(f, { from: MEMBER, text: command });
    assert.match(f.output(), new RegExp(command.slice(1), "i"), `${command} sem argumento mostra o uso`);
  }
});

test("jogos grátis (!free) e assinatura de alertas", async () => {
  mock.method(axios, "get", async () => ({ data: [{ id: 1, title: "Jogo Grátis", worth: "$19.99", platforms: "PC, Epic Games Store", end_date: "2026-12-01", open_giveaway_url: "https://g.test/1", type: "Game", status: "Active", description: "Pegue já" }] }));
  const f = fakeClient();
  await send(f, { from: MEMBER, text: "!free" });
  assert.ok(f.texts().length >= 1);
  for (const arg of ["on", "off", "simples", "completo"]) {
    f.reset();
    await send(f, { from: MEMBER, text: `!free ${arg}` });
    assert.ok(f.texts().length >= 1, `!free ${arg}`);
  }
});

test("notícias (RSS simulado)", async () => {
  mock.method(axios, "get", async () => ({ data: `<rss><channel><item><title>Manchete 1</title><link>https://n.test/1</link><pubDate>Mon, 17 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>` }));
  const f = fakeClient();
  await send(f, { from: MEMBER, chat: G, text: "!noticias" });
  assert.ok(f.texts().length >= 1);
});

test("leilão de carta: abrir, dar lance e lance inválido", async () => {
  mock.method(Math, "random", () => 0.7);
  mock.method(axios, "post", async () => ({ data: { data: { Page: { characters: [{ id: 9101, name: { full: "Carta Leilão", native: "" }, image: { large: "https://img.test/a.png" }, media: { nodes: [] }, favourites: 1 }] } } } }));
  mock.method(axios, "get", async () => ({ data: PNG }));
  const f = fakeClient();
  await send(f, { from: ADMIN, chat: G, text: "!roll" });
  const code = String(f.sent.find(s => s.content.image)!.content.caption).match(/\b(\d{3})\b/)![1];
  await send(f, { from: MEMBER, chat: G, text: code });
  assert.equal((await CardGameService.getInstance().getUserCollection(MEMBER)).length, 1);
  f.reset();
  await send(f, { from: MEMBER, chat: G, text: "!carta" });
  const serial = f.output().match(/#(\d+)/)![1];
  f.reset();
  await send(f, { from: MEMBER, chat: G, text: `!leilao #${serial} 10` });
  assert.match(f.output(), /LEIL/i);
  f.reset();
  await send(f, { from: OTHER, chat: G, text: "!lance abc" });
  assert.ok(f.texts().length >= 1, "lance inválido responde");
  f.reset();
  await send(f, { from: OTHER, chat: G, text: "!lance 5" });
  assert.ok(f.texts().length >= 1, "lance abaixo do mínimo responde");
});
