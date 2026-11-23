/**
 * !yt na melhor qualidade que cabe no limite (H.264, sem recomprimir), erros do !ig explicados,
 * !marcar/!tagall (invisível, lista e respondendo), !discord por grupo e !link.
 */
import { test, before, afterEach, mock } from "node:test"
import assert from "node:assert/strict"
import { fakeClient, setupBot, setupGroup, send, user, HOST } from "./helpers/harness.js"
import { pickYoutubeFormats, ytDlpVideoFormat, instagramErrorMessage, ytDlpFailure, YtFormat } from "../src/utils/download.util.js"
import { normalizeDiscordInvite, parseDiscordInput } from "../src/commands/group.extra.functions.commands.js"

const G = "120363100000000555@g.us", G2 = "120363100000000556@g.us"
const ADMIN = user(5501), M1 = user(5502), M2 = user(5503)
const MB = 1024 * 1024

before(async () => {
  await setupBot()
  await setupGroup(G, [{ id: ADMIN, admin: true }, { id: M1 }, { id: M2 }])
  await setupGroup(G2, [{ id: ADMIN, admin: true }, { id: M1 }])
})
afterEach(() => mock.restoreAll())

// ———————————————— !yt ————————————————
const v = (height: number, mb: number, codec = "avc1.64001F"): YtFormat => ({ hasVideo: true, hasAudio: false, container: "mp4", videoCodec: codec, height, contentLength: mb * MB })
const audio: YtFormat = { hasVideo: false, hasAudio: true, container: "mp4", bitrate: 128_000, contentLength: 3 * MB }

test("!yt: maior resolução H.264 que cabe no limite; nunca VP9/AV1; reserva yt-dlp com as mesmas regras", () => {
  const formats = [v(1080, 77), v(720, 25), v(480, 13), v(360, 8), v(1440, 120, "vp09.00.50.08"), { ...v(2160, 40), videoCodec: "av01.0.12M.08" }, audio,
    { hasVideo: false, hasAudio: true, container: "webm", bitrate: 160_000, contentLength: 4 * MB }]
  assert.equal(pickYoutubeFormats(formats, 213, { maxBytes: 50 * MB, maxHeight: 1080 })!.video.height, 720, "1080p (80 MB) não cabe em 50 MB")
  assert.equal(pickYoutubeFormats(formats, 213, { maxBytes: 100 * MB, maxHeight: 1080 })!.video.height, 1080, "cabendo, vai em 1080p")
  assert.equal(pickYoutubeFormats(formats, 213, { maxBytes: 100 * MB, maxHeight: 720 })!.video.height, 720, "respeita a resolução máxima")
  assert.equal(pickYoutubeFormats(formats, 213, { maxBytes: 1 * MB, maxHeight: 1080 })!.video.height, 360, "nada cabe: fica com a menor")
  assert.equal(pickYoutubeFormats(formats, 213, { maxBytes: 50 * MB, maxHeight: 1080 })!.audio.container, "mp4", "áudio AAC (m4a) para juntar no MP4")
  // sem contentLength: estima pelo bitrate × duração
  const estimated = pickYoutubeFormats([{ ...v(1080, 0), contentLength: undefined, bitrate: 4_000_000 }, { ...v(720, 0), contentLength: undefined, bitrate: 1_500_000 }, audio], 300, { maxBytes: 80 * MB, maxHeight: 1080 })
  assert.equal(estimated!.video.height, 720, "1080p estimado em ~150 MB")
  assert.equal(pickYoutubeFormats([audio], 60), null)
  assert.match(ytDlpVideoFormat({ maxBytes: 50 * MB, maxHeight: 1080 }), /^bv\*\[vcodec\^=avc1\]\[ext=mp4\]\[height<=1080\]\[filesize<\?42M\]\+ba\[ext=m4a\]/)
})

// ———————————————— !ig ————————————————
test("!ig: o motivo real do erro vira uma explicação (antes era sempre 'erro interno')", () => {
  assert.match(instagramErrorMessage(new Error("ERROR: [Instagram] x: Requested content is not available, rate-limit reached or login required")), /limitou|login/)
  assert.match(instagramErrorMessage(new Error("ERROR: [Instagram] HTTP Error 429: Too Many Requests")), /limitou os downloads/)
  assert.match(instagramErrorMessage(new Error("ERROR: No video formats found!")), /apenas fotos/)
  assert.match(instagramErrorMessage(new Error("ERROR: Unsupported URL: https://instagram.com/")), /Não reconheci esse link/)
  assert.match(instagramErrorMessage(new Error("yt-dlp não encontrado em /app/bin/yt-dlp")), /setup:yt-dlp/)
  assert.match(instagramErrorMessage(new Error("yt-dlp: tempo esgotado (60s)")), /demorou demais/)
  assert.match(instagramErrorMessage(new Error("algo inesperado")), /erro interno/)
})

test("yt-dlp que nem inicia (código 127, como no ARM64) vira mensagem clara com o motivo", () => {
  const NL = String.fromCharCode(10)
  const msg = ytDlpFailure(127, "/tmp/_MEI123/libpython3.13.so: failed to map segment from shared object" + NL)
  assert.match(msg, /não conseguiu executar no servidor \(código 127\): .*failed to map segment/)
  assert.match(instagramErrorMessage(new Error(msg)), /não consegue executar neste servidor[\s\S]*docker compose build --no-cache/)
  assert.equal(ytDlpFailure(1, ["[instagram] x: Downloading", "ERROR: [Instagram] x: Requested content is not available", ""].join(NL)), "ERROR: [Instagram] x: Requested content is not available", "a linha ERROR do yt-dlp tem prioridade")
  assert.equal(ytDlpFailure(2, ""), "yt-dlp terminou com código 2")
})

