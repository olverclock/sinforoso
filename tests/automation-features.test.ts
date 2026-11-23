/**
 * Automações por chat: !jogosgratis (GamerPower filtrado), lives (Twitch, Kick, YouTube, TikTok),
 * frases automáticas e proteção de links/arquivos (VirusTotal). APIs simuladas; fluxo real do bot.
 */
import { test, before, afterEach, mock } from "node:test"
import assert from "node:assert/strict"
import axios from "axios"
import { fakeClient, setupBot, setupGroup, send, user, fastForward, waMedia } from "./helpers/harness.js"
import * as fg from "../src/utils/freegames.util.js"
import * as live from "../src/utils/livestream.util.js"
import * as ph from "../src/utils/phrases.util.js"
import * as vt from "../src/utils/virustotal.util.js"
import { ChatFeaturesService } from "../src/services/chat-features.service.js"
import { FeatureSchedulerService } from "../src/services/feature-scheduler.service.js"
import { parseLiveInput } from "../src/commands/utility.automation.functions.commands.js"
import { PHRASES } from "../src/data/phrases.data.js"

const G = "120363100000000777@g.us"
const ADMIN = user(771), MEMBER = user(772), PV = user(773)
const features = new ChatFeaturesService()
before(async () => {
  await setupBot()
  await setupGroup(G, [{ id: ADMIN, admin: true }, { id: MEMBER }])
})
afterEach(() => {
  mock.restoreAll()
  vt.resetVirusTotalLimits()
  live.clearLiveTokens()
  delete process.env.VIRUSTOTAL_API_KEY; delete process.env.TWITCH_CLIENT_ID; delete process.env.TWITCH_CLIENT_SECRET
})

const giveaway = (over: Record<string, unknown> = {}) => ({
  id: 1, title: "Jogo Legal (Epic Games) Giveaway", worth: "$19.99", thumbnail: "https://gp.test/t.jpg", image: "https://gp.test/i.jpg",
  description: "Grab it free", instructions: "Click", open_giveaway_url: "https://gp.test/open/1", type: "Game",
  platforms: "PC, Epic Games Store", end_date: "2026-12-02 23:59:00", status: "Active", ...over,
})

// ———————————————— JOGOS GRÁTIS ————————————————
test("jogos grátis: só Epic/Steam/GOG/Ubisoft/EA, só jogo completo ativo, sem restrição de região", () => {
  assert.deepEqual(fg.toFreeGame(giveaway() as never), { id: 1, title: "Jogo Legal", image: "https://gp.test/i.jpg", url: "https://gp.test/open/1", stores: ["Epic Games"], worth: "$19.99", end_date: "2026-12-02 23:59:00" })
  assert.deepEqual(fg.storesOf("PC, Steam, GOG"), ["Steam", "GOG"])
  assert.deepEqual(fg.storesOf("PC, Ubisoft"), ["Ubisoft"])
  assert.deepEqual(fg.storesOf("PC, Origin"), ["EA app"])
  assert.equal(fg.toFreeGame(giveaway({ platforms: "Android, iOS" }) as never), null, "loja fora do filtro")
  assert.equal(fg.toFreeGame(giveaway({ type: "DLC" }) as never), null, "DLC não é jogo")
  assert.equal(fg.toFreeGame(giveaway({ status: "Expired" }) as never), null)
  for (const lock of ["This key is region locked", "Only available in the US", "EU-only offer", "Not available in your region", "Selected countries only"]) {
    assert.equal(fg.toFreeGame(giveaway({ description: lock }) as never), null, lock)
  }
  assert.ok(fg.toFreeGame(giveaway({ description: "Free for a limited time only!" }) as never), "'only' sem região não bloqueia")
  assert.equal(fg.cleanTitle("Dwarven Realms (Steam) Key Giveaway"), "Dwarven Realms")
})

