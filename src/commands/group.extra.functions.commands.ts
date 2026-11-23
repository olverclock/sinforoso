import { WASocket } from "baileys"
import { Bot } from "../interfaces/bot.interface.js"
import { Group } from "../interfaces/group.interface.js"
import { Message } from "../interfaces/message.interface.js"
import botTexts from "../helpers/bot.texts.helper.js"
import { buildText, showConsoleError, randomDelay } from "../utils/general.util.js"
import { messageErrorCommandUsage } from "../utils/commands.util.js"
import * as waUtil from "../utils/whatsapp.util.js"
import { describeWhen, normalizeWord, parseSchedule } from "../utils/reminder.util.js"
import { sameUser } from "../utils/identity.util.js"
import { DiscordInvite } from "../interfaces/chat-features.interface.js"
import { GroupController } from "../controllers/group.controller.js"
import { UserController } from "../controllers/user.controller.js"
import { ChatFeaturesService } from "../services/chat-features.service.js"
import { ReminderService } from "../services/reminder.service.js"
import { MAX_MINUTES, MIN_MINUTES } from "../services/captcha.service.js"
import { receiverOf, SecretSanta, SecretSantaService } from "../services/secret-santa.service.js"
import { groupExtraTexts as t } from "./group.extra.texts.commands.js"

const features = new ChatFeaturesService()
const reminders = new ReminderService()
const secretSanta = new SecretSantaService()

export const MAX_RULES_LENGTH = 4000

async function reply(client: WASocket, message: Message, text: string): Promise<void> {
    await waUtil.replyText(client, message.chat_id, text, message.wa_message, { expiration: message.expiration })
}

function requireGroupAdmin(message: Message) {
    if (!message.isGroupAdmin) throw new Error(botTexts.permission.admin_group_only)
}

function isBotGroupAdmin(group: Group, botInfo: Bot): Promise<boolean> {
    return new GroupController().isParticipantAdmin(group.id, botInfo.host_number)
}

// ———————————————— AGENDAR ————————————————
export async function agendarCommand(client: WASocket, botInfo: Bot, message: Message, group: Group) {
    requireGroupAdmin(message)
    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    const parsed = parseSchedule(message.text_command)
    await reminders.add({ chat_id: group.id, creator: message.sender, kind: 'group', text: parsed.text, when: parsed.when, repeat: parsed.repeat, expiration: message.expiration })
    await reply(client, message, buildText(t.agendar.msgs.reply, describeWhen(parsed.when, parsed.repeat), parsed.text))
}

// ———————————————— REGRAS ————————————————
export async function regrasCommand(client: WASocket, _botInfo: Bot, message: Message, group: Group) {
    const current = await features.get(group.id)
    const text = current.rules.text || group.description?.trim()
    if (!text) return reply(client, message, buildText(t.regras.msgs.reply_empty))
    await reply(client, message, buildText(t.regras.msgs.reply, group.name, text))
}

export async function setregrasCommand(client: WASocket, _botInfo: Bot, message: Message, group: Group) {
    requireGroupAdmin(message)
    const quoted = message.quotedMessage ? (message.quotedMessage.body || message.quotedMessage.caption) : ''
    const text = (message.text_command || quoted || '').trim()
    if (!text) throw new Error(buildText(t.setregras.msgs.error_empty))
    if (text.length > MAX_RULES_LENGTH) throw new Error(t.setregras.msgs.error_length)
    await features.update(group.id, f => { f.rules.text = text })
    await reply(client, message, buildText(t.setregras.msgs.reply, text.length))
}

export async function rmregrasCommand(client: WASocket, _botInfo: Bot, message: Message, group: Group) {
    requireGroupAdmin(message)
    await features.update(group.id, f => { f.rules = { text: '', auto: false } })
    await reply(client, message, t.rmregras.msgs.reply)
}

export async function regrasautoCommand(client: WASocket, _botInfo: Bot, message: Message, group: Group) {
    requireGroupAdmin(message)
    const current = await features.get(group.id)
    if (!current.rules.auto && !current.rules.text) throw new Error(buildText(t.regrasauto.msgs.error_no_rules))
    const updated = await features.update(group.id, f => { f.rules.auto = !f.rules.auto })
    await reply(client, message, updated.rules.auto ? t.regrasauto.msgs.reply_on : t.regrasauto.msgs.reply_off)
}