// ———————————————— !marcar / !tagall ————————————————
test("!marcar: invisível, com lista de @ e respondendo uma mensagem; só admin; sem marcar o bot", async () => {
  const f = fakeClient()
  await send(f, { from: M1, chat: G, text: "!marcar oi" })
  assert.match(f.output(), /administradores do grupo/)

  f.reset()
  await send(f, { from: ADMIN, chat: G, text: "!marcar Reunião às 20h!" })
  const hidden = f.sent.find(s => Array.isArray(s.content.mentions))!
  assert.equal(hidden.content.text, "📢 Reunião às 20h!", "texto limpo, sem @")
  assert.deepEqual([...(hidden.content.mentions as string[])].sort(), [ADMIN, M1, M2].sort(), "todos menos o bot")
  assert.ok(!(hidden.content.mentions as string[]).includes(HOST))

  f.reset()
  await send(f, { from: ADMIN, chat: G, text: "!tagall lista Avisos" })
  const listed = f.sent.find(s => Array.isArray(s.content.mentions))!
  assert.match(String(listed.content.text), /📢 Avisos[\s\S]*@5511900005502/)

  f.reset()
  await send(f, { from: ADMIN, chat: G, text: "!marcar", quoted: { stanzaId: "AVISO1", participant: M1, quotedMessage: { conversation: "Amanhã não tem aula" } } })
  const quoted = f.sent.find(s => Array.isArray(s.content.mentions))!
  assert.match(String(quoted.content.text), /Marcando todos \(3\) nesta mensagem/)
  assert.equal((quoted.options?.quoted as { key: { id: string } }).key.id, "AVISO1", "responde a mensagem do aviso")
})

// ———————————————— !discord ————————————————
test("!discord: cada grupo com seus convites e nomes; só admin altera; links validados", async () => {
  assert.equal(normalizeDiscordInvite("https://discord.gg/abc123"), "https://discord.gg/abc123")
  assert.equal(normalizeDiscordInvite("discord.com/invite/Xyz-9"), "https://discord.gg/Xyz-9")
  assert.equal(normalizeDiscordInvite("https://discordapp.com/invite/abc"), "https://discord.gg/abc")
  assert.equal(normalizeDiscordInvite("https://discord-gg.com/abc"), null, "domínio falso")
  assert.equal(normalizeDiscordInvite("https://evil.com/?discord.gg/abc"), "https://discord.gg/abc", "o link gerado é sempre o oficial discord.gg")
  assert.deepEqual(parseDiscordInput("Gamers BR | https://discord.gg/abc123"), { name: "Gamers BR", url: "https://discord.gg/abc123" })
  assert.deepEqual(parseDiscordInput("https://discord.gg/abc123 Gamers BR"), { name: "Gamers BR", url: "https://discord.gg/abc123" })

  const f = fakeClient()
  await send(f, { from: ADMIN, chat: G, text: "!discord" })
  assert.match(f.output(), /ainda não tem convite/)
  f.reset()
  await send(f, { from: M1, chat: G, text: "!discord add Gamers | https://discord.gg/aaa" })
  assert.match(f.output(), /administradores do grupo/)
  await send(f, { from: ADMIN, chat: G, text: "!discord add Gamers BR | https://discord.gg/aaa" })
  await send(f, { from: ADMIN, chat: G, text: "!discord add Estudos https://discord.com/invite/bbb" })
  await send(f, { from: ADMIN, chat: G, text: "!discord add gamers br | https://discord.gg/ccc" })
  assert.match(f.output(), /atualizado/, "mesmo nome (sem diferenciar maiúsculas) atualiza")
  await send(f, { from: ADMIN, chat: G, text: "!discord add Sem link aqui" })
  assert.match(f.output(), /Link do Discord inválido/)

  f.reset()
  await send(f, { from: M1, chat: G, text: "!discord" })
  assert.match(f.output(), /Discord do grupo\* \(2\)[\s\S]*1\.\* Gamers BR\n🔗 https:\/\/discord\.gg\/ccc[\s\S]*2\.\* Estudos\n🔗 https:\/\/discord\.gg\/bbb/)

  f.reset()
  await send(f, { from: ADMIN, chat: G2, text: "!discord" })
  assert.match(f.output(), /ainda não tem convite/, "outro grupo tem a própria lista")

  f.reset()
  await send(f, { from: ADMIN, chat: G, text: "!discord rm 2" })
  assert.match(f.output(), /Estudos\* removido/)
  await send(f, { from: ADMIN, chat: G, text: "!discord rm gamers br" })
  assert.match(f.output(), /Gamers BR\* removido/)
  await send(f, { from: ADMIN, chat: G, text: "!discord rm Nada" })
  assert.match(f.output(), /Não achei esse convite/)
})

// ———————————————— !link ————————————————
test("!link: admin recebe o link de convite atual do grupo", async () => {
  const f = fakeClient()
  await send(f, { from: ADMIN, chat: G, text: "!link" })
  assert.match(f.output(), /Link do grupo[\s\S]*chat\.whatsapp\.com\/CODIGO123/)
  f.reset()
  await send(f, { from: M1, chat: G, text: "!link" })
  assert.match(f.output(), /administradores do grupo/)
})