test("jogos grátis: a API sem ofertas (201) devolve lista vazia", async () => {
  mock.method(axios, "get", async () => ({ status: 201, data: { status: 0, status_message: "No active giveaways" } }))
  assert.deepEqual(await fg.fetchFreeGames(), [])
})

test("!jogosgratis: só admin ativa no grupo; ao ativar posta os atuais com imagem; o ciclo posta só os novos", async () => {
  let list = [giveaway(), giveaway({ id: 2, title: "Outro (Steam) Giveaway", platforms: "PC, Steam" })]
  mock.method(axios, "get", async (url: string) => { assert.match(url, /gamerpower\.com\/api\/filter/); return { status: 200, data: list } })
  const f = fakeClient()
  await send(f, { from: MEMBER, chat: G, text: "!jogosgratis" })
  assert.match(f.output(), /administradores/i, "membro comum não ativa")
  assert.equal((await features.get(G)).freegames.status, false)

  f.reset()
  await send(f, { from: ADMIN, chat: G, text: "!jogosgratis" })
  assert.match(f.output(), /ativado/)
  const images = f.sent.filter(s => s.content.image)
  assert.equal(images.length, 2, "postou os 2 atuais com imagem")
  assert.match(String(images[0].content.caption), /Jogo Legal[\s\S]*Epic Games[\s\S]*https:\/\/gp\.test\/open\/1/)

  const scheduler = FeatureSchedulerService.getInstance()
  scheduler.start(f.client); scheduler.stop()
  f.reset()
  await fastForward(() => scheduler.freeGamesCycle())
  assert.equal(f.sent.length, 0, "nada novo, nada postado")
  list = [...list, giveaway({ id: 3, title: "Novo (GOG) Giveaway", platforms: "PC, GOG" })]
  await fastForward(() => scheduler.freeGamesCycle())
  assert.equal(f.sent.length, 1)
  assert.match(String(f.sent[0].content.caption), /Novo[\s\S]*GOG/)

  f.reset()
  await send(f, { from: ADMIN, chat: G, text: "!jogosgratis" })
  assert.match(f.output(), /desativado/)
})

test("!jogosgratis agora: lista no privado sem precisar ativar; sem jogos avisa", async () => {
  mock.method(axios, "get", async () => ({ status: 200, data: [giveaway({ id: 9 })] }))
  const f = fakeClient()
  await send(f, { from: PV, text: "!jogosgratis agora" })
  assert.ok(f.sent.some(s => s.content.image), "mostrou o jogo")
  mock.method(axios, "get", async () => ({ status: 201, data: {} }))
  f.reset()
  await send(f, { from: PV, text: "!jogosgratis agora" })
  assert.match(f.output(), /Nenhum jogo grátis/)
})

// ———————————————— LIVES ————————————————
test("lives: reconhece link ou 'plataforma nome' e rejeita entradas inválidas", () => {
  assert.deepEqual(parseLiveInput(["https://www.twitch.tv/Gaules"]), { platform: "twitch", channel: "Gaules" })
  assert.deepEqual(parseLiveInput(["https://kick.com/meu-canal"]), { platform: "kick", channel: "meu-canal" })
  assert.deepEqual(parseLiveInput(["https://www.youtube.com/@LofiGirl"]), { platform: "youtube", channel: "LofiGirl" })
  assert.deepEqual(parseLiveInput(["https://www.tiktok.com/@user.name/live"]), { platform: "tiktok", channel: "user.name" })
  assert.deepEqual(parseLiveInput(["youtube", "@Canal"]), { platform: "youtube", channel: "Canal" })
  assert.deepEqual(parseLiveInput(["TWITCH", "nome_1"]), { platform: "twitch", channel: "nome_1" })
  assert.equal(parseLiveInput(["facebook", "x"]), null)
  assert.equal(parseLiveInput(["twitch"]), null)
  assert.equal(parseLiveInput(["twitch", "a b; rm -rf"]), null, "nome inválido")
})

