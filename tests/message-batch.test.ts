/**
 * Lote com várias mensagens (como o Baileys entrega depois de uma reconexão): todas são tratadas,
 * na ordem; mensagens antigas demais não disparam comandos.
 */
import { test, before } from "node:test"
import assert from "node:assert/strict"
import NodeCache from "node-cache"
import { fakeClient, setupBot, user, currentBot, fastForward } from "./helpers/harness.js"
import { messageReceived, MAX_MESSAGE_AGE_MS } from "../src/events/message-received.event.js"

const P1 = user(951), P2 = user(952)
before(async () => { await setupBot() })

let n = 0
const raw = (from: string, text: string, ageMs = 0) => ({
  key: { remoteJid: from, id: `BATCH-${++n}`, fromMe: false },
  messageTimestamp: Math.floor((Date.now() - ageMs) / 1000),
  pushName: "Teste",
  message: { conversation: text },
})

test("todas as mensagens do lote são tratadas (antes só a primeira)", async () => {
  const f = fakeClient()
  await fastForward(() => messageReceived(f.client, { messages: [raw(P1, "oi"), raw(P1, "!ping"), raw(P2, "!ping")] as never, type: "notify" }, currentBot(), new NodeCache()))
  const pings = f.sent.filter(s => /Pong|ping|Latência|ms/i.test(String(s.content.text ?? "")))
  assert.ok(pings.some(s => s.chatId === P1), "respondeu o comando do 1º usuário (2ª mensagem do lote)")
  assert.ok(pings.some(s => s.chatId === P2), "respondeu o comando do 2º usuário (3ª mensagem do lote)")
})

test("comando antigo demais (enviado com o bot desligado) é ignorado; recente é respondido", async () => {
  const f = fakeClient()
  const P3 = user(953)
  await fastForward(() => messageReceived(f.client, { messages: [raw(P3, "!ping", MAX_MESSAGE_AGE_MS + 60_000)] as never, type: "notify" }, currentBot(), new NodeCache()))
  assert.equal(f.sent.filter(s => s.chatId === P3).length, 0, "antigo: nada enviado")
  await fastForward(() => messageReceived(f.client, { messages: [raw(P3, "!ping", 2 * 60_000)] as never, type: "notify" }, currentBot(), new NodeCache()))
  assert.ok(f.sent.some(s => s.chatId === P3), "2 minutos atrás: respondeu")
})

test("mensagem com defeito no meio do lote não impede as seguintes", async () => {
  const f = fakeClient()
  const broken = { key: { remoteJid: P1, id: "QUEBRADA", fromMe: false }, messageTimestamp: Math.floor(Date.now() / 1000), message: null }
  await fastForward(() => messageReceived(f.client, { messages: [broken, raw(P2, "!ping")] as never, type: "notify" }, currentBot(), new NodeCache()))
  assert.ok(f.sent.some(s => s.chatId === P2))
})
