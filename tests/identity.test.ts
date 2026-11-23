/**
 * Identidades do Baileys 7: membros dos grupos chegam como LID (@lid) e o próprio bot (e mensagens
 * mandadas pelo WhatsApp do bot) chegam pelo número (@s.whatsapp.net). Reproduz o caso real em que
 * o bot dizia "Apenas administradores do grupo" mesmo para o dono, no WhatsApp do bot, sendo admin.
 */
import { test, before, afterEach, mock } from "node:test"
import assert from "node:assert/strict"
import NodeCache from "node-cache"
import { fakeClient, setupBot, currentBot, fastForward, HOST } from "./helpers/harness.js"
import { GroupController } from "../src/controllers/group.controller.js"
import { ParticipantService, db as participantsDb } from "../src/services/participant.service.js"
import { messageReceived } from "../src/events/message-received.event.js"
import { groupParticipantsUpdated } from "../src/events/group-participants-updated.event.js"
import * as waUtil from "../src/utils/whatsapp.util.js"
import { antifakeAllows, clearIdentities, idsOf, inList, linkIds, phoneOf, sameUser } from "../src/utils/identity.util.js"

const G = "120363100000000999@g.us"
const BOT_LID = "111111111111111@lid"
const MEMBER_LID = "222222222222222@lid", MEMBER_PN = "5586999990001@s.whatsapp.net"
const ADMIN_LID = "333333333333333@lid", ADMIN_PN = "5586999990002@s.whatsapp.net"

const metadata = () => ({
  id: G, subject: "Grupo LID", desc: "", owner: ADMIN_LID, announce: false,
  participants: [
    { id: BOT_LID, phoneNumber: HOST, admin: "admin" },
    { id: ADMIN_LID, phoneNumber: ADMIN_PN, admin: "admin" },
    { id: MEMBER_LID, phoneNumber: MEMBER_PN, admin: null },
  ],
})

before(async () => {
  await setupBot()
  await new GroupController().registerGroup(metadata() as never)
})
afterEach(() => mock.restoreAll())

const raw = (text: string, key: Record<string, unknown>) => ({
  key: { remoteJid: G, id: `ID-${Math.random()}`, ...key },
  messageTimestamp: Math.floor(Date.now() / 1000), pushName: "Dono", message: { conversation: text },
})

test("identidades: LID e número de telefone viram a mesma pessoa; anti-fake só age com o número real", () => {
  clearIdentities()
  linkIds(MEMBER_LID, MEMBER_PN)
  assert.deepEqual(idsOf(MEMBER_PN), [MEMBER_PN, MEMBER_LID])
  assert.equal(sameUser("222222222222222:7@lid", MEMBER_PN), true, "ignora o número do aparelho")
  assert.equal(phoneOf(MEMBER_LID), "5586999990001")
  assert.equal(inList(["5586999990001@s.whatsapp.net"], MEMBER_LID), true, "lista negra cadastrada pelo número pega o LID")
  assert.equal(antifakeAllows(MEMBER_LID, ["55"], []), true)
  assert.equal(antifakeAllows(MEMBER_LID, ["1"], []), false)
  assert.equal(antifakeAllows(MEMBER_LID, ["1"], ["5586999990001"]), true, "número liberado")
  assert.equal(antifakeAllows("999999999999999@lid", ["55"], []), null, "só o LID: país desconhecido, ninguém é removido")
  linkIds("x@g.us", MEMBER_LID)
  assert.deepEqual(idsOf(MEMBER_LID).sort(), [MEMBER_LID, MEMBER_PN].sort(), "grupo nunca vira identidade")
})

test("dono no WhatsApp do PRÓPRIO bot, num grupo com membros em LID: comando de admin funciona", async () => {
  // Como na produção: o registro do grupo e a conexão ensinam as ligações
  clearIdentities()
  await new GroupController().syncGroups([metadata() as never])
  const fake = fakeClient({ user: { id: HOST.replace("@", ":12@"), lid: BOT_LID } })
  waUtil.getHostNumber(fake.client)

  assert.equal(await new GroupController().isParticipantAdmin(G, HOST), true, "o bot é admin (guardado como LID)")
  await fastForward(() => messageReceived(fake.client, { messages: [raw("!jogosgratis", { fromMe: true, participant: BOT_LID })] as never, type: "notify" }, currentBot(), new NodeCache()))
  const out = fake.output()
  assert.doesNotMatch(out, /Apenas \*administradores do grupo\*/)
  assert.match(out, /JOGOS GRÁTIS\* (ativado|desativado)/)
})

