/**
 * Backup no Google Drive (login por código, envio que espera a internet voltar, rotação), jogos
 * grátis conferidos para o Brasil e mensagens de status/canais ignoradas. APIs simuladas.
 */
import { test, before, afterEach, mock } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import axios from "axios"
import NodeCache from "node-cache"
import { fakeClient, setupBot, fastForward, currentBot, user, send, OWNER } from "./helpers/harness.js"
import { BackupService } from "../src/services/backup.service.js"
import { DriveBackupService } from "../src/services/gdrive-backup.service.js"
import { readDriveState, writeDriveState, DriveConfig } from "../src/utils/gdrive.util.js"
import * as fg from "../src/utils/freegames.util.js"
import { freeGameCaption, unavailableNote } from "../src/services/feature-scheduler.service.js"
import { messageReceived } from "../src/events/message-received.event.js"

before(async () => { await setupBot() })
afterEach(() => { mock.restoreAll(); fg.clearAvailabilityCache() })

const axiosError = (status: number, data: unknown) => Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, response: { status, data } })

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sinforoso-drive-"))
  const storage = path.join(root, "storage"), backups = path.join(root, "backups")
  fs.mkdirSync(storage); fs.writeFileSync(path.join(storage, "a.db"), "dados")
  const backup = new BackupService(() => ({ sourceDir: storage, backupDir: backups, hour: 4, keep: 7 }))
  const config: DriveConfig = { clientId: "cid", clientSecret: "csecret", folderName: "Sinforoso Backups", keep: 2, stateFile: path.join(storage, "gdrive.json") }
  const service = new DriveBackupService(() => config, () => backup, async () => undefined)
  return { root, backup, config, service, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) }
}

