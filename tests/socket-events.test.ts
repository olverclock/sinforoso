/**
 * Eventos do socket do Baileys (antes um único callback com complexidade 34, sem nenhum teste).
 * Cobre cada caminho do comportamento original: QR/pareamento, abertura, fechamento, inicialização,
 * mensagens e eventos de grupo (com fila antes de o bot ficar pronto) e isolamento de falhas.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import NodeCache from "node-cache"
import type { WASocket } from "baileys"
import { createSocketEventProcessor, SocketEventDeps, SocketSession, CloseAction } from "../src/helpers/socket.events.helper.js"
import type { ConnectionSupervisor } from "../src/helpers/connection.supervisor.helper.js"
import type { Bot } from "../src/interfaces/bot.interface.js"

type Calls = [string, ...unknown[]][]

/** Sessão com cliente, supervisor e dependências falsos que registram tudo em `calls`, na ordem. */
function setup(opts: { current?: boolean, answer?: string, closeAction?: CloseAction, fail?: Partial<Record<keyof SocketEventDeps | "waitForSocketOpen", Error>> } = {}) {
  const calls: Calls = []
  const rec = (name: string, result?: unknown) => async (...args: unknown[]) => {
    calls.push([name, ...args])
    const err = opts.fail?.[name as keyof SocketEventDeps]
    if (err) throw err
    return result
  }
  const client = {
    waitForSocketOpen: async () => { calls.push(["waitForSocketOpen"]); if (opts.fail?.waitForSocketOpen) throw opts.fail.waitForSocketOpen },
    end: (err?: Error) => calls.push(["client.end", err?.message]),
  } as unknown as WASocket
  const supervisor = {
    isCurrent: () => opts.current ?? true,
    markAwaitingUser: (g: number) => calls.push(["markAwaitingUser", g]),
    markOpen: (g: number) => calls.push(["markOpen", g]),
    stop: () => calls.push(["stop"]),
    giveUp: (r: string) => calls.push(["giveUp", r]),
    scheduleReconnect: (g: number, r: string) => calls.push(["scheduleReconnect", g, r]),
  } as unknown as ConnectionSupervisor
  const bot = { name: "Bot" } as Bot
  const deps: SocketEventDeps = {
    getBot: () => { if (opts.fail?.getBot) throw opts.fail.getBot; return bot },
    askQuestion: rec("askQuestion", opts.answer ?? "1") as SocketEventDeps["askQuestion"],
    connectionQr: rec("connectionQr"),
    connectionPairingCode: rec("connectionPairingCode"),
    connectionClose: rec("connectionClose", opts.closeAction ?? "reconnect") as SocketEventDeps["connectionClose"],
    connectionOpen: rec("connectionOpen"),
    syncGroupsOnStart: rec("syncGroupsOnStart"),
    startFreeGamesMonitor: rec("startFreeGamesMonitor"),
    executeEventQueue: rec("executeEventQueue"),
    queueEvent: rec("queueEvent"),
    messageReceived: rec("messageReceived"),
    groupParticipantsUpdated: rec("groupParticipantsUpdated"),
    addedOnGroup: rec("addedOnGroup"),
    partialGroupUpdate: rec("partialGroupUpdate"),
    log: (...args: unknown[]) => calls.push(["log", args.map(String).join(" ")]),
  }
  const session: SocketSession = {
    client, generation: 7, supervisor, login: { connectionType: null },
    saveCreds: rec("saveCreds") as () => Promise<void>,
    eventsCache: new NodeCache(), messagesCache: new NodeCache(), isBotReady: false,
  }
  const process = createSocketEventProcessor(session, deps)
  const names = () => calls.map(c => c[0])
  return { process, session, calls, names, bot }
}

test("eventos de uma conexão antiga são ignorados", async () => {
  const s = setup({ current: false })
  await s.process({ "creds.update": {}, "connection.update": { connection: "open" } })
  assert.deepEqual(s.calls, [])
})

test("falha ao ler os dados do bot: registra e não trata nada", async () => {
  const s = setup({ fail: { getBot: new Error("bot.json corrompido") } })
  await s.process({ "creds.update": {} })
  assert.deepEqual(s.names(), ["log"])
  assert.match(String(s.calls[0][1]), /Erro crítico no loop de eventos/)
})

