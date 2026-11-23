/**
 * Recursos novos: lembretes e agendamentos, enquetes, regras, verificação de novos membros,
 * filtro de golpes, sorteio de membros, amigo secreto, consultas brasileiras (CEP, CNPJ,
 * feriados, loterias, rastreio) e backup automático. APIs simuladas; fluxo real do bot.
 */
import { test, before, afterEach, mock } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import zlib from "node:zlib"
import axios from "axios"
import moment from "moment-timezone"
import { fakeClient, setupBot, setupGroup, send, user, fastForward, currentBot, HOST } from "./helpers/harness.js"
import { parseSchedule, parseClock, parseDuration, nextOccurrence, describeWhen } from "../src/utils/reminder.util.js"
import { ReminderService, reminderMessage, db as remindersDb } from "../src/services/reminder.service.js"
import { CaptchaService, readAnswer, makeQuestion, db as captchaDb } from "../src/services/captcha.service.js"
import { drawPairs, SecretSantaService } from "../src/services/secret-santa.service.js"
import { BackupService, tarHeader, isBackupDue, lastScheduledSlot, listEntries } from "../src/services/backup.service.js"
import { ChatFeaturesService } from "../src/services/chat-features.service.js"
import { scamScore } from "../src/utils/antiscam.util.js"
import * as br from "../src/utils/brasil.util.js"
import { parsePoll } from "../src/commands/utility.extra.functions.commands.js"
import { parseMemberDrawArgs } from "../src/commands/misc.functions.commands.js"
import { groupParticipantsUpdated } from "../src/events/group-participants-updated.event.js"
import { utilityMenu, groupAdminMenu, groupMenu, adminMenu, miscGroupMenu } from "../src/helpers/menu.builder.helper.js"

const G = "120363100000000888@g.us"
const ADMIN = user(881), MEMBER = user(882), OTHER = user(883), PV = user(884)
const TZ = "America/Sao_Paulo"
const at = (s: string) => moment.tz(s, "YYYY-MM-DD HH:mm", TZ).valueOf()
const features = new ChatFeaturesService()

before(async () => {
  await setupBot()
  await setupGroup(G, [{ id: ADMIN, admin: true }, { id: MEMBER }, { id: OTHER }])
})
afterEach(() => mock.restoreAll())

/** Espera um trabalho em segundo plano (guards do grupo) terminar. */
async function waitFor(check: () => boolean, ms = 3000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (check()) return
    await new Promise(r => setTimeout(r, 10))
  }
  assert.fail("condição não aconteceu a tempo")
}

const axiosError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, response: { status } })

// ———————————————— PARSER DE HORÁRIOS ————————————————
test("lembrete: entende os jeitos comuns de escrever horário em português", () => {
  const now = at("2026-11-18 15:00") // quarta-feira
  const cases: [string, string, string][] = [
    ["10m tomar água", "2026-11-18 15:10", "tomar água"],
    ["30 minutos pausa", "2026-11-18 15:30", "pausa"],
    ["em 2h reunião", "2026-11-18 17:00", "reunião"],
    ["daqui a 3 horas x", "2026-11-18 18:00", "x"],
    ["daqui 1h30 x", "2026-11-18 16:30", "x"],
    ["18h30 jantar", "2026-11-18 18:30", "jantar"],
    ["às 9h acordar", "2026-11-19 09:00", "acordar"],
    ["14h já passou hoje", "2026-11-19 14:00", "já passou hoje"],
    ["amanhã 9h reunião", "2026-11-19 09:00", "reunião"],
    ["amanha x", "2026-11-19 09:00", "x"],
    ["depois de amanhã 10h y", "2026-11-20 10:00", "y"],
    ["25/12 15h natal", "2026-12-25 15:00", "natal"],
    ["10/01 ano que vem", "2027-01-10 09:00", "ano que vem"],
    ["25/12/2026 15:00 z", "2026-12-25 15:00", "z"],
    ["segunda 9h a", "2026-11-23 09:00", "a"],
    ["quarta 14h semana que vem", "2026-11-25 14:00", "semana que vem"],
    ["quarta 16h hoje ainda", "2026-11-18 16:00", "hoje ainda"],
    ["sexta-feira 18h happy hour", "2026-11-20 18:00", "happy hour"],
    ["hoje 22h série", "2026-11-18 22:00", "série"],
    ["2h acordar", "2026-11-19 02:00", "acordar"],
    ["1h30m algo", "2026-11-18 16:30", "algo"],
  ]
  for (const [input, expected, text] of cases) {
    const r = parseSchedule(input, now)
    assert.equal(moment.tz(r.when, TZ).format("YYYY-MM-DD HH:mm"), expected, input)
    assert.equal(r.text, text, input)
    assert.equal(r.repeat, null, input)
  }
  const daily = parseSchedule("todo dia 8h remédio", now)
  assert.deepEqual(daily.repeat, { kind: "daily" })
  assert.equal(moment.tz(daily.when, TZ).format("YYYY-MM-DD HH:mm"), "2026-11-19 08:00")
  assert.deepEqual(parseSchedule("todos os dias 22:00 dormir", now).repeat, { kind: "daily" })
  const weekly = parseSchedule("toda segunda 9h reunião", now)
  assert.deepEqual(weekly.repeat, { kind: "weekly", weekday: 1 })
  assert.equal(describeWhen(weekly.when, weekly.repeat), "toda segunda às 09:00")

  assert.throws(() => parseSchedule("hoje 8h x", now), /já passou/)
  assert.throws(() => parseSchedule("blabla", now), /Não entendi/)
  assert.throws(() => parseSchedule("todo dia x", now), /horário da repetição/)
  assert.throws(() => parseSchedule("31/02 x", now), /Data inválida/)
  assert.throws(() => parseSchedule("18h", now), /Escreva o que devo lembrar/)
  assert.throws(() => parseSchedule("em 9999 dias x", now), /Tempo inválido/)
})

