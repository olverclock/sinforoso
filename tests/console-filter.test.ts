/** Filtro do console: mensagens do libsignal com chaves privadas não vão para o log. */
import { test } from "node:test"
import assert from "node:assert/strict"
import { classifyConsoleMessage } from "../src/utils/console-filter.util.js"

test("descarta as mensagens rotineiras do libsignal (que trazem chaves privadas)", () => {
  for (const msg of ["Closing session:", "Closing open session in favor of incoming prekey bundle", "Removing old closed session:", "Decrypted message with closed session."]) {
    assert.equal(classifyConsoleMessage(msg), "drop", msg)
  }
})

test("falhas reais viram aviso curto, sem objetos; o resto do bot não é afetado", () => {
  assert.match(String(classifyConsoleMessage("Failed to decrypt message with any known session...")), /CRIPTOGRAFIA/)
  assert.match(String(classifyConsoleMessage("Session error:Error: Bad MAC")), /CRIPTOGRAFIA/)
  assert.equal(classifyConsoleMessage("Conexão aberta!"), null)
  assert.equal(classifyConsoleMessage("[MAINTENANCE] Rotina concluída"), null)
  assert.equal(classifyConsoleMessage({ objeto: true }), null)
})
