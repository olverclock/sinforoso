/**
 * !brasileirao com implementação própria (sem biblioteca externa): lê a tabela e as rodadas das
 * páginas públicas do Terra, descobre o ID da temporada atual na página oficial (antes ficava preso
 * na temporada 2025) e usa um ID de reserva se a página não responder.
 */
import { test, before, afterEach, mock } from "node:test"
import assert from "node:assert/strict"
import axios from "axios"
import { fakeClient, setupBot, send, user } from "./helpers/harness.js"
import { brasileiraoData, championshipId, parseRounds, parseTable } from "../src/utils/brasileirao.util.js"

const row = (pos: number, name: string, pts: number) => `<tr><td class="position">${pos}</td><td class="shield"><a><img src="https://img/${pos}.png"></a></td>` +
  `<td class="team-name" colspan="1"><a title="${name}">${name}</a></td><td class="points">${pts}</td><td title="Jogos">30</td><td title="Vitórias">20</td>` +
  `<td title="Empates">5</td><td title="Derrotas">5</td><td title="Gols Pró">50</td><td title="Gols Contra">20</td><td title="Saldo de Gols">30</td><td title="Aproveitamento">72</td></tr>`
const TABLE = `<table><tbody>${row(1, "Flamengo", 65)}${row(2, "Palmeiras", 61)}</tbody></table>`
const match = (teams: string, home = "", away = "") => `<li class="match"><meta itemprop="name" content="${teams}">` +
  `<span class="goals home">${home}</span><span class="goals away">${away}</span><div class="details"><strong class="date-manager">Sáb 21/11 16h</strong><span class="stadium">Maracanã</span></div></li>`
const ROUNDS = `<ul class="rounds">` +
  `<li class="round hide"><br class="date-round" data-date="2026-11-14 GMT+0000 "><h3 class="header-round">33ª rodada</h3><ul>${match("Flamengo x Bahia", "2", "0")}</ul></li>` +
  `<li class="round"><br class="date-round" data-date="2026-11-21 GMT+0000 "><h3 class="header-round">34ª rodada</h3><ul>${match("Palmeiras x Vasco da Gama")}</ul></li></ul>`

const seen: string[] = []
function serve(routes: { terra?: string | Error, table?: string, rounds?: string }) {
  mock.method(axios, "get", async (url: string) => {
    seen.push(url)
    if (url.includes("terra.com.br")) { if (routes.terra instanceof Error) throw routes.terra; return { data: routes.terra ?? "" } }
    if (url.includes("ms-standings-games-light")) return { data: routes.rounds ?? "" }
    if (url.includes("ms-standings-light")) return { data: routes.table ?? "" }
    throw new Error("inesperado " + url)
  })
}

before(async () => { await setupBot() })
afterEach(() => { mock.restoreAll(); seen.length = 0 })

test("lê a tabela e as rodadas (rodada atual e placares)", () => {
  const table = parseTable(TABLE)
  assert.equal(table.length, 2)
  assert.deepEqual({ ...table[0] }, { nome: "Flamengo", escudo: "https://img/1.png", posicao: "1", pontos: "65", jogos: "30", vitorias: "20", empates: "5", derrotas: "5", gols_pro: "50", gols_contra: "20", saldo_gols: "30", aproveitamento: "72%" })
  const rounds = parseRounds(ROUNDS)
  assert.equal(rounds.length, 2)
  assert.equal(rounds[0].rodada_atual, false)
  assert.equal(rounds[1].rodada_atual, true)
  assert.equal(rounds[1].inicio, "21/11/2026")
  assert.equal(rounds[0].partidas[0].resultado_texto, "Flamengo 2 x 0 Bahia")
  assert.equal(rounds[1].partidas[0].time_fora, "Vasco da Gama", "time com 'x' no meio do texto não quebra")
})

test("descobre o ID da temporada na página oficial; sem a página, usa o ID de reserva", async () => {
  serve({ terra: `<a href="https://p1.trrsf.com/api/musa-soccer/ms-standings-light?idChampionship=1599&idPhase=">`, table: TABLE, rounds: ROUNDS })
  assert.equal(await championshipId("A", 1_000), "1599")
  const data = await brasileiraoData("A")
  assert.ok(seen.some(u => u.includes("ms-standings-light?idChampionship=1599")), "usa o ID descoberto")
  assert.equal(data.tabela[0].nome, "Flamengo")
  mock.restoreAll()
  serve({ terra: new Error("fora do ar") })
  assert.equal(await championshipId("B", 1_000), "1461", "reserva da Série B")
})

test("tabela vazia na fonte: erro claro (não mostra tabela em branco)", async () => {
  serve({ terra: "", table: "<html>sem tabela</html>", rounds: "" })
  await assert.rejects(brasileiraoData("B"), /indisponível/)
})

test("!brasileirao pelo fluxo real mostra tabela e jogos da rodada atual", async () => {
  serve({ terra: "", table: TABLE, rounds: ROUNDS })
  const f = fakeClient()
  await send(f, { from: user(8101), text: "!brasileirao" })
  const out = f.output()
  assert.match(out, /Flamengo[\s\S]*Palmeiras/)
  assert.match(out, /Palmeiras[\s\S]*Vasco da Gama/, "jogos da rodada atual")
  assert.doesNotMatch(out, /Bahia/, "rodada antiga não aparece")
})
