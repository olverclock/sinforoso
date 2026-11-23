import { WASocket, WAMessage, MessageUpsertType, isJidBroadcast, isJidNewsletter } from 'baileys'
import { showConsoleError } from '../utils/general.util.js'
import { Bot } from '../interfaces/bot.interface.js'
import NodeCache from 'node-cache'
import { UserController } from '../controllers/user.controller.js'
import { handleGroupMessage, handlePrivateMessage } from '../helpers/message.handler.helper.js'
import { GroupController } from '../controllers/group.controller.js'
import { storeMessageOnCache, formatWAMessage } from '../utils/whatsapp.util.js'
import { commandInvoker } from '../helpers/command.invoker.helper.js'

/**
 * Mensagens mais antigas que isso (enviadas enquanto o bot estava desligado) não disparam comandos,
 * para o bot não responder de uma vez horas de comandos antigos depois de religar.
 */
export const MAX_MESSAGE_AGE_MS = Number(process.env.MAX_MESSAGE_AGE_MIN ?? 10) * 60_000

/** DEBUG_MESSAGES=1 no .env: registra no log o caminho de cada mensagem (sem o conteúdo). */
const debugEnabled = () => process.env.DEBUG_MESSAGES === '1'
function debug(raw: WAMessage, what: string) {
    if (!debugEnabled()) return
    const chat = raw.key.remoteJid?.endsWith('@g.us') ? 'grupo' : 'privado'
    const age = Math.round(messageAgeMs(raw) / 1000)
    console.log(`[MSG] ${chat} · ${age}s atrás · ${what}`)
}

function messageAgeMs(m: WAMessage, now = Date.now()): number {
    const seconds = Number(m.messageTimestamp ?? 0)
    return seconds ? now - seconds * 1000 : 0
}

async function handleOne(client: WASocket, raw: WAMessage, botInfo: Bot) {
    const userController = new UserController()
    const groupController = new GroupController()
    const idChat = raw.key.remoteJid
    const isGroupMsg = idChat?.includes("@g.us")
    const group = (isGroupMsg && idChat) ? await groupController.getGroup(idChat) : null
    const message = await formatWAMessage(raw, group, botInfo.host_number, {
        getBotAdmins: () => userController.getAdmins(),
        isParticipantAdmin: (groupId, userId) => groupController.isParticipantAdmin(groupId, userId)
    })
    if (!message) return debug(raw, 'formato ignorado (reação, status, sistema...)')

    // Sincronizar registro: aguardar conclusão antes de prosseguir com handlers/comandos
    await userController.registerUser(message.sender, message.pushname)

    if (!isGroupMsg) {
        const needCallCommand = await handlePrivateMessage(client, botInfo, message)
        debug(raw, needCallCommand ? `comando ${message.command}` : 'não é comando (ou bloqueada pelas regras do privado)')
        if (needCallCommand) await commandInvoker(client, botInfo, message, null)
    } else if (group) {
        const needCallCommand = await handleGroupMessage(client, group, botInfo, message)
        debug(raw, needCallCommand ? `comando ${message.command}` : 'não é comando (ou bloqueada pelas regras do grupo)')
        if (needCallCommand) await commandInvoker(client, botInfo, message, group)
    } else {
        debug(raw, 'grupo ainda não registrado no banco do bot')
    }
}

/**
 * Trata TODAS as mensagens do lote, na ordem. Depois de uma reconexão o Baileys entrega várias
 * mensagens juntas num único evento; antes só a primeira era tratada e as demais (inclusive
 * comandos) eram perdidas. Uma falha numa mensagem não impede as seguintes.
 */
export async function messageReceived(client: WASocket, messages: { messages: WAMessage[], requestId?: string, type: MessageUpsertType }, botInfo: Bot, messageCache: NodeCache) {
    for (const raw of messages.messages) {
        try {
            if (raw.key.fromMe) storeMessageOnCache(raw, messageCache)
            if (messages.type !== 'notify') { debug(raw, `ignorada: tipo "${messages.type}" (histórico)`); continue }
            // Status (stories) dos contatos, listas de transmissão e canais não são conversas: responder
            // ali (boas-vindas, figurinha automática...) publicava um status em nome do bot, e o WhatsApp
            // derrubava a conexão ("Stream Errored (ack)", class "status", type "media").
            if (isJidBroadcast(raw.key.remoteJid ?? '') || isJidNewsletter(raw.key.remoteJid ?? '')) { debug(raw, 'ignorada: status, transmissão ou canal'); continue }
            if (messageAgeMs(raw) > MAX_MESSAGE_AGE_MS) { debug(raw, 'ignorada: mais antiga que o limite (MAX_MESSAGE_AGE_MIN)'); continue }
            await handleOne(client, raw, botInfo)
        } catch (err) {
            showConsoleError(err, "MESSAGES.UPSERT")
        }
    }
}
