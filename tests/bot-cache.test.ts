/** PERF-01: cache do bot.json em memória, sem mudar o comportamento quando o arquivo é editado por fora. */
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { BotService } from "../src/services/bot.service.js"

const file = path.resolve("storage/bot.json")

test("getBot: devolve cópias (alterar o objeto não muda o cache) e reflete os set* do próprio bot", () => {
  const service = new BotService()
  const original = service.getBot().prefix
  const copy = service.getBot()
  copy.prefix = "?"
  assert.equal(service.getBot().prefix, original, "alterar a cópia não afeta o cache")

  service.setPrefix("#")
  assert.equal(new BotService().getBot().prefix, "#")
  service.setPrefix(original)
  assert.equal(new BotService().getBot().prefix, original)
})

test("getBot: edição do bot.json por fora é detectada (mesmo comportamento de antes do cache)", () => {
  const service = new BotService()
  const before = service.getBot()
  service.getBot() // garante que está em cache
  try {
    fs.writeFileSync(file, JSON.stringify({ ...before, name: "Editado à mão no arquivo" }))
    const future = new Date(Date.now() + 5_000)
    fs.utimesSync(file, future, future)
    assert.equal(new BotService().getBot().name, "Editado à mão no arquivo")
  } finally {
    fs.writeFileSync(file, JSON.stringify(before))
  }
  assert.equal(new BotService().getBot().name, before.name)
})

test("getBot: se o bot.json for apagado com o bot rodando, é recriado com os valores padrão", () => {
  const service = new BotService()
  const before = service.getBot()
  try {
    fs.rmSync(file)
    const recreated = new BotService().getBot()
    assert.equal(recreated.prefix, "!")
    assert.ok(fs.existsSync(file))
  } finally {
    fs.writeFileSync(file, JSON.stringify(before))
  }
})
