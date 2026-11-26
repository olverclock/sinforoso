import { BinaryNode, INITIAL_PREKEY_COUNT, GroupMetadata, WAMessage, WAPresence, WASocket, S_WHATSAPP_NET, generateWAMessageContent, generateWAMessageFromContent, getContentType, prepareWAMessageMedia, proto } from "baileys"
import { markStickerAudio, STICKER_AUDIO_MIMETYPE } from "./sound-sticker.util.js"
import { User } from "../interfaces/user.interface.js"
import axios from "axios"
import { randomDelay, HTTP_TIMEOUT } from "./general.util.js"
import { MessageOptions, MessageTypes, Message } from "../interfaces/message.interface.js"
import * as convertLibrary from './convert.util.js'
import { Group } from "../interfaces/group.interface.js"
import { removeBold } from "./general.util.js"
import NodeCache from "node-cache"
import { linkIds, sameUser } from "./identity.util.js"

/**
 * Ouvinte chamado após cada mensagem enviada por sendText/replyText (usado pelo
 * "Janitor" de auto-exclusão). É registrado na inicialização por
 * services/automation.service.ts (setSentMessageListener), para que utils/ não
 * dependa de services/ (regra ARCH-011).
 */
type SentMessageListener = (client: WASocket, chatId: string, sent: WAMessage) => void
let sentMessageListener: SentMessageListener | undefined

/**
 * Correção de um bug do Baileys 7.0.0-rc14 (WhiskeySockets/Baileys#2858; correção oficial nos PRs
 * #2866/#2883, ainda não lançada): o WhatsApp passou a entregar status (stories) dos contatos como
 * um elemento <status> separado, que o Baileys não confirma (ack). Sem a confirmação, o servidor
 * segura as mensagens novas e, cerca de 50 minutos depois, derruba a conexão com
 * "Stream Errored (ack)" (class "status", type "media"). Aqui o <status> é só confirmado, igual ao
 * PR oficial; o conteúdo não é lido. Quando o Baileys tratar isso sozinho, nada é registrado.
 */
export function ackStatusStanzas(client: WASocket): boolean {
    const ws = client.ws as unknown as { on: (event: string, listener: (node: BinaryNode) => void) => void, listenerCount?: (event: string) => number }
    if ((ws.listenerCount?.('CB:status') ?? 0) > 0) return false
    ws.on('CB:status', (node: BinaryNode) => {
        client.sendMessageAck(node).catch(err => console.warn('[CONEXÃO] Falha ao confirmar <status>:', err instanceof Error ? err.message : err))
    })
    return true
}

/** Intervalo mínimo entre duas verificações de chaves pedidas pelo servidor. */
export const DIGEST_MIN_INTERVAL_MS = 60_000

/**
 * Notificação do servidor pedindo a verificação das chaves de criptografia
 * (<notification type="encrypt"> com <digest>, sem <count>). O WhatsApp Web responde chamando
 * digestKey(); o Baileys 7.0.0-rc14 lê <count> sem conferir e quebra com "Cannot read properties
 * of undefined (reading 'attrs')" (a notificação ainda é confirmada, então a conexão segue).
 * Aqui o pedido é atendido com o método oficial do próprio Baileys, digestKeyBundle(), que confere
 * as chaves no servidor e as reenvia se estiverem faltando. Como no WAWebDigestKeyJob do WhatsApp
 * Web, uma resposta 404 ("o servidor não tem as chaves deste aparelho") reenvia o lote completo
 * (INITIAL_PREKEY_COUNT); o uploadPreKeys do Baileys já evita dois envios ao mesmo tempo. Pedidos
 * repetidos em menos de 1 minuto são agrupados num só.
 */
export async function answerDigestRequest(client: Pick<WASocket, 'digestKeyBundle' | 'uploadPreKeys'>): Promise<'ok' | 'reuploaded'> {
    try {
        await client.digestKeyBundle()
        return 'ok'
    } catch (err) {
        const e = err as { data?: unknown, output?: { statusCode?: number } }
        if (Number(e?.data) !== 404 && e?.output?.statusCode !== 404) throw err
        await client.uploadPreKeys(INITIAL_PREKEY_COUNT)
        return 'reuploaded'
    }
}