test("admin do grupo escrevendo com o número (participant em PN) é reconhecido; membro comum não", async () => {
  clearIdentities()
  await new GroupController().syncGroups([metadata() as never])
  const fake = fakeClient()
  await fastForward(() => messageReceived(fake.client, { messages: [raw("!regrasauto", { fromMe: false, participant: ADMIN_PN, participantAlt: ADMIN_LID })] as never, type: "notify" }, currentBot(), new NodeCache()))
  assert.doesNotMatch(fake.output(), /Apenas \*administradores do grupo\*/)
  fake.reset()
  await fastForward(() => messageReceived(fake.client, { messages: [raw("!regrasauto", { fromMe: false, participant: MEMBER_LID })] as never, type: "notify" }, currentBot(), new NodeCache()))
  assert.match(fake.output(), /Apenas \*administradores do grupo\*/)
})

test("atividade de quem escreve pelo número soma no registro do LID (sem criar duplicado)", async () => {
  clearIdentities()
  await new GroupController().syncGroups([metadata() as never])
  const before = (await new ParticipantService().getParticipantFromGroup(G, MEMBER_LID))!.msgs
  await new ParticipantService().incrementParticipantActivity(G, MEMBER_PN, "conversation", false)
  assert.equal((await new ParticipantService().getParticipantFromGroup(G, MEMBER_PN))!.msgs, before + 1)
  assert.equal(await participantsDb.countAsync({ group_id: G, user_id: MEMBER_PN }), 0, "não cria linha com o número")
})

test("anti-fake não remove quem entrou só com LID; remove número de fora com número conhecido", async () => {
  clearIdentities()
  await new GroupController().syncGroups([metadata() as never])
  await new GroupController().setAntiFake(G, true)
  const NEW_LID = "444444444444444@lid", FOREIGN_LID = "555555555555555@lid"
  const fake = fakeClient({
    user: { id: HOST, lid: BOT_LID },
    groupMetadata: async () => ({ ...metadata(), participants: [...metadata().participants, { id: FOREIGN_LID, phoneNumber: "14155550123@s.whatsapp.net", admin: null }] }),
  })
  waUtil.getHostNumber(fake.client)

  await fastForward(() => groupParticipantsUpdated(fake.client, { id: G, author: ADMIN_LID, participants: [NEW_LID], action: "add" }, currentBot()))
  assert.equal(fake.calls.some(c => c.method === "groupParticipantsUpdate"), false, "LID sem número conhecido não é removido")

  await fastForward(() => groupParticipantsUpdated(fake.client, { id: G, author: ADMIN_LID, participants: [FOREIGN_LID], action: "add" }, currentBot()))
  const removal = fake.calls.find(c => c.method === "groupParticipantsUpdate")
  assert.deepEqual(removal?.args, [G, [FOREIGN_LID], "remove"], "número +1 (fora do Brasil) é removido")
  await new GroupController().setAntiFake(G, false)
})

// ———————————————— <status> sem ack derrubava a conexão (Baileys rc14) ————————————————
test("<status> do WhatsApp é confirmado (ack class=status), como no PR oficial do Baileys", async () => {
  const { EventEmitter } = await import("node:events")
  const { buildAckStanza } = await import("baileys")
  const ws = new EventEmitter()
  const acks: unknown[] = []
  const client = { ws, sendMessageAck: async (node: unknown) => { acks.push(node) } }
  assert.equal(waUtil.ackStatusStanzas(client as never), true)
  const node = { tag: "status", attrs: { id: "3A2069ED", from: "5511999999999@s.whatsapp.net", type: "media", offline: "0" } }
  ws.emit("CB:status", node)
  await new Promise(r => setImmediate(r))
  assert.deepEqual(acks, [node], "o próprio nó é confirmado")
  // O ack que o Baileys monta para esse nó é exatamente o esperado pelo servidor
  assert.deepEqual((buildAckStanza as (n: unknown, e?: number, me?: string) => { attrs: unknown })(node, undefined, HOST).attrs, { id: "3A2069ED", to: "5511999999999@s.whatsapp.net", class: "status", type: "media" })
  assert.equal(waUtil.ackStatusStanzas(client as never), false, "não registra duas vezes (nem quando o Baileys passar a tratar sozinho)")
})