test("YouTube: página /live com isLiveNow vira live com o vídeo; sem isso, offline", () => {
  const html = `x"videoDetails":{"videoId":"4t4AQ15yj1M","title":"lofi \\u0026 chill","lengthSeconds":"0"}x"isLiveNow":true`
  assert.deepEqual(live.parseYoutubeLivePage(html, "LofiGirl"), { live: true, stream_id: "4t4AQ15yj1M", title: "lofi & chill", url: "https://www.youtube.com/watch?v=4t4AQ15yj1M", thumbnail: "https://i.ytimg.com/vi/4t4AQ15yj1M/hqdefault_live.jpg" })
  assert.deepEqual(live.parseYoutubeLivePage("<html>canal</html>", "google"), { live: false, url: "https://www.youtube.com/@google" })
})

test("Twitch com chave: token de app e Helix em lote; Kick e TikTok sem chave pelos endpoints públicos", async () => {
  process.env.TWITCH_CLIENT_ID = "cid"; process.env.TWITCH_CLIENT_SECRET = "sec"
  const posts = mock.method(axios, "post", async (url: string) => { assert.equal(url, "https://id.twitch.tv/oauth2/token"); return { data: { access_token: "tok", expires_in: 3600 } } })
  mock.method(axios, "get", async (url: string, cfg: { headers: Record<string, string> }) => {
    assert.match(url, /helix\/streams\?user_login=a(&user_login=b)?$/)
    assert.deepEqual([cfg.headers["Client-Id"], cfg.headers.Authorization], ["cid", "Bearer tok"])
    return { data: { data: [{ id: "S1", user_login: "a", title: "Jogando", thumbnail_url: "https://t/{width}x{height}.jpg", type: "live" }] } }
  })
  const tw = await live.checkLives("twitch", ["a", "b", "a"])
  assert.deepEqual(tw.get("a"), { live: true, stream_id: "S1", title: "Jogando", url: "https://www.twitch.tv/a", thumbnail: "https://t/1280x720.jpg" })
  assert.equal(tw.get("b")!.live, false)
  await live.checkLives("twitch", ["a"])
  assert.equal(posts.mock.callCount(), 1, "token reaproveitado até expirar")

  mock.restoreAll()
  mock.method(axios, "get", async (url: string) => {
    if (url.includes("kick.com/api/v2/channels/canal")) return { data: { livestream: { id: 55, session_title: "Ao vivo!", is_live: true } } }
    if (url.includes("tiktok.com/api-live")) return { data: { data: { user: { roomId: "R9", status: 2 }, liveRoom: { status: 2, title: "Live TT" } } } }
    throw new Error("inesperado " + url)
  })
  assert.deepEqual((await live.checkLives("kick", ["canal"])).get("canal"), { live: true, stream_id: "55", title: "Ao vivo!", url: "https://kick.com/canal", thumbnail: undefined })
  assert.equal((await live.checkLives("tiktok", ["pessoa"])).get("pessoa")!.live, true)
})