export function handleServerDigestRequests(client: WASocket, now: () => number = Date.now): void {
    const ws = client.ws as unknown as { on: (event: string, listener: (node: BinaryNode) => void) => void }
    let last = 0
    ws.on('CB:notification,type:encrypt', (node: BinaryNode) => {
        if (node.attrs?.from !== S_WHATSAPP_NET) return
        const children = Array.isArray(node.content) ? node.content as BinaryNode[] : []
        const asksDigest = children.some(child => child?.tag === 'digest') && !children.some(child => child?.tag === 'count')
        if (!asksDigest || now() - last < DIGEST_MIN_INTERVAL_MS) return
        last = now()
        answerDigestRequest(client)
            .then(result => console.log(result === 'ok'
                ? '[CONEXÃO] O servidor pediu para conferir as chaves de criptografia: conferidas ✅'
                : `[CONEXÃO] O servidor não tinha as chaves de criptografia deste aparelho: ${INITIAL_PREKEY_COUNT} chaves reenviadas ✅`))
            .catch(err => console.warn('[CONEXÃO] Verificação de chaves pedida pelo servidor falhou:', err instanceof Error ? err.message : err))
    })
}

export function setSentMessageListener(listener: SentMessageListener) {
    sentMessageListener = listener
}

/** Consultas usadas por formatWAMessage, fornecidas por quem chama (events/). */
export type FormatWAMessageLookups = {
    getBotAdmins: () => Promise<User[]>
    isParticipantAdmin: (groupId: string, userId: string) => Promise<boolean>
}

async function updatePresence(client: WASocket, chatId: string, presence: WAPresence) {
    await client.presenceSubscribe(chatId)
    await randomDelay(200, 400)
    await client.sendPresenceUpdate(presence, chatId)
    await randomDelay(300, 1000)
    await client.sendPresenceUpdate('paused', chatId)
}

export function addWhatsappSuffix(userNumber: string) {
    if (userNumber.includes('@')) return userNumber
    const userId = userNumber.replace(/\W+/g, "") + S_WHATSAPP_NET
    return userId
}

export function removeWhatsappSuffix(userId: string) {
    const userNumber = userId.replace(/(@s\.whatsapp\.net|@lid|@g\.us)/, '')
    return userNumber
}

export function normalizeJid(jid: string) {
    if (!jid) return jid
    return jid.replace(/:[0-9]+/ism, '')
}

export function removePrefix(prefix: string, command: string) {
    const commandWithoutPrefix = command.replace(prefix, '')
    return commandWithoutPrefix
}

export function getGroupParticipantsByMetadata(group: GroupMetadata) {
    const { participants } = group
    let groupParticipants: string[] = []
    participants.forEach((participant) => {
        groupParticipants.push(participant.id)
    })
    return groupParticipants
}

export function getGroupAdminsByMetadata(group: GroupMetadata) {
    const { participants } = group
    const admins = participants.filter(user => (user.admin != null))
    let groupAdmins: string[] = []
    admins.forEach((admin) => {
        groupAdmins.push(admin.id)
    })
    return groupAdmins
}

export function deleteMessage(client: WASocket, message: WAMessage, deleteQuoted: boolean) {
    let deletedMessage
    let chatId = message.key.remoteJid

    if (!chatId) return

    if (deleteQuoted) {
        deletedMessage = {
            remoteJid: message.key.remoteJid,
            fromMe: message.key.participant === message?.message?.extendedTextMessage?.contextInfo?.participant,
            id: message.message?.extendedTextMessage?.contextInfo?.stanzaId,
            participant: message?.message?.extendedTextMessage?.contextInfo?.participant
        }
    } else {
        deletedMessage = message.key
    }

    return client.sendMessage(chatId, { delete: deletedMessage })
}

