/**
 * Infraestrutura de testes de integração: cliente WhatsApp falso + envio de mensagens pelo fluxo
 * real (messageReceived → formatWAMessage → handler → commandInvoker → comando → NeDB).
 *
 * Os testes rodam numa pasta temporária (scripts/run-tests.mjs), então o NeDB usado aqui é vazio
 * e descartável. Cada arquivo de teste deve usar ids próprios de grupo/usuário.
 */
import NodeCache from "node-cache";
import { BotController } from "../../src/controllers/bot.controller.js";
import { UserController } from "../../src/controllers/user.controller.js";
import { GroupController } from "../../src/controllers/group.controller.js";
import { messageReceived } from "../../src/events/message-received.event.js";
import "../../src/helpers/command.invoker.helper.js"; // registra as listas de comandos
import "../../src/services/automation.service.js"; // registra o ouvinte de mensagens enviadas (Janitor)
import type { Bot } from "../../src/interfaces/bot.interface.js";

/*
 * Testes nunca acessam a internet: fetch e o adapter padrão do axios falham, a menos que o teste
 * substitua a chamada (ex.: mock.method(axios, "get", ...)).
 */
import axios from "axios";
import fs from "node:fs";
import { encryptedStream } from "baileys";
const offline = async () => { throw new Error("rede bloqueada nos testes"); };
/** Respostas do fetch simulado (url exata ou prefixo → corpo). Usado pela mídia do WhatsApp e por SDKs. */
const fetchRoutes = new Map<string, () => Response>();
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  for (const [route, respond] of fetchRoutes) if (url === route || url.startsWith(route)) return respond();
  return offline();
}) as typeof fetch;
axios.defaults.adapter = offline as never;
// yt-dlp real também acessaria a internet: nos testes o binário "não existe" (os testes que usam
// o yt-dlp substituem ytDlp.run/downloadToBuffer). Chaves opcionais ficam desligadas.
process.env.YTDLP_PATH = "__yt-dlp-desativado-nos-testes__";
delete process.env.GROQ_API_KEY;
delete process.env.HF_TOKEN;
delete process.env.MYMEMORY_EMAIL;

/** Faz o fetch simulado responder `body` (Buffer ou JSON) para a url/prefixo. Devolve a função que desfaz. */
export function serveFetch(route: string, body: Buffer | object, status = 200) {
  fetchRoutes.set(route, () => Buffer.isBuffer(body)
    ? new Response(new Uint8Array(body), { status })
    : new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  return () => fetchRoutes.delete(route);
}

let mediaCounter = 0;
/** Mensagem de mídia do WhatsApp: o conteúdo é criptografado pelo próprio Baileys e servido pelo fetch simulado. */
export async function waMedia(kind: "image" | "video" | "sticker" | "audio" | "document", buffer: Buffer, extra: Record<string, unknown> = {}) {
  const enc = await encryptedStream(buffer, kind);
  const url = `https://mmg.whatsapp.net/teste/${++mediaCounter}.enc`;
  serveFetch(url, fs.readFileSync(enc.encFilePath));
  fs.rmSync(enc.encFilePath, { force: true });
  const mimetype = { image: "image/png", video: "video/mp4", sticker: "image/webp", audio: "audio/mpeg", document: "application/pdf" }[kind];
  return { [`${kind}Message`]: { url, mediaKey: enc.mediaKey, mimetype, fileLength: enc.fileLength, fileSha256: enc.fileSha256, fileEncSha256: enc.fileEncSha256, ...extra } };
}

export const HOST = "5511900000000@s.whatsapp.net";
export const OWNER = "5511911111111@s.whatsapp.net";

export type Call = { method: string, args: unknown[] };

export type FakeClient = {
  client: any;
  calls: Call[];
  /** Mensagens enviadas (sendMessage): chat e conteúdo. */
  sent: { chatId: string, content: Record<string, unknown>, options?: Record<string, unknown> }[];
  /** Textos enviados (text/caption), na ordem. */
  texts: () => string[];
  /** Concatena todos os textos enviados (para asserções com regex). */
  output: () => string;
  reset: () => void;
};

/** Metadados de grupos conhecidos pelo cliente falso (groupMetadata). */
const groupsMeta = new Map<string, any>();

/**
 * Cliente falso: qualquer método do WASocket existe e registra a chamada. Os mais usados devolvem
 * valores plausíveis; `overrides` permite simular respostas e falhas específicas.
 */
export function fakeClient(overrides: Record<string, unknown> = {}): FakeClient {
  const calls: Call[] = [];
  const sent: FakeClient["sent"] = [];
  let counter = 0;
  const defaults: Record<string, (...args: any[]) => unknown> = {
    sendMessage: async (chatId: string, content: Record<string, unknown>, options?: Record<string, unknown>) => {
      sent.push({ chatId, content, options });
      return { key: { id: `SENT-${++counter}`, remoteJid: chatId, fromMe: true }, message: {} };
    },
    groupMetadata: async (id: string) => groupsMeta.get(id) ?? { id, subject: "Grupo", participants: [] },
    groupFetchAllParticipating: async () => Object.fromEntries([...groupsMeta].map(([k, v]) => [k, v])),
    groupInviteCode: async () => "CODIGO123",
    groupRevokeInvite: async () => "CODIGO456",
    groupParticipantsUpdate: async (_g: string, jids: string[]) => jids.map(jid => ({ status: "200", jid })),
    groupAcceptInvite: async () => "120363999999999999@g.us",
    profilePictureUrl: async () => { throw new Error("sem foto") },
    onWhatsApp: async (...numbers: string[]) => numbers.map(n => ({ exists: true, jid: `${n.replace(/\D/g, "")}@s.whatsapp.net` })),
    fetchBlocklist: async () => [],
    fetchStatus: async () => [],
  };
  const client = new Proxy({ user: { id: HOST }, ...overrides }, {
    get(target: any, prop: string | symbol) {
      if (typeof prop === "symbol" || prop === "then") return target[prop];
      if (prop in target && typeof target[prop] !== "function") return target[prop];
      const impl = (target[prop] ?? defaults[prop]) as ((...a: unknown[]) => unknown) | undefined;
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        return impl ? impl(...args) : Promise.resolve(undefined);
      };
    },
  });
  const texts = () => sent.map(s => (s.content.text ?? s.content.caption ?? "") as string).filter(Boolean);
  return { client, calls, sent, texts, output: () => texts().join("\n-----\n"), reset: () => { calls.length = 0; sent.length = 0; } };
}

