/*
 * Figurinhas com som (lançadas pelo WhatsApp em 24/11/2026).
 *
 * O Baileys 7.0.0-rc14 ainda não conhece o formato (issue #2932): a figurinha com som chega como
 * mensagem vazia e não há como enviá-la. Este módulo cobre os dois lados até o Baileys oficializar,
 * usando as definições extraídas do próprio WhatsApp Web (whatsmeow, proto v1054751086):
 *
 *   message Message        { optional FutureProofMessage audioStickerMessage = 134; }
 *   message FutureProofMessage { optional Message message = 1; }
 *   message StickerMessage { optional int32 premium = 24; optional string emojis = 25;
 *                            oneof audio { AudioMessage audioMessage = 26; } }
 *
 * Envio: a figurinha é montada normalmente pelo Baileys (assim o nó sai com mediatype="sticker") e
 * marcada com um código temporário no accessibilityLabel. Na hora de codificar (proto.Message.encode,
 * por onde passam a mensagem e a cópia para os outros aparelhos), a marca é retirada e a mensagem sai
 * como audioStickerMessage { message { stickerMessage { ..., premium = 0, audioMessage } } }.
 * Recebimento: se a mensagem decodificada não tem conteúdo conhecido mas traz o campo 134, a
 * figurinha de dentro vira um stickerMessage comum (comandos como !simg passam a funcionar).
 *
 * Quando o Baileys incluir o formato, este módulo pode ser removido.
 */
import { proto } from "baileys"
import ffmpeg from "fluent-ffmpeg"
import fs from "fs-extra"
import crypto from "node:crypto"
import { getTempPath } from "./general.util.js"

export const AUDIO_STICKER_FIELD = 134
const FUTURE_PROOF_MESSAGE_FIELD = 1
const STICKER_FIELD = 26
const PREMIUM_FIELD = 24
const STICKER_AUDIO_FIELD = 26
/** Tag do campo 134 (comprimento delimitado) em varint: (134 << 3) | 2 = 1074 → 0xB2 0x08. */
const AUDIO_STICKER_TAG = [0xb2, 0x08]

/** Prefixo da marca temporária (nunca é enviada: o codificador sempre a retira). */
const MARK = "\u0000sinforoso-sound:"
/** Áudios aguardando envio; guardados por 10 minutos para cobrir reenvios do próprio Baileys. */
const pending = new Map<string, { audio: proto.Message.IAudioMessage, at: number }>()
const PENDING_TTL_MS = 10 * 60 * 1000

/** O WhatsApp só toca o áudio com este mimetype exato (com "audio/ogg" puro a figurinha fica muda). */
export const STICKER_AUDIO_MIMETYPE = "audio/ogg; codecs=opus"
/** Limite observado de ~1.000.000 bytes para o áudio; fica abaixo com folga. */
export const STICKER_AUDIO_MAX_BYTES = 900_000
/** Figurinha feita de vídeo leva 5 segundos de som, como no aplicativo oficial. */
export const VIDEO_STICKER_AUDIO_SECONDS = 5

type Encoder = (m: proto.IMessage, w?: protobufWriter) => protobufWriter
type Decoder = (r: Uint8Array | protobufReader, l?: number, e?: number) => proto.Message
interface protobufWriter { uint32(v: number): protobufWriter, int32(v: number): protobufWriter, fork(): protobufWriter, ldelim(): protobufWriter }
interface protobufReader { buf: Uint8Array, pos: number, len: number }

const INSTALLED = Symbol.for("sinforoso.soundSticker")

/** Marca a figurinha para sair com som; devolve o rótulo a colocar em stickerMessage.accessibilityLabel. */
export function markStickerAudio(audio: proto.Message.IAudioMessage, now = Date.now()): string {
    for (const [id, item] of pending) if (now - item.at > PENDING_TTL_MS) pending.delete(id)
    const id = crypto.randomBytes(9).toString("hex")
    pending.set(id, { audio, at: now })
    return MARK + id
}

