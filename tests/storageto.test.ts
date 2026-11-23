/**
 * !upload: compartilhamento pelo storage.to (API oficial: init → PUT pré-assinado → confirm;
 * multipart acima de 50 MB). API simulada conforme https://storage.to/docs/api.
 */
import { test, before, afterEach, mock } from "node:test"
import assert from "node:assert/strict"
import axios from "axios"
import { fakeClient, setupBot, send, user, waMedia } from "./helpers/harness.js"
import * as st from "../src/utils/storageto.util.js"
import { parseUploadArgs } from "../src/commands/utility.document.functions.commands.js"

const P = user(991)
before(async () => { await setupBot() })
afterEach(() => { mock.restoreAll(); delete process.env.STORAGETO_API_TOKEN })

type Call = { method: string, url: string, body?: unknown, headers?: Record<string, string> }

/** API falsa do storage.to que registra as chamadas. */
function fakeApi(opts: { multipart?: boolean, failPut?: boolean, status?: number } = {}) {
  const calls: Call[] = []
  mock.method(axios, "post", async (url: string, body: unknown, cfg: { headers: Record<string, string> }) => {
    calls.push({ method: "post", url: url.replace("https://storage.to/api", ""), body, headers: cfg?.headers })
    if (opts.status) throw Object.assign(new Error("http"), { response: { status: opts.status, data: { success: false, error: "Arquivo bloqueado" } } })
    if (url.endsWith("/upload/init")) return { data: opts.multipart
      ? { success: true, type: "multipart", upload_id: "UP1", r2_key: "key-1", part_size: 4, total_parts: 3, initial_urls: { "1": "https://r2.test/p1", "2": "https://r2.test/p2" }, owner_token: "owner_mp" }
      : { success: true, type: "single", upload_url: "https://r2.test/put", headers: { Host: ["r2.test"] }, r2_key: "key-1" } }
    if (url.endsWith("/upload/parts")) return { data: { success: true, part_urls: [{ partNumber: 3, url: "https://r2.test/p3" }] } }
    if (url.endsWith("/upload/confirm")) return { data: { success: true, file: { id: "FQxyz1234", url: "https://storage.to/FQxyz1234", filename: (body as { filename: string }).filename, human_size: "1 KB", expires_at: "2026-11-21T12:00:00Z" }, owner_token: "owner_v1_abc" } }
    return { data: { success: true } }
  })
  mock.method(axios, "put", async (url: string, data: Buffer) => {
    calls.push({ method: "put", url, body: data.length })
    if (opts.failPut) throw new Error("rede")
    return { headers: { etag: `"etag-${url.slice(-2)}"` } }
  })
  return calls
}

test("upload simples: init → PUT → confirm, com token de visitante; devolve o link", async () => {
  const calls = fakeApi()
  const result = await st.uploadToStorageTo(Buffer.from("conteudo"), "relatório.pdf", "application/pdf")
  assert.deepEqual(calls.map(c => `${c.method} ${c.url}`), ["post /upload/init", "put https://r2.test/put", "post /upload/confirm"])
  assert.deepEqual(calls[0].body, { filename: "relatório.pdf", content_type: "application/pdf", size: 8 })
  assert.match(String(calls[0].headers?.["X-Visitor-Token"]), /^[a-f0-9]{48}$/)
  assert.equal((calls[2].body as { r2_key: string }).r2_key, "key-1")
  assert.deepEqual(result, { id: "FQxyz1234", url: "https://storage.to/FQxyz1234", filename: "relatório.pdf", humanSize: "1 KB", expiresAt: "2026-11-21T12:00:00Z", ownerToken: "owner_v1_abc" })
})

test("validade e senha usam o owner_token do arquivo; com conta, envia o Bearer", async () => {
  process.env.STORAGETO_API_TOKEN = "tok_conta"
  const calls = fakeApi()
  await st.uploadToStorageTo(Buffer.from("x"), "a.txt", "text/plain", { days: 7, password: "Segredo1" })
  const expiry = calls.find(c => c.url.endsWith("/expiry"))!
  const password = calls.find(c => c.url.endsWith("/password"))!
  assert.equal(expiry.url, "/file/FQxyz1234/expiry")
  assert.deepEqual(expiry.body, { days: 7 })
  assert.equal(expiry.headers?.Authorization, "Owner owner_v1_abc")
  assert.deepEqual(password.body, { password: "Segredo1" })
  assert.equal(calls[0].headers?.Authorization, "Bearer tok_conta")
})

