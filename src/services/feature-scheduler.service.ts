import { WASocket } from "baileys"
import * as waUtil from "../utils/whatsapp.util.js"
import { randomDelay, showConsoleError } from "../utils/general.util.js"
import { fetchFreeGamesForCountry, FreeGame, CheckedFreeGame } from "../utils/freegames.util.js"
import { checkLives, LiveStatus } from "../utils/livestream.util.js"
import { formatPhrase, isPhraseDue, phraseAt } from "../utils/phrases.util.js"
import { ChatFeaturesService } from "./chat-features.service.js"
import { ChatFeatures, LiveChannel, LivePlatform } from "../interfaces/chat-features.interface.js"
import { PHRASES } from "../data/phrases.data.js"
import { ReminderService } from "./reminder.service.js"
import { CaptchaService } from "./captcha.service.js"
import { GiveawayService } from "./giveaway.service.js"

/*
 * Agendador dos recursos automáticos por chat: jogos grátis (a cada 30 min), lives (a cada 3 min)
 * e frases (verificação a cada minuto). Cada ciclo é protegido contra erro e contra execução
 * sobreposta; na reconexão só o socket é trocado (os intervalos continuam os mesmos).
 */

export const FREEGAMES_INTERVAL_MS = 30 * 60_000
export const LIVES_INTERVAL_MS = 3 * 60_000
export const PHRASES_INTERVAL_MS = 60_000
/** Lembretes/agendamentos e prazos da verificação de novos membros. */
export const REMINDERS_INTERVAL_MS = 30_000
export const CAPTCHA_INTERVAL_MS = 30_000
/** Encerramento dos sorteios no horário e novas tentativas de entrega. */
export const GIVEAWAYS_INTERVAL_MS = 20_000
/** Máximo de jogos postados por chat em um ciclo (evita enxurrada). */
export const MAX_GAMES_PER_CYCLE = 5

export const PLATFORM_NAMES: Record<LivePlatform, string> = { twitch: 'Twitch', kick: 'Kick', youtube: 'YouTube', tiktok: 'TikTok' }

export function freeGameCaption(game: FreeGame | CheckedFreeGame): string {
    const until = game.end_date && game.end_date !== 'N/A' ? `\n⏳ *Grátis até:* ${game.end_date.slice(8, 10)}/${game.end_date.slice(5, 7)}/${game.end_date.slice(0, 4)}` : ''
    const worth = game.worth && game.worth !== 'N/A' ? `\n💰 *Valor normal:* ~${game.worth}~ → *GRÁTIS*` : ''
    const confirmed = 'availability' in game && game.availability === 'confirmed' ? `\n✅ *Disponível no Brasil* (conferido na loja)` : ''
    return `🎮 *JOGO GRÁTIS!*\n\n*${game.title}*\n🏪 *Loja:* ${game.stores.join(', ')}${worth}${until}${confirmed}\n\n🔗 ${game.url}`
}

/** Lista curta das ofertas que a loja não libera no Brasil (não são divulgadas como jogo grátis). */
export function unavailableNote(games: FreeGame[]): string {
    if (!games.length) return ''
    return `🚫 *Não disponíveis no Brasil* (a loja mostra "indisponível na sua região"):\n${games.map(g => `• ${g.title} (${g.stores.join(', ')})`).join('\n')}`
}

export function liveCaption(channel: LiveChannel, status: LiveStatus): string {
    const title = status.title ? `\n📺 ${status.title}` : ''
    return `🔴 *${channel.channel}* está *AO VIVO* na *${PLATFORM_NAMES[channel.platform]}*!${title}\n\n🔗 ${status.url}`
}

export class FeatureSchedulerService {
    private static instance: FeatureSchedulerService
    private client?: WASocket
    private started = false
    private running = new Set<string>()
    private timers: ReturnType<typeof setInterval>[] = []
    private readonly features = new ChatFeaturesService()
    private readonly reminders = new ReminderService()
    private readonly captcha = new CaptchaService()
    private readonly giveaways = new GiveawayService()

    static getInstance() {
        if (!FeatureSchedulerService.instance) FeatureSchedulerService.instance = new FeatureSchedulerService()
        return FeatureSchedulerService.instance
    }

    /** Inicia os ciclos (uma vez) ou só troca o socket na reconexão. */
    start(client: WASocket) {
        this.client = client
        if (this.started) return
        this.started = true
        this.timers.push(
            setInterval(() => void this.guard('freegames', () => this.freeGamesCycle()), FREEGAMES_INTERVAL_MS),
            setInterval(() => void this.guard('lives', () => this.livesCycle()), LIVES_INTERVAL_MS),
            setInterval(() => void this.guard('phrases', () => this.phrasesCycle()), PHRASES_INTERVAL_MS),
            setInterval(() => void this.guard('reminders', () => this.remindersCycle()), REMINDERS_INTERVAL_MS),
            setInterval(() => void this.guard('captcha', () => this.captchaCycle()), CAPTCHA_INTERVAL_MS),
            setInterval(() => void this.guard('giveaways', () => this.giveawaysCycle()), GIVEAWAYS_INTERVAL_MS),
        )
        // Logo ao conectar: lembretes e verificações que venceram com o bot desligado ou sem internet
        void this.guard('reminders', () => this.remindersCycle())
        void this.guard('captcha', () => this.captchaCycle())
        void this.guard('giveaways', () => this.giveawaysCycle())
        for (const timer of this.timers) timer.unref?.()
    }

