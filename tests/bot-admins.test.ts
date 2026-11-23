/**
 * Admins do bot: ninguém vira admin (ou dono) só por usar o MESMO NOME do dono no WhatsApp — isso
 * acontecia no código antigo (autoSyncAdmin por nome). A mesma pessoa em LID e em número continua
 * reconhecida pela ligação oficial do WhatsApp. O !info mostra só telefones de verdade, uma vez por
 * pessoa, e o !admins explica quando dois registros são a mesma conta.
 */
import { test, before } from "node:test"
import assert from "node:assert/strict"
import { fakeClient, setupBot, send, user, OWNER } from "./helpers/harness.js"
import { UserController } from "../src/controllers/user.controller.js"
import { linkIds } from "../src/utils/identity.util.js"

const users = new UserController()
const OWNER_LID = "987654321098765@lid"
const IMPOSTOR = user(7001)

before(async () => { await setupBot() })

test("mesmo nome do dono NÃO dá admin nem dono a outra pessoa", async () => {
  const f = fakeClient()
  // Primeira mensagem registra o impostor com o nome "Dono"; a segunda já seria admin no código antigo
  await send(f, { from: IMPOSTOR, text: "oi", name: "Dono" })
  await send(f, { from: IMPOSTOR, text: "!admins", name: "Dono" })
  const impostor = await users.getUser(IMPOSTOR)
  assert.equal(impostor?.admin, false, "não virou admin")
  assert.equal(impostor?.owner, false, "não virou dono")
  assert.match(f.output(), /administradores do bot/, "comando de admin recusado")
  assert.doesNotMatch(f.output(), /Admins do bot/)
})

test("o dono continua admin quando escreve pelo LID (ligação oficial do WhatsApp, não pelo nome)", async () => {
  linkIds(OWNER_LID, OWNER)
  const f = fakeClient()
  await send(f, { from: OWNER_LID, text: "!admins", name: "Outro Nome Qualquer" })
  assert.match(f.output(), /Admins do bot/)
})

test("!info: só telefones de verdade e uma vez por pessoa; !admins mostra que é a mesma conta", async () => {
  // Registro antigo do dono em LID (como as versões antigas criavam) + um LID sem telefone conhecido
  await users.registerUser(OWNER_LID, "Dono")
  await users.promoteUser(OWNER_LID)
  const UNKNOWN_LID = "123450000099999@lid"
  await users.registerUser(UNKNOWN_LID, "Sem Telefone")
  await users.promoteUser(UNKNOWN_LID)

  const f = fakeClient()
  await send(f, { from: user(7002), text: "!info" })
  const info = f.output()
  const phone = OWNER.replace("@s.whatsapp.net", "")
  assert.equal(info.split(`wa.me/${phone}`).length - 1, 1, "o dono aparece uma vez só")
  assert.doesNotMatch(info, /wa\.me\/987654321098765|wa\.me\/123450000099999/, "LID não aparece como se fosse telefone")

  f.reset()
  await send(f, { from: OWNER, text: "!admins" })
  const admins = f.output()
  assert.match(admins, /Mesma pessoa que o Nº/, "explica que o LID é a mesma conta do dono")
  assert.match(admins, /sem número \(ID interno do WhatsApp, não é telefone\)/)
  assert.match(admins, new RegExp(`\\+${phone}`))
  await users.demoteUser(UNKNOWN_LID)
})

test("!rmadmin: remove marca de dono copiada; não remove o próprio dono nem o último dono", async () => {
  const COPY = user(7003)
  await users.registerUser(COPY, "Dono")
  await users.registerOwner(COPY) // como o código antigo deixava: admin + dono copiados pelo nome
  const f = fakeClient()
  await send(f, { from: OWNER, text: `!rmadmin ${COPY.replace("@s.whatsapp.net", "")}` })
  const copy = await users.getUser(COPY)
  assert.equal(copy?.admin, false)
  assert.equal(copy?.owner, false, "a marca de dono também sai")

  f.reset()
  await send(f, { from: OWNER, text: `!rmadmin ${OWNER.replace("@s.whatsapp.net", "")}` })
  assert.equal((await users.getUser(OWNER))?.owner, true, "o dono não remove a si mesmo")

  f.reset()
  await send(f, { from: OWNER, text: "!rmadmin 99" })
  assert.match(f.output(), /não é \*ADMINISTRADOR\* do bot/, "número da lista que não existe: aviso, sem travar")
})