test("<status> com o Baileys REAL: o socket confirma com o ack oficial e só uma vez (também os offline)", async () => {
  const { makeWASocket, initAuthCreds, makeCacheableSignalKeyStore } = await import("baileys")
  const pino = (await import("pino")).default
  const lines: { msg?: string, sent?: Record<string, string> }[] = []
  const logger = pino({ level: "debug" }, { write: (line: string) => { lines.push(JSON.parse(line)) } })
  const creds = initAuthCreds()
  creds.me = { id: "5511900000000:1@s.whatsapp.net", name: "Bot" }
  const keys = { get: async () => ({}), set: async () => undefined }
  const sock = makeWASocket({ auth: { creds, keys: makeCacheableSignalKeyStore(keys as never, logger) }, logger, waWebSocketUrl: "ws://127.0.0.1:9", printQRInTerminal: false } as never)
  try {
    assert.equal(waUtil.ackStatusStanzas(sock), true, "o Baileys rc14 não trata <status>: a correção entra")
    assert.equal(waUtil.ackStatusStanzas(sock), false, "não registra de novo")
    sock.ws.emit("CB:status", { tag: "status", attrs: { id: "A5E2CA57", from: "5511988887777@s.whatsapp.net", type: "media" } })
    sock.ws.emit("CB:status", { tag: "status", attrs: { id: "B6F3DB68", from: "5511988887777@s.whatsapp.net", type: "media", offline: "1" } })
    await new Promise(r => setTimeout(r, 100))
    const acks = lines.filter(l => l.msg === "sent ack").map(l => l.sent)
    assert.deepEqual(acks, [
      { id: "A5E2CA57", to: "5511988887777@s.whatsapp.net", class: "status", type: "media" },
      { id: "B6F3DB68", to: "5511988887777@s.whatsapp.net", class: "status", type: "media" },
    ], "mesmo formato do ack exigido pelo servidor (o do stream:error)")
  } finally {
    await sock.end(new Error("teste concluído")).catch(() => undefined)
  }
})

test("pedido <digest> do servidor (o que quebrava o Baileys com 'reading attrs') vira verificação oficial das chaves", async () => {
  const { makeWASocket, initAuthCreds, makeCacheableSignalKeyStore } = await import("baileys")
  const pino = (await import("pino")).default
  const logger = pino({ level: "silent" })
  const creds = initAuthCreds()
  creds.me = { id: "5511900000000:1@s.whatsapp.net", name: "Bot" }
  const keys = { get: async () => ({}), set: async () => undefined }
  const sock = makeWASocket({ auth: { creds, keys: makeCacheableSignalKeyStore(keys as never, logger) }, logger, waWebSocketUrl: "ws://127.0.0.1:9" } as never)
  let calls = 0
  ;(sock as unknown as { digestKeyBundle: () => Promise<void> }).digestKeyBundle = async () => { calls++ }
  let clock = 1_000_000
  try {
    waUtil.handleServerDigestRequests(sock, () => clock)
    const digest = { tag: "notification", attrs: { from: "@s.whatsapp.net", type: "encrypt", id: "1" }, content: [{ tag: "digest", attrs: {} }] }
    sock.ws.emit("CB:notification,type:encrypt", digest)
    assert.equal(calls, 1, "o pedido de verificação é atendido com o método oficial do Baileys")
    sock.ws.emit("CB:notification,type:encrypt", digest)
    assert.equal(calls, 1, "pedidos repetidos em menos de 1 minuto viram um só")
    clock += 61_000
    sock.ws.emit("CB:notification,type:encrypt", digest)
    assert.equal(calls, 2)
    clock += 61_000
    sock.ws.emit("CB:notification,type:encrypt", { ...digest, content: [{ tag: "count", attrs: { value: "3" } }] })
    sock.ws.emit("CB:notification,type:encrypt", { ...digest, attrs: { ...digest.attrs, from: "5511988887777@s.whatsapp.net" } })
    assert.equal(calls, 2, "aviso de poucas pre-keys (<count>) e notificações de contatos continuam com o Baileys")
  } finally {
    await sock.end(new Error("teste concluído")).catch(() => undefined)
  }
})

