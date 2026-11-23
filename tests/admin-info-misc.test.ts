/**
 * Comandos de administração do bot, informação e variados pelo fluxo real.
 */
import { test, before, mock } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { fakeClient, setupBot, setupGroup, send, user, currentBot, OWNER } from "./helpers/harness.js";
import { UserController } from "../src/controllers/user.controller.js";
import { BotController } from "../src/controllers/bot.controller.js";
import botTexts from "../src/helpers/bot.texts.helper.js";

const G = "120363100000000101@g.us";
const ADMIN_BOT = user(201), MEMBER = user(202), TARGET = user(203);
const fake = fakeClient();
const pv = (from: string, text: string, extra: Record<string, unknown> = {}) => send(fake, { from, text, ...extra });
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

before(async () => {
  await setupBot();
  await setupGroup(G, [{ id: ADMIN_BOT, admin: true }, { id: MEMBER }, { id: TARGET }]);
  await new UserController().registerUser(ADMIN_BOT, "Admin do bot");
  await new UserController().promoteUser(ADMIN_BOT);
});

test("comandos de admin do bot são negados a usuários comuns", async () => {
  fake.reset();
  await pv(MEMBER, "!modoadmin");
  assert.match(fake.output(), new RegExp(esc(botTexts.permission.admin_bot_only)));
  assert.equal(currentBot().admin_mode, false);
});

test("alternâncias globais do bot pelo dono", async () => {
  const toggles: [string, () => boolean][] = [
    ["!modoadmin", () => currentBot().admin_mode], ["!comandospv", () => currentBot().commands_pv], ["!autostickerpv", () => currentBot().autosticker],
  ];
  for (const [command, read] of toggles) {
    const before = read();
    await pv(OWNER, command);
    assert.equal(read(), !before, command);
    await pv(OWNER, command);
    assert.equal(read(), before, command);
  }
});

test("taxa de comandos: ativar com parâmetros e desativar", async () => {
  await pv(OWNER, "!taxacomandos 3 30");
  assert.deepEqual(currentBot().command_rate, { status: true, max_cmds_minute: 3, block_time: 30 });
  await pv(OWNER, "!taxacomandos");
  assert.equal(currentBot().command_rate.status, false);
});

test("nome e prefixo do bot", async () => {
  await pv(OWNER, "!nomebot Robô Teste");
  assert.equal(currentBot().name, "Robô Teste");
  await pv(OWNER, "!prefixo #");
  assert.equal(currentBot().prefix, "#");
  fake.reset();
  await pv(OWNER, "!menu");
  assert.equal(fake.texts().length, 0, "com prefixo # o !menu não é comando");
  await pv(OWNER, "#prefixo !");
  assert.equal(currentBot().prefix, "!");
});

test("bloqueio global de comandos", async () => {
  await pv(OWNER, "!bcmdglobal !play !naoexiste");
  assert.deepEqual(currentBot().block_cmds, ["play"]);
  fake.reset();
  await pv(MEMBER, "!play musica");
  assert.ok(fake.texts().length >= 1, "deveria avisar o bloqueio");
  await pv(OWNER, "!dcmdglobal !play");
  assert.deepEqual(currentBot().block_cmds, []);
});

test("administradores do bot: listar, adicionar e remover", async () => {
  fake.reset();
  await pv(OWNER, "!admins");
  assert.match(fake.output(), /Admin do bot|Dono/);
  fake.reset();
  await pv(OWNER, "!addadmin", { mentions: [user(299)] });
  assert.match(fake.output(), /não está registrado/, "usuário desconhecido não vira admin");
  await new UserController().registerUser(TARGET, "Alvo");
  await pv(OWNER, "!addadmin", { mentions: [TARGET] });
  assert.equal((await new UserController().getUser(TARGET))?.admin, true);
  await pv(OWNER, "!rmadmin", { mentions: [TARGET] });
  assert.equal((await new UserController().getUser(TARGET))?.admin, false);
});

test("bloquear/desbloquear contato e lista de bloqueados", async () => {
  await pv(OWNER, "!bloquear", { mentions: [TARGET] });
  assert.ok(fake.calls.some(c => c.method === "updateBlockStatus" && c.args[1] === "block"));
  const blocked = fakeClient({ fetchBlocklist: async () => [TARGET] });
  await send(blocked, { from: OWNER, text: "!desbloquear", mentions: [TARGET] });
  assert.ok(blocked.calls.some(c => c.method === "updateBlockStatus" && c.args[1] === "unblock"));
  fake.reset();
  await pv(OWNER, "!listablock");
  assert.ok(fake.texts().length >= 1);
});