test("multipart (> 50 MB): pede as URLs que faltam, envia as partes na ordem e finaliza com os ETags", async () => {
  const calls = fakeApi({ multipart: true })
  await st.uploadToStorageTo(Buffer.from("123456789012"), "video.mp4", "video/mp4")
  assert.deepEqual(calls.find(c => c.url === "/upload/parts")?.body, { upload_id: "UP1", part_numbers: [3] })
  assert.deepEqual(calls.filter(c => c.method === "put").map(c => [c.url, c.body]), [["https://r2.test/p1", 4], ["https://r2.test/p2", 4], ["https://r2.test/p3", 4]])
  assert.deepEqual(calls.find(c => c.url === "/upload/complete-multipart")?.body, { upload_id: "UP1", parts: [{ partNumber: 1, etag: '"etag-p1"' }, { partNumber: 2, etag: '"etag-p2"' }, { partNumber: 3, etag: '"etag-p3"' }] })
})

test("multipart com falha cancela o envio no servidor (abort)", async () => {
  const calls = fakeApi({ multipart: true, failPut: true })
  await assert.rejects(st.uploadToStorageTo(Buffer.from("123456789012"), "video.mp4", "video/mp4"), st.StorageToError)
  assert.ok(calls.some(c => c.url === "/upload/abort"))
})

test("bloqueios e erros: tipos recusados pelo storage.to, vazio, cota (429) e recusa (422) viram mensagens claras", async () => {
  const calls = fakeApi()
  for (const ext of ["exe", "apk", "ipa", "scr"]) await assert.rejects(st.uploadToStorageTo(Buffer.from("x"), `app.${ext}`, "application/octet-stream"), new RegExp(`\\.${ext}`))
  await assert.rejects(st.uploadToStorageTo(Buffer.alloc(0), "a.txt", "text/plain"), /vazio/)
  assert.equal(calls.length, 0, "nada foi enviado")
  mock.restoreAll(); fakeApi({ status: 429 })
  await assert.rejects(st.uploadToStorageTo(Buffer.from("x"), "a.txt", "text/plain"), /50 arquivos por dia/)
  mock.restoreAll(); fakeApi({ status: 422 })
  await assert.rejects(st.uploadToStorageTo(Buffer.from("x"), "a.txt", "text/plain"), /recusou o arquivo: Arquivo bloqueado/)
})

test("nome seguro e argumentos do comando", () => {
  assert.equal(st.safeFilename("../../etc/passwd"), "passwd")
  assert.equal(st.safeFilename("C:\\pasta\\nota fiscal.pdf"), "nota fiscal.pdf")
  assert.equal(st.safeFilename("a<b>c?.txt"), "a_b_c_.txt")
  assert.equal(st.safeFilename(""), "arquivo")
  assert.deepEqual(parseUploadArgs([]), {})
  assert.deepEqual(parseUploadArgs(["7"]), { days: 7 })
  assert.deepEqual(parseUploadArgs(["2", "Senha123"]), { days: 2, password: "Senha123" })
  assert.throws(() => parseUploadArgs(["8"]), /1 a 7/)
  assert.throws(() => parseUploadArgs(["abc"]), /4 a 100/)
})

test("!upload pelo fluxo do bot: responde um documento e recebe o link; sem arquivo explica o uso", async () => {
  const calls = fakeApi()
  const f = fakeClient()
  const doc = await waMedia("document", Buffer.from("PDF falso"), { fileName: "contrato.pdf" })
  await send(f, { from: P, text: "!upload 5", quoted: { stanzaId: "Q1", participant: P, quotedMessage: doc } })
  assert.match(f.output(), /Arquivo compartilhado[\s\S]*contrato\.pdf[\s\S]*https:\/\/storage\.to\/FQxyz1234/)
  assert.deepEqual(calls.find(c => c.url.endsWith("/expiry"))?.body, { days: 5 })
  f.reset()
  await send(f, { from: P, text: "!upload" })
  assert.match(f.output(), /Responda um arquivo/)
  f.reset()
  await send(f, { from: P, text: "!upload 9", quoted: { stanzaId: "Q2", participant: P, quotedMessage: doc } })
  assert.match(f.output(), /1 a 7/)
})