test("lembrete: peças do parser e próxima repetição", () => {
  assert.deepEqual(parseClock("18h30"), [18, 30])
  assert.deepEqual(parseClock("7:05"), [7, 5])
  assert.equal(parseClock("25h"), null)
  assert.equal(parseClock("18"), null, "número sozinho não é horário")
  assert.equal(parseDuration("2h"), null, "2h sem 'em' é horário")
  assert.equal(parseDuration("2h", true), 120)
  assert.equal(parseDuration("45min"), 45)
  assert.equal(parseDuration("2d"), 2880)
  // Repetição pula as ocorrências perdidas (bot desligado por dias) e cai no futuro
  const when = at("2026-11-10 08:00")
  assert.equal(moment.tz(nextOccurrence(when, { kind: "daily" }, at("2026-11-18 09:00"))!, TZ).format("YYYY-MM-DD HH:mm"), "2026-11-19 08:00")
  assert.equal(moment.tz(nextOccurrence(when, { kind: "weekly", weekday: 2 }, at("2026-11-18 09:00"))!, TZ).format("YYYY-MM-DD HH:mm"), "2026-11-24 08:00")
  assert.equal(nextOccurrence(when, null), null)
})

// ———————————————— LEMBRETES E AGENDAMENTOS ————————————————
test("lembrete: criar, listar, enviar no horário (com menção no grupo) e apagar", async () => {
  await remindersDb.removeAsync({}, { multi: true })
  const fake = fakeClient()
  await send(fake, { from: MEMBER, chat: G, text: "!lembrete em 10 minutos tirar o bolo" })
  assert.match(fake.output(), /Lembrete criado/)
  await send(fake, { from: PV, text: "!lembrete amanhã 9h ligar pro médico" })

  fake.reset()
  await send(fake, { from: MEMBER, chat: G, text: "!lembretes" })
  assert.match(fake.output(), /tirar o bolo/)
  assert.doesNotMatch(fake.output(), /médico/, "só os lembretes deste chat e desta pessoa")

  // Na hora: sai no grupo marcando quem criou, e é apagado
  fake.reset()
  const service = new ReminderService()
  const sent = await fastForward(() => service.sendDue(fake.client, Date.now() + 11 * 60_000))
  assert.equal(sent, 1)
  assert.equal(fake.sent[0].chatId, G)
  assert.match(String(fake.sent[0].content.text), /tirar o bolo/)
  assert.deepEqual(fake.sent[0].content.mentions, [MEMBER])
  assert.equal(await remindersDb.countAsync({ chat_id: G }), 0)

  // Remover pelo número da lista
  fake.reset()
  await send(fake, { from: PV, text: "!rmlembrete 1" })
  assert.match(fake.output(), /Apagado: _ligar pro médico_/)
  await send(fake, { from: PV, text: "!rmlembrete 5" })
  assert.match(fake.output(), /Número não encontrado/)
})

test("lembrete: atrasado (bot desligado/sem internet) sai com aviso; falha de envio tenta de novo depois", async () => {
  await remindersDb.removeAsync({}, { multi: true })
  const service = new ReminderService()
  const when = Date.now() - 60 * 60_000
  await service.add({ chat_id: PV, creator: PV, kind: "personal", text: "pagar conta", when, repeat: null })
  assert.match(reminderMessage({ chat_id: PV, creator: PV, kind: "personal", text: "x", when, repeat: null, created_at: 0 }), /bot estava desligado ou sem internet/)

  // Sem conexão: nada é perdido
  const offline = fakeClient({ sendMessage: async () => { throw new Error("Connection Closed") } })
  assert.equal(await fastForward(() => service.sendDue(offline.client)), 0)
  assert.equal(await remindersDb.countAsync({}), 1)

  // Voltou a internet: sai com o aviso de atraso
  const fake = fakeClient()
  assert.equal(await fastForward(() => service.sendDue(fake.client)), 1)
  assert.match(fake.output(), /pagar conta[\s\S]*Era para/)
  assert.equal(await remindersDb.countAsync({}), 0)
})

test("lembrete: repetição continua agendada depois de enviada", async () => {
  await remindersDb.removeAsync({}, { multi: true })
  const service = new ReminderService()
  const when = Date.now() - 1000
  await service.add({ chat_id: PV, creator: PV, kind: "personal", text: "beber água", when, repeat: { kind: "daily" } })
  await fastForward(() => service.sendDue(fakeClient().client))
  const doc = await remindersDb.findOneAsync({ chat_id: PV }) as { when: number }
  assert.ok(doc, "continua no banco")
  assert.equal(Math.round((doc.when - when) / 3_600_000), 24)
})