test("!addlive/!lives/!rmlive e ciclo: avisa ao entrar no ar, nunca a mesma live duas vezes", async () => {
  const P2 = user(774)
  let isLive = false, streamId = "V1"
  mock.method(axios, "get", async () => ({ data: isLive ? `"videoDetails":{"videoId":"${streamId}xxxxxxxx".slice(0)` : "<html></html>" }))
  // vídeo com 11 caracteres
  mock.restoreAll()
  mock.method(axios, "get", async () => ({ data: isLive ? `"videoDetails":{"videoId":"${streamId.padEnd(11, "x")}","title":"Live"}"isLiveNow":true` : "<html></html>" }))
  const f = fakeClient()
  await send(f, { from: P2, text: "!addlive youtube @MeuCanal" })
  assert.match(f.output(), /MeuCanal[\s\S]*YouTube[\s\S]*Vou avisar[\s\S]*ativados/)
  f.reset()
  await send(f, { from: P2, text: "!addlive https://www.youtube.com/@meucanal" })
  assert.match(f.output(), /já está na lista/, "mesmo canal, maiúsculas diferentes")

  const scheduler = FeatureSchedulerService.getInstance()
  scheduler.start(f.client); scheduler.stop()
  f.reset()
  await fastForward(() => scheduler.livesCycle())
  assert.equal(f.sent.length, 0, "offline: nada")
  isLive = true
  await fastForward(() => scheduler.livesCycle())
  assert.equal(f.sent.length, 1, "entrou no ar: avisou")
  assert.match(String(f.sent[0].content.caption), /MeuCanal[\s\S]*AO VIVO[\s\S]*YouTube[\s\S]*watch\?v=V1/)
  await fastForward(() => scheduler.livesCycle())
  assert.equal(f.sent.length, 1, "mesma live: não repete")
  isLive = false
  await fastForward(() => scheduler.livesCycle())
  isLive = true; streamId = "V2"
  await fastForward(() => scheduler.livesCycle())
  assert.equal(f.sent.length, 2, "nova live: avisa de novo")

  f.reset()
  await send(f, { from: P2, text: "!lives" })
  assert.match(f.output(), /ATIVADOS[\s\S]*🔴 \*MeuCanal\* \(YouTube\)/)
  f.reset()
  await send(f, { from: P2, text: "!rmlive youtube MeuCanal" })
  assert.match(f.output(), /removido/)
  assert.equal((await features.get(P2)).lives.channels.length, 0)
})

test("!addlive avisa na hora se o canal já está ao vivo e não repete o aviso no ciclo", async () => {
  const P3 = user(775)
  mock.method(axios, "get", async () => ({ data: `"videoDetails":{"videoId":"ABCDEFGHIJK","title":"Já no ar"}"isLiveNow":true` }))
  const f = fakeClient()
  await send(f, { from: P3, text: "!addlive youtube @NoAr" })
  assert.match(f.output(), /ao vivo agora[\s\S]*watch\?v=ABCDEFGHIJK/)
  const scheduler = FeatureSchedulerService.getInstance()
  scheduler.start(f.client); scheduler.stop()
  f.reset()
  await fastForward(() => scheduler.livesCycle())
  assert.equal(f.sent.filter(s => s.chatId === P3).length, 0)
})

// ———————————————— FRASES ————————————————
test("frases: horário e intervalo aceitos e recusados", () => {
  assert.equal(ph.parseTime("8"), "08:00"); assert.equal(ph.parseTime("8:30"), "08:30"); assert.equal(ph.parseTime("21h"), "21:00")
  assert.equal(ph.parseTime("21h15"), "21:15"); assert.equal(ph.parseTime("24:00"), null); assert.equal(ph.parseTime("8:61"), null); assert.equal(ph.parseTime("abc"), null)
  assert.equal(ph.parseInterval("30m"), 30); assert.equal(ph.parseInterval("2h"), 120); assert.equal(ph.parseInterval("1h30"), 90)
  assert.equal(ph.parseInterval("1d"), 1440); assert.equal(ph.parseInterval("90"), 90)
  assert.equal(ph.parseInterval("10m"), null, "menos de 30 min"); assert.equal(ph.parseInterval("8d"), null, "mais de 7 dias"); assert.equal(ph.parseInterval("x"), null)
  assert.equal(ph.describeInterval(90), "1 hora(s) e 30 minuto(s)")
})

test("frases: diário dispara uma vez por dia depois do horário; intervalo respeita o tempo", () => {
  const at = (iso: string) => Date.parse(iso)
  const daily = { mode: "daily" as const, time: "08:00", interval_minutes: 0, last_sent: at("2026-11-17T12:00:00Z") }
  assert.equal(ph.isPhraseDue(daily, at("2026-11-18T10:59:00Z")), false, "07:59 em Brasília")
  assert.equal(ph.isPhraseDue(daily, at("2026-11-18T11:00:00Z")), true, "08:00 em Brasília")
  assert.equal(ph.isPhraseDue({ ...daily, last_sent: at("2026-11-18T11:00:30Z") }, at("2026-11-18T20:00:00Z")), false, "já enviou hoje")
  const interval = { mode: "interval" as const, time: "08:00", interval_minutes: 120, last_sent: 0 }
  assert.equal(ph.isPhraseDue({ ...interval, last_sent: 1_000_000 }, 1_000_000 + 119 * 60_000), false)
  assert.equal(ph.isPhraseDue({ ...interval, last_sent: 1_000_000 }, 1_000_000 + 120 * 60_000), true)
})

