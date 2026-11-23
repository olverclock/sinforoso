/**
 * Testes de caracterização de handleGameMessage (Show do Milhão): registram o comportamento atual em
 * todos os caminhos antes da refatoração de complexidade. O serviço do jogo é simulado para cobrir
 * cada resultado (acerto, erro, fim de jogo, eliminação, ajudas e falhas).
 */
import { test, before, afterEach, mock } from "node:test"
import assert from "node:assert/strict"
import { fakeClient, setupBot, user, fastForward } from "./helpers/harness.js"
import { handleGameMessage } from "../src/helpers/message.procedures.helper.js"
import { GameService } from "../src/services/game.service.js"
import { AutomationService } from "../src/services/automation.service.js"
import { GroupController } from "../src/controllers/group.controller.js"
import type { GameState } from "../src/interfaces/game.interface.js"
import type { Message } from "../src/interfaces/message.interface.js"
import type { Bot } from "../src/interfaces/bot.interface.js"

const G = "120363100000000901@g.us"
const PLAYER = user(901), OTHER = user(902)
let bot: Bot
before(async () => { bot = await setupBot() })
afterEach(() => mock.restoreAll())

function game(partial: Partial<GameState> = {}): GameState {
  return {
    chatId: G, mode: "group", participants: [PLAYER], currentQuestionIndex: 1,
    currentQuestion: { id: 1, question: "Capital do Brasil?", options: ["Rio", "Brasília", "SP", "BH"], answer: 1 } as GameState["currentQuestion"],
    helped: { pulos: 0, cartas: false, universitarios: false, placas: false },
    usedQuestionIds: [], accumulatedPrize: 1000, status: "waiting_answer", lastTime: 0, ...partial,
  }
}

function msg(text: string, sender = PLAYER, chat = G): Message {
  return { chat_id: chat, sender, body: text, caption: "", expiration: undefined, wa_message: { key: { id: "M1", remoteJid: chat } } } as unknown as Message
}

/** Simula o serviço do jogo e devolve os mocks para conferência. */
function stub(state: GameState | undefined, opts: { participant?: { xp: number, score: number } | null } = {}) {
  const service = GameService.getInstance()
  const getActive = mock.method(service, "getActiveGame", () => state)
  const clear = mock.method(AutomationService.getInstance(), "clearGameTimeout", () => { })
  const participant = mock.method(GroupController.prototype, "getParticipant", async () => opts.participant === undefined ? { xp: 10, score: 10 } : opts.participant)
  return { service, getActive, clear, participant }
}

const run = (f: ReturnType<typeof fakeClient>, m: Message) => fastForward(() => handleGameMessage(f.client, bot, undefined, m))

test("ignora: sem jogo, jogo fora de 'waiting_answer', privado de outra pessoa, participante eliminado, texto qualquer", async () => {
  const f = fakeClient()
  stub(undefined)
  assert.equal(await run(f, msg("1")), false)
  mock.restoreAll(); stub(game({ status: "playing" }))
  assert.equal(await run(f, msg("1")), false)
  mock.restoreAll(); stub(game({ mode: "private", chatId: PLAYER }))
  assert.equal(await run(f, msg("1", OTHER, PLAYER)), false, "no privado só o dono responde")
  mock.restoreAll(); stub(game(), { participant: { xp: 0, score: 0 } })
  assert.equal(await run(f, msg("1")), false, "eliminado não responde")
  mock.restoreAll(); stub(game(), { participant: { xp: 0, score: 5 } })
  assert.equal(await run(f, msg("bom dia")), false, "só XP zerado não elimina; texto que não é resposta é ignorado")
  mock.restoreAll(); stub(game({ currentQuestion: undefined }))
  assert.equal(await run(f, msg("2")), false, "sem pergunta atual")
  assert.equal(f.sent.length, 0, "nada enviado")
})

test("ajudas: cada termo vira o tipo certo; 'pular' manda a nova pergunta; erro da ajuda vira mensagem", async () => {
  const cases: [string, string][] = [["pular", "pulos"], ["pulos", "pulos"], ["cartas", "cartas"], ["Universitários", "universitarios"], ["universitarios", "universitarios"], ["placas", "placas"], ["alex", "placas"], ["ajuda alex", "placas"]]
  for (const [text, type] of cases) {
    mock.restoreAll()
    const f = fakeClient()
    const s = stub(game())
    const help = mock.method(s.service, "useHelp", async () => ({ type, content: "dica" }))
    assert.equal(await run(f, msg(text)), true, text)
    assert.equal(help.mock.calls[0].arguments[1], type, `${text} → ${type}`)
    assert.ok(s.clear.mock.callCount() >= 1, "cancelou o tempo esgotado (pular cancela de novo ao reenviar a pergunta)")
    assert.match(f.output(), new RegExp(type.toUpperCase()))
    assert.match(f.output(), /dica/)
    if (type === "pulos") assert.match(f.output(), /Capital do Brasil/, "pular reenviou a pergunta")
  }

  mock.restoreAll()
  const f = fakeClient()
  const s = stub(game())
  mock.method(s.service, "useHelp", async () => { throw new Error("Você já usou essa ajuda") })
  assert.equal(await run(f, msg("cartas")), true)
  assert.match(f.output(), /❌ Você já usou essa ajuda/)
})