test("agendar: só admin do grupo; mensagem sai no grupo sem menção e só admin apaga", async () => {
  await remindersDb.removeAsync({}, { multi: true })
  const fake = fakeClient()
  await send(fake, { from: MEMBER, chat: G, text: "!agendar 18h reunião" })
  assert.match(fake.output(), /administradores do grupo/)
  fake.reset()
  await send(fake, { from: ADMIN, chat: G, text: "!agendar toda segunda 8h Bom dia, equipe!" })
  assert.match(fake.output(), /Mensagem agendada para \*toda segunda às 08:00\*/)

  fake.reset()
  await send(fake, { from: MEMBER, chat: G, text: "!lembretes" })
  assert.match(fake.output(), /Bom dia, equipe!.*\n?.*|mensagem do grupo/)
  await send(fake, { from: MEMBER, chat: G, text: "!rmlembrete 1" })
  assert.match(fake.output(), /Só administradores do grupo podem apagar/)

  fake.reset()
  const doc = await remindersDb.findOneAsync({ chat_id: G }) as { when: number }
  await fastForward(() => new ReminderService().sendDue(fake.client, doc.when + 1000))
  assert.match(String(fake.sent[0].content.text), /Mensagem agendada\*\n\nBom dia, equipe!/)
  assert.equal(fake.sent[0].content.mentions, undefined)
})

// ———————————————— ENQUETE ————————————————
test("enquete: cria enquete nativa (uma ou várias opções) e valida o formato", async () => {
  assert.deepEqual(parsePoll("Qual dia? | Sábado | Domingo"), { question: "Qual dia?", options: ["Sábado", "Domingo"], multiple: false })
  assert.equal(parsePoll("multi O que levar? | Carne | Gelo").multiple, true)
  assert.throws(() => parsePoll("Só pergunta | uma"), /de 2 a 12/)
  assert.throws(() => parsePoll("P | a | A"), /repetidas/)
  assert.throws(() => parsePoll(`P | ${Array.from({ length: 13 }, (_, i) => `o${i}`).join(" | ")}`), /de 2 a 12/)

  const fake = fakeClient()
  await send(fake, { from: MEMBER, chat: G, text: "!enquete multi O que levar? | Carne | Bebida | Gelo" })
  const poll = fake.sent.find(s => s.content.poll)?.content.poll as { name: string, values: string[], selectableCount: number }
  assert.deepEqual(poll, { name: "O que levar?", values: ["Carne", "Bebida", "Gelo"], selectableCount: 0 })
  fake.reset()
  await send(fake, { from: PV, text: "!enquete Vamos? | Sim | Não" })
  assert.equal((fake.sent.find(s => s.content.poll)?.content.poll as { selectableCount: number }).selectableCount, 1)
})

// ———————————————— REGRAS ————————————————
test("regras: admin define, todos leem e regrasauto envia para quem entra", async () => {
  const fake = fakeClient()
  await send(fake, { from: MEMBER, chat: G, text: "!setregras sem spam" })
  assert.match(fake.output(), /administradores do grupo/)
  fake.reset()
  await send(fake, { from: ADMIN, chat: G, text: "!regrasauto" })
  assert.match(fake.output(), /Defina as regras primeiro/)
  await send(fake, { from: ADMIN, chat: G, text: "!setregras 1. Respeito\n2. Sem spam" })
  await send(fake, { from: MEMBER, chat: G, text: "!regras" })
  assert.match(fake.output(), /Regras do grupo[\s\S]*1\. Respeito\n2\. Sem spam/)
  await send(fake, { from: ADMIN, chat: G, text: "!regrasauto" })
  assert.match(fake.output(), /Envio automático das regras \*ativado\*/)

  fake.reset()
  const NEW = user(889)
  await groupParticipantsUpdated(fake.client, { id: G, author: ADMIN, participants: [NEW], action: "add" }, currentBot())
  const rules = fake.sent.find(s => /Leia as regras/.test(String(s.content.text)))
  assert.ok(rules, "regras enviadas")
  assert.deepEqual(rules!.content.mentions, [NEW])

  await send(fake, { from: ADMIN, chat: G, text: "!rmregras" })
  const saved = await features.get(G)
  assert.deepEqual(saved.rules, { text: "", auto: false })
  fake.reset()
  await send(fake, { from: MEMBER, chat: G, text: "!regras" })
  assert.match(fake.output(), /descrição/, "sem regras salvas, mostra a descrição do grupo")
})

// ———————————————— VERIFICAÇÃO DE NOVOS MEMBROS ————————————————
test("verificação: quem entra responde a conta; acerto libera, sem resposta é removido", async () => {
  await captchaDb.removeAsync({}, { multi: true })
  const fake = fakeClient()
  await send(fake, { from: ADMIN, chat: G, text: "!verificacao 61" })
  assert.match(fake.output(), /de 1 a 60/)
  await send(fake, { from: ADMIN, chat: G, text: "!verificacao 2" })
  assert.match(fake.output(), /prazo de \*2 minuto\(s\)\*/)

  // Entrou: recebe a conta
  const A = user(8801), B = user(8802)
  fake.reset()
  await groupParticipantsUpdated(fake.client, { id: G, author: ADMIN, participants: [A], action: "add" }, currentBot())
  await groupParticipantsUpdated(fake.client, { id: G, author: ADMIN, participants: [B], action: "add" }, currentBot())
  assert.match(fake.output(), /Quanto é \d+ [+-] \d+\?/)
  const pendingA = await new CaptchaService().get(G, A)
  assert.ok(pendingA)

  // A acerta (por extenso também vale)
  fake.reset()
  await send(fake, { from: A, chat: G, text: `acho que é ${pendingA!.answer}` })
  await waitFor(() => /verificado\(a\)/.test(fake.output()))
  assert.equal(await new CaptchaService().get(G, A), null)

  // B não responde: o prazo vence e ele é removido (o bot é admin)
  fake.reset()
  await fastForward(() => new CaptchaService().processExpired(fake.client, HOST, Date.now() + 3 * 60_000))
  const removal = fake.calls.find(c => c.method === "groupParticipantsUpdate")
  assert.deepEqual(removal?.args, [G, [B], "remove"])
  assert.match(fake.output(), /não concluir a verificação/)
  assert.equal(await new CaptchaService().get(G, B), null)
})

