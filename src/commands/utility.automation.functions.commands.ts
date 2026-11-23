import { downloadMediaMessage, WASocket } from "baileys"
import { Bot } from "../interfaces/bot.interface.js"
import { Group } from "../interfaces/group.interface.js"
import { Message } from "../interfaces/message.interface.js"
import { LivePlatform } from "../interfaces/chat-features.interface.js"
import botTexts from "../helpers/bot.texts.helper.js"
import { buildText, findLinks } from "../utils/general.util.js"
import { messageErrorCommandUsage } from "../utils/commands.util.js"
import * as waUtil from "../utils/whatsapp.util.js"
import { fetchFreeGamesForCountry } from "../utils/freegames.util.js"
import { checkLives, normalizeChannel } from "../utils/livestream.util.js"
import { describeInterval, formatPhrase, parseInterval, parseTime, phraseAt } from "../utils/phrases.util.js"
import { MAX_SCAN_FILE_BYTES, scanFileHash, scanUrl, sha256, ScanResult, withScheme } from "../utils/virustotal.util.js"
import { ChatFeaturesService } from "../services/chat-features.service.js"
import { FeatureSchedulerService, MAX_GAMES_PER_CYCLE, PLATFORM_NAMES, unavailableNote } from "../services/feature-scheduler.service.js"
import { PHRASES } from "../data/phrases.data.js"
import { automationTexts as t } from "./utility.automation.texts.commands.js"

const features = new ChatFeaturesService()
const PLATFORMS: LivePlatform[] = ['twitch', 'kick', 'youtube', 'tiktok']

async function reply(client: WASocket, message: Message, text: string): Promise<void> {
    await waUtil.replyText(client, message.chat_id, text, message.wa_message, { expiration: message.expiration })
}

/** No grupo, só administradores do grupo configuram; no privado, o próprio usuário. */
function requireConfigPermission(message: Message) {
    if (message.isGroupMsg && !message.isGroupAdmin) throw new Error(botTexts.permission.admin_group_only)
}

// ———————————————— JOGOS GRÁTIS ————————————————
export async function jogosgratisCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    if (message.args[0]?.toLowerCase() === 'agora') {
        const { available: games, unavailable } = await fetchFreeGamesForCountry()
        if (!games.length) {
            await reply(client, message, t.jogosgratis.msgs.reply_none)
            if (unavailable.length) await reply(client, message, unavailableNote(unavailable))
            return
        }
        await reply(client, message, buildText(t.jogosgratis.msgs.reply_current_title, games.length))
        await FeatureSchedulerService.getInstance().postFreeGames(client, message.chat_id, games.slice(0, 10))
        if (unavailable.length) await reply(client, message, unavailableNote(unavailable))
        return
    }
    requireConfigPermission(message)
    const current = await features.get(message.chat_id)
    const enable = !current.freegames.status
    let toPost: Awaited<ReturnType<typeof fetchFreeGamesForCountry>>['available'] = []
    if (enable) {
        // Ao ativar, já mostra os jogos de agora (até 5); depois só os novos
        try { toPost = (await fetchFreeGamesForCountry()).available.slice(0, MAX_GAMES_PER_CYCLE) } catch { toPost = [] }
    }
    await features.update(message.chat_id, f => {
        f.freegames.status = enable
        if (enable) f.freegames.posted_ids.push(...toPost.map(g => g.id))
    })
    await reply(client, message, enable ? t.jogosgratis.msgs.reply_on : t.jogosgratis.msgs.reply_off)
    if (toPost.length) await FeatureSchedulerService.getInstance().postFreeGames(client, message.chat_id, toPost)
}