/** Google Drive simulado em memória. */
function fakeGoogle(options: { offline?: () => boolean, revoked?: boolean } = {}) {
  const files: { id: string, name: string, parent: string, created: number }[] = []
  const uploads: string[] = []
  let polls = 0, n = 0
  const offline = () => options.offline?.() ?? false
  const net = () => { if (offline()) throw Object.assign(new Error("getaddrinfo ENOTFOUND"), { isAxiosError: true, code: "ENOTFOUND" }) }
  mock.method(axios, "post", async (url: string, body: unknown, cfg?: { headers?: Record<string, string> }) => {
    net()
    if (url === "https://oauth2.googleapis.com/device/code") {
      assert.match(String(body), /scope=https%3A%2F%2Fwww\.googleapis\.com%2Fauth%2Fdrive\.file/)
      return { data: { device_code: "DEV", user_code: "ABCD-EFGH", verification_url: "https://www.google.com/device", expires_in: 1800, interval: 5 } }
    }
    if (url === "https://oauth2.googleapis.com/token") {
      const params = new URLSearchParams(String(body))
      if (params.get("grant_type") === "urn:ietf:params:oauth:grant-type:device_code") {
        if (++polls < 2) throw axiosError(428, { error: "authorization_pending" })
        return { data: { access_token: "AT", refresh_token: "RT" } }
      }
      if (options.revoked) throw axiosError(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." })
      assert.equal(params.get("refresh_token"), "RT")
      return { data: { access_token: "AT" } }
    }
    if (url === "https://oauth2.googleapis.com/revoke") return { data: {} }
    if (url.startsWith("https://www.googleapis.com/drive/v3/files")) return { data: { id: "FOLDER" } }
    if (url.startsWith("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable")) {
      assert.equal(cfg?.headers?.Authorization, "Bearer AT")
      const meta = body as { name: string, parents: string[] }
      return { headers: { location: `https://upload.test/session/${encodeURIComponent(meta.name)}|${meta.parents[0]}` }, data: {} }
    }
    throw new Error(`POST inesperado ${url}`)
  })
  mock.method(axios, "put", async (url: string, data: Buffer) => {
    net()
    const [name, parent] = decodeURIComponent(url.split("/session/")[1]).split("|")
    assert.ok(Buffer.isBuffer(data) && data.length > 0)
    files.push({ id: `F${++n}`, name, parent, created: n })
    uploads.push(name)
    return { data: { id: `F${n}`, name } }
  })
  mock.method(axios, "get", async (url: string) => {
    net()
    if (url.includes("/drive/v3/files/FOLDER")) return { data: { id: "FOLDER", trashed: false } }
    if (url === "https://www.googleapis.com/drive/v3/files") return { data: { files: [...files].sort((a, b) => b.created - a.created).map(f => ({ id: f.id, name: f.name })) } }
    throw new Error(`GET inesperado ${url}`)
  })
  mock.method(axios, "delete", async (url: string) => {
    net()
    const id = url.split("/").pop()
    files.splice(files.findIndex(f => f.id === id), 1)
    return { data: {} }
  })
  return { files, uploads, polls: () => polls }
}

test("drive: conecta pelo código (google.com/device), guarda o token só para o bot e envia os backups", async () => {
  const { backup, service, config, cleanup } = setup()
  try {
    const google = fakeGoogle()
    await backup.create(Date.parse("2026-11-18T07:00:00Z"))
    let outcome: unknown
    const done = new Promise<void>(resolve => {
      void service.startLink(async o => { outcome = o; resolve() }).then(code => {
        assert.equal(code.user_code, "ABCD-EFGH")
        assert.equal(code.verification_url, "https://www.google.com/device")
      })
    })
    await done
    assert.deepEqual(outcome, { status: "ok" })
    assert.ok(google.polls() >= 2, "esperou a autorização (authorization_pending)")
    assert.equal(readDriveState(config.stateFile).refresh_token, "RT")
    if (process.platform !== "win32") assert.equal(fs.statSync(config.stateFile).mode & 0o777, 0o600)

    await service.sync()
    assert.equal(google.uploads.length, 1)
    assert.equal(google.files[0].parent, "FOLDER")
    assert.equal(await service.sync(), 0, "não reenvia o que já está no Drive")
  } finally { cleanup() }
})

test("drive: sem internet às 4h o backup fica no servidor e sobe quando a internet volta", async () => {
  const { backup, service, config, cleanup } = setup()
  try {
    let offline = true
    const google = fakeGoogle({ offline: () => offline })
    writeDriveState({ refresh_token: "RT", uploaded: [] }, config.stateFile)
    await backup.create(Date.parse("2026-11-18T07:00:00Z"))
    assert.equal(await service.sync(), 0)
    assert.match(service.status().lastError ?? "", /Sem conexão com o Google/)
    assert.equal(service.status().linked, true, "queda de rede não desconecta")

    offline = false
    assert.equal(await service.sync(), 1)
    assert.equal(google.uploads.length, 1)
    assert.equal(service.status().lastError, undefined)
  } finally { cleanup() }
})

test("drive: mantém só os mais recentes no Drive e desconecta se o Google revogar o acesso", async () => {
  const { backup, service, config, cleanup } = setup()
  try {
    const google = fakeGoogle()
    writeDriveState({ refresh_token: "RT", uploaded: [] }, config.stateFile)
    for (const [i, day] of ["2026-11-16", "2026-11-17", "2026-11-18"].entries()) {
      const f = await backup.create(Date.parse(`${day}T07:00:00Z`))
      fs.utimesSync(f.path, new Date(Date.parse(`${day}T07:00:00Z`)), new Date(Date.parse(`${day}T07:00:00Z`) + i))
    }
    await service.sync()
    assert.equal(google.files.length, 2, "keep = 2")
    assert.deepEqual(google.files.map(f => f.name).sort(), backup.list().slice(0, 2).map(f => f.name).sort())

    mock.restoreAll()
    fakeGoogle({ revoked: true })
    await backup.create(Date.parse("2026-11-19T07:00:00Z"))
    const log = mock.method(console, "log", () => undefined)
    assert.equal(await service.sync(), 0)
    log.mock.restore()
    assert.equal(service.status().linked, false)
    assert.match(service.status().lastError ?? "", /revogado ou expirou/)
  } finally { cleanup() }
})

test("drive: !backup drive pede configuração e só funciona no privado do admin", async () => {
  delete process.env.GDRIVE_CLIENT_ID; delete process.env.GDRIVE_CLIENT_SECRET
  const fake = fakeClient()
  await send(fake, { from: OWNER, text: "!backup drive" })
  assert.match(fake.output(), /GDRIVE_CLIENT_ID e GDRIVE_CLIENT_SECRET/)
})

// ———————————————— JOGOS GRÁTIS NO BRASIL ————————————————
const game = (id: number, title: string, url: string): fg.FreeGame => ({ id, title, image: "", url, stores: ["Epic Games"], worth: "$9.99", end_date: "2026-12-02 23:59:00" })

function mockStores() {
  mock.method(axios, "get", async (url: string) => {
    if (url === "https://www.gamerpower.com/open/epic-ok") return { status: 301, headers: { location: "https://store.epicgames.com/p/knightica-3be45c" } }
    if (url === "https://www.gamerpower.com/open/epic-blocked") return { status: 301, headers: { location: "https://store.epicgames.com/p/contractor-the-clean-up-part-ii-1b1b57" } }
    if (url === "https://www.gamerpower.com/open/steam-blocked") return { status: 301, headers: { location: "https://store.steampowered.com/app/123/" } }
    if (url === "https://www.gamerpower.com/open/alienware") return { status: 301, headers: { location: "https://na.alienwarearena.com/ucf/show/1" } }
    if (url.startsWith("https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions")) {
      assert.match(url, /country=BR&allowCountries=BR/)
      return { data: { data: { Catalog: { searchStore: { elements: [
        { title: "Knightica", catalogNs: { mappings: [{ pageSlug: "knightica-3be45c" }] }, price: { totalPrice: { discountPrice: 0 } }, promotions: { promotionalOffers: [{ promotionalOffers: [{}] }] } },
        { title: "Jogo Pago", catalogNs: { mappings: [{ pageSlug: "pago" }] }, price: { totalPrice: { discountPrice: 5000 } }, promotions: null },
      ] } } } } }
    }
    if (url.startsWith("https://store.steampowered.com/api/appdetails?appids=123&cc=br")) return { data: { 123: { success: false } } }
    throw new Error(`URL inesperada ${url}`)
  })
}

test("jogos grátis: confere na Epic e na Steam do Brasil; o que a loja não libera aqui não é divulgado", async () => {
  mockStores()
  assert.equal(await fg.checkAvailability(game(1, "Knightica", "https://www.gamerpower.com/open/epic-ok")), "confirmed")
  assert.equal(await fg.checkAvailability(game(2, "Contractor: The Clean Up Part 2", "https://www.gamerpower.com/open/epic-blocked")), "unavailable")
  assert.equal(await fg.checkAvailability(game(3, "Jogo Steam", "https://www.gamerpower.com/open/steam-blocked")), "unavailable")
  assert.equal(await fg.checkAvailability(game(4, "Chave parceiro", "https://www.gamerpower.com/open/alienware")), "unknown", "sem como conferir: segue normal")
  assert.equal(await fg.checkAvailability(game(5, "Erro de rede", "https://www.gamerpower.com/open/offline")), "unknown", "falha de consulta não esconde o jogo")

  const confirmed = freeGameCaption({ ...game(1, "Knightica", "u"), availability: "confirmed" })
  assert.match(confirmed, /Disponível no Brasil/)
  assert.doesNotMatch(freeGameCaption(game(1, "Knightica", "u")), /Disponível no Brasil/)
  assert.match(unavailableNote([game(2, "Contractor", "u")]), /Não disponíveis no Brasil[\s\S]*Contractor/)
})

// ———————————————— STATUS E CANAIS ————————————————
test("status (stories), listas de transmissão e canais são ignorados: o bot não publica status sem querer", async () => {
  const fake = fakeClient()
  const story = (remoteJid: string, participant?: string) => ({
    key: { remoteJid, id: `ST-${Math.random()}`, fromMe: false, ...(participant ? { participant } : {}) },
    messageTimestamp: Math.floor(Date.now() / 1000), pushName: "Contato",
    message: { conversation: "!menu" },
  })
  await fastForward(() => messageReceived(fake.client, { messages: [story("status@broadcast", user(7001)), story("1234567890@broadcast"), story("120363000000000000@newsletter")] as never, type: "notify" }, currentBot(), new NodeCache()))
  assert.equal(fake.sent.length, 0, "nada é enviado para status@broadcast/canais")
  assert.equal(fake.calls.some(c => c.method === "sendReceipt"), false, "nem confirmação de leitura")
})