test("verificação: 3 erros removem na hora; admins e mensagens sem número não contam", async () => {
  await captchaDb.removeAsync({}, { multi: true })
  const C = user(8803)
  const service = new CaptchaService()
  await service.start(G, C, 5)
  const pending = (await service.get(G, C))!
  const wrong = String(pending.answer + 1)
  assert.deepEqual(await service.check(G, C, "oi gente"), { status: "none" }, "sem número não é tentativa")
  assert.deepEqual(await service.check(G, C, wrong), { status: "wrong", remaining: 2 })
  assert.deepEqual(await service.check(G, C, wrong), { status: "wrong", remaining: 1 })
  assert.deepEqual(await service.check(G, C, wrong), { status: "failed" })
  assert.equal((await service.expired()).length, 1, "venceu na hora")

  assert.equal(readAnswer("doze"), 12)
  assert.equal(readAnswer("é 7!"), 7)
  assert.equal(readAnswer("sei lá"), null)
  for (let i = 0; i < 50; i++) {
    const q = makeQuestion()
    const [a, op, b] = q.question.split(" ")
    assert.equal(op === "+" ? Number(a) + Number(b) : Number(a) - Number(b), q.answer)
    assert.ok(q.answer >= 0)
  }
})

test("verificação: sem ser admin o bot avisa e não tenta remover", async () => {
  await captchaDb.removeAsync({}, { multi: true })
  const G2 = "120363100000000889@g.us"
  const D = user(8804)
  await setupGroup(G2, [{ id: ADMIN, admin: true }, { id: D }], { botAdmin: false })
  await captchaDb.insertAsync({ group_id: G2, user_id: D, answer: 3, expires_at: 0, attempts: 0 })
  const fake = fakeClient()
  await fastForward(() => new CaptchaService().processExpired(fake.client, HOST))
  assert.equal(fake.calls.some(c => c.method === "groupParticipantsUpdate"), false)
  assert.match(fake.output(), /preciso ser \*administrador\*/)
})

// ———————————————— ANTIGOLPE ————————————————
test("antigolpe: pontuação pega golpes comuns sem marcar conversa normal", () => {
  const scams = [
    "Ganhe R$ 300 por dia só curtindo vídeos no YouTube! Chama no pv",
    "Oi mãe, troquei de número, salva esse. Preciso de um pix urgente",
    "🐯 Fortune Tiger plataforma nova pagando muito! Horário pagante agora https://bit.ly/abc",
    "Você foi sorteado! Resgate seu prêmio em www.premio-brasil.xyz",
    "Sua CNH suspensa, regularize agora: http://detran-gov.online/x",
    "Renda extra trabalhando de casa, vagas limitadas, me chama",
    "Me passa o código de 6 dígitos que chegou aí por SMS por favor",
    "Trabalhe de casa avaliando produtos, ganhe por tarefa! https://wa.me/5511999",
  ]
  const normal = [
    "manda o pix depois do almoço", "alguém sabe se a banca de jornal abre hoje?", "corre que o jogo vai começar",
    "quanto é o investimento do curso?", "o boleto venceu ontem, vou pagar hoje",
    "Galera, o churrasco é sábado, cada um faz um pix de R$ 30 pro João", "olha esse vídeo https://youtube.com/watch?v=x muito bom",
    "urgente: reunião mudou para 15h", "comprei bitcoin ano passado e perdi tudo kkk", "entre no grupo da turma, link: chat.whatsapp.com/abc",
    "urgente galera, alguém me faz um pix? te pago amanhã", "o cassino do filme é top, corre ver", "pessoal troquei de número, esse é meu novo",
    "ganhei um sorteio no trabalho, foi demais", "alguém trabalha de casa aqui? como é?", "me manda o codigo do cupom",
  ]
  for (const s of scams) assert.equal(scamScore(s).isScam, true, s)
  for (const s of normal) assert.equal(scamScore(s).isScam, false, s)
})

test("antigolpe: no grupo apaga (bot admin) e avisa; admins e grupos sem filtro não são afetados", async () => {
  const fake = fakeClient()
  const scam = "Ganhe R$ 300 por dia só curtindo vídeos no YouTube! Chama no pv"
  await send(fake, { from: MEMBER, chat: G, text: scam })
  await new Promise(r => setTimeout(r, 50))
  assert.doesNotMatch(fake.output(), /POSSÍVEL GOLPE/, "desligado por padrão")

  await send(fake, { from: ADMIN, chat: G, text: "!antigolpe" })
  assert.match(fake.output(), /Filtro de golpes\* ativado/)
  fake.reset()
  await send(fake, { from: MEMBER, chat: G, text: scam })
  await waitFor(() => /POSSÍVEL GOLPE/.test(fake.output()))
  assert.ok(fake.sent.some(s => s.content.delete), "mensagem apagada")
  assert.match(fake.output(), /A mensagem foi apagada/)

  fake.reset()
  await send(fake, { from: ADMIN, chat: G, text: scam })
  await new Promise(r => setTimeout(r, 50))
  assert.equal(fake.sent.some(s => s.content.delete), false, "admin não é filtrado")
  await send(fake, { from: ADMIN, chat: G, text: "!antigolpe" })
})