/** Instala o codificador e o decodificador (uma vez só, mesmo se chamado de novo). */
export function installSoundStickerSupport() {
    const message = proto.Message as unknown as { encode: Encoder, decode: Decoder, [INSTALLED]?: boolean }
    if (message[INSTALLED]) return
    const originalEncode = message.encode
    const originalDecode = message.decode

    message.encode = function (m, w) {
        const sticker = m?.stickerMessage
        const label = sticker?.accessibilityLabel
        if (!sticker || typeof label !== "string" || !label.startsWith(MARK)) return originalEncode.call(this, m, w)
        const { accessibilityLabel: _mark, ...cleanSticker } = sticker
        const audio = pending.get(label.slice(MARK.length))?.audio
        if (!audio) return originalEncode.call(this, { ...m, stickerMessage: cleanSticker }, w)
        const { stickerMessage: _sticker, ...rest } = m
        const writer = originalEncode.call(this, rest, w)
        writer.uint32((AUDIO_STICKER_FIELD << 3) | 2).fork()       // audioStickerMessage (FutureProofMessage)
        writer.uint32((FUTURE_PROOF_MESSAGE_FIELD << 3) | 2).fork() // .message
        writer.uint32((STICKER_FIELD << 3) | 2).fork()              // .stickerMessage
        proto.Message.StickerMessage.encode(cleanSticker, writer as never)
        writer.uint32((PREMIUM_FIELD << 3) | 0).int32(0)            // premium = 0 (como nas figurinhas comuns do app)
        writer.uint32((STICKER_AUDIO_FIELD << 3) | 2).fork()        // audioMessage
        proto.Message.AudioMessage.encode(audio, writer as never)
        writer.ldelim().ldelim().ldelim().ldelim()
        return writer
    }

    message.decode = function (r, l, e) {
        const view = r instanceof Uint8Array ? { buf: r, start: 0, end: r.length }
            : r && (r as protobufReader).buf ? { buf: (r as protobufReader).buf, start: (r as protobufReader).pos, end: l === undefined ? (r as protobufReader).len : (r as protobufReader).pos + l } : null
        const decoded = originalDecode.call(this, r, l, e)
        if (view && !decoded.stickerMessage) {
            try {
                const sticker = unwrapAudioSticker(view.buf.subarray(view.start, view.end))
                if (sticker) decoded.stickerMessage = sticker
            } catch { /* conteúdo desconhecido continua ignorado, como antes */ }
        }
        return decoded
    }
    message[INSTALLED] = true
}

/** Lê um varint (protobuf) a partir de pos; devolve [valor, nova posição]. */
function readVarint(buf: Uint8Array, pos: number): [number, number] {
    let value = 0, shift = 0
    while (pos < buf.length) {
        const byte = buf[pos++]
        value += (byte & 0x7f) * 2 ** shift
        if (byte < 0x80) return [value, pos]
        shift += 7
        if (shift > 63) break
    }
    throw new Error("varint inválido")
}

/** Procura o campo 134 no primeiro nível da mensagem e devolve a figurinha de dentro. */
export function unwrapAudioSticker(bytes: Uint8Array): proto.Message.IStickerMessage | null {
    if (!hasTag(bytes)) return null
    let pos = 0
    while (pos < bytes.length) {
        const [tag, afterTag] = readVarint(bytes, pos)
        const field = Math.floor(tag / 8), wire = tag & 7
        pos = afterTag
        if (wire === 0) { pos = readVarint(bytes, pos)[1]; continue }
        if (wire === 1) { pos += 8; continue }
        if (wire === 5) { pos += 4; continue }
        if (wire !== 2) return null
        const [length, start] = readVarint(bytes, pos)
        pos = start + length
        if (field === AUDIO_STICKER_FIELD) {
            const inner = proto.Message.FutureProofMessage.decode(bytes.subarray(start, pos))
            return inner.message?.stickerMessage ?? null
        }
    }
    return null
}

function hasTag(bytes: Uint8Array): boolean {
    for (let i = 0; i < bytes.length - 1; i++) if (bytes[i] === AUDIO_STICKER_TAG[0] && bytes[i + 1] === AUDIO_STICKER_TAG[1]) return true
    return false
}

/**
 * Extrai o som do vídeo para a figurinha: só a faixa de áudio (sem capa ou vídeo, que impedem a
 * reprodução), Opus em OGG, mono 48 kHz. Devolve null se o vídeo não tiver som.
 */
export async function extractStickerAudio(video: Buffer, seconds = VIDEO_STICKER_AUDIO_SECONDS): Promise<{ audio: Buffer, seconds: number } | null> {
    const input = getTempPath("mp4"), output = getTempPath("ogg")
    try {
        await fs.writeFile(input, video)
        const ok = await new Promise<boolean>((resolve) => {
            ffmpeg(input)
                // aresample first_pts=0: se o áudio do arquivo começa depois da imagem (comum em gravações de
                // celular), completa o início com silêncio. Sem isso o OGG descarta esse atraso e o som saía
                // adiantado em relação à animação (que segue a linha do tempo do arquivo).
                .outputOptions(["-vn", "-map", "0:a:0", "-af", "aresample=async=1:first_pts=0", "-t", String(seconds), "-c:a", "libopus", "-b:a", "64k", "-ac", "1", "-ar", "48000", "-map_metadata", "-1"])
                .format("ogg")
                .on("end", () => resolve(true))
                .on("error", () => resolve(false)) // sem faixa de áudio (ou ffmpeg sem libopus): figurinha sem som
                .save(output)
        })
        if (!ok || !fs.existsSync(output)) return null
        const audio = await fs.readFile(output)
        if (audio.length < 200 || audio.length > STICKER_AUDIO_MAX_BYTES) return null
        const duration = await new Promise<number>((resolve) => {
            ffmpeg.ffprobe(output, (err, data) => resolve(err ? seconds : Number(data?.format?.duration) || seconds))
        })
        return { audio, seconds: Math.max(1, Math.min(seconds, Math.round(duration))) }
    } finally {
        await fs.remove(input).catch(() => undefined)
        await fs.remove(output).catch(() => undefined)
    }
}

installSoundStickerSupport()
