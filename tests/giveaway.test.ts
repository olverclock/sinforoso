/**
 * Sistema de sorteios: justiça e verificação do sorteio, cofre criptografado, os três modos
 * (inscrições, relâmpago com animação, caça à chave protegida), concorrência, recuperação após
 * reinício, falha de entrega e compatibilidade com o "!sorteio 100" antigo.
 */
import { test, before, afterEach, mock } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { randomBytes } from "node:crypto"
import { fileURLToPath } from "node:url"
import { fakeClient, setupBot, setupGroup, send, user, fastForward, HOST } from "./helpers/harness.js"
import * as gw from "../src/utils/giveaway.util.js"
import { GiveawayService, giveawaysDb, entriesDb, prizesDb, claimsDb, LIMITS } from "../src/services/giveaway.service.js"
import { parseCloseTime, splitParts } from "../src/commands/misc.giveaway.functions.commands.js"

const G = "120363100000000444@g.us"
const ADMIN = user(4401), A = user(4402), B = user(4403), C = user(4404)
const service = new GiveawayService()
const MEDIA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "media")

before(async () => {
  await setupBot()
  await setupGroup(G, [{ id: ADMIN, admin: true }, { id: A }, { id: B }, { id: C }])
})
afterEach(() => mock.restoreAll())

const lastId = async () => ((await giveawaysDb.findAsync({ group_id: G }) as { id: string, created_at: number }[]).sort((a, b) => b.created_at - a.created_at)[0]).id

// ———————————————— Peças puras ————————————————
test("sorteio verificável: mesma semente e lista dão o mesmo resultado; adulterar é detectado", () => {
  const { seed, commitment } = gw.newCommitment()
  assert.equal(gw.sha256Hex(Buffer.from(seed, "hex")), commitment)
  const ids = ["5511a@s.whatsapp.net", "5511b@s.whatsapp.net", "5511c@s.whatsapp.net", "5511d@s.whatsapp.net", "5511e@s.whatsapp.net"]
  const w1 = gw.deterministicPick(seed, ids, 3)
  assert.deepEqual(gw.deterministicPick(seed, [...ids].reverse(), 3), w1, "a ordem de inscrição não muda o resultado")
  assert.equal(new Set(w1).size, 3, "sem repetidos")
  assert.equal(gw.verifyDraw(seed, commitment, ids, 3, w1), true)
  assert.equal(gw.verifyDraw(seed, commitment, ids, 3, [w1[1], w1[0], w1[2]]), false, "trocar a ordem dos vencedores é detectado")
  assert.equal(gw.verifyDraw(randomBytes(32).toString("hex"), commitment, ids, 3, w1), false, "outra semente não bate com o compromisso")
  assert.deepEqual(gw.deterministicPick(seed, [], 1), [], "sem participantes, sem vencedor")
  assert.equal(gw.deterministicPick(seed, ids, 10).length, 5, "nunca mais vencedores que participantes")
})

test("sorteio justo: cada participante tem a mesma chance (sem viés)", () => {
  const ids = ["a", "b", "c", "d", "e", "f", "g"]
  const counts = new Map(ids.map(i => [i, 0]))
  const runs = 14_000
  for (let i = 0; i < runs; i++) { const [w] = gw.deterministicPick(randomBytes(32).toString("hex"), ids, 1); counts.set(w, counts.get(w)! + 1) }
  const expected = runs / ids.length
  for (const [id, n] of counts) assert.ok(Math.abs(n - expected) / expected < 0.08, `${id}: ${n} vezes (esperado ~${expected})`)
})

