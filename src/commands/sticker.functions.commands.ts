import { downloadMediaMessage, WASocket } from "baileys"
import { Bot } from "../interfaces/bot.interface.js"
import { Group } from "../interfaces/group.interface.js"
import { Message } from "../interfaces/message.interface.js"
import * as waUtil from '../utils/whatsapp.util.js'
import * as imageUtil from '../utils/image.util.js'
import * as stickerUtil from '../utils/sticker.util.js'
import { buildText, errorMessage } from "../utils/general.util.js"
import { messageErrorCommandUsage } from "../utils/commands.util.js"
import stickerCommands from "./sticker.list.commands.js"

export async function sCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    let stickerType: "resize" | "contain" | "circle" = 'resize'

    if (message.args[0] === '1') {
        stickerType = 'circle'
    } else if (message.args[0] === '2') {
        stickerType = 'contain'
    }

    let messageData = {
        type: (message.isQuoted) ? message.quotedMessage?.type : message.type,
        message: (message.isQuoted) ? message.quotedMessage?.wa_message : message.wa_message,
        seconds: (message.isQuoted) ? message.quotedMessage?.media?.seconds : message.media?.seconds
    }

    if (!messageData.type || !messageData.message) {
        throw new Error(stickerCommands.s.msgs.error_message)
    } else if (messageData.type != "imageMessage" && messageData.type != "videoMessage") {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    } else if (messageData.type == "videoMessage" && messageData.seconds && messageData.seconds > 9) {
        throw new Error(stickerCommands.s.msgs.error_limit)
    }

    const mediaBuffer = await downloadMediaMessage(messageData.message, "buffer", {})
    const authorText = buildText(stickerCommands.s.msgs.author_text, message.pushname)
    const stickerBuffer = await stickerUtil.createSticker(mediaBuffer, { pack: botInfo.name, author: authorText, fps: 9, type: stickerType })
    await waUtil.sendSticker(client, message.chat_id, stickerBuffer, { expiration: message.expiration })
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
