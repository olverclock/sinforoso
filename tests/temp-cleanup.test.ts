import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { cleanupOldTempFiles } from "../src/utils/general.util.js"

test("cleanupOldTempFiles apaga só arquivos temporários mais antigos que o limite", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "limpeza-"))
  try {
    const velho = path.join(dir, "velho.mp4"), novo = path.join(dir, "novo.mp3")
    fs.writeFileSync(velho, "x"); fs.writeFileSync(novo, "y")
    fs.mkdirSync(path.join(dir, "subpasta"))
    const duasHorasAtras = new Date(Date.now() - 2 * 60 * 60 * 1000)
    fs.utimesSync(velho, duasHorasAtras, duasHorasAtras)

    assert.equal(cleanupOldTempFiles(60 * 60 * 1000, [dir, path.join(dir, "nao-existe")]), 1)
    assert.equal(fs.existsSync(velho), false, "o arquivo antigo foi apagado")
    assert.equal(fs.existsSync(novo), true, "o arquivo recente (talvez em uso) ficou")
    assert.equal(fs.existsSync(path.join(dir, "subpasta")), true, "pastas não são apagadas")
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