/**
 * Executa `fn` sem as esperas de "digitação"/espaçamento entre envios (0,5–15 s):
 * durante a execução, timers de até 15 s disparam na hora; timers longos (sessão de carta de 60 s,
 * Janitor, tempo esgotado de jogo) mantêm a duração real e não seguram o processo (unref).
 */
const realSetTimeout = globalThis.setTimeout;
const SHORT_DELAY_MS = 15_000;
function fastSetTimeout(callback: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) {
  const long = (ms ?? 0) > SHORT_DELAY_MS;
  const handle = realSetTimeout(callback, long ? ms : 0, ...args);
  if (long) handle.unref();
  return handle;
}
export async function fastForward<T>(fn: () => Promise<T>): Promise<T> {
  globalThis.setTimeout = fastSetTimeout as typeof setTimeout;
  try {
    return await fn();
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
}

/** Inicializa o bot (bot.json no storage temporário) com HOST como número e OWNER como dono. */
export async function setupBot(): Promise<Bot> {
  const bot = new BotController();
  bot.startBot(HOST);
  const users = new UserController();
  await users.registerUser(OWNER, "Dono");
  await users.registerOwner(OWNER);
  return bot.getBot();
}

export const currentBot = () => new BotController().getBot();

export type Member = { id: string, admin?: boolean };

/** Registra um grupo (NeDB) e o expõe ao cliente falso. O bot (HOST) é admin por padrão. */
export async function setupGroup(id: string, members: Member[], options: { botAdmin?: boolean, subject?: string } = {}) {
  const participants = [{ id: HOST, admin: options.botAdmin === false ? null : "admin" }, ...members.map(m => ({ id: m.id, admin: m.admin ? "admin" : null }))];
  const metadata = { id, subject: options.subject ?? "Grupo Teste", desc: "descrição", owner: members[0]?.id, announce: false, participants };
  groupsMeta.set(id, metadata);
  await new GroupController().registerGroup(metadata as any);
  return new GroupController().getGroup(id);
}

export const getGroup = (id: string) => new GroupController().getGroup(id);

/** Faz o cliente falso "sair" do grupo: ele deixa de aparecer em groupMetadata/groupFetchAllParticipating. */
export const forgetGroup = (id: string) => groupsMeta.delete(id);

type Send = { from: string, chat?: string, text?: string, name?: string, message?: Record<string, unknown>, quoted?: Record<string, unknown>, mentions?: string[] };
let msgCounter = 0;

/** Simula uma mensagem recebida e espera todo o processamento do bot. */
export async function send(fake: FakeClient, input: Send) {
  const chat = input.chat ?? input.from;
  const isGroup = chat.endsWith("@g.us");
  const contextInfo = (input.quoted || input.mentions) ? { ...(input.quoted ?? {}), mentionedJid: input.mentions ?? [] } : undefined;
  const content = input.message ?? (contextInfo ? { extendedTextMessage: { text: input.text ?? "", contextInfo } } : { conversation: input.text ?? "" });
  const raw = {
    key: { remoteJid: chat, id: `MSG-${++msgCounter}`, fromMe: false, ...(isGroup ? { participant: input.from } : {}) },
    messageTimestamp: Math.floor(Date.now() / 1000),
    pushName: input.name ?? "Usuário",
    message: content,
  };
  await fastForward(() => messageReceived(fake.client, { messages: [raw as any], type: "notify" }, currentBot(), new NodeCache()));
}

/** Cria um JID de usuário de teste. */
export const user = (n: number | string) => `55119${String(n).padStart(8, "0")}@s.whatsapp.net`;