test("verificação de chaves: 404 do servidor reenvia o lote completo (WAWebDigestKeyJob); outros erros não", async () => {
  const { Boom } = await import("@hapi/boom")
  const { INITIAL_PREKEY_COUNT } = await import("baileys")
  const uploads: (number | undefined)[] = []
  const make = (fail?: unknown) => ({
    digestKeyBundle: async () => { if (fail) throw fail },
    uploadPreKeys: async (count?: number) => { uploads.push(count) },
  })
  assert.equal(await waUtil.answerDigestRequest(make()), "ok")
  assert.deepEqual(uploads, [])
  // Formato real do erro de IQ do Baileys: assertNodeErrorFree → new Boom(text, { data: code })
  assert.equal(await waUtil.answerDigestRequest(make(new Boom("item-not-found", { data: 404 }))), "reuploaded")
  assert.deepEqual(uploads, [INITIAL_PREKEY_COUNT])
  assert.equal(INITIAL_PREKEY_COUNT, 812)
  await assert.rejects(waUtil.answerDigestRequest(make(new Boom("Timed Out", { statusCode: 408 }))), /Timed Out/, "queda de rede não dispara reenvio")
  assert.equal(uploads.length, 1)
})

test("log: o erro do Baileys com o <digest> real some (já tratado) e o bot registra que atendeu; outros erros continuam", async () => {
  const { makeWASocket, initAuthCreds, makeCacheableSignalKeyStore } = await import("baileys")
  const pino = (await import("pino")).default
  const { baileysLogHooks, isHandledBaileysError } = await import("../src/utils/console-filter.util.js")
  const lines: { msg?: string, level?: number }[] = []
  const logger = pino({ level: "debug", hooks: baileysLogHooks as never }, { write: (l: string) => { lines.push(JSON.parse(l)) } })
  const creds = initAuthCreds()
  creds.me = { id: "5511900000000:1@s.whatsapp.net", name: "Bot" }
  const keys = { get: async () => ({}), set: async () => undefined }
  const sock = makeWASocket({ auth: { creds, keys: makeCacheableSignalKeyStore(keys as never, logger) }, logger, waWebSocketUrl: "ws://127.0.0.1:9" } as never)
  let digests = 0
  ;(sock as unknown as { digestKeyBundle: () => Promise<void> }).digestKeyBundle = async () => { digests++ }
  const logs: string[] = []
  const log = mock.method(console, "log", (...a: unknown[]) => { logs.push(a.join(" ")) })
  try {
    waUtil.handleServerDigestRequests(sock)
    const node = { tag: "notification", attrs: { from: "@s.whatsapp.net", type: "encrypt", id: "77", t: "1" }, content: [{ tag: "digest", attrs: {} }] }
    // Caminho real: a frame chega como no socket (CB:notification + CB:notification,type:encrypt)
    sock.ws.emit("CB:notification", node)
    sock.ws.emit("CB:notification,type:encrypt", node)
    await new Promise(r => setTimeout(r, 150))
    assert.equal(digests, 1, "o bot atendeu o pedido")
    assert.ok(logs.some(l => /conferir as chaves de criptografia: conferidas/.test(l)), "linha clara de confirmação")
    assert.ok(!lines.some(l => l.msg === "unexpected error in 'handling notification'"), "o erro já tratado do Baileys não aparece")
    assert.ok(lines.some(l => l.msg === "sent ack"), "a notificação continua confirmada pelo Baileys")
  } finally {
    log.mock.restore()
    await sock.end(new Error("teste concluído")).catch(() => undefined)
  }
  // Outros erros do Baileys continuam aparecendo
  const other = new TypeError("Cannot read properties of undefined (reading 'attrs')")
  assert.equal(isHandledBaileysError([{ err: other }, "unexpected error in 'handling notification'"]), false, "mesma mensagem em outra função não é escondida")
  assert.equal(isHandledBaileysError([{ err: new Error("x") }, "unexpected error in 'handling receipt'"]), false)
})