export function readMessage(client: WASocket, chatId: string, sender: string, messageId: string) {
    return client.sendReceipt(chatId, sender, [messageId], 'read')
}

export function updateProfilePic(client: WASocket, chatId: string, image: Buffer) {
    return client.updateProfilePicture(chatId, image)
}

export function updateProfileStatus(client: WASocket, text: string) {
    return client.updateProfileStatus(text)
}

export function shutdownBot(client: WASocket) {
    return client.end(new Error("admin_command"))
}

export function getProfilePicUrl(client: WASocket, chatId: string) {
    return client.profilePictureUrl(chatId, "image")
}

export function blockContact(client: WASocket, userId: string) {
    return client.updateBlockStatus(userId, "block")
}

export function unblockContact(client: WASocket, userId: string) {
    return client.updateBlockStatus(userId, "unblock")
}

export function getHostNumber(client: WASocket) {
    // O bot aparece nos grupos pelo LID e nas mensagens pelo número: as duas formas são ele
    linkIds(normalizeJid(client.user?.id ?? ''), normalizeJid(client.user?.lid ?? ''))
    const user = client.user?.id || client.user?.lid
    return normalizeJid(user || '')
}

export function getBlockedContacts(client: WASocket) {
    return client.fetchBlocklist()
}

/**
 * Animação curta: o WhatsApp não aceita .gif, então vai como MP4 com gifPlayback (forma documentada
 * no README do Baileys). Aparece sem som e em repetição, como um GIF.
 */
export function sendGif(client: WASocket, chatId: string, video: Buffer, caption: string, options?: MessageOptions & { mentions?: string[] }) {
    return client.sendMessage(chatId, { video, gifPlayback: true, mimetype: 'video/mp4', caption, mentions: options?.mentions }, { ephemeralExpiration: options?.expiration })
}

export async function sendText(client: WASocket, chatId: string, text: string, options?: MessageOptions) {
    await updatePresence(client, chatId, "composing")
    const sent = await client.sendMessage(chatId, { text, linkPreview: null }, { ephemeralExpiration: options?.expiration })
    if (sent) sentMessageListener?.(client, chatId, sent)
    return sent
}

/** Enquete nativa do WhatsApp. selectableCount 1 = uma opção; 0 = várias opções. */
export function sendPoll(client: WASocket, chatId: string, name: string, values: string[], selectableCount: number, options?: MessageOptions) {
    return client.sendMessage(chatId, { poll: { name, values, selectableCount } }, { ephemeralExpiration: options?.expiration })
}

export function sendLinkWithPreview(client: WASocket, chatId: string, text: string, options?: MessageOptions) {
    return client.sendMessage(chatId, { text }, { ephemeralExpiration: options?.expiration })
}

export async function sendTextWithMentions(client: WASocket, chatId: string, text: string, mentions: string[], options?: MessageOptions) {
    await updatePresence(client, chatId, "composing")
    return client.sendMessage(chatId, { text, mentions }, { ephemeralExpiration: options?.expiration })
}

export function sendSticker(client: WASocket, chatId: string, sticker: Buffer, options?: MessageOptions) {
    return client.sendMessage(chatId, { sticker }, { ephemeralExpiration: options?.expiration })
}

/**
 * Figurinha com som (formato oficial audioStickerMessage, ver utils/sound-sticker.util.ts).
 * Se algo falhar (upload, cliente sem suporte...), envia a figurinha normal, sem som: o comando nunca
 * fica pior do que antes. Devolve true quando saiu com som.
 */