test("frases: cada chat percorre o banco inteiro sem repetir, em ordem própria", () => {
  const bank = Array.from({ length: 50 }, (_, i) => i)
  const seen = new Set(Array.from({ length: 50 }, (_, i) => ph.phraseAt(bank, "chat-a", i)))
  assert.equal(seen.size, 50, "uma volta sem repetição")
  const a = Array.from({ length: 10 }, (_, i) => ph.phraseAt(bank, "chat-a", i))
  const b = Array.from({ length: 10 }, (_, i) => ph.phraseAt(bank, "chat-b", i))
  assert.notDeepEqual(a, b, "chats diferentes, ordens diferentes")
  assert.deepEqual(a, Array.from({ length: 10 }, (_, i) => ph.phraseAt(bank, "chat-a", i)), "ordem estável")
})

test("!frases, !frasehora, !fraseintervalo, !fraseagora e o envio automático", async () => {
  const P4 = user(776)
  const f = fakeClient()
  await send(f, { from: P4, text: "!frasehora 7:30" })
  assert.match(f.output(), /todo dia às 07:30[\s\S]*ativadas/)
  let saved = await features.get(P4)
  assert.deepEqual([saved.phrases.status, saved.phrases.mode, saved.phrases.time], [true, "daily", "07:30"])
  f.reset()
  await send(f, { from: P4, text: "!fraseintervalo 2h" })
  assert.match(f.output(), /a cada 2 hora\(s\)/)
  f.reset()
  await send(f, { from: P4, text: "!fraseintervalo 5m" })
  assert.match(f.output(), /Intervalo inválido/)
  f.reset()
  await send(f, { from: P4, text: "!fraseagora" })
  assert.match(f.output(), /Frase do momento[\s\S]*“/)

  const scheduler = FeatureSchedulerService.getInstance()
  scheduler.start(f.client); scheduler.stop()
  saved = await features.get(P4)
  f.reset()
  await fastForward(() => scheduler.phrasesCycle(saved.phrases.last_sent + 60_000))
  assert.equal(f.sent.filter(s => s.chatId === P4).length, 0, "ainda não deu 2 h")
  await fastForward(() => scheduler.phrasesCycle(saved.phrases.last_sent + 2 * 3_600_000))
  assert.equal(f.sent.filter(s => s.chatId === P4).length, 1, "deu 2 h: enviou")
  const after = await features.get(P4)
  assert.equal(after.phrases.cursor, saved.phrases.cursor + 1, "avançou para a próxima frase")

  f.reset()
  await send(f, { from: P4, text: "!frases" })
  assert.match(f.output(), /desativadas/)
})

test("banco de frases: pelo menos 5.000, sem repetidas, sem vazias", () => {
  assert.ok(PHRASES.length >= 5000, `tem ${PHRASES.length}`)
  assert.ok(PHRASES.every(p => p.text.trim().length >= 10))
  const keys = new Set(PHRASES.map(p => p.text.toLowerCase()))
  assert.equal(keys.size, PHRASES.length)
})