test("QR code: pergunta o método só na 1ª vez; QR (1) mostra o código a cada novo QR", async () => {
  const s = setup({ answer: "1" })
  await s.process({ "connection.update": { qr: "QR-A" } })
  assert.deepEqual(s.names(), ["markAwaitingUser", "log", "askQuestion", "connectionQr"])
  assert.deepEqual(s.calls[3], ["connectionQr", "QR-A"])
  assert.equal(s.session.login.connectionType, "1")

  s.calls.length = 0
  await s.process({ "connection.update": { qr: "QR-B" } })
  assert.deepEqual(s.calls, [["markAwaitingUser", 7], ["connectionQr", "QR-B"]], "não pergunta de novo")
})

test("código de pareamento (2): pede o número uma vez, não mostra QR; falha no pareamento limpa a escolha e reconecta", async () => {
  const s = setup({ answer: "2" })
  await s.process({ "connection.update": { qr: "QR-A" } })
  assert.deepEqual(s.names(), ["markAwaitingUser", "log", "askQuestion", "connectionPairingCode"])
  s.calls.length = 0
  await s.process({ "connection.update": { qr: "QR-B" } })
  assert.deepEqual(s.names(), ["markAwaitingUser"], "com pareamento por código, novos QR não são mostrados")

  const f = setup({ answer: "2", fail: { connectionPairingCode: new Error("número inválido") } })
  await f.process({ "connection.update": { qr: "QR-A" } })
  await new Promise(r => setImmediate(r))
  assert.equal(f.session.login.connectionType, null, "vai perguntar de novo")
  assert.deepEqual(f.calls.at(-1), ["client.end", "pairing_failed"])
})

test("conectando e aberto: só registra; aberto avisa o supervisor (zera as falhas)", async () => {
  const s = setup()
  await s.process({ "connection.update": { connection: "connecting" } })
  await s.process({ "connection.update": { connection: "open" } })
  assert.deepEqual(s.names(), ["log", "markOpen", "log"])
})

test("conexão fechada: cada ação do connectionClose leva ao comando certo do supervisor", async () => {
  const expected: Record<CloseAction, unknown[]> = {
    stop: ["stop"],
    fatal: ["giveUp", "falha grave no código"],
    reconnect: ["scheduleReconnect", 7, "conexão fechada"],
    relogin: ["scheduleReconnect", 7, "sessão encerrada, é preciso parear de novo"],
  }
  for (const action of Object.keys(expected) as CloseAction[]) {
    const s = setup({ closeAction: action })
    s.session.login.connectionType = "2"
    await s.process({ "connection.update": { connection: "close" } })
    assert.deepEqual(s.calls.at(-1), expected[action], action)
    assert.equal(s.session.login.connectionType, action === "relogin" ? null : "2", `${action}: escolha de login`)
  }
})

test("notificações pendentes: inicializa uma única vez, na ordem; falha na inicialização encerra a conexão para reconectar", async () => {
  const s = setup()
  await s.process({ "connection.update": { receivedPendingNotifications: true } })
  assert.deepEqual(s.names(), ["waitForSocketOpen", "connectionOpen", "syncGroupsOnStart", "startFreeGamesMonitor", "executeEventQueue", "log"])
  assert.equal(s.session.isBotReady, true)
  s.calls.length = 0
  await s.process({ "connection.update": { receivedPendingNotifications: true } })
  assert.deepEqual(s.calls, [], "não inicializa duas vezes")

  const f = setup({ fail: { syncGroupsOnStart: new Error("timeout") } })
  await f.process({ "connection.update": { receivedPendingNotifications: true } })
  assert.equal(f.session.isBotReady, false)
  assert.deepEqual(f.calls.at(-1), ["client.end", "startup_failed"])
})

test("mensagens só são tratadas depois que o bot está pronto", async () => {
  const s = setup()
  const upsert = { messages: [], type: "notify" as const }
  await s.process({ "messages.upsert": upsert })
  assert.deepEqual(s.calls, [], "antes de pronto: ignoradas (como antes)")
  s.session.isBotReady = true
  await s.process({ "messages.upsert": upsert })
  assert.deepEqual(s.calls, [["messageReceived", s.session.client, upsert, s.bot, s.session.messagesCache]])
})