export async function sendSoundSticker(client: WASocket, chatId: string, sticker: Buffer, sound: { audio: Buffer, seconds: number }, options?: MessageOptions): Promise<boolean> {
    try {
        if (typeof client.relayMessage !== "function" || typeof client.waUploadToServer !== "function" || !client.user?.id) throw new Error("cliente sem envio direto")
        const content = await generateWAMessageContent({ sticker }, { upload: client.waUploadToServer, jid: chatId })
        const { audioMessage } = await prepareWAMessageMedia({ audio: sound.audio, mimetype: STICKER_AUDIO_MIMETYPE, ptt: false, seconds: sound.seconds }, { upload: client.waUploadToServer, jid: chatId })
        if (!content.stickerMessage || !audioMessage) throw new Error("mídia não preparada")
        content.stickerMessage.accessibilityLabel = markStickerAudio(audioMessage)
        const fullMessage = generateWAMessageFromContent(chatId, content, { userJid: client.user.id, ephemeralExpiration: options?.expiration })
        await client.relayMessage(chatId, fullMessage.message!, { messageId: fullMessage.key.id! })
        return true
    } catch (err) {
        console.log(`[figurinha com som] enviando sem som: ${err instanceof Error ? err.message : String(err)}`)
        await sendSticker(client, chatId, sticker, options)
        return false
    }
}

/** Tipos de mídia que as funções de envio de arquivo sabem montar. */
export type MediaMessageType = 'imageMessage' | 'videoMessage' | 'audioMessage'

export async function sendFileFromUrl(client: WASocket, chatId: string, type: MediaMessageType, url: string, caption: string, options?: MessageOptions) {
    if (type === "imageMessage") {
        return client.sendMessage(chatId, { image: { url }, caption }, { ephemeralExpiration: options?.expiration })
    } else if (type === 'videoMessage') {
        let base64Thumb: string | Buffer | undefined = undefined
        if (options?.thumbnail) {
            if (typeof options.thumbnail === 'string' && options.thumbnail.startsWith('http')) {
                try {
                    const { data } = await axios.get(options.thumbnail, { timeout: HTTP_TIMEOUT.media, responseType: 'arraybuffer' })
                    base64Thumb = Buffer.from(data).toString('base64')
                } catch (err) {
                    base64Thumb = await convertLibrary.convertVideoToThumbnail('url', url)
                }
            } else if (Buffer.isBuffer(options.thumbnail)) {
                base64Thumb = options.thumbnail.toString('base64')
            } else {
                base64Thumb = options.thumbnail as string
            }
        } else {
            base64Thumb = await convertLibrary.convertVideoToThumbnail('url', url)
        }
        return client.sendMessage(chatId, { video: { url }, mimetype: options?.mimetype, caption, jpegThumbnail: base64Thumb }, { ephemeralExpiration: options?.expiration })
    } else if (type === 'audioMessage') {
        return client.sendMessage(chatId, { audio: { url }, mimetype: options?.mimetype }, { ephemeralExpiration: options?.expiration })
    }

    // Exaustivo: o compilador garante que todos os tipos foram tratados; em runtime, erro explícito.
    const unsupported: never = type
    throw new Error(`Tipo de mídia não suportado para envio: ${String(unsupported)}`)
}

export async function replyText(client: WASocket, chatId: string, text: string, quoted: WAMessage, options?: MessageOptions) {
    await updatePresence(client, chatId, "composing")
    const sent = await client.sendMessage(chatId, { text, linkPreview: null }, { quoted, ephemeralExpiration: options?.expiration })
    if (sent) sentMessageListener?.(client, chatId, sent)
    return sent
}

export async function replyFile(client: WASocket, chatId: string, type: MediaMessageType, url: string, caption: string, quoted: WAMessage, options?: MessageOptions) {
    if (type == "imageMessage") {
        return client.sendMessage(chatId, { image: { url }, caption }, { quoted, ephemeralExpiration: options?.expiration })
    } else if (type == "videoMessage") {
        const base64Thumb = await convertLibrary.convertVideoToThumbnail('file', url)
        return client.sendMessage(chatId, { video: { url }, mimetype: options?.mimetype, caption, jpegThumbnail: base64Thumb }, { quoted, ephemeralExpiration: options?.expiration })
    } else if (type == "audioMessage") {
        return client.sendMessage(chatId, { audio: { url }, mimetype: options?.mimetype }, { quoted, ephemeralExpiration: options?.expiration })
    }

    // Exaustivo: o compilador garante que todos os tipos foram tratados; em runtime, erro explícito.
    const unsupported: never = type
    throw new Error(`Tipo de mídia não suportado para envio: ${String(unsupported)}`)
}

