/**
 * Engajamento: perfil/XP, jogo de cartas (roll → resgate → inventário → venda/troca), bolão,
 * oráculo e comandos com API externa (respostas simuladas).
 */
import { test, before, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { fakeClient, setupBot, setupGroup, send, user } from "./helpers/harness.js";
import { UserService } from "../src/services/user.service.js";
import { CardGameService } from "../src/services/cardgame.service.js";

const ROOT = process.env.SINFOROSO_PROJECT_ROOT ?? process.cwd();
const PNG = fs.readFileSync(path.join(ROOT, "src", "media", "cara.png"));
const G = "120363100000000301@g.us";
const ADMIN = user(501), PLAYER = user(502), FRIEND = user(503);

const anilist = (id: number, name: string) => ({ data: { data: { Page: { characters: [{ id, name: { full: name, native: "名前" }, image: { large: `https://img.test/${id}.png` }, media: { nodes: [{ type: "ANIME", title: { romaji: "Obra Teste" } }] }, description: "Descrição", favourites: 1234 }] } } } });

before(async () => {
  await setupBot();
  await setupGroup(G, [{ id: ADMIN, admin: true }, { id: PLAYER }, { id: FRIEND }]);
});
afterEach(() => mock.restoreAll());

test("perfil e ranking de XP respondem com os dados do usuário", async () => {
  const f = fakeClient();
  await send(f, { from: PLAYER, chat: G, text: "!perfil", name: "Jogadora" });
  assert.match(f.output(), /Jogadora|XP|Nível/i);
  f.reset();
  await send(f, { from: PLAYER, chat: G, text: "!topxp" });
  assert.ok(f.texts().length >= 1);
});

test("XP: ganho, gasto e saldo insuficiente", async () => {
  const users = UserService.getInstance();
  const before = (await users.getUser(PLAYER))!;
  await users.addXp(PLAYER, 100);
  assert.equal((await users.getUser(PLAYER))!.xp, (before.xp ?? 0) + 100);
  assert.equal(await users.spendXp(PLAYER, 50), true);
  assert.equal(await users.spendXp(PLAYER, 1_000_000), false, "não gasta mais do que tem");
});

test("jogo de cartas: roll, resgate pelo código, inventário, inspeção e venda", async () => {
  mock.method(Math, "random", () => 0.7); // AniList (não IGDB) e código de resgate previsível
  mock.method(axios, "post", async () => anilist(9001, "Personagem Teste"));
  mock.method(axios, "get", async () => ({ data: PNG }));
  const f = fakeClient();

  await send(f, { from: ADMIN, chat: G, text: "!roll" });
  const roll = f.sent.find(s => s.content.image);
  assert.ok(roll, "enviou a imagem da carta");
  const code = String(roll!.content.caption).match(/\b(\d{3})\b/)?.[1];
  assert.ok(code, `código de resgate na legenda: ${roll!.content.caption}`);

  f.reset();
  await send(f, { from: PLAYER, chat: G, text: code! });
  const collection = await CardGameService.getInstance().getUserCollection(PLAYER);
  assert.equal(collection.length, 1, "a carta foi para a coleção de quem resgatou");
  assert.match(f.output(), /Personagem Teste/);

  f.reset();
  await send(f, { from: FRIEND, chat: G, text: code! });
  assert.equal((await CardGameService.getInstance().getUserCollection(FRIEND)).length, 0, "não dá para resgatar duas vezes");

  for (const command of ["!inv", "!colecao", "!cartas", "!carta"]) {
    f.reset();
    await send(f, { from: PLAYER, chat: G, text: command });
    assert.ok(f.sent.length >= 1, `${command} deveria responder`);
  }
  f.reset();
  await send(f, { from: PLAYER, chat: G, text: "!carta" });
  const serial = f.output().match(/#(\d+)/)?.[1];
  assert.ok(serial, `serial na listagem: ${f.output().slice(0, 200)}`);

  f.reset();
  await send(f, { from: PLAYER, chat: G, text: `!carta #${serial}` });
  assert.ok(f.sent.some(s => s.content.image), "mostra a imagem da carta");

  const xpBefore = (await UserService.getInstance().getUser(PLAYER))!.xp ?? 0;
  f.reset();
  await send(f, { from: PLAYER, chat: G, text: `!vender #${serial}` });
  assert.equal((await CardGameService.getInstance().getUserCollection(PLAYER)).length, 0, "carta vendida sai da coleção");
  assert.ok(((await UserService.getInstance().getUser(PLAYER))!.xp ?? 0) > xpBefore, "venda rende XP");
});

test("troca de cartas: proposta, aceite e transferência", async () => {
  const cards = CardGameService.getInstance();
  mock.method(Math, "random", () => 0.7);
  mock.method(axios, "post", async () => anilist(9002, "Carta da Troca"));
  mock.method(axios, "get", async () => ({ data: PNG }));
  const f = fakeClient();
  await send(f, { from: ADMIN, chat: G, text: "!roll" });
  const code = String(f.sent.find(s => s.content.image)!.content.caption).match(/\b(\d{3})\b/)![1];
  await send(f, { from: PLAYER, chat: G, text: code });
  const [card] = await cards.getUserCollection(PLAYER);
  f.reset();
  await send(f, { from: PLAYER, chat: G, text: `!carta` });
  const serial = f.output().match(/#(\d+)/)![1];

  f.reset();
  await send(f, { from: PLAYER, chat: G, text: `!trade @amigo #${serial}`, mentions: [FRIEND] });
  assert.match(f.output(), /TROCA/i);
  await send(f, { from: FRIEND, chat: G, text: "!trade aceitar" });
  assert.equal((await cards.getUserCardById(card.id))?.user_id, FRIEND, "a carta mudou de dono");
});

test("bolão: criar, apostar e encerrar com permissão", async () => {
  const f = fakeClient();
  await send(f, { from: PLAYER, text: "!bolao Quem ganha?" });
  assert.match(f.output(), /grupos/i, "bolão só em grupo");
  f.reset();
  await send(f, { from: ADMIN, chat: G, text: "!bolao Quem ganha o jogo?" });
  assert.match(f.output(), /Quem ganha o jogo\?/);
  await send(f, { from: PLAYER, chat: G, text: "!apostar Flamengo" });
  await send(f, { from: FRIEND, chat: G, text: "!apostar Vasco" });
  f.reset();
  await send(f, { from: PLAYER, chat: G, text: "!encerrarbolao Flamengo" });
  assert.match(f.output(), /administradores/i, "membro comum não encerra");
  f.reset();
  await send(f, { from: ADMIN, chat: G, text: "!encerrarbolao Flamengo" });
  assert.ok(f.texts().length >= 1);
});

test("oráculo responde à pergunta", async () => {
  const f = fakeClient();
  await send(f, { from: PLAYER, chat: G, text: "!oraculo vou passar na prova?" });
  assert.ok(f.texts().length >= 1);
});

test("bitcoin e fortnite: dados simulados e tratamento de erro da API", async () => {
  mock.method(axios, "get", async (url: string) => {
    if (url.includes("blockchain")) return { data: { BRL: { last: 350000, buy: 349000, sell: 351000, symbol: "R$" }, USD: { last: 70000, buy: 69900, sell: 70100, symbol: "$" } } };
    const err = Object.assign(new Error("Request failed"), { response: { status: 404 } });
    throw err;
  });
  const f = fakeClient();
  await send(f, { from: PLAYER, text: "!bitcoin" });
  assert.match(f.output(), /350[.,]?000|BTC|Bitcoin/i);
  f.reset();
  await send(f, { from: PLAYER, text: "!fortnite jogadorinexistente" });
  assert.match(f.output(), /NÃO ENCONTRADO/i, "404 vira mensagem amigável");
});
