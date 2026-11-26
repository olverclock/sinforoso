import { WASocket } from "baileys"
import { Bot } from "../interfaces/bot.interface.js"
import { Group } from "../interfaces/group.interface.js"
import { Message } from "../interfaces/message.interface.js"
import { buildText } from "../utils/general.util.js"
import { messageErrorCommandUsage } from "../utils/commands.util.js"
import * as waUtil from "../utils/whatsapp.util.js"
import * as downloadUtil from '../utils/download.util.js'
import * as convertUtil from '../utils/convert.util.js'
import { imageSearch } from '../utils/image.util.js'
import format from 'format-duration'
import downloadCommands, { clipTexts, CLIP_MAX_SOURCE_SECONDS, langTexts } from "./download.list.commands.js"
import { clipAudio, clipVideo, formatClock, rangeLength, TimeRange } from "../utils/clip.util.js"
import * as anyVideo from "../utils/any-video.util.js"
import { languageName, parseDownloadOptions } from "../utils/audio-lang.util.js"

/**
 * Opções no fim do comando: trecho ("1:20-1:45") e idioma do áudio ("en", "espanhol"). Sem idioma, o
 * áudio é sempre o original. Devolve o link/busca sem as opções.
 */
function withRange(botInfo: Bot, message: Message) {
    const { rest, range, lang } = parseDownloadOptions(message.text_command)
    if (!rest) throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    return { text: rest, range, lang }
}

const langNote = (lang: string | null) => lang ? buildText(langTexts.note, languageName(lang)) : ''

/** Mensagem quando o vídeo não tem o idioma pedido (mostra os disponíveis). */
function languageError(err: downloadUtil.AudioLanguageUnavailableError): Error {
    if (!err.available.length) return new Error(buildText(langTexts.no_dubs, languageName(err.lang)))
    const list = err.available.map(t => `${languageName(t.code)}${t.original ? ' (original)' : ''} = *${t.code}*`).join(', ')
    return new Error(buildText(langTexts.unavailable, languageName(err.lang), list))
}

const rangeNote = (range: TimeRange | null) => range ? buildText(clipTexts.note, formatClock(range.start), formatClock(range.end)) : ''

/** Envia um vídeo (link ou arquivo); com trecho, baixa, recorta e envia só o pedaço. */
async function replyVideo(client: WASocket, message: Message, source: { url?: string, buffer?: Buffer }, range: TimeRange | null) {
    const options = { expiration: message.expiration, mimetype: 'video/mp4' as const }
    if (!range) {
        if (source.buffer) return waUtil.replyFileFromBuffer(client, message.chat_id, 'videoMessage', source.buffer, '', message.wa_message, options)
        return waUtil.replyFileFromUrl(client, message.chat_id, 'videoMessage', source.url!, '', message.wa_message, options)
    }
    const full = source.buffer ?? await downloadUtil.mediaBuffer(source.url!)
    return waUtil.replyFileFromBuffer(client, message.chat_id, 'videoMessage', await clipVideo(full, range), '', message.wa_message, options)
}

type YoutubeMsgs = typeof downloadCommands.yt.msgs

/** Vídeo do YouTube pedido e validações (duração, ao vivo, trecho). */
async function youtubeTarget(botInfo: Bot, message: Message, msgs: YoutubeMsgs) {
    const { text, range, lang } = withRange(botInfo, message)
    const videoInfo = await downloadUtil.youtubeMedia(text).catch((err: unknown) => {
        if (err instanceof downloadUtil.YoutubeUnavailableError) throw new Error(msgs.error_unavailable)
        throw err
    })

    if (!videoInfo) {
        throw new Error(msgs.error_not_found)
    } else if (videoInfo.is_live) {
        throw new Error(msgs.error_live)
    } else if (range) {
        if (rangeLength(range) > 360) throw new Error(clipTexts.range_too_long)
        if (videoInfo.duration > downloadUtil.YT_MAX_SOURCE_SECONDS_FOR_CLIP) throw new Error(clipTexts.source_too_long)
        if (videoInfo.duration && range.start >= videoInfo.duration) throw new Error(buildText(clipTexts.start_after_end, videoInfo.duration_formatted))
    } else if (videoInfo.duration > 360) {
        // Vídeo longo: com um trecho (ex.: 10:00-12:30) dá para baixar só a parte desejada
        throw new Error(buildText(msgs.error_limit))
    }
    await downloadUtil.assertAudioLanguage(videoInfo.id_video, lang).catch((err: unknown) => {
        if (err instanceof downloadUtil.AudioLanguageUnavailableError) throw languageError(err)
        throw err
    })
    return { videoInfo, range, lang }
}