export async function replyFileFromUrl(client: WASocket, chatId: string, type: MediaMessageType, url: string, caption: string, quoted: WAMessage, options?: MessageOptions) {
    if (type == "imageMessage") {
        return client.sendMessage(chatId, { image: { url }, caption }, { quoted, ephemeralExpiration: options?.expiration })
    } else if (type == "videoMessage") {
        const base64Thumb = await convertLibrary.convertVideoToThumbnail('url', url)
        return client.sendMessage(chatId, { video: { url }, mimetype: options?.mimetype, caption, jpegThumbnail: base64Thumb }, { quoted, ephemeralExpiration: options?.expiration })
    } else if (type == "audioMessage") {
        return client.sendMessage(chatId, { audio: { url }, mimetype: options?.mimetype }, { quoted, ephemeralExpiration: options?.expiration })
    }

    // Exaustivo: o compilador garante que todos os tipos foram tratados; em runtime, erro explícito.
    const unsupported: never = type
    throw new Error(`Tipo de mídia não suportado para envio: ${String(unsupported)}`)
}

export async function replyFileFromBuffer(client: WASocket, chatId: string, type: MediaMessageType, buffer: Buffer, caption: string, quoted: WAMessage, options?: MessageOptions) {
    if (type == "videoMessage") {
        const base64Thumb = await convertLibrary.convertVideoToThumbnail('buffer', buffer)
        return client.sendMessage(chatId, { video: buffer, caption, mimetype: options?.mimetype, jpegThumbnail: base64Thumb }, { quoted, ephemeralExpiration: options?.expiration })
    } else if (type == "imageMessage") {
        return client.sendMessage(chatId, { image: buffer, caption }, { quoted, ephemeralExpiration: options?.expiration })
    } else if (type == "audioMessage") {
        return client.sendMessage(chatId, { audio: buffer, mimetype: options?.mimetype }, { quoted, ephemeralExpiration: options?.expiration })
    }

    // Exaustivo: o compilador garante que todos os tipos foram tratados; em runtime, erro explícito.
    const unsupported: never = type
    throw new Error(`Tipo de mídia não suportado para envio: ${String(unsupported)}`)
}

/** Envia um documento (PDF, DOCX, TXT...) a partir de um buffer, respondendo a mensagem. */
export async function replyDocumentFromBuffer(client: WASocket, chatId: string, buffer: Buffer, fileName: string, mimetype: string, caption: string, quoted: WAMessage, options?: MessageOptions) {
    return client.sendMessage(chatId, { document: buffer, fileName, mimetype, caption }, { quoted, ephemeralExpiration: options?.expiration })
}

export async function replyWithMentions(client: WASocket, chatId: string, text: string, mentions: string[], quoted: WAMessage, options?: MessageOptions) {
    await updatePresence(client, chatId, "composing")
    return client.sendMessage(chatId, { text, mentions }, { quoted, ephemeralExpiration: options?.expiration })
}

export function joinGroupInviteLink(client: WASocket, linkGroup: string) {
    return client.groupAcceptInvite(linkGroup)
}

export function revokeGroupInvite(client: WASocket, groupId: string) {
    return client.groupRevokeInvite(groupId)
}

export async function getGroupInviteLink(client: WASocket, groupId: string) {
    let inviteCode = await client.groupInviteCode(groupId)
    return inviteCode ? `https://chat.whatsapp.com/${inviteCode}` : undefined
}

export function leaveGroup(client: WASocket, groupId: string) {
    return client.groupLeave(groupId)
}

export function getGroupInviteInfo(client: WASocket, linkGroup: string) {
    return client.groupGetInviteInfo(linkGroup)
}

export function updateGroupRestriction(client: WASocket, groupId: string, status: boolean) {
    let config: "announcement" | "not_announcement" = status ? "announcement" : "not_announcement"
    return client.groupSettingUpdate(groupId, config)
}

