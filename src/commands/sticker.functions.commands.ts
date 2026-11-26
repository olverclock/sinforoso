import { downloadMediaMessage, WASocket } from "baileys"
import { Bot } from "../interfaces/bot.interface.js"
import { Group } from "../interfaces/group.interface.js"
import { Message } from "../interfaces/message.interface.js"
import * as waUtil from '../utils/whatsapp.util.js'
import * as imageUtil from '../utils/image.util.js'
import * as stickerUtil from '../utils/sticker.util.js'
import { extractStickerAudio, VIDEO_STICKER_AUDIO_SECONDS } from '../utils/sound-sticker.util.js'
import { clipVideo, formatClock, rangeLength } from '../utils/clip.util.js'
import { anyVideo, isLink, LoginRequiredError, NoVideoError, siteName } from '../utils/any-video.util.js'
import { languageName, parseDownloadOptions } from '../utils/audio-lang.util.js'
import { AudioLanguageUnavailableError } from '../utils/download.util.js'
import { buildText, errorMessage } from "../utils/general.util.js"
import { messageErrorCommandUsage } from "../utils/commands.util.js"
import stickerCommands from "./sticker.list.commands.js"

/** Opções do !s: "1" círculo, "2" sem cortar, "mudo" sem som e um trecho opcional ("0:03-0:08"). */
function stickerArgs(text: string) {
    // Primeiro as palavras de opção (1, 2, mudo); depois trecho e idioma, em qualquer ordem
    const all = text.trim().split(/\s+/).filter(Boolean)
    const isFlag = (word: string) => /^(1|2|mudo|semsom|sem-som)$/i.test(word)
    const flags = all.filter(isFlag)
    const { rest, range, lang } = parseDownloadOptions(all.filter(word => !isFlag(word)).join(' '))
    const words = [...rest.split(/\s+/).filter(Boolean), ...flags]
    const stickerType: "resize" | "contain" | "circle" = flags.includes('1') ? 'circle' : flags.includes('2') ? 'contain' : 'resize'
    const muted = flags.some(word => /^(mudo|semsom|sem-som)$/i.test(word))
    // Idioma do áudio (dublagem do YouTube), ex.: "en"; sem idioma, o original
    return { stickerType, muted, range, words, lang }
}

/** Mídia do !s (a própria mensagem ou a citada). */
function stickerSource(message: Message) {
    return {
        type: (message.isQuoted) ? message.quotedMessage?.type : message.type,
        message: (message.isQuoted) ? message.quotedMessage?.wa_message : message.wa_message,
        seconds: (message.isQuoted) ? message.quotedMessage?.media?.seconds : message.media?.seconds
    }
}

export async function sCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    const { stickerType, muted, range } = stickerArgs(message.text_command)
    const messageData = stickerSource(message)
    const isVideo = messageData.type == "videoMessage"

    if (!messageData.type || !messageData.message) {
        throw new Error(stickerCommands.s.msgs.error_message)
    } else if (messageData.type != "imageMessage" && !isVideo) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    } else if (isVideo && range && rangeLength(range) > 9) {
        throw new Error(stickerCommands.s.msgs.error_range_limit)
    } else if (isVideo && !range && messageData.seconds && messageData.seconds > 9) {
        // Vídeo longo: com um trecho (ex.: !s 0:10-0:15) dá para escolher a parte da figurinha
        throw new Error(buildText(stickerCommands.s.msgs.error_limit))
    }

    const downloaded = await downloadMediaMessage(messageData.message, "buffer", {})
    const mediaBuffer = (isVideo && range) ? await clipVideo(downloaded, range) : downloaded
    await createAndSendSticker(client, botInfo, message, mediaBuffer, { isVideo, muted, stickerType })
}

/**
 * Cria e envia a figurinha. Vídeo com som vira figurinha com som: som e animação usam os MESMOS
 * primeiros 5 s (sincronizados). "mudo" mantém sem som (e a animação com a duração inteira, até 9 s).
 */
