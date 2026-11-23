/**
 * Sessão do WhatsApp no NeDB: índice único na chave (gravação rápida das 812 pre-keys do pareamento),
 * limpeza de duplicados mantendo o mais recente e chaves de sincronização no formato do Baileys.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import DataStore from "@seald-io/nedb"
import { BufferJSON, proto } from "baileys"
import { indexByKey, useNeDBAuthState } from "../src/helpers/session.auth.helper.js"

const tempStore = () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sessao-")), "s.db")
  return new DataStore<{ key: string, data: string }>({ filename: file, autoload: true })
}

test("duplicados são limpos mantendo o registro que o bot já usava, e o índice único passa a valer", async () => {
  const store = tempStore()
  await store.insertAsync({ key: "pre-key-1", data: '"velho"' })
  await store.insertAsync({ key: "pre-key-1", data: '"novo"' })
  await store.insertAsync({ key: "session-a", data: '"a"' })
  const inUse = (await store.findOneAsync({ key: "pre-key-1" }))!.data
  await indexByKey(store)
  const docs = await store.findAsync({ key: "pre-key-1" })
  assert.equal(docs.length, 1, "sobrou um só")
  assert.equal(docs[0].data, inUse, "é o mesmo que o bot já lia")
  await assert.rejects(store.insertAsync({ key: "session-a", data: '"dup"' }), /unique|violates/i, "índice único ativo")
})

test("gravar as 812 pre-keys do pareamento é rápido com o índice (bem abaixo dos 30 s do Baileys)", async () => {
  const store = tempStore()
  for (let i = 0; i < 4000; i++) await store.insertAsync({ key: `session-${i}`, data: "x" })
  await indexByKey(store)
  const t = performance.now()
  await Promise.all(Array.from({ length: 812 }, (_, i) => store.updateAsync({ key: `pre-key-${i}` }, { $set: { data: "y" } }, { upsert: true })))
  const seconds = (performance.now() - t) / 1000
  assert.ok(seconds < 5, `levou ${seconds.toFixed(2)} s`)
})

test("chaves: grava, lê, apaga; app-state-sync-key volta como mensagem protobuf (fromObject, igual ao oficial)", async () => {
  const { state, saveCreds } = await useNeDBAuthState()
  const syncKey = proto.Message.AppStateSyncKeyData.fromObject({ keyData: Buffer.from("chave-secreta"), fingerprint: { rawId: 7, currentIndex: 1, deviceIndexes: [0, 1] }, timestamp: 123 })
  const plain = JSON.parse(JSON.stringify(syncKey, BufferJSON.replacer), BufferJSON.reviver)
  await state.keys.set({ "app-state-sync-key": { AAAAAHWs: plain }, "pre-key": { "1": { public: Buffer.from("p"), private: Buffer.from("q") } } })
  const got = await state.keys.get("app-state-sync-key", ["AAAAAHWs"])
  const value = got.AAAAAHWs!
  assert.ok(value instanceof proto.Message.AppStateSyncKeyData, "tipo protobuf")
  assert.equal(Buffer.from(value.keyData!).toString(), "chave-secreta")
  assert.equal(value.fingerprint?.rawId, 7)
  assert.deepEqual((await state.keys.get("pre-key", ["1"]))["1"]?.public, Buffer.from("p"))
  await state.keys.set({ "pre-key": { "1": null } })
  assert.equal((await state.keys.get("pre-key", ["1"]))["1"], null, "apagou")
  await saveCreds()
})
