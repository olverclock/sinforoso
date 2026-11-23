/**
 * Comandos de grupo pelo fluxo real (mensagem → handler → invoker → comando → NeDB → resposta).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { fakeClient, setupBot, setupGroup, getGroup, send, user, HOST } from "./helpers/harness.js";
import botTexts from "../src/helpers/bot.texts.helper.js";

const G = "120363100000000001@g.us";
const ADMIN = user(101), MEMBER = user(102), OTHER = user(103);
const fake = fakeClient();
const cmd = (from: string, text: string, extra: Record<string, unknown> = {}) => send(fake, { from, chat: G, text, ...extra });

before(async () => {
  await setupBot();
  await setupGroup(G, [{ id: ADMIN, admin: true }, { id: MEMBER }, { id: OTHER }]);
});

test("toggle de recursos do grupo por admin atualiza o banco e responde", async () => {
  const toggles: [string, (g: any) => boolean][] = [
    ["!antilink", g => g.antilink.status], ["!autosticker", g => g.autosticker], ["!mutar", g => g.muted],
    ["!antifake", g => g.antifake.status], ["!autoresp", g => g.auto_reply.status], ["!janitor", g => g.janitor_status],
  ];
  for (const [command, read] of toggles) {
    const before = read(await getGroup(G));
    fake.reset();
    await cmd(ADMIN, command);
    assert.equal(read(await getGroup(G)), !before, `${command} deveria alternar o estado`);
    assert.ok(fake.texts().length >= 1, `${command} deveria responder`);
    await cmd(ADMIN, command); // volta ao estado original
    assert.equal(read(await getGroup(G)), before);
  }
});

test("membro comum não pode usar comandos de administração do grupo", async () => {
  for (const command of ["!antilink", "!mutar", "!bemvindo", "!antiflood", "!restrito", "!ban", "!aviso", "!limiteavisos 3"]) {
    fake.reset();
    await cmd(MEMBER, command);
    assert.match(fake.output(), new RegExp(escape(botTexts.permission.admin_group_only)), `${command}: deveria negar`);
  }
});

test("comandos de grupo não funcionam no privado", async () => {
  fake.reset();
  await send(fake, { from: ADMIN, text: "!antilink" });
  assert.match(fake.output(), new RegExp(escape(botTexts.permission.group)));
});

test("bot sem admin no grupo recusa comandos que exigem admin do bot", async () => {
  const G2 = "120363100000000002@g.us";
  await setupGroup(G2, [{ id: ADMIN, admin: true }], { botAdmin: false });
  fake.reset();
  await send(fake, { from: ADMIN, chat: G2, text: "!antilink" });
  assert.match(fake.output(), new RegExp(escape(botTexts.permission.bot_group_admin)));
});

test("bem-vindo com mensagem personalizada e limite de avisos", async () => {
  await cmd(ADMIN, "!bemvindo Seja bem-vindo!");
  let g = await getGroup(G);
  assert.equal(g?.welcome.status, true);
  assert.match(g?.welcome.msg ?? "", /Seja bem-vindo/);
  await cmd(ADMIN, "!bemvindo");
  g = await getGroup(G);
  assert.equal(g?.welcome.status, false);

  await cmd(ADMIN, "!limiteavisos 5");
  assert.equal((await getGroup(G))?.strike_limit, 5);
});

test("filtros de palavras: adicionar, listar e remover", async () => {
  await cmd(ADMIN, "!addfiltros palavrao outra");
  assert.deepEqual([...(await getGroup(G))!.word_filter].sort(), ["outra", "palavrao"]);
  await cmd(ADMIN, "!rmfiltros outra");
  assert.deepEqual((await getGroup(G))!.word_filter, ["palavrao"]);
});

test("exceções de link: adicionar e remover (forEach → for...of grava antes de responder)", async () => {
  await cmd(ADMIN, "!addexlink youtube.com instagram.com");
  assert.deepEqual([...(await getGroup(G))!.antilink.exceptions].sort(), ["instagram.com", "youtube.com"]);
  await cmd(ADMIN, "!rmexlink youtube.com");
  assert.deepEqual((await getGroup(G))!.antilink.exceptions, ["instagram.com"]);
});

test("exceções do anti-fake: prefixos e números", async () => {
  await cmd(ADMIN, "!addexfake 1, 5511988887777");
  let g = await getGroup(G);
  assert.ok(g!.antifake.exceptions.prefixes.includes("1"));
  assert.ok(g!.antifake.exceptions.numbers.includes("5511988887777"));
  fake.reset();
  await cmd(ADMIN, "!rmexfake 55, 1");
  g = await getGroup(G);
  assert.ok(!g!.antifake.exceptions.prefixes.includes("1"));
  assert.ok(g!.antifake.exceptions.prefixes.includes("55"), "o prefixo 55 não pode ser removido");
});

test("respostas automáticas: adicionar, listar e remover", async () => {
  await cmd(ADMIN, "!addresp oi olá pessoal");
  assert.equal((await getGroup(G))!.auto_reply.config.find(c => c.word == "oi")?.reply, "olá pessoal");
  assert.ok((await getGroup(G))!.auto_reply.config.some(c => c.word == "oi"));
  fake.reset();
  await cmd(ADMIN, "!respostas");
  assert.match(fake.output(), /oi/);
  await cmd(ADMIN, "!rmresp oi");
  assert.ok(!(await getGroup(G))!.auto_reply.config.some(c => c.word == "oi"));
});

test("bloquear e desbloquear comandos no grupo", async () => {
  await cmd(ADMIN, "!bcmd !s !play !naoexiste");
  assert.deepEqual([...(await getGroup(G))!.block_cmds].sort(), ["play", "s"]);
  assert.match(fake.output(), /naoexiste\* não existe/);
  fake.reset();
  await cmd(MEMBER, "!s");
  assert.ok(fake.texts().length >= 1, "deveria avisar que o comando está bloqueado");
  await cmd(ADMIN, "!dcmd !s !play");
  assert.deepEqual((await getGroup(G))!.block_cmds, []);
});

test("anti-flood com parâmetros", async () => {
  await cmd(ADMIN, "!antiflood 5 15");
  const g = await getGroup(G);
  assert.equal(g!.antiflood.status, true);
  assert.equal(g!.antiflood.max_messages, 5);
  assert.equal(g!.antiflood.interval, 15);
  await cmd(ADMIN, "!antiflood");
  assert.equal((await getGroup(G))!.antiflood.status, false);
});

test("lista negra: adicionar e remover número", async () => {
  await cmd(ADMIN, "!addlista 5511977776666");
  assert.ok((await getGroup(G))!.blacklist.includes("5511977776666@s.whatsapp.net"));
  await cmd(ADMIN, "!rmlista 5511977776666");
  assert.ok(!(await getGroup(G))!.blacklist.includes("5511977776666@s.whatsapp.net"));
});

test("comandos informativos do grupo respondem", async () => {
  for (const command of ["!grupo", "!adms", "!dono", "!topativos", "!inativos 1", "!listanegra", "!link"]) {
    fake.reset();
    await cmd(ADMIN, command);
    assert.ok(fake.texts().length >= 1, `${command} deveria responder`);
  }
});

test("promover, rebaixar e banir via menção", async () => {
  const updates = () => fake.calls.filter(c => c.method === "groupParticipantsUpdate").map(c => [c.args[1], c.args[2]]);
  fake.reset();
  await cmd(ADMIN, "!promover", { mentions: [OTHER] });
  assert.deepEqual(updates(), [[[OTHER], "promote"]]);
  fake.reset();
  await new (await import("../src/controllers/group.controller.js")).GroupController().setAdmin(G, OTHER, true); // o WhatsApp confirmaria via evento
  await cmd(ADMIN, "!rebaixar", { mentions: [OTHER] });
  assert.deepEqual(updates(), [[[OTHER], "demote"]]);
  fake.reset();
  await cmd(ADMIN, "!ban", { mentions: [MEMBER, HOST] });
  assert.ok(updates().some(([jids, action]) => action === "remove" && (jids as string[]).includes(MEMBER)), "deveria remover o membro");
  assert.ok(!updates().some(([jids]) => (jids as string[]).includes(HOST)), "nunca remove o próprio bot");
});

test("avisos: adicionar, remover e zerar", async () => {
  await cmd(ADMIN, "!aviso", { mentions: [MEMBER] });
  await cmd(ADMIN, "!rmaviso", { mentions: [MEMBER] });
  fake.reset();
  await cmd(ADMIN, "!zeraravisos");
  assert.ok(fake.texts().length >= 1);
});

test("guia de comando responde com o guia", async () => {
  fake.reset();
  await cmd(ADMIN, "!antilink guia");
  assert.match(fake.output(), /antilink/i);
});

function escape(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