// ———————————————— VIRUSTOTAL ————————————————
test("VirusTotal: identificador de URL, veredito e critério do alerta", () => {
  assert.equal(vt.urlId("http://www.example.com/?a=1"), "aHR0cDovL3d3dy5leGFtcGxlLmNvbS8_YT0x")
  assert.equal(vt.verdictOf({ malicious: 1, suspicious: 0, harmless: 70, undetected: 10 }), "malicious")
  assert.equal(vt.verdictOf({ malicious: 0, suspicious: 0, harmless: 0, undetected: 0 }), "unknown")
  assert.equal(vt.isDangerous({ malicious: 1, suspicious: 0, harmless: 70, undetected: 0 }), false, "1 antivírus só não alerta")
  assert.equal(vt.isDangerous({ malicious: 2, suspicious: 0, harmless: 70, undetected: 0 }), true)
  assert.equal(vt.isDangerous({ malicious: 1, suspicious: 2, harmless: 70, undetected: 0 }), true)
  assert.equal(vt.withScheme("site.com/x"), "https://site.com/x")
})

test("VirusTotal: usa relatório existente; desconhecido é enviado e aguardado; 429 vira aviso de cota; arquivo só pelo hash", async () => {
  process.env.VIRUSTOTAL_API_KEY = "vtkey"
  const calls: string[] = []
  mock.method(axios, "request", async (cfg: { method: string, url: string, headers: Record<string, string>, data?: URLSearchParams }) => {
    calls.push(`${cfg.method} ${cfg.url.replace("https://www.virustotal.com/api/v3", "")}`)
    assert.equal(cfg.headers["x-apikey"], "vtkey")
    if (cfg.url.endsWith(`/urls/${vt.urlId("https://ruim.test")}`)) return { data: { data: { attributes: { last_analysis_stats: { malicious: 5, suspicious: 1, harmless: 60, undetected: 5 } } } } }
    if (cfg.url.includes("/urls/") && cfg.method === "get") throw Object.assign(new Error("404"), { response: { status: 404 } })
    if (cfg.url.endsWith("/urls") && cfg.method === "post") { assert.equal(cfg.data?.get("url"), "https://novo.test"); return { data: { data: { id: "AN1" } } } }
    if (cfg.url.endsWith("/analyses/AN1")) return { data: { data: { attributes: { status: "completed", stats: { malicious: 0, suspicious: 0, harmless: 65, undetected: 8 } } } } }
    if (cfg.url.includes("/files/")) throw Object.assign(new Error("404"), { response: { status: 404 } })
    throw new Error("inesperado " + cfg.url)
  })
  assert.equal((await vt.scanUrl("https://ruim.test")).verdict, "malicious")
  assert.equal((await vt.scanUrl("https://ruim.test")).verdict, "malicious")
  assert.equal(calls.length, 1, "segunda consulta veio do cache de 24 h")
  assert.equal((await vt.scanUrl("https://novo.test", { pollIntervalMs: 1 })).verdict, "clean")
  assert.deepEqual(calls.slice(1), [`get /urls/${vt.urlId("https://novo.test")}`, "post /urls", "get /analyses/AN1"])
  assert.equal((await vt.scanFileHash("a".repeat(64))).verdict, "unknown")
  assert.ok(calls.every(c => !c.startsWith("post /files")), "nenhum arquivo enviado")

  mock.restoreAll()
  vt.resetVirusTotalLimits()
  mock.method(axios, "request", async () => { throw Object.assign(new Error("429"), { response: { status: 429 } }) })
  await assert.rejects(vt.scanUrl("https://x.test"), vt.VirusTotalQuotaError)
})

test("VirusTotal: no máximo 4 consultas por minuto (a 5ª espera)", async () => {
  process.env.VIRUSTOTAL_API_KEY = "vtkey"
  mock.method(axios, "request", async () => ({ data: { data: { attributes: { last_analysis_stats: { malicious: 0, suspicious: 0, harmless: 1, undetected: 0 } } } } }))
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 })
  try {
    const done: number[] = []
    const all = [1, 2, 3, 4, 5].map(i => vt.scanFileHash(String(i).repeat(64)).then(() => done.push(i)))
    for (let i = 0; i < 10; i++) await Promise.resolve()
    assert.equal(done.length, 4, "4 passaram na hora")
    mock.timers.tick(60_100)
    await Promise.all(all)
    assert.equal(done.length, 5, "a 5ª passou depois de 1 minuto")
  } finally {
    mock.timers.reset()
  }
})

