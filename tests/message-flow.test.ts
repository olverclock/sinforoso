/**
 * Fluxo das mensagens: filtros do grupo (anti-link, palavras, mudo, anti-flood, respostas
 * automáticas), regras do privado (PV, modo admin, taxa de comandos) e eventos de entrada/saída
 * de membros (boas-vindas, lista negra, anti-fake) e de grupos.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { fakeClient, fastForward, setupBot, setupGroup, getGroup, forgetGroup, send, user, HOST, OWNER } from "./helpers/harness.js";
import { GroupController } from "../src/controllers/group.controller.js";
import { BotController } from "../src/controllers/bot.controller.js";
import { UserController } from "../src/controllers/user.controller.js";
import { groupParticipantsUpdated } from "../src/events/group-participants-updated.event.js";
import { addedOnGroup } from "../src/events/group-added.event.js";
import { partialGroupUpdate } from "../src/events/group-partial-update.event.js";
import { syncGroupsOnStart } from "../src/helpers/groups.sync.helper.js";

const G = "120363100000000201@g.us";
const ADMIN = user(301), MEMBER = user(302), SPAMMER = user(303);
const groups = new GroupController();
const deleted = (f: ReturnType<typeof fakeClient>) => f.sent.filter(s => (s.content as { delete?: unknown }).delete);

before(async () => {
  await setupBot();
  await setupGroup(G, [{ id: ADMIN, admin: true }, { id: MEMBER }, { id: SPAMMER }]);
});

test("anti-link apaga a mensagem com link de membro e respeita exceções e admins", async () => {
  await groups.setAntiLink(G, true);
  await groups.setLinkException(G, "youtube.com", "add");
  const f = fakeClient();
  await send(f, { from: MEMBER, chat: G, text: "entrem aqui https://golpe.example.com/x" });
  assert.equal(deleted(f).length, 1, "link proibido é apagado");
  f.reset();
  await send(f, { from: MEMBER, chat: G, text: "vídeo https://youtube.com/watch?v=1" });
  assert.equal(deleted(f).length, 0, "exceção não é apagada");
  f.reset();
  await send(f, { from: ADMIN, chat: G, text: "admin pode https://golpe.example.com" });
  assert.equal(deleted(f).length, 0, "admin pode mandar link");
  await groups.setAntiLink(G, false);
});

test("anti-link é desligado automaticamente se o bot perdeu o admin", async () => {
  const G2 = "120363100000000202@g.us";
  await setupGroup(G2, [{ id: MEMBER }], { botAdmin: false });
  await groups.setAntiLink(G2, true);
  await send(fakeClient(), { from: MEMBER, chat: G2, text: "https://x.com" });
  assert.equal((await getGroup(G2))!.antilink.status, false);
});

test("filtro de palavras apaga mensagens com palavra proibida", async () => {
  await groups.setWordFilter(G, "proibida", "add");
  const f = fakeClient();
  await send(f, { from: MEMBER, chat: G, text: "isso é uma PALAVRA proibida aqui" });
  assert.equal(deleted(f).length, 1);
  await groups.setWordFilter(G, "proibida", "remove");
});

test("grupo mutado ignora comandos de membros mas não de admins", async () => {
  await groups.setMuted(G, true);
  const f = fakeClient();
  await send(f, { from: MEMBER, chat: G, text: "!menu" });
  assert.equal(f.texts().length, 0, "membro é ignorado");
  await send(f, { from: ADMIN, chat: G, text: "!menu" });
  assert.ok(f.texts().length >= 1, "admin é atendido");
  await groups.setMuted(G, false);
});

test("anti-flood remove quem passa do limite de mensagens", async () => {
  await groups.setAntiFlood(G, true, 3, 60);
  const f = fakeClient();
  for (let i = 0; i < 6; i++) await send(f, { from: SPAMMER, chat: G, text: `spam ${i}` });
  assert.ok(f.calls.some(c => c.method === "groupParticipantsUpdate" && c.args[2] === "remove" && (c.args[1] as string[]).includes(SPAMMER)), "spammer removido");
  await groups.setAntiFlood(G, false);
});

test("resposta automática responde à palavra configurada", async () => {
  await groups.setAutoReply(G, true);
  // A resposta automática compara palavra por palavra (o !addresp só cadastra uma palavra).
  await groups.setReplyConfig(G, "bomdia", "Bom dia, grupo!", "add");
  const f = fakeClient();
  await send(f, { from: MEMBER, chat: G, text: "pessoal *BomDia* a todos" });
  assert.match(f.output(), /Bom dia, grupo!/);
  f.reset();
  await send(f, { from: MEMBER, chat: G, text: "boa noite" });
  assert.equal(f.texts().length, 0, "sem palavra cadastrada, sem resposta");
  await groups.setAutoReply(G, false);
});

test("contagem de atividade e de comandos do participante", async () => {
  const before = (await groups.getParticipant(G, MEMBER))!;
  await send(fakeClient(), { from: MEMBER, chat: G, text: "mensagem comum" });
  await send(fakeClient(), { from: MEMBER, chat: G, text: "!menu" });
  const after = (await groups.getParticipant(G, MEMBER))!;
  assert.equal(after.msgs, before.msgs + 2);
  assert.ok(after.commands >= before.commands + 1);
});

test("PV: comandos no privado bloqueados para não-admins quando desativados", async () => {
  const bot = new BotController();
  bot.setCommandsPv(false);
  const f = fakeClient();
  await send(f, { from: user(310), text: "!menu" });
  assert.equal(f.texts().filter(t => /menu/i.test(t) && !/Boas vindas/.test(t)).length, 0);
  await send(f, { from: OWNER, text: "!menu" });
  assert.ok(f.texts().length >= 1, "dono continua sendo atendido");
  bot.setCommandsPv(true);
});

test("modo admin: só admins do bot são atendidos", async () => {
  const bot = new BotController();
  bot.setAdminMode(true);
  const f = fakeClient();
  await send(f, { from: user(311), text: "!ping" });
  assert.equal(f.texts().filter(t => /ping|pong|ms/i.test(t)).length, 0);
  bot.setAdminMode(false);
});

test("taxa de comandos limita quem envia comandos demais", async () => {
  const bot = new BotController();
  bot.setCommandRate(true, 2, 60);
  const spam = user(312);
  const f = fakeClient();
  for (let i = 0; i < 5; i++) await send(f, { from: spam, text: "!ping" });
  assert.equal((await new UserController().getUser(spam))!.command_rate.limited, true);
  bot.setCommandRate(false);
});

test("entrada de membro: boas-vindas, lista negra e anti-fake", async () => {
  const f = fakeClient();
  await groups.setWelcome(G, true, "Bem-vindo(a)!");
  const NEW = user(320);
  await fastForward(() => groupParticipantsUpdated(f.client, { id: G, author: ADMIN, participants: [NEW], action: "add" }, new BotController().getBot()));
  assert.ok(await groups.isParticipant(G, NEW), "membro registrado");
  assert.match(f.output(), /Bem-vindo\(a\)!/);

  f.reset();
  await groups.setBlacklist(G, user(321), "add");
  await fastForward(() => groupParticipantsUpdated(f.client, { id: G, author: ADMIN, participants: [user(321)], action: "add" }, new BotController().getBot()));
  assert.ok(f.calls.some(c => c.method === "groupParticipantsUpdate" && c.args[2] === "remove"), "membro da lista negra é removido");

  f.reset();
  await groups.setAntiFake(G, true);
  const FAKE = "1555000000001@s.whatsapp.net";
  await fastForward(() => groupParticipantsUpdated(f.client, { id: G, author: ADMIN, participants: [FAKE], action: "add" }, new BotController().getBot()));
  assert.ok(f.calls.some(c => c.method === "groupParticipantsUpdate" && c.args[2] === "remove" && (c.args[1] as string[]).includes(FAKE)), "número estrangeiro removido");
  await groups.setAntiFake(G, false);
  await groups.setWelcome(G, false);
});

test("saída, promoção e rebaixamento atualizam o banco", async () => {
  const f = fakeClient();
  const bot = new BotController().getBot();
  await fastForward(() => groupParticipantsUpdated(f.client, { id: G, author: ADMIN, participants: [MEMBER], action: "promote" }, bot));
  assert.equal(await groups.isParticipantAdmin(G, MEMBER), true);
  await fastForward(() => groupParticipantsUpdated(f.client, { id: G, author: ADMIN, participants: [MEMBER], action: "demote" }, bot));
  assert.equal(await groups.isParticipantAdmin(G, MEMBER), false);
  await fastForward(() => groupParticipantsUpdated(f.client, { id: G, author: ADMIN, participants: [SPAMMER], action: "remove" }, bot));
  assert.equal(await groups.isParticipant(G, SPAMMER), false);
});

test("bot adicionado a um grupo novo registra o grupo; atualização parcial muda o nome", async () => {
  const G3 = "120363100000000203@g.us";
  const f = fakeClient({ groupMetadata: async () => ({ id: G3, subject: "Novo", participants: [{ id: HOST, admin: "admin" }, { id: ADMIN, admin: null }] }) });
  await fastForward(() => addedOnGroup(f.client, [{ id: G3, subject: "Novo", participants: [{ id: HOST, admin: "admin" }, { id: ADMIN, admin: null }] } as never], new BotController().getBot()));
  assert.equal((await getGroup(G3))?.name, "Novo");
  await partialGroupUpdate({ id: G3, subject: "Renomeado" });
  assert.equal((await getGroup(G3))?.name, "Renomeado");
});

test("sincronização na inicialização remove grupos em que o bot não está mais", async () => {
  const G4 = "120363100000000204@g.us";
  await setupGroup(G4, [{ id: ADMIN }]);
  // O bot "saiu" só de G4; os demais grupos (inclusive os de outros arquivos de teste) continuam.
  forgetGroup(G4);
  const f = fakeClient();
  await fastForward(() => syncGroupsOnStart(f.client));
  assert.equal(await getGroup(G4), null, "grupo antigo removido");
  assert.ok(await getGroup(G), "grupo atual mantido");
});