test("eventos de grupo: vão para a fila antes de o bot ficar pronto e para os tratadores depois", async () => {
  const s = setup()
  const participants = { id: "g@g.us", author: "a@s.whatsapp.net", action: "add" as const, participants: [{ id: "5511999990001:12@s.whatsapp.net" }, "5511999990002@s.whatsapp.net"] }
  const upsert = [{ id: "novo@g.us" }]
  await s.process({ "group-participants.update": participants as never, "groups.upsert": upsert as never, "groups.update": [{ id: "g@g.us", subject: "Novo nome" }] })
  assert.deepEqual(s.calls.map(c => [c[0], c[2]]), [["queueEvent", "group-participants.update"], ["queueEvent", "groups.upsert"], ["queueEvent", "groups.update"]])
  const queued = s.calls[0][3] as { participants: string[] }
  assert.deepEqual(queued.participants, ["5511999990001@s.whatsapp.net", "5511999990002@s.whatsapp.net"], "JIDs normalizados")

  s.calls.length = 0
  s.session.isBotReady = true
  await s.process({ "group-participants.update": participants as never, "groups.upsert": upsert as never, "groups.update": [{ id: "g@g.us", subject: "Novo nome" }] })
  assert.deepEqual(s.names(), ["groupParticipantsUpdated", "addedOnGroup", "partialGroupUpdate"])

  s.calls.length = 0
  await s.process({ "groups.update": [{ id: "a@g.us" }, { id: "b@g.us" }] })
  await s.process({ "groups.update": [{ id: "a@g.us", participants: [] }] as never })
  assert.deepEqual(s.calls, [], "várias atualizações ou com participantes não são parciais")
})

test("falha num tratador é registrada com o rótulo dele e não impede os outros", async () => {
  const s = setup({ fail: { connectionClose: new Error("x"), groupParticipantsUpdated: new Error("y") } })
  s.session.isBotReady = true
  await s.process({
    "connection.update": { connection: "close" }, "creds.update": {},
    "group-participants.update": { id: "g@g.us", author: "a", action: "add", participants: [] } as never,
    "groups.upsert": [{ id: "novo@g.us" }] as never,
  })
  const logs = s.calls.filter(c => c[0] === "log").map(c => String(c[1]))
  assert.match(logs[0], /Erro crítico no loop de eventos/)
  assert.match(logs[1], /Erro ao atualizar participantes/)
  assert.ok(s.names().includes("saveCreds"), "as credenciais foram salvas mesmo com a falha anterior")
  assert.ok(s.names().includes("addedOnGroup"), "o evento seguinte foi tratado")
})

test("rede de segurança: sem o aviso de pendências entregues, o bot entra no ar após o tempo limite (uma vez só)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const s = setup()
  await s.process({ "connection.update": { connection: "open" } })
  assert.equal(s.session.isBotReady, false)
  t.mock.timers.tick(179_000)
  assert.equal(s.session.isBotReady, false, "ainda esperando")
  t.mock.timers.tick(1_000)
  for (let i = 0; i < 10; i++) await Promise.resolve()
  assert.equal(s.session.isBotReady, true, "entrou no ar pela rede de segurança")
  assert.ok(s.calls.some(c => c[0] === "log" && /iniciando o bot assim mesmo/.test(String(c[1]))))
  const inits = s.names().filter(n => n === "connectionOpen").length
  await s.process({ "connection.update": { receivedPendingNotifications: true } })
  assert.equal(s.names().filter(n => n === "connectionOpen").length, inits, "o aviso atrasado não inicializa de novo")
})

test("rede de segurança: o aviso normal cancela o temporizador; queda também cancela", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const s = setup()
  await s.process({ "connection.update": { connection: "open" } })
  await s.process({ "connection.update": { receivedPendingNotifications: true } })
  assert.equal(s.names().filter(n => n === "connectionOpen").length, 1)
  t.mock.timers.tick(200_000)
  for (let i = 0; i < 10; i++) await Promise.resolve()
  assert.equal(s.names().filter(n => n === "connectionOpen").length, 1, "não inicializou de novo")

  const c = setup()
  await c.process({ "connection.update": { connection: "open" } })
  await c.process({ "connection.update": { connection: "close" } })
  t.mock.timers.tick(200_000)
  for (let i = 0; i < 10; i++) await Promise.resolve()
  assert.equal(c.session.isBotReady, false, "conexão caiu: não inicializa")
})

test("inicialização simultânea (aviso e rede de segurança juntos) roda uma vez só", async () => {
  const s = setup()
  await Promise.all([
    s.process({ "connection.update": { receivedPendingNotifications: true } }),
    s.process({ "connection.update": { receivedPendingNotifications: true } }),
  ])
  assert.equal(s.names().filter(n => n === "connectionOpen").length, 1)
})