async function waitFor(check: () => boolean) {
  await fastForward(async () => { for (let i = 0; i < 200 && !check(); i++) await new Promise(r => setTimeout(r, 5)) })
}

test("!scanlinks: alerta link perigoso no grupo e apaga com 3+ antivírus; desligado ou sem chave não consulta", async () => {
  process.env.VIRUSTOTAL_API_KEY = "vtkey"
  const request = mock.method(axios, "request", async () => ({ data: { data: { attributes: { last_analysis_stats: { malicious: 6, suspicious: 0, harmless: 50, undetected: 3 } } } } }))
  const f = fakeClient()
  await send(f, { from: MEMBER, chat: G, text: "olha https://golpe.test/premio" })
  await fastForward(() => new Promise(r => setTimeout(r, 20)))
  assert.equal(request.mock.callCount(), 0, "proteção desligada: nem consulta")

  await send(f, { from: ADMIN, chat: G, text: "!scanlinks" })
  assert.match(f.output(), /ativada/)
  f.reset()
  await send(f, { from: MEMBER, chat: G, text: "olha https://golpe.test/premio" })
  await waitFor(() => /LINK PERIGOSO/.test(f.output()))
  assert.match(f.output(), /LINK PERIGOSO[\s\S]*golpe\.test[\s\S]*6\* antivírus[\s\S]*apagada/)
  assert.ok(f.sent.some(s => (s.content as { delete?: unknown }).delete), "mensagem apagada (bot é admin)")

  request.mock.mockImplementation(async () => ({ data: { data: { attributes: { last_analysis_stats: { malicious: 0, suspicious: 0, harmless: 70, undetected: 5 } } } } }))
  vt.resetVirusTotalLimits()
  f.reset()
  await send(f, { from: MEMBER, chat: G, text: "site bom https://seguro.test" })
  await fastForward(() => new Promise(r => setTimeout(r, 30)))
  assert.equal(f.sent.length, 0, "link limpo: silêncio")

  delete process.env.VIRUSTOTAL_API_KEY
  const before = request.mock.callCount()
  await send(f, { from: MEMBER, chat: G, text: "outro https://x.test" })
  await fastForward(() => new Promise(r => setTimeout(r, 20)))
  assert.equal(request.mock.callCount(), before, "sem chave: não consulta")
  await features.update(G, c => { c.linkscan.status = false })
})

test("!scan: verifica link digitado ou documento respondido (só hash); sem nada explica o uso", async () => {
  process.env.VIRUSTOTAL_API_KEY = "vtkey"
  const urls: string[] = []
  mock.method(axios, "request", async (cfg: { url: string }) => {
    urls.push(cfg.url)
    return { data: { data: { attributes: { last_analysis_stats: { malicious: 0, suspicious: 1, harmless: 60, undetected: 4 } } } } }
  })
  const f = fakeClient()
  await send(f, { from: PV, text: "!scan exemplo.test/pagina" })
  assert.match(f.output(), /SUSPEITO[\s\S]*Suspeito: \*1\*/)
  assert.ok(urls[0].includes(`/urls/${vt.urlId("https://exemplo.test/pagina")}`))

  f.reset(); urls.length = 0
  const docMessage = await waMedia("document", Buffer.from("conteudo do documento"), { fileName: "nota.pdf" })
  await send(f, { from: PV, text: "!scan", quoted: { stanzaId: "Q1", participant: PV, quotedMessage: docMessage } })
  assert.match(f.output(), /SHA-256: [0-9a-f]{64}/)
  assert.ok(urls[0].includes("/files/"), "consulta por hash")
  assert.ok(urls.every(u => !u.endsWith("/files")), "não enviou o arquivo")

  f.reset()
  await send(f, { from: PV, text: "!scan" })
  assert.match(f.output(), /Envie um link/)
})