test("resposta: aceita 1-4 e A-D (maiúscula ou minúscula) com o índice certo", async () => {
  for (const [text, index] of [["1", 0], ["4", 3], ["a", 0], ["B", 1], ["d", 3]] as const) {
    mock.restoreAll()
    const f = fakeClient()
    const s = stub(game())
    const submit = mock.method(s.service, "submitAnswer", async () => ({ correct: true, gameOver: true, game: game() }))
    assert.equal(await run(f, msg(text)), true)
    assert.deepEqual(submit.mock.calls[0].arguments, [G, PLAYER, index], text)
  }
  mock.restoreAll()
  const f = fakeClient()
  stub(game())
  assert.equal(await run(f, msg("5")), false, "5 não é alternativa")
  assert.equal(await run(f, msg("e")), false, "E não é alternativa")
})

test("acerto com fim de jogo: parabeniza e mostra o prêmio em reais", async () => {
  const f = fakeClient()
  const s = stub(game())
  mock.method(s.service, "submitAnswer", async () => ({ correct: true, gameOver: true, game: game({ accumulatedPrize: 1000000 }) }))
  assert.equal(await run(f, msg("2")), true)
  assert.equal(f.sent.length, 2)
  assert.ok(f.sent[0].content.mentions, "o acerto menciona o jogador")
  assert.match(f.texts()[1], /R\$\s?1\.000\.000,00/)
})

test("acerto sem fim de jogo: depois de 3 s busca e envia a próxima pergunta; falha no timer só é registrada", async () => {
  const f = fakeClient()
  const s = stub(game())
  mock.method(s.service, "submitAnswer", async () => ({ correct: true, gameOver: false, game: game() }))
  const next = mock.method(s.service, "nextQuestion", async () => game())
  await run(f, msg("2"))
  await fastForward(async () => { for (let i = 0; i < 100 && !/Capital do Brasil/.test(f.output()); i++) await new Promise(r => setTimeout(r, 10)) })
  assert.equal(next.mock.callCount(), 1, "pediu a próxima pergunta")
  assert.match(f.output(), /Capital do Brasil/, "enviou a próxima pergunta")

  mock.restoreAll()
  const f2 = fakeClient()
  const s2 = stub(game())
  mock.method(s2.service, "submitAnswer", async () => ({ correct: true, gameOver: false, game: game() }))
  mock.method(s2.service, "nextQuestion", async () => { throw new Error("sem perguntas") })
  await run(f2, msg("2"))
  await fastForward(() => new Promise(r => setTimeout(r, 50)))
  assert.equal(f2.sent.length, 1, "só o 'acertou' foi enviado; o erro do timer não derrubou nada")
})

test("erro no privado: encerra com R$ 0,00 sem consultar eliminação", async () => {
  const f = fakeClient()
  const s = stub(game({ mode: "private", chatId: PLAYER }))
  mock.method(s.service, "submitAnswer", async () => ({ correct: false, gameOver: false, game: game() }))
  assert.equal(await run(f, msg("1", PLAYER, PLAYER)), true)
  assert.equal(f.sent.length, 2)
  assert.match(f.texts()[1], /R\$ 0,00/)
  assert.equal(s.participant.mock.callCount(), 0)
})

test("erro no grupo: avisa a eliminação quando XP e pontos zeram e o fim de jogo quando acabou", async () => {
  // não eliminado e jogo continua: só o 'errou'
  let f = fakeClient()
  let s = stub(game())
  mock.method(s.service, "submitAnswer", async () => ({ correct: false, gameOver: false, game: game() }))
  assert.equal(await run(f, msg("1")), true)
  assert.equal(f.sent.length, 1)

  // eliminado (a 1ª consulta, antes da resposta, ainda tinha pontos) e jogo acabou
  mock.restoreAll()
  f = fakeClient()
  s = stub(game())
  let calls = 0
  s.participant.mock.mockImplementation(async () => (++calls === 1 ? { xp: 1, score: 1 } : { xp: 0, score: 0 }))
  mock.method(s.service, "submitAnswer", async () => ({ correct: false, gameOver: true, game: game() }))
  assert.equal(await run(f, msg("1")), true)
  assert.equal(f.sent.length, 3, "errou + eliminado + fim de jogo")
  assert.ok(f.sent[1].content.mentions, "a eliminação menciona o jogador")
  assert.match(f.texts()[2], /R\$ 0,00/)
})

test("falha ao registrar a resposta: só registra no console e devolve false", async () => {
  const f = fakeClient()
  const s = stub(game())
  mock.method(s.service, "submitAnswer", async () => { throw new Error("banco indisponível") })
  const err = mock.method(console, "error", () => { })
  assert.equal(await run(f, msg("1")), false)
  assert.equal(err.mock.callCount(), 1)
  assert.equal(f.sent.length, 0)
})