// ———————————————— SORTEIO DE MEMBROS ————————————————
test("sorteiomembro: sem argumentos igual a antes; com número sorteia vários diferentes e sem o bot", async () => {
  assert.deepEqual(parseMemberDrawArgs(["3", "Camisa", "do", "time"]), { count: 3, prize: "Camisa do time" })
  assert.deepEqual(parseMemberDrawArgs(["Ingresso"]), { count: 1, prize: "Ingresso" })
  assert.throws(() => parseMemberDrawArgs(["51"]), /de 1 a 50/)

  const fake = fakeClient()
  await send(fake, { from: MEMBER, chat: G, text: "!sorteiomembro" })
  assert.match(fake.output(), /O membro sorteado foi @/)
  assert.equal((fake.sent[0].content.mentions as string[]).length, 1)

  for (let i = 0; i < 10; i++) {
    fake.reset()
    await send(fake, { from: MEMBER, chat: G, text: "!sorteiomembro 3 Ingresso do show" })
    const mentions = fake.sent[0].content.mentions as string[]
    assert.equal(mentions.length, 3)
    assert.equal(new Set(mentions).size, 3, "sem repetidos")
    assert.ok(!mentions.includes(HOST), "o bot fica de fora")
    assert.match(fake.output(), /Prêmio\*: Ingresso do show[\s\S]*1º @/)
  }
  fake.reset()
  await send(fake, { from: MEMBER, chat: G, text: "!sorteiomembro 40" })
  assert.match(fake.output(), /só tem \d+ membro/)
})

// ———————————————— AMIGO SECRETO ————————————————
test("amigo secreto: ninguém tira a si mesmo e todos recebem exatamente um amigo", () => {
  for (let n = 3; n <= 12; n++) {
    const people = Array.from({ length: n }, (_, i) => `p${i}`)
    for (let k = 0; k < 30; k++) {
      const pairs = drawPairs(people)
      assert.deepEqual(Object.keys(pairs).sort(), [...people].sort())
      assert.deepEqual(Object.values(pairs).sort(), [...people].sort(), "cada um é tirado uma vez")
      for (const [giver, receiver] of Object.entries(pairs)) assert.notEqual(giver, receiver)
    }
  }
  assert.throws(() => drawPairs(["a", "b"]), /pelo menos 3/)
})

test("amigo secreto: criar, entrar, sortear (no privado), reenviar e cancelar", async () => {
  await new SecretSantaService().cancel(G)
  const fake = fakeClient()
  await send(fake, { from: MEMBER, chat: G, text: "!amigosecreto criar" })
  assert.match(fake.output(), /administradores do grupo/)
  await send(fake, { from: ADMIN, chat: G, text: "!amigosecreto criar Valor R$ 50, troca dia 20/12" })
  assert.match(fake.output(), /Amigo secreto criado[\s\S]*R\$ 50/)
  await send(fake, { from: MEMBER, chat: G, text: "!amigosecreto entrar" })
  await send(fake, { from: MEMBER, chat: G, text: "!amigosecreto entrar" })
  assert.match(fake.output(), /já está na lista/)
  await send(fake, { from: ADMIN, chat: G, text: "!amigosecreto sortear" })
  assert.match(fake.output(), /pelo menos 3/)
  await send(fake, { from: OTHER, chat: G, text: "!amigosecreto participar" })

  fake.reset()
  await send(fake, { from: ADMIN, chat: G, text: "!amigosecreto sortear" })
  const dms = fake.sent.filter(s => /Você tirou/.test(String(s.content.text)))
  assert.deepEqual(dms.map(d => d.chatId).sort(), [ADMIN, MEMBER, OTHER].sort(), "cada um no seu privado")
  for (const dm of dms) {
    assert.notDeepEqual(dm.content.mentions, [dm.chatId], "não tirou a si mesmo")
    assert.match(String(dm.content.text), /R\$ 50/)
  }
  assert.match(fake.output(), /Sorteio feito/)

  fake.reset()
  await send(fake, { from: MEMBER, chat: G, text: "!amigosecreto meu" })
  assert.equal(fake.sent.filter(s => s.chatId === MEMBER).length, 1)
  assert.match(fake.output(), /Enviei no seu privado/)
  await send(fake, { from: MEMBER, chat: G, text: "!amigosecreto sair" })
  assert.match(fake.output(), /sorteio já foi feito/)
  await send(fake, { from: MEMBER, chat: G, text: "!amigosecreto xyz" })
  assert.match(fake.output(), /Opção inválida/)
  await send(fake, { from: ADMIN, chat: G, text: "!amigosecreto cancelar" })
  assert.match(fake.output(), /cancelado/)
  assert.equal(await new SecretSantaService().get(G), null)
})