async function createAndSendSticker(client: WASocket, botInfo: Bot, message: Message, mediaBuffer: Buffer, opts: { isVideo: boolean, muted: boolean, stickerType: "resize" | "contain" | "circle" }) {
    const authorText = buildText(stickerCommands.s.msgs.author_text, message.pushname)
    const sound = (opts.isVideo && !opts.muted) ? await extractStickerAudio(mediaBuffer).catch(() => null) : null
    const stickerBuffer = await stickerUtil.createSticker(mediaBuffer, { pack: botInfo.name, author: authorText, fps: 9, type: opts.stickerType, maxSeconds: sound ? VIDEO_STICKER_AUDIO_SECONDS : undefined })
    if (sound) await waUtil.sendSoundSticker(client, message.chat_id, stickerBuffer, sound, { expiration: message.expiration })
    else await waUtil.sendSticker(client, message.chat_id, stickerBuffer, { expiration: message.expiration })
}

/** !sbx: figurinha (com som) do vídeo de qualquer site; sem trecho, usa os primeiros 5 s. */
export async function sbxCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    const { stickerType, muted, range, words, lang } = stickerArgs(message.text_command)
    const url = words.find(isLink)
    if (!url) throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    if (range && rangeLength(range) > 9) throw new Error(stickerCommands.s.msgs.error_range_limit)

    const segment = range ?? { start: 0, end: muted ? 9 : VIDEO_STICKER_AUDIO_SECONDS }
    const waitReply = buildText(stickerCommands.sbx.msgs.wait, siteName(url), formatClock(segment.start), formatClock(segment.end))
    await waUtil.replyText(client, message.chat_id, waitReply, message.wa_message, { expiration: message.expiration })
    const video = await anyVideo(url, segment, lang).catch((err: unknown) => {
        if (err instanceof AudioLanguageUnavailableError) throw new Error(err.available.length
            ? buildText(stickerCommands.sbx.msgs.error_language, languageName(err.lang), err.available.map(t => `${languageName(t.code)}${t.original ? ' (original)' : ''} = *${t.code}*`).join(', '))
            : buildText(stickerCommands.sbx.msgs.error_no_dubs, languageName(err.lang)))
        if (err instanceof NoVideoError) throw new Error(stickerCommands.sbx.msgs.error_no_video)
        if (err instanceof LoginRequiredError) throw new Error(stickerCommands.sbx.msgs.error_login)
        throw err
    })
    await createAndSendSticker(client, botInfo, message, video, { isVideo: true, muted, stickerType })
}

export async function simgCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    if (!message.isQuoted || !message.quotedMessage) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    } else if (message.quotedMessage.type != "stickerMessage") {
        throw new Error(stickerCommands.simg.msgs.error_sticker)
    }

    let messageQuotedData = message.quotedMessage.wa_message

    if (messageQuotedData.message?.stickerMessage?.url == "https://web.whatsapp.net") {
        messageQuotedData.message.stickerMessage.url = `https://mmg.whatsapp.net${messageQuotedData.message.stickerMessage.directPath}`
    }

    const stickerBuffer = await downloadMediaMessage(message.quotedMessage.wa_message, "buffer", {})
    const imageBuffer = await stickerUtil.stickerToImage(stickerBuffer)
    await waUtil.replyFileFromBuffer(client, message.chat_id, 'imageMessage', imageBuffer, '', message.wa_message, { expiration: message.expiration, mimetype: 'image/png' })
}