export async function getAllGroups(client: WASocket) {
    let groups = await client.groupFetchAllParticipating()
    let groupsInfo: GroupMetadata[] = []

    for (let [, value] of Object.entries(groups)) {
        groupsInfo.push(value)
    }

    return groupsInfo
}

export async function removeParticipant(client: WASocket, groupId: string, participant: string) {
    const [response] = await client.groupParticipantsUpdate(groupId, [participant], "remove")
    return response
}

export async function addParticipant(client: WASocket, groupId: string, participant: string) {
    const [response] = await client.groupParticipantsUpdate(groupId, [participant], "add")
    return response
}

export async function promoteParticipant(client: WASocket, groupId: string, participant: string) {
    const [response] = await client.groupParticipantsUpdate(groupId, [participant], "promote")
    return response
}

export async function demoteParticipant(client: WASocket, groupId: string, participant: string) {
    const [response] = await client.groupParticipantsUpdate(groupId, [participant], "demote")
    return response
}

export function storeMessageOnCache(message: proto.IWebMessageInfo, messageCache: NodeCache) {
    if (message?.key?.remoteJid && message?.key?.id && message.message) {
        messageCache.set(message.key.id, message.message)
    }
}

export function getMessageFromCache(messageId: string, messageCache: NodeCache) {
    let message = messageCache.get(messageId) as proto.IMessage | undefined
    return message
}

/**
 * Lê `content[field]` de um conteúdo de mensagem do Baileys quando ele é um objeto que possui o campo.
 * Equivale exatamente à expressão repetida antes em formatWAMessage:
 *   (typeof content != "string" && content && field in content) ? content[field] : undefined
 */
function getMessageField<T>(content: unknown, field: string): T | undefined {
    return (typeof content != "string" && content && field in (content as object)) ? (content as Record<string, unknown>)[field] as T : undefined
}

/** Dados de mídia de um conteúdo; undefined quando falta mimetype, url ou tamanho (mensagem descartada). */
function extractMedia(content: unknown): NonNullable<Message['media']> | undefined {
    const mimetype = getMessageField<string | null>(content, "mimetype")
    const url = getMessageField<string | null>(content, "url")
    const seconds = getMessageField<number | null>(content, "seconds")
    const file_length = getMessageField<number | Long | null>(content, "fileLength")

    if (!mimetype || !url || !file_length) return

    return { mimetype, url, seconds: seconds || undefined, file_length }
}

/** Monta Message.quotedMessage; undefined quando a citação é inválida (mensagem descartada). */
function formatQuotedMessage(contextInfo: proto.IContextInfo | undefined, chatId: string, hostId: string): NonNullable<Message['quotedMessage']> | undefined {
    const quotedMessage = unwrapCaptionedDocument(contextInfo?.quotedMessage)
    if (!contextInfo || !quotedMessage) return

    const typeQuoted = getContentType(quotedMessage)
    const quotedStanzaId = contextInfo.stanzaId ?? undefined
    // Nota: LID resolution para comandos como !ddd é feita diretamente no comando via signalRepository
    const senderQuoted = normalizeJid(contextInfo.participant || contextInfo.remoteJid || '')

    if (!typeQuoted || !senderQuoted) return

    const captionQuoted = getMessageField<string | null>(quotedMessage[typeQuoted], "caption")
    const quotedWAMessage = generateWAMessageFromContent(chatId, quotedMessage, { userJid: senderQuoted, messageId: quotedStanzaId })
    quotedWAMessage.key.fromMe = (hostId == senderQuoted)

    const formattedQuoted: NonNullable<Message['quotedMessage']> = {
        type: typeQuoted,
        sender: senderQuoted,
        body: quotedMessage.conversation || quotedMessage.extendedTextMessage?.text || '',
        caption: captionQuoted || '',
        isMedia: typeQuoted != "conversation" && typeQuoted != "extendedTextMessage",
        wa_message: quotedWAMessage
    }

    if (formattedQuoted.isMedia) {
        const media = extractMedia(quotedMessage[typeQuoted])
        if (!media) return
        formattedQuoted.media = media
    }

    return formattedQuoted
}

