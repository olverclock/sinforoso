import moment from "moment-timezone"
import { Phrase, PhraseScheduleMode } from "../interfaces/chat-features.interface.js"

/*
 * Motor das frases automáticas: escolhe a próxima frase sem repetir (cada chat percorre o banco
 * inteiro numa ordem embaralhada própria) e decide quando enviar (horário diário ou intervalo).
 */

export const TIMEZONE = 'America/Sao_Paulo'
export const MIN_INTERVAL_MINUTES = 30
export const MAX_INTERVAL_MINUTES = 7 * 24 * 60

export type { Phrase }

/** Gerador pseudoaleatório determinístico (mulberry32) a partir do id do chat. */
function seededRandom(seedText: string) {
    let seed = 0
    for (const char of seedText) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) | 0
    return () => {
        seed = (seed + 0x6D2B79F5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

const orders = new Map<string, number[]>()

/** Ordem embaralhada (Fisher-Yates) do banco para o chat; a cada volta completa, outra ordem. */
export function phraseOrder(chatId: string, total: number, round: number): number[] {
    const key = `${chatId}#${round}#${total}`
    let order = orders.get(key)
    if (!order) {
        const random = seededRandom(key)
        order = Array.from({ length: total }, (_, i) => i)
        for (let i = total - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]]
        }
        if (orders.size > 200) orders.clear()
        orders.set(key, order)
    }
    return order
}

/** Frase da posição `cursor` para o chat (o cursor só cresce; a volta é calculada). */
export function phraseAt<T>(bank: T[], chatId: string, cursor: number): T {
    const round = Math.floor(cursor / bank.length)
    return bank[phraseOrder(chatId, bank.length, round)[cursor % bank.length]]
}

export function formatPhrase(phrase: Phrase): string {
    return phrase.author ? `“${phrase.text}”\n— _${phrase.author}_` : `“${phrase.text}”`
}

/** "8", "8h", "08:30", "8:30" → "08:30"; inválido → null. */
export function parseTime(input: string): string | null {
    const match = input.trim().toLowerCase().match(/^(\d{1,2})(?:[:h](\d{2})?)?h?$/)
    if (!match) return null
    const hours = Number(match[1]), minutes = Number(match[2] ?? 0)
    if (hours > 23 || minutes > 59) return null
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/** "30m", "2h", "1h30", "1d" → minutos; fora de 30 min a 7 dias → null. */
export function parseInterval(input: string): number | null {
    const match = input.trim().toLowerCase().match(/^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m?)?$/)
    if (!match || !input.trim()) return null
    const [, d, h, m] = match
    if (d === undefined && h === undefined && m === undefined) return null
    // "90" sem unidade = minutos; "1h30" = 1 h e 30 min
    const minutes = Number(d ?? 0) * 1440 + Number(h ?? 0) * 60 + Number(m ?? 0)
    return minutes >= MIN_INTERVAL_MINUTES && minutes <= MAX_INTERVAL_MINUTES ? minutes : null
}

export function describeInterval(minutes: number): string {
    const d = Math.floor(minutes / 1440), h = Math.floor((minutes % 1440) / 60), m = minutes % 60
    return [d && `${d} dia(s)`, h && `${h} hora(s)`, m && `${m} minuto(s)`].filter(Boolean).join(' e ')
}

/** Já passou da hora de enviar? */
export function isPhraseDue(schedule: { mode: PhraseScheduleMode, time: string, interval_minutes: number, last_sent: number }, now = Date.now()): boolean {
    if (schedule.mode === 'interval') return now - schedule.last_sent >= schedule.interval_minutes * 60_000
    const [hours, minutes] = schedule.time.split(':').map(Number)
    const todayAt = moment.tz(now, TIMEZONE).set({ hour: hours, minute: minutes, second: 0, millisecond: 0 }).valueOf()
    return now >= todayAt && schedule.last_sent < todayAt
}