// ———————————————— CEP, CNPJ, FERIADOS, LOTERIAS, RASTREIO ————————————————
test("cep: endereço do CEP (ViaCEP, reserva BrasilAPI) e CEP inexistente", async () => {
  mock.method(axios, "get", async (url: string) => {
    if (url === "https://viacep.com.br/ws/01310100/json/") return { data: { cep: "01310-100", logradouro: "Avenida Paulista", complemento: "de 612 a 1510 - lado par", bairro: "Bela Vista", localidade: "São Paulo", uf: "SP", ddd: "11", ibge: "3550308" } }
    if (url === "https://viacep.com.br/ws/99999998/json/") return { data: { erro: "true" } }
    if (url === "https://brasilapi.com.br/api/cep/v2/99999998") throw axiosError(404)
    throw new Error(`URL inesperada ${url}`)
  })
  const fake = fakeClient()
  await send(fake, { from: PV, text: "!cep 01310-100" })
  assert.match(fake.output(), /CEP 01310-100[\s\S]*Avenida Paulista[\s\S]*Bela Vista[\s\S]*São Paulo - SP[\s\S]*DDD 11/)
  fake.reset()
  await send(fake, { from: PV, text: "!cep 99999-998" })
  assert.match(fake.output(), /não encontrado/)
  fake.reset()
  await send(fake, { from: PV, text: "!cep 123" })
  assert.match(fake.output(), /8 números/)
})

test("cep pelo endereço: lê o endereço e escolhe a faixa de numeração certa", async () => {
  assert.deepEqual(br.parseAddress("Av. São Sebastião, 2840, Parnaíba, PI"), { street: "Av. São Sebastião", number: 2840, district: undefined, city: "Parnaíba", uf: "PI" })
  assert.deepEqual(br.parseAddress("Rua Augusta 1500 - Consolação - São Paulo/SP"), { street: "Rua Augusta", number: 1500, district: "Consolação", city: "São Paulo", uf: "SP" })
  assert.deepEqual(br.parseAddress("Rua das Flores, nº 10, Centro, Teresina PI"), { street: "Rua das Flores", number: 10, district: "Centro", city: "Teresina", uf: "PI" })
  assert.throws(() => br.parseAddress("Rua X SP"), /Endereço incompleto/)
  assert.deepEqual(br.parseRange("de 1001 a 1999 - lado ímpar"), { from: 1001, to: 1999, parity: "impar" })
  assert.deepEqual(br.parseRange("de 2838 ao fim - lado par"), { from: 2838, to: Infinity, parity: "par" })
  assert.deepEqual(br.parseRange("até 999/1000"), { from: 0, to: 1000, parity: undefined })
  assert.equal(br.parseRange("Apto 5"), null)
  assert.deepEqual(br.splitStreetType("Av. São Sebastião"), { type: "avenida", name: "São Sebastião" })

  let requested = ""
  mock.method(axios, "get", async (url: string) => {
    requested = url
    return { data: [
      { cep: "01304-000", logradouro: "Rua Augusta", complemento: "até 699/700", bairro: "Consolação", localidade: "São Paulo", uf: "SP" },
      { cep: "01304-001", logradouro: "Rua Augusta", complemento: "de 700 a 1680 - lado par", bairro: "Consolação", localidade: "São Paulo", uf: "SP" },
      { cep: "01305-000", logradouro: "Rua Augusta", complemento: "de 701 a 1679 - lado ímpar", bairro: "Consolação", localidade: "São Paulo", uf: "SP" },
    ] }
  })
  const fake = fakeClient()
  await send(fake, { from: PV, text: "!cep Rua Augusta, 1500, Consolação, São Paulo, SP" })
  assert.equal(requested, "https://viacep.com.br/ws/SP/S%C3%A3o%20Paulo/Augusta/json/")
  assert.match(fake.output(), /CEP provável: 01304-001/)

  fake.reset()
  await send(fake, { from: PV, text: "!cep Rua Augusta, São Paulo, SP" })
  assert.match(fake.output(), /Possíveis CEPs\* \(3\)[\s\S]*Informe o \*número\*/)
})

test("cnpj: valida dígitos, mostra dados públicos e usa a reserva se a BrasilAPI cair", async () => {
  assert.equal(br.isValidCnpj("00.000.000/0001-91"), true)
  assert.equal(br.isValidCnpj("00000000000192"), false)
  assert.equal(br.isValidCnpj("11111111111111"), false)
  const urls: string[] = []
  mock.method(axios, "get", async (url: string) => {
    urls.push(url)
    if (url.includes("brasilapi")) throw axiosError(503)
    return { data: { cnpj: "00000000000191", razao_social: "BANCO DO BRASIL SA", nome_fantasia: "DIRECAO GERAL", descricao_situacao_cadastral: "ATIVA", data_inicio_atividade: "1966-08-01", municipio: "BRASILIA", uf: "DF", capital_social: 120000000000, qsa: [{ nome_socio: "FULANO", qualificacao_socio: "Diretor" }] } }
  })
  const fake = fakeClient()
  await send(fake, { from: PV, text: "!cnpj 00.000.000/0001-91" })
  assert.deepEqual(urls, ["https://brasilapi.com.br/api/cnpj/v1/00000000000191", "https://minhareceita.org/00000000000191"])
  assert.match(fake.output(), /BANCO DO BRASIL SA[\s\S]*00\.000\.000\/0001-91[\s\S]*ATIVA[\s\S]*01\/08\/1966[\s\S]*FULANO/)
  fake.reset()
  await send(fake, { from: PV, text: "!cnpj 00000000000192" })
  assert.match(fake.output(), /dígitos verificadores/)
})