    /** Para testes. */
    stop() {
        for (const timer of this.timers) clearInterval(timer)
        this.timers = []
        this.started = false
    }

    /** Impede dois ciclos iguais ao mesmo tempo e registra erros sem derrubar o bot. */
    private async guard(name: string, cycle: () => Promise<void>) {
        if (this.running.has(name) || !this.client) return
        this.running.add(name)
        try {
            await cycle()
        } catch (err) {
            showConsoleError(err, `FEATURE_SCHEDULER_${name.toUpperCase()}`)
        } finally {
            this.running.delete(name)
        }
    }

    // ——— Jogos grátis ———
    async postFreeGames(client: WASocket, chatId: string, games: FreeGame[]) {
        for (const game of games) {
            try {
                await waUtil.sendFileFromUrl(client, chatId, 'imageMessage', game.image, freeGameCaption(game))
            } catch {
                await waUtil.sendText(client, chatId, freeGameCaption(game))
            }
            await randomDelay(1500, 3000)
        }
    }

    async freeGamesCycle() {
        const chats = await this.features.listActive('freegames')
        if (!chats.length || !this.client) return
        // Só o que dá para resgatar no Brasil; o resto não é marcado como postado (se a loja liberar depois, sai)
        const games = (await fetchFreeGamesForCountry()).available
        for (const chat of chats) {
            const fresh = games.filter(g => !chat.freegames.posted_ids.includes(g.id)).slice(0, MAX_GAMES_PER_CYCLE)
            if (!fresh.length) continue
            await this.postFreeGames(this.client, chat.chat_id, fresh)
            await this.features.update(chat.chat_id, f => { f.freegames.posted_ids.push(...fresh.map(g => g.id)) })
            await randomDelay(3000, 6000)
        }
    }

    // ——— Lives ———
    async notifyLive(client: WASocket, chatId: string, channel: LiveChannel, status: LiveStatus) {
        const caption = liveCaption(channel, status)
        try {
            if (status.thumbnail) await waUtil.sendFileFromUrl(client, chatId, 'imageMessage', status.thumbnail, caption)
            else await waUtil.sendLinkWithPreview(client, chatId, caption)
        } catch {
            await waUtil.sendText(client, chatId, caption)
        }
    }

    async livesCycle() {
        const chats = await this.features.listActive('lives')
        if (!chats.length || !this.client) return
        const byPlatform = new Map<LivePlatform, Set<string>>()
        for (const chat of chats) for (const c of chat.lives.channels) {
            if (!byPlatform.has(c.platform)) byPlatform.set(c.platform, new Set())
            byPlatform.get(c.platform)!.add(c.channel)
        }
        // Cada canal é consultado uma vez por ciclo, mesmo que esteja em vários chats
        const statuses = new Map<string, LiveStatus>()
        for (const [platform, channels] of byPlatform) {
            const result = await checkLives(platform, [...channels])
            for (const [channel, status] of result) statuses.set(`${platform}:${channel}`, status)
        }
        for (const chat of chats) await this.applyLiveStatuses(chat, statuses)
    }

    private async applyLiveStatuses(chat: ChatFeatures, statuses: Map<string, LiveStatus>) {
        const toNotify: [LiveChannel, LiveStatus][] = []
        for (const channel of chat.lives.channels) {
            const status = statuses.get(`${channel.platform}:${channel.channel}`)
            if (!status) continue // erro na consulta: mantém o estado anterior
            // Avisa quando entra no ar ou quando começa outra transmissão; nunca a mesma live duas vezes
            const sameStream = Boolean(status.stream_id) && status.stream_id === channel.last_stream_id
            const becameLive = status.live && channel.live !== true
            const newStream = status.live && Boolean(status.stream_id) && !sameStream
            if ((becameLive || newStream) && !sameStream) toNotify.push([channel, status])
            channel.live = status.live
            if (status.live && status.stream_id) channel.last_stream_id = status.stream_id
        }
        await this.features.update(chat.chat_id, f => { f.lives.channels = chat.lives.channels })
        for (const [channel, status] of toNotify) {
            await this.notifyLive(this.client!, chat.chat_id, channel, status)
            await randomDelay(1500, 3000)
        }
    }

    // ——— Frases ———
    async phrasesCycle(now = Date.now()) {
        const chats = await this.features.listActive('phrases')
        if (!this.client) return
        for (const chat of chats) {
            if (!isPhraseDue(chat.phrases, now)) continue
            const phrase = phraseAt(PHRASES, chat.chat_id, chat.phrases.cursor)
            await waUtil.sendText(this.client, chat.chat_id, `💭 *Frase do momento*\n\n${formatPhrase(phrase)}`)
            await this.features.update(chat.chat_id, f => { f.phrases.cursor++; f.phrases.last_sent = now })
            await randomDelay(1500, 3000)
        }
    }

    // ——— Lembretes e verificação de novos membros ———
    async remindersCycle(now = Date.now()) {
        if (!this.client) return
        await this.reminders.sendDue(this.client, now)
    }

    async captchaCycle(now = Date.now()) {
        if (!this.client) return
        const botId = waUtil.getHostNumber(this.client)
        if (!botId) return
        await this.captcha.processExpired(this.client, botId, now)
    }

    // ——— Sorteios ———
    async giveawaysCycle(now = Date.now()) {
        if (!this.client) return
        const client = this.client
        await this.giveaways.runDue(client, g => this.giveaways.announceResult(client, g).then(() => undefined), now)
    }
}