// ———————————————— VERIFICAÇÃO DE NOVOS MEMBROS ————————————————
export async function verificacaoCommand(client: WASocket, botInfo: Bot, message: Message, group: Group) {
    requireGroupAdmin(message)
    const arg = message.args[0]
    const current = await features.get(group.id)
    let minutes = current.captcha.minutes
    let enable = !current.captcha.status
    if (arg) {
        minutes = Number(arg)
        if (!Number.isInteger(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) throw new Error(t.verificacao.msgs.error_minutes)
        enable = true // com prazo, sempre liga (ou só ajusta o prazo)
    }
    await features.update(group.id, f => { f.captcha = { status: enable, minutes } })
    if (!enable) return reply(client, message, t.verificacao.msgs.reply_off)
    const warn = (await isBotGroupAdmin(group, botInfo)) ? '' : t.verificacao.msgs.warn_not_admin
    await reply(client, message, buildText(t.verificacao.msgs.reply_on, minutes, warn))
}

// ———————————————— ANTIGOLPE ————————————————
export async function antigolpeCommand(client: WASocket, botInfo: Bot, message: Message, group: Group) {
    requireGroupAdmin(message)
    const updated = await features.update(group.id, f => { f.antiscam.status = !f.antiscam.status })
    if (!updated.antiscam.status) return reply(client, message, t.antigolpe.msgs.reply_off)
    const warn = (await isBotGroupAdmin(group, botInfo)) ? '' : t.antigolpe.msgs.warn_not_admin
    await reply(client, message, buildText(t.antigolpe.msgs.reply_on, warn))
}

// ———————————————— AMIGO SECRETO ————————————————
const mentionOf = (id: string) => `@${waUtil.removeWhatsappSuffix(id)}`

async function displayName(id: string): Promise<string> {
    const user = await new UserController().getUser(id)
    return user?.name?.trim() || waUtil.removeWhatsappSuffix(id)
}

/** Envia a cada participante, no privado, quem ele tirou. Devolve quem não recebeu. */
export async function sendSecretSantaDMs(client: WASocket, game: SecretSanta, groupName: string, only?: string): Promise<string[]> {
    const failed: string[] = []
    const note = game.note ? `\n\n📝 ${game.note}` : ''
    for (const { giver, receiver } of game.pairs) {
        if (only && giver !== only) continue
        try {
            const text = buildText(t.amigosecreto.msgs.dm, groupName, `${await displayName(receiver)} (${mentionOf(receiver)})`, note)
            await waUtil.sendTextWithMentions(client, giver, text, [receiver])
            if (!only) await randomDelay(800, 1500)
        } catch (err) {
            showConsoleError(err, "AMIGO_SECRETO")
            failed.push(giver)
        }
    }
    return failed
}

type SantaAction = (client: WASocket, botInfo: Bot, message: Message, group: Group) => Promise<void>

const SANTA_ACTIONS: Record<string, SantaAction> = {
    criar: async (client, _botInfo, message, group) => {
        requireGroupAdmin(message)
        const note = message.args.slice(1).join(' ').trim().slice(0, 300)
        await secretSanta.create(group.id, message.sender, note)
        await reply(client, message, buildText(t.amigosecreto.msgs.reply_created, note ? `\n\n📝 ${note}` : ''))
    },
    entrar: async (client, _botInfo, message, group) => {
        const { game, added } = await secretSanta.join(group.id, message.sender)
        if (!added) return reply(client, message, buildText(t.amigosecreto.msgs.reply_already, game.participants.length))
        await waUtil.replyWithMentions(client, message.chat_id, buildText(t.amigosecreto.msgs.reply_joined, waUtil.removeWhatsappSuffix(message.sender), game.participants.length), [message.sender], message.wa_message, { expiration: message.expiration })
    },
    sair: async (client, _botInfo, message, group) => {
        const { game, removed } = await secretSanta.leave(group.id, message.sender)
        await reply(client, message, removed ? buildText(t.amigosecreto.msgs.reply_left, game.participants.length) : t.amigosecreto.msgs.reply_not_in)
    },
    lista: async (client, _botInfo, message, group) => {
        const game = await secretSanta.get(group.id)
        if (!game) return reply(client, message, t.amigosecreto.msgs.reply_nothing)
        const names = game.participants.map((p, i) => `${i + 1}. ${mentionOf(p)}`).join('\n')
        const status = game.status === 'drawn' ? ' · _sorteado_ ✅' : ' · _aberto para entrar_'
        const note = game.note ? `\n📝 ${game.note}` : ''
        await waUtil.replyWithMentions(client, message.chat_id, buildText(t.amigosecreto.msgs.reply_list, game.participants.length, status + note, names), game.participants, message.wa_message, { expiration: message.expiration })
    },
    sortear: async (client, _botInfo, message, group) => {
        requireGroupAdmin(message)
        const game = await secretSanta.draw(group.id)
        const failed = await sendSecretSantaDMs(client, game, group.name)
        const failedText = failed.length ? buildText(t.amigosecreto.msgs.reply_dm_failed, failed.map(mentionOf).join(', ')) : ''
        await waUtil.replyWithMentions(client, message.chat_id, buildText(t.amigosecreto.msgs.reply_drawn, failedText), failed, message.wa_message, { expiration: message.expiration })
    },
    meu: async (client, _botInfo, message, group) => {
        const game = await secretSanta.get(group.id)
        if (!game) return reply(client, message, t.amigosecreto.msgs.reply_nothing)
        if (game.status !== 'drawn') return reply(client, message, t.amigosecreto.msgs.reply_not_drawn)
        if (!receiverOf(game, message.sender)) return reply(client, message, t.amigosecreto.msgs.reply_not_participant)
        const failed = await sendSecretSantaDMs(client, game, group.name, message.sender)
        if (failed.length) throw new Error("Não consegui enviar no seu privado. Mande um \"oi\" no privado do bot e tente de novo.")
        await reply(client, message, t.amigosecreto.msgs.reply_dm_sent)
    },
    cancelar: async (client, _botInfo, message, group) => {
        requireGroupAdmin(message)
        const removed = await secretSanta.cancel(group.id)
        await reply(client, message, removed ? t.amigosecreto.msgs.reply_cancelled : t.amigosecreto.msgs.reply_nothing)
    },
}

const SANTA_ALIASES: Record<string, string> = {
    criar: 'criar', novo: 'criar', iniciar: 'criar', entrar: 'entrar', participar: 'entrar', sair: 'sair',
    lista: 'lista', listar: 'lista', participantes: 'lista', sortear: 'sortear', sorteio: 'sortear',
    meu: 'meu', quem: 'meu', cancelar: 'cancelar', apagar: 'cancelar', encerrar: 'cancelar',
}

export async function amigosecretoCommand(client: WASocket, botInfo: Bot, message: Message, group: Group) {
    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    const action = SANTA_ALIASES[normalizeWord(message.args[0])]
    if (!action) throw new Error(buildText(t.amigosecreto.msgs.error_option))
    await SANTA_ACTIONS[action](client, botInfo, message, group)
}

// ———————————————— MARCAR TODOS ————————————————
export async function marcarCommand(client: WASocket, botInfo: Bot, message: Message, group: Group) {
    requireGroupAdmin(message)
    const everyone = (await new GroupController().getParticipantsIds(group.id)).filter(id => !sameUser(id, botInfo.host_number))
    const options = { expiration: message.expiration }
    const [first, ...rest] = message.args.filter(Boolean)
    const showList = normalizeWord(first ?? '') === 'lista'
    const text = (showList ? rest.join(' ') : message.text_command).trim()

    // Respondendo uma mensagem sem texto: marca todos naquela mensagem
    if (message.quotedMessage && !text && !showList) {
        await waUtil.replyWithMentions(client, message.chat_id, buildText(t.marcar.msgs.reply_quoted, everyone.length), everyone, message.quotedMessage.wa_message, options)
        return
    }
    if (showList) {
        const list = everyone.map(id => `@${waUtil.removeWhatsappSuffix(id)}`).join(' ')
        await waUtil.sendTextWithMentions(client, message.chat_id, buildText(t.marcar.msgs.reply_list, text || t.marcar.msgs.reply_hidden_empty, list), everyone, options)
        return
    }
    // Invisível: as menções vão nos dados da mensagem, sem encher o texto de @
    await waUtil.sendTextWithMentions(client, message.chat_id, text ? buildText(t.marcar.msgs.reply_hidden, text) : t.marcar.msgs.reply_hidden_empty, everyone, options)
}

// ———————————————— DISCORD ————————————————
export const MAX_DISCORD_INVITES = 10

/** Aceita discord.gg/código, discord.com/invite/código e discordapp.com/invite/código; devolve o link limpo. */
export function normalizeDiscordInvite(text: string): string | null {
    const m = text.match(/(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]{2,32})(?![A-Za-z0-9-])/i)
    return m ? `https://discord.gg/${m[1]}` : null
}

