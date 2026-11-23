/**
 * Menus por categoria, comandos utilitários restantes (APIs simuladas) e jogos (Show do Milhão e
 * cassino) pelo fluxo real.
 */
import { test, before, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { fakeClient, setupBot, setupGroup, send, user, OWNER } from "./helpers/harness.js";
import { GameService } from "../src/services/game.service.js";
import { UserService } from "../src/services/user.service.js";

const G = "120363100000000501@g.us";
const ADMIN = user(701), MEMBER = user(702);
before(async () => {
  await setupBot();
  await setupGroup(G, [{ id: ADMIN, admin: true }, { id: MEMBER }]);
});
afterEach(() => mock.restoreAll());

test("menu principal e de cada categoria respondem no grupo e no privado", async () => {
  const f = fakeClient();
  const seen = new Set<string>();
  for (const page of ["", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "99"]) {
    for (const [from, chat] of [[MEMBER, G], [OWNER, OWNER], [ADMIN, G]] as const) {
      f.reset();
      await send(f, { from, chat, text: `!menu ${page}`.trim() });
      assert.ok(f.texts().length >= 1, `!menu ${page} (${chat === G ? "grupo" : "privado"})`);
      seen.add(f.output());
    }
  }
  assert.ok(seen.size >= 8, "páginas diferentes produzem textos diferentes");
});

test("filmes e séries em alta (TMDB simulado)", async () => {
  mock.method(axios, "get", async (url: string) => ({ data: { results: [{ title: url.includes("/tv") ? undefined : "Filme A", name: "Série B", overview: "Sinopse" }] } }));
  const f = fakeClient();
  for (const command of ["!filmes", "!series"]) {
    f.reset();
    await send(f, { from: MEMBER, text: command });
    assert.match(f.output(), /Sinopse/, command);
  }
});

test("clima, moeda e pesquisa com respostas simuladas", async () => {
  mock.method(axios, "get", async (url: string) => {
    if (url.includes("conditions.json")) return { data: [{ code: 1000, languages: [{ lang_iso: "pt", day_text: "Sol", night_text: "Limpo" }] }] };
    if (url.includes("forecast.json")) return { data: { location: { name: "Natal", region: "RN", country: "Brasil", localtime_epoch: 1700000000 }, current: { last_updated_epoch: 1700000000, temp_c: 30, feelslike_c: 32, condition: { code: 1000 }, is_day: 1, wind_kph: 5, humidity: 60, cloud: 0 }, forecast: { forecastday: [] } } };
    if (url.includes("awesomeapi")) return { data: { EURBRL: { codein: "BRL", name: "Euro/Real", bid: "6", create_date: "2026-11-17 09:00:00" } } };
    if (url.includes("bing.com/search")) return { data: `<ol><li class="b_algo"><h2><a href="https://r.test">Resultado</a></h2><div class="b_caption"><p>desc</p></div></li></ol>` };
    throw new Error("rota não simulada");
  });
  const f = fakeClient();
  for (const [command, expected] of [["!clima Natal", /Natal/], ["!moeda euro 10", /60\.00/], ["!pesquisa algo", /Resultado/]] as const) {
    f.reset();
    await send(f, { from: MEMBER, text: command });
    assert.match(f.output(), expected, command);
  }
  f.reset();
  await send(f, { from: MEMBER, text: "!moeda bitcoin 10" });
  assert.match(f.output(), /moeda/i, "moeda inválida mostra o uso");
});

test("voz gera áudio a partir do texto e falhas de serviço viram mensagem amigável", async () => {
  mock.method(axios, "get", async () => ({ data: Buffer.from("ID3audio") }));
  const f = fakeClient();
  await send(f, { from: MEMBER, text: "!voz pt olá pessoal" });
  assert.ok(f.sent.some(s => s.content.audio), "enviou áudio");
  for (const command of ["!traduz pt hello", "!letra musica qualquer", "!brasileirao", "!noticias", "!encurtar nao-e-url"]) {
    f.reset();
    await send(f, { from: MEMBER, text: command });
    assert.ok(f.texts().length >= 1, `${command} responde mesmo sem rede`);
  }
});

test("Show do Milhão: iniciar, responder, usar ajuda e parar", async () => {
  const f = fakeClient();
  await send(f, { from: MEMBER, chat: G, text: "!showdomilhao" });
  assert.ok(GameService.getInstance().getActiveGame(G), "jogo iniciado no grupo");
  assert.match(f.output(), /A\)|1\)|\?/, "enviou a pergunta");

  const game = GameService.getInstance().getActiveGame(G)!;
  assert.ok(game.currentQuestion && game.currentQuestion.options.length === 4, "pergunta com 4 alternativas");
  f.reset();
  await send(f, { from: MEMBER, chat: G, text: "cartas" });
  assert.ok(f.texts().length >= 1, "ajuda respondida");

  f.reset();
  await send(f, { from: MEMBER, chat: G, text: "!showdomilhao parar" });
  assert.ok(!GameService.getInstance().getActiveGame(G) || GameService.getInstance().getActiveGame(G)?.status !== "waiting_answer", "jogo encerrado");
});

test("Show do Milhão no privado: resposta errada encerra o jogo", async () => {
  const P = user(710);
  const f = fakeClient();
  await send(f, { from: P, text: "!showdomilhao" });
  const game = GameService.getInstance().getActiveGame(P);
  assert.ok(game, "jogo privado iniciado");
  const correct = game!.currentQuestion!.answer;
  const wrong = ["A", "B", "C", "D"][(correct + 1) % 4];
  f.reset();
  await send(f, { from: P, text: wrong });
  assert.match(f.output(), /R\$ 0,00|errou|Errou|GAME OVER|fim/i);
});

test("cassino: aposta válida, inválida e sem XP", async () => {
  const P = user(711);
  const f = fakeClient();
  await send(f, { from: P, text: "!casino" });
  assert.ok(f.texts().length >= 1, "sem valor mostra como apostar");
  await UserService.getInstance().addXp(P, 500);
  f.reset();
  await send(f, { from: P, text: "!casino 100" });
  assert.ok(f.texts().length >= 1);
  f.reset();
  await send(f, { from: P, text: "!casino abc" });
  assert.ok(f.texts().length >= 1, "aposta inválida");
});