test("feriados: próximos a partir de hoje (junta o ano seguinte) e lista de um ano", async () => {
  const year = moment.tz(TZ).year()
  mock.method(axios, "get", async (url: string) => {
    const y = Number(url.split("/").pop())
    return { data: [{ date: `${y}-01-01`, name: "Confraternização mundial", type: "national" }, { date: `${y}-12-25`, name: "Natal", type: "national" }] }
  })
  const list = await br.upcomingHolidays(3, moment.tz(`${year}-06-01`, TZ).valueOf())
  assert.deepEqual(list.map(h => h.date), [`${year}-12-25`, `${year + 1}-01-01`, `${year + 1}-12-25`])
  const fake = fakeClient()
  await send(fake, { from: PV, text: "!feriados 2030" })
  assert.match(fake.output(), /Feriados nacionais de 2030[\s\S]*01\/01[\s\S]*Natal/)
})

test("loteria: escolhe o jogo pelo apelido e formata o resultado da Caixa", async () => {
  assert.deepEqual(br.parseLotteryArgs([]), { game: "megasena", contest: undefined })
  assert.deepEqual(br.parseLotteryArgs(["dia", "de", "sorte", "1350"]), { game: "diadesorte", contest: 1350 })
  assert.deepEqual(br.parseLotteryArgs(["+Milionária"]), { game: "maismilionaria", contest: undefined })
  assert.throws(() => br.parseLotteryArgs(["bingo"]), /não reconhecido/)
  let requested = ""
  mock.method(axios, "get", async (url: string) => {
    requested = url
    return { data: { numero: 6500, dataApuracao: "17/11/2026", listaDezenas: ["06", "10", "23", "25", "48"], acumulado: false, dataProximoConcurso: "18/11/2026", valorEstimadoProximoConcurso: 1500000, listaRateioPremio: [{ descricaoFaixa: "5 acertos", numeroDeGanhadores: 1, valorPremio: 1234567.89 }, { descricaoFaixa: "4 acertos", numeroDeGanhadores: 0, valorPremio: 0 }] } }
  })
  const fake = fakeClient()
  await send(fake, { from: PV, text: "!loteria quina 6500" })
  assert.equal(requested, "https://servicebus2.caixa.gov.br/portaldeloterias/api/quina/6500")
  assert.match(fake.output(), /Quina\* · Concurso \*6500\*[\s\S]*06 · 10 · 23 · 25 · 48[\s\S]*1 ganhador · R\$\s1\.234\.567,89[\s\S]*ninguém acertou[\s\S]*Saiu o prêmio principal/)
})

test("rastreio: valida o dígito verificador (padrão S10) e mostra o link oficial", async () => {
  assert.equal(br.parseTrackingCode("RR123456785BR").valid, true)
  assert.equal(br.parseTrackingCode("rr 123456785 br").valid, true)
  assert.equal(br.parseTrackingCode("RR123456784BR").valid, false)
  assert.deepEqual(br.parseTrackingCode("LB123456785CN"), { code: "LB123456785CN", valid: true, country: "China", service: "Pequeno pacote/carta com rastreio" })
  const fake = fakeClient()
  await send(fake, { from: PV, text: "!rastreio RR123456785BR" })
  assert.match(fake.output(), /Código válido[\s\S]*Brasil[\s\S]*rastreamento\.correios\.com\.br/)
  fake.reset()
  await send(fake, { from: PV, text: "!rastreio RR123456784BR" })
  assert.match(fake.output(), /dígito verificador não confere/)
  fake.reset()
  await send(fake, { from: PV, text: "!rastreio abc" })
  assert.match(fake.output(), /não parece um código/)
})

// ———————————————— BACKUP ————————————————
/** Lê os nomes e conteúdos de um .tar.gz gerado pelo backup (sem depender do tar do sistema). */
function readTarGz(file: string): Map<string, Buffer | null> {
  const tar = zlib.gunzipSync(fs.readFileSync(file))
  const entries = new Map<string, Buffer | null>()
  let offset = 0
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every(b => b === 0)) break
    const field = (start: number, len: number) => header.subarray(start, start + len).toString("utf8").replace(/\0.*$/s, "")
    let sum = 0
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : header[i]
    assert.equal(parseInt(field(148, 8), 8), sum, "checksum do cabeçalho")
    const prefix = field(345, 155)
    const name = (prefix ? `${prefix}/` : "") + field(0, 100)
    const size = parseInt(field(124, 12), 8)
    const type = field(156, 1)
    offset += 512
    entries.set(name, type === "5" ? null : tar.subarray(offset, offset + size))
    offset += Math.ceil(size / 512) * 512
  }
  return entries
}