/** "Nome | link", "Nome link" ou "link Nome" → { name, url }. */
export function parseDiscordInput(text: string): DiscordInvite | null {
    const url = normalizeDiscordInvite(text)
    if (!url) return null
    const name = text.replace(/(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[A-Za-z0-9-]+/i, ' ').replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim()
    return { name: name.slice(0, 60), url }
}

function findInvite(list: DiscordInvite[], query: string): number {
    const n = Number(query)
    if (Number.isInteger(n) && n >= 1 && n <= list.length) return n - 1
    const wanted = normalizeWord(query.trim())
    return list.findIndex(i => normalizeWord(i.name) === wanted)
}

export async function discordCommand(client: WASocket, _botInfo: Bot, message: Message, group: Group) {
    const [option, ...rest] = message.args.filter(Boolean)
    const action = normalizeWord(option ?? '')
    const argText = rest.join(' ').trim()

    if (!action) {
        const { discord } = await features.get(group.id)
        if (!discord.length) return reply(client, message, buildText(t.discord.msgs.reply_empty))
        let text = buildText(t.discord.msgs.reply_title, discord.length)
        discord.forEach((invite, i) => { text += buildText(t.discord.msgs.reply_item, i + 1, invite.name || 'Discord', invite.url) })
        return reply(client, message, text.trim())
    }
    if (['add', 'adicionar', 'novo'].includes(action)) {
        requireGroupAdmin(message)
        if (!argText) throw new Error(buildText(t.discord.msgs.error_format))
        const invite = parseDiscordInput(argText)
        if (!invite) throw new Error(t.discord.msgs.error_link)
        if (!invite.name) throw new Error(buildText(t.discord.msgs.error_format))
        let updated = false
        await features.update(group.id, f => {
            const index = f.discord.findIndex(i => normalizeWord(i.name) === normalizeWord(invite.name))
            // Mesmo nome: troca só o link e mantém o nome como foi escrito da primeira vez
            if (index >= 0) { f.discord[index] = { ...f.discord[index], url: invite.url }; invite.name = f.discord[index].name; updated = true; return }
            if (f.discord.length >= MAX_DISCORD_INVITES) throw new Error(buildText(t.discord.msgs.error_limit))
            f.discord.push(invite)
        })
        return reply(client, message, buildText(updated ? t.discord.msgs.reply_updated : t.discord.msgs.reply_added, invite.name, invite.url))
    }
    if (['rm', 'remover', 'apagar', 'del'].includes(action)) {
        requireGroupAdmin(message)
        if (!argText) throw new Error(buildText(t.discord.msgs.error_not_found))
        let removed: DiscordInvite | undefined
        await features.update(group.id, f => {
            const index = findInvite(f.discord, argText)
            if (index >= 0) removed = f.discord.splice(index, 1)[0]
        })
        if (!removed) throw new Error(buildText(t.discord.msgs.error_not_found))
        return reply(client, message, buildText(t.discord.msgs.reply_removed, removed.name))
    }
    throw new Error(buildText(t.discord.msgs.error_option))
}