export async function ssfCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    let messageData = {
        type: (message.isQuoted) ? message.quotedMessage?.type : message.type,
        message: (message.isQuoted) ? message.quotedMessage?.wa_message : message.wa_message
    }

    if (!messageData.type || !messageData.message) {
        throw new Error(stickerCommands.ssf.msgs.error_message)
    } else if (messageData.type != "imageMessage") {
        throw new Error(stickerCommands.ssf.msgs.error_image)
    }

    // Feedback visual: Reagir com ampulheta para indicar processamento IA
    await client.sendMessage(message.chat_id, { react: { text: "⌛", key: message.wa_message.key } })

    try {
        const mediaBuffer = await downloadMediaMessage(messageData.message, "buffer", {})
        const imageBufferRemovedBg = await imageUtil.removeBackground(mediaBuffer)
        const authorText = buildText(stickerCommands.ssf.msgs.author_text, message.pushname)
        const stickerBuffer = await stickerUtil.createSticker(imageBufferRemovedBg, { pack: botInfo.name, author: authorText, fps: 9, type: 'resize' })
        await waUtil.sendSticker(client, message.chat_id, stickerBuffer, { expiration: message.expiration })

        // Sucesso: Reagir com check
        await client.sendMessage(message.chat_id, { react: { text: "✅", key: message.wa_message.key } })
    } catch (err) {
        // Erro: Reagir com X
        await client.sendMessage(message.chat_id, { react: { text: "❌", key: message.wa_message.key } })
        throw err
    }
}

export async function emojimixCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const [emoji1, emoji2] = message.text_command.split("+")

    if (!emoji1 || !emoji2) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    try {
        const supportEmoji = await imageUtil.checkEmojiMixSupport(emoji1.trim(), emoji2.trim())

        if (!supportEmoji.emoji1 && !supportEmoji.emoji2) {
            throw new Error(buildText(stickerCommands.emojimix.msgs.error_emojis, emoji1, emoji2))
        } else if (!supportEmoji.emoji1) {
            throw new Error(buildText(stickerCommands.emojimix.msgs.error_emoji, emoji1))
        } else if (!supportEmoji.emoji2) {
            throw new Error(buildText(stickerCommands.emojimix.msgs.error_emoji, emoji2))
        }

        const imageBuffer = await imageUtil.emojiMix(emoji1.trim(), emoji2.trim())

        if (!imageBuffer) {
            throw new Error(stickerCommands.emojimix.msgs.error_not_found)
        }

        const authorText = buildText(stickerCommands.emojimix.msgs.author_text, message.pushname)
        const stickerBuffer = await stickerUtil.createSticker(imageBuffer, { pack: botInfo.name, author: authorText, fps: 9, type: 'resize' })
        await waUtil.sendSticker(client, message.chat_id, stickerBuffer, { expiration: message.expiration })
    } catch (err) {
        // Diferenciar erros de validação/uso de erros críticos
        if (errorMessage(err).includes("não é compatível") || errorMessage(err).includes("não são compatíveis")) {
            throw err // Erro de uso já formatado
        }

        throw new Error(`Infelizmente não consegui misturar esses emojis. ${errorMessage(err)}`)
    }
}

export async function snomeCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    if (!message.isQuoted || message.quotedMessage?.type != "stickerMessage") {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    let [pack, author] = message.text_command.split(',')

    if (!pack || !author) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    let messageQuotedData = message.quotedMessage.wa_message

    if (!messageQuotedData.message?.stickerMessage) {
        throw new Error(stickerCommands.snome.msgs.error_message)
    }

    if (messageQuotedData.message.stickerMessage.url == "https://web.whatsapp.net") {
        messageQuotedData.message.stickerMessage.url = `https://mmg.whatsapp.net${messageQuotedData.message.stickerMessage.directPath}`
    }

    const stickerBuffer = await downloadMediaMessage(messageQuotedData, 'buffer', {})
    const stickerRenamedBuffer = await stickerUtil.renameSticker(stickerBuffer, pack, author)
    await waUtil.sendSticker(client, message.chat_id, stickerRenamedBuffer, { expiration: message.expiration })
}

export async function autoSticker(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    if (message.type != 'imageMessage' && message.type != "videoMessage") {
        return
    } else if (message.type == "videoMessage" && message.media?.seconds && message.media?.seconds > 9) {
        return
    }

    let mediaBuffer = await downloadMediaMessage(message.wa_message, "buffer", {})
    const authorText = buildText(stickerCommands.s.msgs.author_text, message.pushname)
    let stickerBuffer = await stickerUtil.createSticker(mediaBuffer, { pack: botInfo.name, author: authorText, fps: 9, type: 'resize' })
    await waUtil.sendSticker(client, message.chat_id, stickerBuffer, { expiration: message.expiration })
}
