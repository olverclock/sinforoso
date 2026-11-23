/**
 * REL-02: falhas de conexão e reconexão com o WhatsApp.
 * Cobre os 6 cenários exigidos: falha na inicialização, queda temporária, rejeição durante a reconexão,
 * sessão expirada, falhas seguidas (sem ciclo infinito) e recuperação sem duplicar conexões/ouvintes.
 */
import { test, afterEach, mock } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { Boom } from "@hapi/boom"
import { DisconnectReason } from "baileys"
import { ConnectionSupervisor, SupervisedSocket, SupervisorOptions } from "../src/helpers/connection.supervisor.helper.js"
import { connectionClose } from "../src/events/connection.event.js"
import { db as sessionDb } from "../src/helpers/session.auth.helper.js"

let timersEnabled = false
afterEach(() => { mock.timers.reset(); timersEnabled = false; mock.restoreAll() })

type FakeSocket = SupervisedSocket & { generation: number, ended: boolean, unsubscribed: boolean }

/** Supervisor com relógio controlado, sem variação aleatória (espera exata) e sockets falsos. */
function harness(startImpl?: (generation: number) => Promise<void>, options: Partial<SupervisorOptions> = {}) {
  let clock = 0
  if (!timersEnabled) { mock.timers.enable({ apis: ["setTimeout", "setInterval"] }); timersEnabled = true }
  const sockets: FakeSocket[] = []
  const logs: string[] = []
  const gaveUp: string[] = []
  const supervisor = new ConnectionSupervisor({
    start: async (generation) => {
      await startImpl?.(generation)
      const socket: FakeSocket = { generation, ended: false, unsubscribed: false, end() { this.ended = true }, unsubscribe() { this.unsubscribed = true } }
      sockets.push(socket)
      return socket
    },
    onGiveUp: (reason) => { gaveUp.push(reason) },
    log: (m) => logs.push(m),
    random: () => 0.5,
    now: () => clock,
    ...options,
  })
  /** Avança o relógio falso e deixa as Promises pendentes rodarem. */
  const advance = async (ms: number) => {
    clock += ms
    mock.timers.tick(ms)
    for (let i = 0; i < 5; i++) await new Promise<void>(r => setImmediate(r))
  }
  return { supervisor, sockets, logs, gaveUp, advance }
}

test("1) falha na inicialização: não rejeita, registra e tenta de novo até conectar", async () => {
  let calls = 0
  const h = harness(async () => { if (++calls <= 2) throw new Error("ENOTFOUND web.whatsapp.com") })
  await assert.doesNotReject(h.supervisor.connect(), "connect() nunca rejeita (sem Promise solta)")
  assert.equal(h.sockets.length, 0)
  assert.match(h.logs.join("\n"), /Falha ao iniciar a conexão: ENOTFOUND/)
  await h.advance(3_000)          // 1ª espera: 3 s
  assert.equal(calls, 2)
  await h.advance(6_000)          // 2ª espera: 6 s
  assert.equal(calls, 3)
  assert.equal(h.sockets.length, 1, "conectou na 3ª tentativa")
  h.supervisor.markOpen(h.sockets[0].generation)
  assert.equal(h.supervisor.consecutiveFailures, 0, "abrir a conexão zera as falhas")
  assert.deepEqual(h.gaveUp, [])
})

test("2) queda temporária de internet: reconecta com espera crescente e volta à espera inicial depois de abrir", async () => {
  const h = harness()
  await h.supervisor.connect()
  const first = h.sockets[0]
  h.supervisor.markOpen(first.generation)

  h.supervisor.scheduleReconnect(first.generation, "conexão fechada")   // caiu (ex.: 408)
  assert.equal(h.supervisor.state, "connecting")
  await h.advance(2_999)
  assert.equal(h.sockets.length, 1, "ainda esperando os 3 s")
  await h.advance(1)
  assert.equal(h.sockets.length, 2, "reconectou depois de 3 s")
  assert.ok(first.unsubscribed && first.ended, "a conexão antiga foi desinscrita e encerrada")

  h.supervisor.markOpen(h.sockets[1].generation)
  h.supervisor.scheduleReconnect(h.sockets[1].generation, "caiu de novo")
  await h.advance(3_000)
  assert.equal(h.sockets.length, 3, "depois de abrir, a espera voltou para 3 s")
})

test("3) rejeição durante a reconexão é tratada e reagendada (o processo não cai)", async () => {
  let calls = 0
  const h = harness(async () => { if (++calls === 2) throw new Error("Connection Failure") })
  await h.supervisor.connect()
  h.supervisor.markOpen(h.sockets[0].generation)
  h.supervisor.scheduleReconnect(h.sockets[0].generation, "conexão fechada")
  await h.advance(3_000)          // 2ª chamada rejeita
  assert.equal(calls, 2)
  assert.equal(h.sockets.length, 1)
  await h.advance(6_000)          // reagendada com espera maior
  assert.equal(calls, 3)
  assert.equal(h.sockets.length, 2, "reconectou depois da rejeição")
  assert.deepEqual(h.gaveUp, [])
})