/** Chaves do Baileys 7 trazem as duas formas (LID e telefone) do remetente: guarda a ligação. */
function learnIdentities(key: WAMessage['key'], hostId: string) {
    const k = key as WAMessage['key'] & { participantAlt?: string, remoteJidAlt?: string }
    linkIds(k.participant, k.participantAlt)
    linkIds(k.remoteJid, k.remoteJidAlt)
    if (k.fromMe && k.participant) linkIds(hostId, k.participant)
}

/** Remetente normalizado: o próprio bot quando fromMe, senão o participante (grupo) ou o chat (privado). */
function messageSender(key: WAMessage['key'], hostId: string) {
    if (key.fromMe) return normalizeJid(hostId)
    return normalizeJid(key.participant || key.remoteJid || '')
}

/**
 * Exemplo copiado de uma mensagem do bot ("*!sorteio relampago* PH42ZY"): o WhatsApp copia os
 * asteriscos do negrito. O do começo já sai com o comando; aqui sai o que FECHA esse negrito, que
 * fica grudado no fim de um argumento ("relampago*"). Só mexe quando o negrito abriu no comando e
 * não fechou nele, e só no primeiro asterisco de fechamento, para não alterar o resto do texto.
 */
function closeCopiedBold(command: string, args: string[]) {
    if (!command.startsWith('*') || command.length > 1 && command.endsWith('*')) return
    for (let i = 0; i < args.length; i++) {
        const lines = args[i].split('\n')
        const j = lines.findIndex(l => l.endsWith('*'))
        if (j < 0) continue
        lines[j] = lines[j].slice(0, -1)
        args[i] = lines.join('\n')
        return
    }
}

/** Separa o comando (minúsculo, sem negrito) dos argumentos. */
function parseCommandText(text: string) {
    // Igual a antes quando o comando é seguido de espaço. Novo: se vier uma quebra de linha (ou tab)
    // logo depois do comando ("!sorteio\nchave ..."), ela também separa o comando dos argumentos;
    // antes o comando virava "!sorteio\nchave" e não era reconhecido.
    const trimmed = text.trim()
    const firstBreak = trimmed.search(/\s/)
    const splitOnLine = firstBreak >= 0 && trimmed[firstBreak] !== ' '
    const [command, ...args] = splitOnLine
        ? [trimmed.slice(0, firstBreak), ...trimmed.slice(firstBreak + 1).split(" ")]
        : trimmed.split(" ")
    closeCopiedBold(command ?? '', args)
    return {
        command: removeBold(command?.toLowerCase().trim()) || '',
        args,
        text_command: args.join(" ").trim(),
    }
}

/** O bot (hostId) é sempre admin e dono; os demais, conforme a lista de admins do bot. */
function botPermissions(sender: string, hostId: string, botAdmins: User[]) {
    const isHost = sender === normalizeJid(hostId)
    // sameUser: o admin cadastrado pelo número também vale quando a mensagem chega pelo LID (e vice-versa),
    // pela ligação que o próprio WhatsApp informa (participantAlt/remoteJidAlt), nunca pelo nome.
    return {
        isBotAdmin: isHost || botAdmins.some(admin => sameUser(admin.id, sender)),
        isBotOwner: isHost || botAdmins.some(admin => admin.owner && sameUser(admin.id, sender)),
    }
}

const isMediaType = (type: keyof proto.IMessage) => type != "conversation" && type != "extendedTextMessage"

/** Acrescenta mídia e citação; devolve undefined quando uma delas é inválida (mensagem descartada). */
function attachMediaAndQuote(formatted: Message, content: unknown, contextInfo: proto.IContextInfo | undefined, hostId: string): Message | undefined {
    if (formatted.isMedia) {
        const media = extractMedia(content)
        if (!media) return
        formatted.media = media
    }
    if (formatted.isQuoted) {
        const quotedMessage = formatQuotedMessage(contextInfo, formatted.chat_id, hostId)
        if (!quotedMessage) return
        formatted.quotedMessage = quotedMessage
    }
    return formatted
}