// ———————————————— LIVES ————————————————
/** "https://twitch.tv/x" ou "twitch x" → { platform, channel }. */
export function parseLiveInput(args: string[]): { platform: LivePlatform, channel: string } | null {
    const text = args.join(' ').trim()
    if (!text) return null
    const fromUrl: [RegExp, LivePlatform][] = [[/twitch\.tv\//i, 'twitch'], [/kick\.com\//i, 'kick'], [/youtube\.com\/|youtu\.be\//i, 'youtube'], [/tiktok\.com\//i, 'tiktok']]
    for (const [pattern, platform] of fromUrl) {
        if (pattern.test(text)) {
            const channel = normalizeChannel(platform, text)
            return channel ? { platform, channel } : null
        }
    }
    const platform = args[0]?.toLowerCase() as LivePlatform
    if (!PLATFORMS.includes(platform) || args.length < 2) return null
    const channel = normalizeChannel(platform, args.slice(1).join(''))
    return channel ? { platform, channel } : null
}

export async function alertaliveCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    requireConfigPermission(message)
    const updated = await features.update(message.chat_id, f => { f.lives.status = !f.lives.status })
    await reply(client, message, updated.lives.status
        ? buildText(t.alertalive.msgs.reply_on, updated.lives.channels.length)
        : t.alertalive.msgs.reply_off)
}

export async function addliveCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    requireConfigPermission(message)
    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    const parsed = parseLiveInput(message.args)
    if (!parsed) throw new Error(buildText(t.addlive.msgs.error_invalid))
    const current = await features.get(message.chat_id)
    if (current.lives.channels.some(c => ChatFeaturesService.sameChannel(c, parsed))) {
        return reply(client, message, t.addlive.msgs.reply_already)
    }
    // Consulta já na hora: estado inicial certo (não avisa de novo uma live que já estava no ar)
    const status = (await checkLives(parsed.platform, [parsed.channel])).get(parsed.channel)
    const wasOff = !current.lives.status
    await features.update(message.chat_id, f => {
        f.lives.status = true
        f.lives.channels.push({ ...parsed, live: status?.live, last_stream_id: status?.live ? status.stream_id : undefined })
    })
    const state = status?.live ? buildText(t.addlive.msgs.reply_is_live, status.url) : t.addlive.msgs.reply_offline
    await reply(client, message, buildText(t.addlive.msgs.reply_added, parsed.channel, PLATFORM_NAMES[parsed.platform], state) + (wasOff ? t.addlive.msgs.reply_auto_on : ''))
}

export async function rmliveCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    requireConfigPermission(message)
    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    const parsed = parseLiveInput(message.args)
    if (!parsed) throw new Error(buildText(t.addlive.msgs.error_invalid))
    let removed = false
    await features.update(message.chat_id, f => {
        const before = f.lives.channels.length
        f.lives.channels = f.lives.channels.filter(c => !ChatFeaturesService.sameChannel(c, parsed))
        removed = f.lives.channels.length < before
    })
    await reply(client, message, removed ? buildText(t.rmlive.msgs.reply_removed, parsed.channel, PLATFORM_NAMES[parsed.platform]) : buildText(t.rmlive.msgs.reply_not_found))
}

export async function livesCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const current = await features.get(message.chat_id)
    let text = buildText(t.lives.msgs.reply_title, current.lives.status ? 'ATIVADOS ✅' : 'DESATIVADOS ❌')
    if (!current.lives.channels.length) text += buildText(t.lives.msgs.reply_empty)
    for (const c of current.lives.channels) text += buildText(t.lives.msgs.reply_item, c.live ? '🔴' : '⚫', c.channel, PLATFORM_NAMES[c.platform])
    await reply(client, message, text.trim())
}

// ———————————————— FRASES ————————————————
function describeSchedule(p: { mode: string, time: string, interval_minutes: number }) {
    return p.mode === 'interval' ? `a cada ${describeInterval(p.interval_minutes)}` : `todo dia às ${p.time}`
}