test("4) sessão expirada/deslogada: apaga as credenciais e pede novo pareamento; esperar o QR não conta como falha", async () => {
  const removed = mock.method(sessionDb, "removeAsync", async () => 3)
  const close = (statusCode: number, message = "x") => connectionClose({ lastDisconnect: { error: new Boom(message, { statusCode }), date: new Date() } })

  assert.equal(await close(DisconnectReason.loggedOut), "relogin")
  assert.equal(removed.mock.callCount(), 1, "credenciais apagadas")
  assert.equal(await close(405), "relogin")
  assert.equal(await close(DisconnectReason.connectionLost), "reconnect")
  assert.equal(await close(DisconnectReason.restartRequired), "reconnect")
  assert.equal(await close(500, "admin_command"), "stop", "desligar por comando não reconecta")
  assert.equal(await close(500, "fatal_error"), "fatal")

  removed.mock.mockImplementation(async () => { throw new Error("disco cheio") })
  assert.equal(await close(DisconnectReason.loggedOut), "reconnect", "erro ao tratar a queda não deixa o bot parado para sempre")

  // Esperando o usuário ler o QR: os timeouts do QR (408) não acumulam falhas nem derrubam o processo
  const h = harness(undefined, { maxConsecutiveFailures: 2 })
  await h.supervisor.connect()
  for (let i = 0; i < 6; i++) {
    const gen = h.sockets.at(-1)!.generation
    h.supervisor.markAwaitingUser(gen)
    h.supervisor.scheduleReconnect(gen, "QR expirou")
    await h.advance(3_000)
  }
  assert.equal(h.sockets.length, 7)
  assert.deepEqual(h.gaveUp, [], "esperar o pareamento nunca desiste")
})

test("5) falhas seguidas: espera cresce até 60 s, e depois do limite desiste uma única vez (sem ciclo infinito)", async () => {
  const h = harness(async () => { throw new Error("offline") }, { maxConsecutiveFailures: 8 })
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(n => h.supervisor.nextDelay(n)), [3_000, 6_000, 12_000, 24_000, 48_000, 60_000, 60_000, 60_000])

  await h.supervisor.connect()
  for (let i = 0; i < 20; i++) await h.advance(60_000)
  assert.equal(h.gaveUp.length, 1, "desistiu exatamente uma vez")
  assert.match(h.gaveUp[0], /8 falhas de conexão seguidas/)
  assert.equal(h.supervisor.state, "stopped")

  const before = h.logs.length
  await h.advance(10 * 60_000)
  assert.equal(h.logs.length, before, "depois de desistir, nada mais é agendado")

  // Variação aleatória de ±20% (evita que vários bots reconectem no mesmo instante)
  const jitter = harness(undefined, { random: () => 0 })
  assert.equal(jitter.supervisor.nextDelay(1), 2_400)
})

test("6) recuperação sem duplicar conexões nem ouvintes de eventos", async () => {
  const h = harness()
  await h.supervisor.connect()
  const gen1 = h.sockets[0].generation

  // Vários avisos de queda para a mesma conexão viram um só agendamento
  h.supervisor.scheduleReconnect(gen1, "a")
  h.supervisor.scheduleReconnect(gen1, "b")
  h.supervisor.scheduleReconnect(gen1, "c")
  await h.advance(60_000)
  assert.equal(h.sockets.length, 2, "uma única conexão nova")
  assert.equal(h.supervisor.consecutiveFailures, 1)

  // Eventos atrasados da conexão antiga são ignorados
  assert.equal(h.supervisor.isCurrent(gen1), false)
  h.supervisor.scheduleReconnect(gen1, "evento atrasado")
  await h.advance(60_000)
  assert.equal(h.sockets.length, 2, "evento de conexão antiga não cria outra")

  // Em cada momento, só a conexão mais nova está ativa
  assert.deepEqual(h.sockets.map(s => !s.ended && !s.unsubscribed), [false, true])

  // Uma conexão que termina de iniciar depois de um stop() é descartada (sem conexão órfã)
  let release!: () => void
  const slow = harness(() => new Promise<void>(r => { release = r }))
  const pending = slow.supervisor.connect()
  slow.supervisor.stop()
  release()
  await pending
  assert.ok(slow.sockets[0].ended && slow.sockets[0].unsubscribed, "conexão órfã encerrada")
  assert.equal(slow.supervisor.state, "stopped")
})

test("watchdog: tentativa travada (sem abrir, cair ou dar erro) faz desistir; espera do usuário e de agendamento não", async () => {
  const stuck = harness(() => new Promise<void>(() => { }), { stuckTimeoutMs: 5 * 60_000, watchdogIntervalMs: 60_000 })
  stuck.supervisor.startWatchdog()
  void stuck.supervisor.connect()
  await stuck.advance(5 * 60_000)
  assert.deepEqual(stuck.gaveUp, [])
  await stuck.advance(60_000)
  assert.equal(stuck.gaveUp.length, 1)
  assert.match(stuck.gaveUp[0], /travada/)

  const waiting = harness(undefined, { stuckTimeoutMs: 60_000, watchdogIntervalMs: 10_000 })
  waiting.supervisor.startWatchdog()
  await waiting.supervisor.connect()
  waiting.supervisor.markAwaitingUser(waiting.sockets[0].generation)
  await waiting.advance(30 * 60_000)
  assert.deepEqual(waiting.gaveUp, [], "esperando o QR por 30 min não é travamento")
  waiting.supervisor.stop()
})

test("Node: uma Promise rejeitada sem tratamento encerra o processo com código 1 (por isso nada pode ficar solto)", () => {
  const result = spawnSync(process.execPath, ["-e", "Promise.reject(new Error('sem catch')); setTimeout(() => {}, 1000)"], { encoding: "utf8" })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /sem catch/)
})