export async function playCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const { videoInfo, range, lang } = await youtubeTarget(botInfo, message, downloadCommands.play.msgs)
    const waitReply = buildText(downloadCommands.play.msgs.wait, videoInfo.title, videoInfo.duration_formatted) + rangeNote(range) + langNote(lang)
    await waUtil.replyText(client, message.chat_id, waitReply, message.wa_message, { expiration: message.expiration })

    let audioBuffer: Buffer
    if (range && videoInfo.duration > 360) {
        // Vídeo longo: o yt-dlp baixa só o trecho
        audioBuffer = await convertUtil.convertMp4ToMp3('buffer', await downloadUtil.youtubeAudioSection(videoInfo.id_video, range, lang))
    } else {
        audioBuffer = await convertUtil.convertMp4ToMp3('buffer', await downloadUtil.youtubeAudio(videoInfo.id_video, lang))
        if (range) audioBuffer = await clipAudio(audioBuffer, range)
    }
    await waUtil.replyFileFromBuffer(client, message.chat_id, 'audioMessage', audioBuffer, '', message.wa_message, { expiration: message.expiration, mimetype: 'audio/mpeg' })
}

export async function ytCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const { videoInfo, range, lang } = await youtubeTarget(botInfo, message, downloadCommands.yt.msgs)
    const waitReply = buildText(downloadCommands.yt.msgs.wait, videoInfo.title, videoInfo.duration_formatted) + rangeNote(range) + langNote(lang)
    await waUtil.replyText(client, message.chat_id, waitReply, message.wa_message, { expiration: message.expiration })

    let videoBuffer: Buffer
    if (range && videoInfo.duration > 360) {
        // Vídeo longo: o yt-dlp baixa só o trecho (não o vídeo inteiro)
        videoBuffer = await downloadUtil.youtubeVideoSection(videoInfo.id_video, range, lang)
    } else {
        videoBuffer = await downloadUtil.youtubeVideo(videoInfo.id_video, lang)
        if (range) videoBuffer = await clipVideo(videoBuffer, range)
    }
    await waUtil.replyFileFromBuffer(client, message.chat_id, 'videoMessage', videoBuffer, '', message.wa_message, { expiration: message.expiration, mimetype: 'video/mp4' })
}

export async function fbCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const { text, range } = withRange(botInfo, message)
    const fbInfo = await downloadUtil.facebookMedia(text)

    if (range) {
        if (rangeLength(range) > 360) throw new Error(clipTexts.range_too_long)
        if (fbInfo.duration > CLIP_MAX_SOURCE_SECONDS) throw new Error(clipTexts.source_too_long_other)
    } else if (fbInfo.duration > 360) {
        throw new Error(buildText(downloadCommands.fb.msgs.error_limit))
    }

    const waitReply = buildText(downloadCommands.fb.msgs.wait, fbInfo.title, format(fbInfo.duration * 1000)) + rangeNote(range)
    await waUtil.replyText(client, message.chat_id, waitReply, message.wa_message, { expiration: message.expiration })
    await replyVideo(client, message, { url: fbInfo.sd }, range)
}

export async function igCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const { text, range } = withRange(botInfo, message)
    if (range && rangeLength(range) > 360) throw new Error(clipTexts.range_too_long)
    const igInfo = await downloadUtil.instagramMedia(text)
    const waitReply = buildText(downloadCommands.ig.msgs.wait, igInfo.author_fullname, igInfo.author_username, igInfo.caption, igInfo.likes) + rangeNote(range)
    await waUtil.replyText(client, message.chat_id, waitReply, message.wa_message, { expiration: message.expiration })

    for (const media of igInfo.media) {
        if (media.type == "video") {
            await replyVideo(client, message, { url: media.url, buffer: media.buffer }, range)
        } else if (media.buffer) {
            await waUtil.replyFileFromBuffer(client, message.chat_id, 'imageMessage', media.buffer, '', message.wa_message, { expiration: message.expiration })
        } else if (media.url) {
            await waUtil.replyFileFromUrl(client, message.chat_id, 'imageMessage', media.url, '', message.wa_message, { expiration: message.expiration })
        }
    }
}