export async function frasesCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    requireConfigPermission(message)
    const updated = await features.update(message.chat_id, f => {
        f.phrases.status = !f.phrases.status
        // Ao ativar, a primeira frase sai no próximo horário (não na hora)
        if (f.phrases.status) f.phrases.last_sent = Date.now()
    })
    await reply(client, message, updated.phrases.status ? buildText(t.frases.msgs.reply_on, describeSchedule(updated.phrases)) : t.frases.msgs.reply_off)
}

const autoOnNote = (wasOff: boolean) => wasOff ? "\n\nℹ️ As frases estavam desligadas e foram *ativadas*." : ""

export async function frasehoraCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    requireConfigPermission(message)
    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    const time = parseTime(message.args[0])
    if (!time) throw new Error(buildText(t.frasehora.msgs.error_invalid))
    const before = await features.get(message.chat_id)
    await features.update(message.chat_id, f => {
        Object.assign(f.phrases, { status: true, mode: 'daily', time, last_sent: Date.now() })
    })
    await reply(client, message, buildText(t.frasehora.msgs.reply, time, autoOnNote(!before.phrases.status)))
}

export async function fraseintervaloCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    requireConfigPermission(message)
    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    const minutes = parseInterval(message.args.join(''))
    if (!minutes) throw new Error(buildText(t.fraseintervalo.msgs.error_invalid))
    const before = await features.get(message.chat_id)
    await features.update(message.chat_id, f => {
        Object.assign(f.phrases, { status: true, mode: 'interval', interval_minutes: minutes, last_sent: Date.now() })
    })
    await reply(client, message, buildText(t.fraseintervalo.msgs.reply, describeInterval(minutes), autoOnNote(!before.phrases.status)))
}

export async function fraseagoraCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const current = await features.get(message.chat_id)
    const phrase = phraseAt(PHRASES, message.chat_id, current.phrases.cursor)
    await features.update(message.chat_id, f => { f.phrases.cursor++ })
    await reply(client, message, buildText(t.fraseagora.msgs.reply, formatPhrase(phrase)))
}

// ———————————————— VIRUSTOTAL ————————————————
function formatResult(target: string, result: ScanResult): string {
    const verdicts = { malicious: t.scan.msgs.verdict_malicious, suspicious: t.scan.msgs.verdict_suspicious, clean: t.scan.msgs.verdict_clean, unknown: t.scan.msgs.verdict_unknown }
    const s = result.stats ?? { malicious: 0, suspicious: 0, harmless: 0, undetected: 0 }
    return buildText(t.scan.msgs.result, target, verdicts[result.verdict], s.malicious, s.suspicious, s.harmless, s.undetected, result.permalink ?? '')
}

export async function scanlinksCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    requireConfigPermission(message)
    const updated = await features.update(message.chat_id, f => { f.linkscan.status = !f.linkscan.status })
    await reply(client, message, updated.linkscan.status ? t.scanlinks.msgs.reply_on : t.scanlinks.msgs.reply_off)
}

export async function scanCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const quoted = message.quotedMessage
    const ownLinks = findLinks(message.text_command) ?? []
    const quotedLinks = quoted ? findLinks(`${quoted.body} ${quoted.caption}`) ?? [] : []
    const link = ownLinks[0] ?? quotedLinks[0]

    if (link) {
        await reply(client, message, t.scan.msgs.wait)
        const url = withScheme(link)
        return reply(client, message, formatResult(url, await scanUrl(url)))
    }
    if (quoted?.isMedia && quoted.type === 'documentMessage') {
        if (Number(quoted.media?.file_length ?? 0) > MAX_SCAN_FILE_BYTES) throw new Error(t.scan.msgs.error_file_size)
        await reply(client, message, t.scan.msgs.wait)
        const buffer = await downloadMediaMessage(quoted.wa_message, "buffer", {})
        return reply(client, message, formatResult(`📄 SHA-256: ${sha256(buffer)}`, await scanFileHash(sha256(buffer))))
    }
    throw new Error(buildText(t.scan.msgs.error_nothing))
}