test("caça à chave: 4 opções diferentes, cada falsa com exatamente 3 letras trocadas", () => {
  for (let k = 0; k < 200; k++) {
    const real = gw.newChallengeCode()
    assert.match(real, /^SFR-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    const { options, correctIndex } = gw.huntOptions(real)
    assert.equal(new Set(options).size, 4)
    assert.equal(options[correctIndex], real)
    for (const [i, opt] of options.entries()) {
      if (i === correctIndex) continue
      const diffs = [...opt].filter((ch, j) => ch !== real[j])
      assert.equal(diffs.length, 3, `${opt} vs ${real}`)
      assert.ok(diffs.every(ch => /[A-Z]/.test(ch)), "só letras são trocadas")
      assert.equal(opt.replace(/[A-Z0-9]/g, "_"), real.replace(/[A-Z0-9]/g, "_"), "mesmo formato")
    }
  }
})

test("cofre: AES-256-GCM abre só com a chave e o sorteio certos; impressão digital detecta repetidas", () => {
  const { enc, fp } = gw.deriveKeys(randomBytes(32))
  const sealed = gw.sealSecret("ABCDE-FGHIJ-KLMNO", enc, "prize:X1:0")
  assert.equal(gw.openSecret(sealed, enc, "prize:X1:0"), "ABCDE-FGHIJ-KLMNO")
  assert.notEqual(gw.sealSecret("ABCDE-FGHIJ-KLMNO", enc, "prize:X1:0").iv, sealed.iv, "IV novo a cada operação")
  assert.throws(() => gw.openSecret(sealed, enc, "prize:X2:0"), "chave de outro sorteio não abre")
  assert.throws(() => gw.openSecret({ ...sealed, data: Buffer.from("x").toString("base64") }, enc, "prize:X1:0"), "dado adulterado é recusado")
  assert.throws(() => gw.openSecret(sealed, gw.deriveKeys(randomBytes(32)).enc, "prize:X1:0"), "outra chave mestra não abre")
  assert.equal(gw.secretFingerprint("abcde-fghij", fp), gw.secretFingerprint(" ABCDE-FGHIJ ", fp))
  assert.equal(gw.maskSecret("ABCDE-FGHIJ-KLMNO"), "ABC•••••••••••MNO")
})

test("entradas do comando: horários e partes", () => {
  const now = Date.parse("2026-11-21T15:00:00-03:00")
  assert.equal(parseCloseTime("1h", now), now + 3_600_000, "1h = daqui a 1 hora")
  assert.equal(parseCloseTime("30m", now), now + 1_800_000)
  assert.equal(new Date(parseCloseTime("às 20h", now)).toISOString(), "2026-11-21T23:00:00.000Z", "às 20h = horário")
  assert.deepEqual(splitParts("Jogo X | 1h | 2 | sem admins"), { parts: ["Jogo X", "1h", "2"], excludeAdmins: true })
})

// ———————————————— Fluxo: inscrições + cofre + entrega ————————————————
test("inscrições: admin cria, membros entram (sem duplicar), chave no privado, encerra e entrega só ao vencedor", async () => {
  const f = fakeClient()
  await send(f, { from: A, chat: G, text: "!sorteio novo Jogo Teste | 1h" })
  assert.match(f.output(), /administradores do grupo/, "membro comum não cria")
  f.reset()
  await send(f, { from: ADMIN, chat: G, text: "!sorteio novo Jogo Teste (Steam) | 1h | 1" })
  assert.match(f.output(), /SORTEIO ABERTO![\s\S]*Jogo Teste \(Steam\)[\s\S]*sorteio entrar [A-Z0-9]{5}/)
  const id = await lastId()

  await send(f, { from: A, chat: G, text: "!sorteio entrar" })
  await send(f, { from: A, chat: G, text: `!sorteio entrar ${id}` })
  assert.match(f.output(), /já está inscrito/)
  await send(f, { from: B, chat: G, text: `!sorteio entrar ${id.toLowerCase()}` })
  assert.equal(await entriesDb.countAsync({ giveaway_id: id }), 2)

  // Chave no grupo: apagada e recusada
  f.reset()
  await send(f, { from: ADMIN, chat: G, text: `!sorteio chave ${id} SECRETA-GRUPO-123` })
  assert.ok(f.sent.some(s => s.content.delete), "tenta apagar a mensagem com a chave")
  assert.match(f.output(), /só no \*privado\*/)
  // Chave no privado: guardada criptografada, resposta mascarada
  f.reset()
  await send(f, { from: ADMIN, text: `!sorteio chave ${id} KEYAA-BBBBB-CCCCC` })
  assert.match(f.output(), /Prêmio guardado no cofre[\s\S]*KEY•+CCC/)
  assert.doesNotMatch(f.output(), /KEYAA-BBBBB-CCCCC/, "a chave não volta inteira")
  await send(f, { from: A, text: `!sorteio chave ${id} OUTRA-CHAVE-999` })
  assert.match(f.output(), /Só quem criou o sorteio ou um administrador/)
  const raw = fs.readFileSync("storage/databases/giveaway_prizes.db", "utf8")
  assert.ok(!raw.includes("KEYAA-BBBBB-CCCCC"), "a chave não fica em texto puro no banco")

  // Encerramento no horário (o agendador chama runDue)
  await giveawaysDb.updateAsync({ id }, { $set: { closes_at: Date.now() - 1000 } }, {})
  f.reset()
  const announced: string[] = []
  await fastForward(() => service.runDue(f.client, async g => { announced.push(g.id); await service.announceResult(f.client, g, "/nao/existe") }))
  assert.deepEqual(announced, [id])
  const g = await service.require(id)
  assert.equal(g.status, "finished")
  const winner = g.winners[0].user
  assert.ok([A, B].includes(winner), "vencedor é um inscrito")
  assert.match(f.output(), /RESULTADO OFICIAL![\s\S]*Jogo Teste/)
  const dm = f.sent.find(s => s.chatId === winner && /KEYAA-BBBBB-CCCCC/.test(String(s.content.text)))
  assert.ok(dm, "a chave foi para o vencedor, no privado")
  assert.ok(!f.sent.some(s => s.chatId === G && /KEYAA/.test(String(s.content.text))), "a chave nunca aparece no grupo")
  assert.equal(g.winners[0].delivery, "delivered")

  // Idempotente: rodar de novo não anuncia nem entrega outra vez
  f.reset()
  await fastForward(() => service.runDue(f.client, async () => { assert.fail("não pode anunciar de novo") }))
  assert.equal(f.sent.length, 0)

  // Verificação pública confere
  f.reset()
  await send(f, { from: C, chat: G, text: `!sorteio verificar ${id}` })
  assert.match(f.output(), /resultado confere/)
  // O "!sorteio 100" antigo continua igual
  f.reset()
  await send(f, { from: C, chat: G, text: "!sorteio 100" })
  assert.match(f.output(), /O número sorteado foi \*\d+\*/)
})

test("concorrência: 40 inscrições ao mesmo tempo + a mesma pessoa 10 vezes = sem duplicatas", async () => {
  const g = await service.create({ groupId: G, groupName: "Grupo", creator: ADMIN, mode: "inscricao", title: "Concorrência", winners: 1, closesAt: Date.now() + 3_600_000 })
  const people = Array.from({ length: 40 }, (_, i) => user(46000 + i))
  await Promise.all([...people.map(p => service.join(g.id, G, p)), ...Array.from({ length: 10 }, () => service.join(g.id, G, A))])
  assert.equal(await entriesDb.countAsync({ giveaway_id: g.id }), 41)
  await service.cancel(g.id, ADMIN, G)
})

test("limites: no máximo 3 sorteios abertos por grupo; não entra depois de cancelado", async () => {
  await giveawaysDb.updateAsync({ group_id: G, status: "open" }, { $set: { status: "cancelled" } }, { multi: true })
  const make = () => service.create({ groupId: G, groupName: "Grupo", creator: ADMIN, mode: "inscricao", title: "X", winners: 1, closesAt: Date.now() + 3_600_000 })
  const created = [await make(), await make(), await make()]
  await assert.rejects(make(), new RegExp(`${LIMITS.activePerGroup} sorteios abertos`))
  await service.cancel(created[0].id, ADMIN, G)
  await assert.rejects(service.join(created[0].id, G, A), /encerradas/)
  for (const g of created.slice(1)) await service.cancel(g.id, ADMIN, G)
})

test("entrega: falha no privado não é marcada como entregue; o vencedor resgata depois", async () => {
  const g = await service.create({ groupId: G, groupName: "Grupo", creator: ADMIN, mode: "inscricao", title: "Falha", winners: 1, closesAt: Date.now() + 3_600_000 })
  await service.join(g.id, G, C)
  await service.addKeys(g.id, ADMIN, ["FALHA-11111-22222"])
  const closed = await service.close(g.id, ADMIN)
  assert.equal(closed.winners[0].user, C)
  const broken = fakeClient({ sendMessage: async () => { throw new Error("Connection Closed") } })
  const log = mock.method(console, "log", () => undefined)
  const r1 = await fastForward(() => service.deliver(broken.client, g.id))
  log.mock.restore()
  assert.deepEqual(r1, { delivered: 0, failed: 1, waitingKey: 0 })
  assert.equal((await service.require(g.id)).winners[0].delivery, "failed")

  const f = fakeClient()
  await send(f, { from: A, text: `!sorteio resgatar ${g.id}` })
  assert.match(f.output(), /não é vencedor/, "outra pessoa não pega o prêmio só sabendo o ID")
  f.reset()
  await send(f, { from: C, text: `!sorteio resgatar ${g.id}` })
  assert.ok(f.sent.some(s => s.chatId === C && /FALHA-11111-22222/.test(String(s.content.text))))
  assert.equal((await service.require(g.id)).winners[0].delivery, "delivered")
})

test("chaves repetidas são recusadas; prêmio cadastrado depois do sorteio é entregue na hora", async () => {
  const g = await service.create({ groupId: G, groupName: "Grupo", creator: ADMIN, mode: "inscricao", title: "Depois", winners: 1, closesAt: Date.now() + 3_600_000 })
  await service.join(g.id, G, B)
  const closed = await service.close(g.id, ADMIN)
  assert.equal(closed.winners[0].delivery, "no_key")
  const dup = await service.addKeys(g.id, ADMIN, ["KEYAA-BBBBB-CCCCC"])
  assert.equal(dup.duplicates, 1, "chave já usada em outro sorteio")
  const f = fakeClient()
  await send(f, { from: ADMIN, text: `!sorteio chave ${g.id} NOVA1-22222-33333` })
  assert.ok(f.sent.some(s => s.chatId === B && /NOVA1-22222-33333/.test(String(s.content.text))), "entregue assim que cadastrada")
})

// ———————————————— Relâmpago com animação ————————————————
test("relâmpago: sorteia na hora entre os membros (nunca o bot), com animação e texto de reserva", async () => {
  const f = fakeClient()
  await send(f, { from: ADMIN, chat: G, text: "!sorteio relampago Chave Relâmpago | 1 | sem admins" })
  const id = await lastId()
  const g = await service.require(id)
  assert.equal(g.status, "finished")
  assert.ok([A, B, C].includes(g.winners[0].user), "membro comum (sem admins, sem o bot)")
  assert.notEqual(g.winners[0].user, HOST)
  assert.match(f.output(), /ATENÇÃO, GALERA![\s\S]*RESULTADO OFICIAL/)

  // Com os arquivos de animação: roleta e troféu (MP4 com gifPlayback), resultado na legenda
  {
    assert.ok(fs.existsSync(path.join(MEDIA, "giveaway-roulette.mp4")) && fs.existsSync(path.join(MEDIA, "giveaway-winner.mp4")), "animações no projeto")
    const f2 = fakeClient()
    const how = await fastForward(() => service.announceResult(f2.client, g, MEDIA))
    assert.equal(how, "animation")
    const gifs = f2.sent.filter(s => s.content.gifPlayback === true)
    assert.equal(gifs.length, 2)
    assert.match(String(gifs[1].content.caption), /RESULTADO OFICIAL/)
    assert.deepEqual(gifs[1].content.mentions, [g.winners[0].user])
  }
  // Animações desligadas no grupo: só texto
  await send(f, { from: ADMIN, chat: G, text: "!sorteio animacao" })
  const f3 = fakeClient()
  assert.equal(await fastForward(() => service.announceResult(f3.client, g, MEDIA)), "text")
  await send(f, { from: ADMIN, chat: G, text: "!sorteio animacao" })
})

// ———————————————— Caça à chave ————————————————
test("caça à chave: tentativas só no privado, limite por pessoa, primeiro acerto vence e encerra", async () => {
  const f = fakeClient()
  await send(f, { from: ADMIN, chat: G, text: "!sorteio caca Jogo Caça | 30m | 1" })
  assert.match(f.output(), /CAÇA À CHAVE![\s\S]*\*A\* — SFR-[\s\S]*\*D\* — SFR-/)
  const id = await lastId()
  const g = await service.require(id)
  const right = gw.OPTION_LETTERS[g.hunt!.correct], wrong = gw.OPTION_LETTERS[(g.hunt!.correct + 1) % 4]
  await service.addKeys(id, ADMIN, ["CACA0-12345-67890"])

  f.reset()
  await send(f, { from: A, chat: G, text: `!sorteio tentar ${id} ${right}` })
  assert.match(f.output(), /no \*privado\* do bot/, "no grupo revelaria a resposta")
  await send(f, { from: A, text: `!sorteio tentar ${id} ${wrong}` })
  assert.match(f.output(), /Não foi dessa vez/)
  await send(f, { from: A, text: `!sorteio tentar ${id} ${right}` })
  assert.match(f.output(), /já usou suas 1 tentativa/)
  await send(f, { from: user(99999), text: `!sorteio tentar ${id} ${right}` })
  assert.match(f.output(), /Só membros do grupo/)

  f.reset()
  // Dois acertos ao mesmo tempo: só um vencedor
  const [r1, r2] = await Promise.allSettled([service.attemptHunt(id, B, right), service.attemptHunt(id, C, right)])
  const ok = [r1, r2].filter(r => r.status === "fulfilled" && r.value.result === "correct")
  assert.equal(ok.length, 1, "um único vencedor")
  const final = await service.require(id)
  assert.equal(final.status, "finished")
  assert.equal(final.winners.length, 1)
  assert.equal(await claimsDb.countAsync({ giveaway_id: id, correct: true }), 1)
})

test("caça à chave sem acerto até o prazo: encerra sem vencedor e guarda o prêmio", async () => {
  const g = await service.create({ groupId: G, groupName: "Grupo", creator: ADMIN, mode: "caca", title: "Sem acerto", winners: 1, closesAt: Date.now() + 600_000 })
  await service.addKeys(g.id, ADMIN, ["GUARD-00000-11111"])
  await giveawaysDb.updateAsync({ id: g.id }, { $set: { closes_at: Date.now() - 1 } }, {})
  const f = fakeClient()
  await fastForward(() => service.runDue(f.client, gg => service.announceResult(f.client, gg).then(() => undefined)))
  assert.equal((await service.require(g.id)).status, "no_winner")
  assert.match(f.output(), /DESAFIO ENCERRADO/)
  assert.doesNotMatch(f.output(), /GUARD-00000-11111/, "a chave não é revelada")
  assert.equal((await prizesDb.findOneAsync({ giveaway_id: g.id }) as { status: string }).status, "available")
})

test("comando com quebra de linha (ex.: chave colada na linha de baixo) e chave antes de criar o sorteio", async () => {
  const f = fakeClient()
  await send(f, { from: ADMIN, text: "!sorteio chave\nZZZZZ\nKEY-ANTES" })
  assert.match(f.output(), /Não achei o sorteio \*ZZZZZ\*[\s\S]*sorteio premio[\s\S]*sorteio novo[\s\S]*sorteio chave/, "explica os dois caminhos em vez de 'opção desconhecida'")
  f.reset()
  await send(f, { from: ADMIN, text: "!sorteio\najuda" })
  assert.match(f.output(), /SORTEIOS DO SINFOROSO/, "quebra de linha logo depois do comando também funciona")

  const g = await service.create({ groupId: G, groupName: "Grupo", creator: ADMIN, mode: "inscricao", title: "Quebra", winners: 2, closesAt: Date.now() + 3_600_000 })
  f.reset()
  await send(f, { from: ADMIN, text: `!sorteio chave\n${g.id}\nLINHA1-AAAAA\nLINHA2-BBBBB` })
  assert.match(f.output(), /Prêmios cadastrados: 2 de 2/, "uma chave por linha")
  await service.cancel(g.id, ADMIN, G)
})

// ———————————————— Prêmio guardado antes (código do prêmio) ————————————————
test("prêmio guardado antes no privado: o código (ou o nome) cria o sorteio já vinculado e entrega sozinho", async () => {
  const f = fakeClient()
  // No grupo: apagado e recusado
  await send(f, { from: ADMIN, chat: G, text: "!sorteio premio Hades | GRUPO-VAZOU-123" })
  assert.ok(f.sent.some(s => s.content.delete), "tenta apagar a mensagem com a chave")
  assert.equal(await service.findPackage(ADMIN, "Hades"), null, "nada guardado a partir do grupo")
  // No privado, com a chave na linha de baixo
  f.reset()
  await send(f, { from: ADMIN, text: "!sorteio premio Hades (Steam) |\nPKG01-AAAAA-11111" })
  const out = f.output()
  const code = /Código do prêmio: (P[A-Z0-9]{5})/.exec(out)?.[1]
  assert.ok(code, "devolve o código do prêmio")
  assert.doesNotMatch(out, /PKG01-AAAAA-11111/, "a chave não volta inteira")
  assert.ok(!fs.readFileSync("storage/databases/giveaway_prizes.db", "utf8").includes("PKG01-AAAAA-11111"), "criptografada no banco")
  f.reset()
  await send(f, { from: ADMIN, text: "!sorteio premios" })
  assert.ok(f.output().includes(`*${code}* — Hades (Steam) · 1 chave`), "lista o prêmio com código e chaves")
  // Outra pessoa não usa o prêmio de quem guardou
  assert.equal(await service.findPackage(A, code!), null)
  const other = await service.create({ groupId: G, groupName: "Grupo", creator: A, mode: "inscricao", title: "x", winners: 1, closesAt: Date.now() + 3_600_000 })
  await assert.rejects(service.linkPackage(code!, other.id, A), /outra pessoa/)
  await service.cancel(other.id, ADMIN, G)

  // No grupo, só o código: já nasce vinculado (código em minúsculas também vale)
  f.reset()
  await send(f, { from: ADMIN, chat: G, text: `!sorteio novo ${code!.toLowerCase()} | 1h` })
  assert.match(f.output(), /SORTEIO ABERTO![\s\S]*Hades \(Steam\)[\s\S]*Prêmio já guardado/)
  assert.ok(f.sent.some(s => s.chatId === ADMIN && /vinculado ao sorteio/.test(String(s.content.text))), "avisa o organizador no privado")
  const id = await lastId()
  assert.equal(await service.prizesCount(id), 1)
  assert.equal(await service.packageKeys(code!), 0, "as chaves saíram do estoque")
  f.reset()
  await send(f, { from: ADMIN, text: `!sorteio premios` })
  assert.match(f.output(), /não tem prêmios guardados/, "prêmio usado sai da lista")

  await service.join(id, G, B)
  await service.close(id, ADMIN)
  f.reset()
  await fastForward(() => service.deliver(f.client, id))
  assert.ok(f.sent.some(s => s.chatId === B && /PKG01-AAAAA-11111/.test(String(s.content.text))), "vencedor recebe a chave sozinho")

  // Pelo NOME, no relâmpago: vencedores = número de chaves
  f.reset()
  await send(f, { from: ADMIN, text: "!sorteio guardar Gift Card R$ 10 | GIFT1-AAAAA GIFT2-BBBBB" })
  await send(f, { from: ADMIN, chat: G, text: "!sorteio relampago gift card r$ 10 | sem admins" })
  const flash = await service.require(await lastId())
  assert.equal(flash.title, "Gift Card R$ 10")
  assert.equal(flash.winners.length, 2)
  for (const w of flash.winners) assert.ok(f.sent.some(s => s.chatId === w.user && /GIFT[12]-/.test(String(s.content.text))), "cada vencedor recebe uma chave")
  assert.ok(!f.sent.some(s => s.chatId === G && /GIFT1-AAAAA|GIFT2-BBBBB/.test(String(s.content.text))), "nunca no grupo")

  // Código que não existe: avisa em vez de criar sorteio chamado "PZZZZ9"
  f.reset()
  await send(f, { from: ADMIN, chat: G, text: "!sorteio novo PZZZZ9 | 1h" })
  assert.match(f.output(), /Não achei o prêmio \*PZZZZ9\*/)
  // Chave repetida e apagar
  f.reset()
  await send(f, { from: ADMIN, text: "!sorteio premio Repetido | GIFT1-AAAAA" })
  assert.match(f.output(), /já estão guardadas/)
  await send(f, { from: ADMIN, text: "!sorteio premio Apagavel | APAGA-11111" })
  const del = /Código do prêmio: (P[A-Z0-9]{5})/.exec(f.output())![1]
  f.reset()
  await send(f, { from: A, text: `!sorteio apagar ${del}` })
  assert.match(f.output(), /não encontrado/, "só o dono apaga")
  await send(f, { from: ADMIN, text: `!sorteio apagar ${del}` })
  assert.match(f.output(), /apagado do cofre/)
  assert.equal(await service.findPackage(ADMIN, del), null)
})

test("sem prêmio guardado: sorteia só o nome e avisa o organizador, no privado, quem ganhou", async () => {
  const f = fakeClient()
  await send(f, { from: ADMIN, chat: G, text: "!sorteio novo Camiseta do grupo | 1h" })
  assert.match(f.output(), /SORTEIO ABERTO![\s\S]*Camiseta do grupo[\s\S]*organizador envia o prêmio/)
  assert.ok(f.sent.some(s => s.chatId === ADMIN && /sem prêmio guardado/.test(String(s.content.text))))
  const id = await lastId()
  await service.join(id, G, C)
  await service.close(id, ADMIN)
  f.reset()
  await fastForward(() => service.deliver(f.client, id))
  const toOrganizer = f.sent.find(s => s.chatId === ADMIN && /Vencedor do sorteio/.test(String(s.content.text)))
  assert.ok(toOrganizer, "organizador é avisado")
  assert.deepEqual(toOrganizer!.content.mentions, [C], "marca o ganhador")
  assert.ok(f.sent.some(s => s.chatId === C && /entregue pelo \*organizador\*/.test(String(s.content.text))), "ganhador sabe que vem do organizador")
  f.reset()
  await fastForward(() => service.deliver(f.client, id))
  assert.ok(!f.sent.some(s => s.chatId === ADMIN), "avisa uma vez só")
  // Uso antigo "!sorteio premio ID CHAVE" continua cadastrando a chave no sorteio
  f.reset()
  await send(f, { from: ADMIN, text: `!sorteio premio ${id} CAMISA-00001` })
  assert.ok(f.sent.some(s => s.chatId === C && /CAMISA-00001/.test(String(s.content.text))), "chave cadastrada depois é entregue na hora")
})

test("exemplo copiado do bot com negrito (*!sorteio relampago* CÓDIGO / *!sorteio entrar ID*) funciona", async () => {
  const f = fakeClient()
  await send(f, { from: ADMIN, text: "!sorteio premio Copiado | COPIA-11111-22222" })
  const code = /Código do prêmio: (P[A-Z0-9]{5})/.exec(f.output())![1]
  f.reset()
  await send(f, { from: ADMIN, chat: G, text: `*!sorteio relampago* ${code}` })
  assert.doesNotMatch(f.output(), /Opção desconhecida/)
  const flash = await service.require(await lastId())
  assert.equal(flash.title, "Copiado", "usou o prêmio guardado pelo código")
  assert.ok(f.sent.some(s => s.chatId === flash.winners[0].user && /COPIA-11111-22222/.test(String(s.content.text))), "chave no privado do ganhador")

  await send(f, { from: ADMIN, chat: G, text: "!sorteio novo Negrito | 1h" })
  const id = await lastId()
  f.reset()
  await send(f, { from: A, chat: G, text: `*!sorteio entrar ${id}*` })
  assert.match(f.output(), /INSCRIÇÃO CONFIRMADA/, "o asterisco que fecha o negrito não gruda no ID")
  f.reset()
  await send(f, { from: A, chat: G, text: "*!sorteio* 5" })
  assert.doesNotMatch(f.output(), /Opção desconhecida|incorretamente/, "o !sorteio com número continua igual")
  await service.cancel(id, ADMIN, G)
})