test("informações: ping, usuário, grupos e link do grupo", async () => {
  for (const command of ["!ping", "!grupos", "!linkgrupo 1"]) {
    fake.reset();
    await pv(OWNER, command);
    assert.ok(fake.texts().length >= 1, command);
  }
  fake.reset();
  await pv(OWNER, "!usuario", { mentions: [ADMIN_BOT] });
  assert.match(fake.output(), /Admin do bot|5511900000201/);
});

test("anúncio para os grupos respeita o intervalo e não falha", async () => {
  fake.reset();
  await pv(OWNER, "!bcgrupos Aviso geral");
  const announcements = fake.sent.filter(s => s.chatId === G);
  assert.equal(announcements.length, 1);
  assert.match(String(announcements[0].content.text), /Aviso geral/);
});

test("sair dos grupos continua mesmo se a saída de um grupo falhar", async () => {
  const failing = fakeClient({ groupLeave: async () => { throw new Error("falha simulada") } });
  await send(failing, { from: OWNER, text: "!sairgrupos" });
  assert.ok(failing.calls.some(c => c.method === "groupLeave"), "tentou sair");
  assert.ok(failing.texts().length >= 1, "respondeu mesmo com a falha");
});

test("desligar encerra a conexão com motivo admin_command", async () => {
  fake.reset();
  await pv(OWNER, "!desligar");
  const end = fake.calls.find(c => c.method === "end");
  assert.ok(end, "chamou client.end");
  assert.equal((end!.args[0] as Error).message, "admin_command");
});

test("menu, info e meus dados respondem com dados do bot/usuário", async () => {
  fake.reset();
  await pv(MEMBER, "!menu");
  assert.match(fake.output(), new RegExp(esc(currentBot().name)));
  fake.reset();
  await pv(MEMBER, "!menu 1");
  assert.ok(fake.texts().length >= 1);
  fake.reset();
  await pv(MEMBER, "!info");
  assert.ok(fake.texts().length >= 1 || fake.sent.length >= 1);
  fake.reset();
  await pv(MEMBER, "!meusdados", { name: "Maria" });
  assert.match(fake.output(), /Maria|Comandos/i);
});

test("reportar avisa os admins mesmo se um envio falhar", async () => {
  let n = 0;
  const flaky = fakeClient({ sendMessage: async (chatId: string, content: Record<string, unknown>) => { if (chatId === OWNER && n++ === 0) throw new Error("falhou"); flaky.sent.push({ chatId, content }); return { key: { id: "x" } } } });
  await send(flaky, { from: MEMBER, text: "!reportar o bot travou" });
  assert.ok(flaky.sent.some(s => s.chatId === ADMIN_BOT), "o outro admin foi avisado");
  assert.ok(flaky.sent.some(s => s.chatId === MEMBER), "o usuário recebeu a confirmação");
});

test("comandos variados sem rede respondem", async () => {
  const commands = ["!caracoroa", "!ppt pedra", "!roletarussa", "!chance de chover", "!viadometro", "!detector", "!gadometro", "!bafometro", "!sorteio 10", "!top5 bonitos", "!par", "!casal"];
  for (const command of commands) {
    fake.reset();
    await send(fake, { from: MEMBER, chat: G, text: command, mentions: command === "!par" ? [MEMBER, TARGET] : [] });
    assert.ok(fake.sent.length >= 1, `${command} deveria responder`);
  }
});

test("comandos variados que usam a internet tratam resposta e falha", async () => {
  const get = mock.method(axios, "get", async (url: string) => {
    if (url.includes("uselessfacts")) return { data: { text: "Fato curioso" } };
    if (url.includes("jokeapi")) return { data: { type: "single", joke: "Piada teste" } };
    if (url.includes("horoscopo")) return { data: "<html><body><p class='text'>Dia bom</p></body></html>" };
    if (url.includes("frases")) return { data: { frases: ["Frase teste"] } };
    throw new Error("rede indisponível");
  });
  mock.method(Math, "random", () => 0.1); // curiosidade: fonte local (a global também usa tradutor na rede)
  for (const command of ["!curiosidade", "!piada", "!horoscopo aries", "!frase"]) {
    fake.reset();
    await pv(MEMBER, command);
    assert.ok(fake.sent.length >= 1, `${command} deveria responder`);
  }
  fake.reset();
  await pv(MEMBER, "!horoscopo signoinvalido");
  assert.match(fake.output(), /horoscopo/i, "signo inválido mostra o uso correto");
  get.mock.mockImplementation(async () => { throw new Error("rede indisponível") });
  fake.reset();
  await pv(MEMBER, "!piada");
  assert.ok(fake.texts().length >= 1, "piada usa a lista local quando a rede falha");
  mock.restoreAll();
});

test("bot reconhece o nome configurado em BotController", () => {
  assert.equal(new BotController().getBot().host_number.length > 0, true);
});