export async function xCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const { text, range } = withRange(botInfo, message)
    if (range && rangeLength(range) > 360) throw new Error(clipTexts.range_too_long)
    const xInfo = await downloadUtil.xMedia(text)

    if (!xInfo) {
        throw new Error(downloadCommands.x.msgs.error_not_found)
    }

    const waitReply = buildText(downloadCommands.x.msgs.wait, xInfo.text) + rangeNote(range)
    await waUtil.replyText(client, message.chat_id, waitReply, message.wa_message, { expiration: message.expiration })

    for await (let media of xInfo.media) {
        if (media.type == "image") {
            await waUtil.replyFileFromUrl(client, message.chat_id, 'imageMessage', media.url, '', message.wa_message, { expiration: message.expiration })
        } else if (media.type == "video") {
            await replyVideo(client, message, { url: media.url }, range)
        }
    }
}

export async function tkCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const { text, range } = withRange(botInfo, message)
    if (range && rangeLength(range) > 360) throw new Error(clipTexts.range_too_long)
    const tiktok = await downloadUtil.tiktokMedia(text)

    if (!tiktok) {
        throw new Error(downloadCommands.tk.msgs.error_not_found)
    }

    const waitReply = buildText(downloadCommands.tk.msgs.wait, tiktok.author_profile, tiktok.description) + rangeNote(range)
    await waUtil.replyText(client, message.chat_id, waitReply, message.wa_message, { expiration: message.expiration })

    const urls = Array.isArray(tiktok.url) ? tiktok.url : [tiktok.url]
    for (const url of urls) {
        if (tiktok.type == 'image') {
            await waUtil.replyFileFromUrl(client, message.chat_id, 'imageMessage', url, '', message.wa_message, { expiration: message.expiration })
        } else if (tiktok.type == 'video') {
            await replyVideo(client, message, { url }, range)
        }
    }
}

/**
 * !bx: baixa de qualquer site. YouTube, Instagram, TikTok, X e Facebook usam o comando próprio de cada
 * um (fotos, carrosséis e trechos continuam funcionando); texto sem link busca no YouTube; qualquer
 * outro site vai pelo yt-dlp.
 */
export async function bxCommand(client: WASocket, botInfo: Bot, message: Message, group?: Group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const { text, range, lang } = withRange(botInfo, message)
    const provider = anyVideo.videoProvider(text)
    if (provider === null || provider === 'youtube') return ytCommand(client, botInfo, message, group)
    if (provider === 'instagram') return igCommand(client, botInfo, message, group)
    if (provider === 'tiktok') return tkCommand(client, botInfo, message, group)
    if (provider === 'x') return xCommand(client, botInfo, message, group)
    if (provider === 'facebook') return fbCommand(client, botInfo, message, group)

    if (range && rangeLength(range) > 360) throw new Error(clipTexts.range_too_long)
    const waitReply = buildText(downloadCommands.bx.msgs.wait, anyVideo.siteName(text)) + rangeNote(range) + langNote(lang)
    await waUtil.replyText(client, message.chat_id, waitReply, message.wa_message, { expiration: message.expiration })
    const video = await anyVideo.genericVideo(text, range, lang).catch((err: unknown) => {
        if (err instanceof anyVideo.NoVideoError) throw new Error(downloadCommands.bx.msgs.error_no_video)
        if (err instanceof anyVideo.LoginRequiredError) throw new Error(downloadCommands.bx.msgs.error_login)
        throw err
    })
    await waUtil.replyFileFromBuffer(client, message.chat_id, 'videoMessage', video, '', message.wa_message, { expiration: message.expiration, mimetype: 'video/mp4' })
}

export async function imgCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const MAX_SENT = 5
    const MAX_RESULTS = 50
    let imagesSent = 0

    let images = await imageSearch(message.text_command)
    const maxImageResults = images.length > MAX_RESULTS ? MAX_RESULTS : images.length
    images = images.splice(0, maxImageResults)

    for (let i = 0; i < maxImageResults; i++) {
        let randomIndex = Math.floor(Math.random() * images.length)
        let chosenImage = images[randomIndex].url
        await waUtil.sendFileFromUrl(client, message.chat_id, 'imageMessage', chosenImage, '', { expiration: message.expiration, mimetype: 'image/jpeg' }).then(() => {
            imagesSent++
        }).catch(() => {
            //Ignora se não for possível enviar essa imagem
        })
        images.splice(randomIndex, 1)

        if (imagesSent == MAX_SENT) {
            break
        }
    }

    if (!imagesSent) {
        throw new Error(downloadCommands.img.msgs.error)
    }
}