/** Campos que vêm do contextInfo (expiração, menções, citação). */
function contextFields(contextInfo: proto.IContextInfo | undefined) {
    return {
        expiration: contextInfo?.expiration || undefined,
        mentioned: contextInfo?.mentionedJid || [],
        isQuoted: Boolean(contextInfo?.quotedMessage),
    }
}

/** Texto da mensagem (conversation/extendedText) e legenda da mídia. */
function messageTexts(message: proto.IMessage, content: unknown) {
    return {
        body: message.conversation || message.extendedTextMessage?.text || '',
        caption: getMessageField<string | null>(content, "caption") || '',
    }
}

/** Identificação obrigatória; undefined quando falta id, horário ou chat (mensagem descartada). */
function messageIdentity(m: WAMessage) {
    const message_id = m.key.id
    const t = m.messageTimestamp as number
    const chat_id = m.key.remoteJid
    if (!message_id || !t || !chat_id) return
    return { message_id, t, chat_id }
}

/**
 * Documento enviado COM legenda chega embrulhado em "documentWithCaptionMessage". Sem desembrulhar,
 * a mensagem era descartada: "!topdf" (ou !pdf, !ocr, !upload...) escrito na legenda do arquivo não
 * funcionava, nem responder um documento que tinha legenda. O download (downloadMediaMessage) já
 * entende o embrulho, então a mensagem original é mantida em wa_message.
 */
export function unwrapCaptionedDocument(message: proto.IMessage | null | undefined): proto.IMessage | null | undefined {
    return message?.documentWithCaptionMessage?.message?.documentMessage ? message.documentWithCaptionMessage.message : message
}

export async function formatWAMessage(m: WAMessage, group: Group | null, hostId: string, lookups: FormatWAMessageLookups) {
    const waContent = unwrapCaptionedDocument(m.message)
    if (!waContent) return

    const type = getContentType(waContent)
    const content = type ? waContent[type] : undefined
    if (!type || !isAllowedType(type) || !content) return

    const botAdmins = await lookups.getBotAdmins()
    const contextInfo = getMessageField<proto.IContextInfo>(content, "contextInfo")
    learnIdentities(m.key, hostId)
    const sender = messageSender(m.key, hostId)
    const isGroupAdmin = (sender && group) ? await lookups.isParticipantAdmin(group.id, sender) : false
    const identity = messageIdentity(m)
    if (!identity || !sender) return

    const { body, caption } = messageTexts(waContent, content)
    const context = contextFields(contextInfo)
    const command = parseCommandText(caption || body)
    const permissions = botPermissions(sender, hostId, botAdmins)
    const formatted: Message = {
        message_id: identity.message_id,
        sender,
        type: type as MessageTypes,
        t: identity.t,
        chat_id: identity.chat_id,
        expiration: context.expiration,
        pushname: m.pushName || '',
        body,
        caption,
        mentioned: context.mentioned,
        text_command: command.text_command,
        command: command.command,
        args: command.args,
        isQuoted: context.isQuoted,
        isGroupMsg: identity.chat_id.includes("@g.us"),
        isGroupAdmin,
        isBotAdmin: permissions.isBotAdmin,
        isBotOwner: permissions.isBotOwner,
        isBotMessage: m.key.fromMe ?? false,
        isBroadcast: identity.chat_id == "status@broadcast",
        isMedia: isMediaType(type),
        wa_message: m,
    }

    return attachMediaAndQuote(formatted, content, contextInfo, hostId)
}

function isAllowedType(type: keyof proto.IMessage) {
    const allowedTypes: MessageTypes[] = [
        "conversation",
        "extendedTextMessage",
        "audioMessage",
        "imageMessage",
        "audioMessage",
        "documentMessage",
        "stickerMessage",
        "videoMessage",
        "viewOnceMessage",
        "viewOnceMessageV2",
        "viewOnceMessageV2Extension"
    ]

    return allowedTypes.includes(type)
}