test("backup: gera .tar.gz válido da pasta de dados (sem os temporários) e mantém só os mais recentes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sinforoso-bk-"))
  const source = path.join(root, "storage"), dest = path.join(root, "backups")
  fs.mkdirSync(path.join(source, "databases"), { recursive: true })
  fs.mkdirSync(path.join(source, "temp"), { recursive: true })
  fs.writeFileSync(path.join(source, "users.db"), "x".repeat(1000))
  fs.writeFileSync(path.join(source, "databases", "reminders.db"), '{"a":1}\n')
  fs.writeFileSync(path.join(source, "temp", "lixo.tmp"), "nao entra")
  const longDir = path.join(source, "a".repeat(60), "b".repeat(60))
  fs.mkdirSync(longDir, { recursive: true })
  fs.writeFileSync(path.join(longDir, "arquivo-com-nome-longo.db"), "ok")
  const service = new BackupService(() => ({ sourceDir: source, backupDir: dest, hour: 4, keep: 2 }))
  try {
    const file = await service.create(at("2026-11-18 04:00"))
    assert.equal(file.name, "sinforoso-backup-2026-11-18_04-00-00.tar.gz")
    const entries = readTarGz(file.path)
    assert.equal(entries.get("storage/users.db")?.toString(), "x".repeat(1000))
    assert.equal(entries.get("storage/databases/reminders.db")?.toString(), '{"a":1}\n')
    assert.equal(entries.get(`storage/${"a".repeat(60)}/${"b".repeat(60)}/arquivo-com-nome-longo.db`)?.toString(), "ok", "caminho longo (prefixo ustar)")
    assert.ok(![...entries.keys()].some(k => k.includes("temp")), "temporários ficam de fora")
    assert.ok(!fs.readdirSync(dest).some(n => n.endsWith(".partial")))

    // Rotação: ficam os 2 mais recentes. A ordem é pela data do arquivo; datas fixas no passado
    // para o teste não depender do dia em que roda (o arquivo recém-criado é sempre o mais novo).
    fs.utimesSync(file.path, new Date("2020-01-01T00:00:00Z"), new Date("2020-01-01T00:00:00Z"))
    for (const [i, when] of ["2026-11-19 04:00", "2026-11-20 04:00"].entries()) {
      const f = await service.create(at(when))
      const past = new Date(Date.UTC(2020, 0, 2 + i))
      fs.utimesSync(f.path, past, past)
    }
    assert.equal(service.list().length, 2)
    assert.ok(!fs.existsSync(file.path), "o mais antigo foi apagado")

    // Resto de queda de energia no meio do backup é limpo e não conta como backup
    fs.writeFileSync(path.join(dest, "sinforoso-backup-x.tar.gz.partial"), "meio")
    service.rotate(2)
    assert.ok(!fs.readdirSync(dest).some(n => n.endsWith(".partial")))
    assert.equal(listEntries(source).some(e => e.rel.startsWith("temp")), false)
    assert.equal(tarHeader("x", 1, 0, "file").length, 512)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("backup: às 4h, ou assim que o bot ligar se perdeu o horário (sem energia/desligado)", async () => {
  const slot = lastScheduledSlot(at("2026-11-18 10:00"), 4)
  assert.equal(moment.tz(slot, TZ).format("YYYY-MM-DD HH:mm"), "2026-11-18 04:00")
  assert.equal(moment.tz(lastScheduledSlot(at("2026-11-18 03:00"), 4), TZ).format("YYYY-MM-DD HH:mm"), "2026-11-17 04:00")
  assert.equal(isBackupDue(at("2026-11-18 03:59"), at("2026-11-17 04:00"), 4), false, "antes das 4h, o de ontem vale")
  assert.equal(isBackupDue(at("2026-11-18 04:00"), at("2026-11-17 04:00"), 4), true, "deu 4h")
  assert.equal(isBackupDue(at("2026-11-18 15:00"), at("2026-11-17 04:01"), 4), true, "estava desligado às 4h: faz ao ligar")
  assert.equal(isBackupDue(at("2026-11-18 15:00"), at("2026-11-18 04:05"), 4), false, "já fez hoje")
  assert.equal(isBackupDue(at("2026-11-18 15:00"), null, 4), true, "nenhum backup ainda")

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sinforoso-bk-"))
  fs.mkdirSync(path.join(root, "storage"))
  fs.writeFileSync(path.join(root, "storage", "a.db"), "1")
  const service = new BackupService(() => ({ sourceDir: path.join(root, "storage"), backupDir: path.join(root, "bk"), hour: 4, keep: 7 }))
  try {
    const log = mock.method(console, "log", () => undefined)
    assert.ok(await service.runIfDue(Date.now()), "primeiro backup")
    assert.equal(await service.runIfDue(Date.now()), null, "não repete no mesmo dia")
    log.mock.restore()
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("backup: comando só para admin do bot; envio só no privado", async () => {
  const fake = fakeClient()
  await send(fake, { from: MEMBER, chat: G, text: "!backup lista" })
  assert.match(fake.output(), /administradores do bot/)
})

// ———————————————— MENUS ————————————————
test("menus: todos os comandos novos aparecem", () => {
  const bot = currentBot()
  const utility = utilityMenu(bot), groupAdmin = groupAdminMenu(bot), group = groupMenu(bot), admin = adminMenu(bot), misc = miscGroupMenu(bot)
  for (const cmd of ["lembrete", "lembretes", "rmlembrete", "enquete", "cep", "cnpj", "feriados", "loteria", "rastreio"]) assert.match(utility, new RegExp(`\\*!${cmd}\\*`), cmd)
  for (const cmd of ["agendar", "regras", "setregras", "rmregras", "regrasauto", "verificacao", "antigolpe", "amigosecreto criar", "amigosecreto sortear"]) assert.match(groupAdmin, new RegExp(`\\*!${cmd}\\*`), cmd)
  for (const cmd of ["regras", "amigosecreto entrar", "amigosecreto meu"]) assert.match(group, new RegExp(`\\*!${cmd}\\*`), cmd)
  assert.match(admin, /\*!backup\*/)
  assert.match(misc, /\*!sorteiomembro\* \n.*\[qtd\] \[prêmio\]/)
})
