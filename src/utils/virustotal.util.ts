import axios, { AxiosError } from "axios"
import crypto from "node:crypto"
import { HTTP_TIMEOUT } from "./general.util.js"

/*
 * VirusTotal API v3 (https://docs.virustotal.com/reference/overview), chave grátis em
 * https://www.virustotal.com (VIRUSTOTAL_API_KEY no .env). API pública: 4 pedidos/minuto e
 * 500/dia; proibido uso comercial. Tudo o que é consultado entra na base do VirusTotal, por isso:
 * - arquivos NUNCA são enviados: só o SHA-256 é consultado (GET /files/{hash});
 * - links primeiro são consultados (GET /urls/{id}); só se forem desconhecidos são enviados para
 *   análise (POST /urls) e o resultado é aguardado (GET /analyses/{id}).
 */

const API = "https://www.virustotal.com/api/v3"
const PER_MINUTE = 4
const PER_DAY = 500
const CACHE_MS = 24 * 60 * 60 * 1000
/** Limite para baixar um documento só para calcular o hash. */
export const MAX_SCAN_FILE_BYTES = 64 * 1024 * 1024

export interface ScanStats { malicious: number, suspicious: number, harmless: number, undetected: number }
export type ScanVerdict = 'malicious' | 'suspicious' | 'clean' | 'unknown'
export interface ScanResult { verdict: ScanVerdict, stats?: ScanStats, permalink?: string }

export function apiKey(): string | undefined {
    return process.env.VIRUSTOTAL_API_KEY?.trim() || undefined
}

export class VirusTotalQuotaError extends Error {
    constructor(message = "A cota gratuita do VirusTotal acabou (500 consultas por dia). Tente amanhã.") { super(message) }
}

// ——— Limite de taxa: no máximo 4 pedidos por minuto e 500 por dia (janela deslizante) ———
const sentAt: number[] = []
let dayStart = 0, dayCount = 0
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function throttle(now: () => number = Date.now) {
    if (now() - dayStart > 24 * 60 * 60 * 1000) { dayStart = now(); dayCount = 0 }
    if (dayCount >= PER_DAY) throw new VirusTotalQuotaError()
    for (;;) {
        while (sentAt.length && now() - sentAt[0] >= 60_000) sentAt.shift()
        if (sentAt.length < PER_MINUTE) break
        await sleep(60_000 - (now() - sentAt[0]) + 50)
    }
    sentAt.push(now())
    dayCount++
}

/** Para testes. */
export function resetVirusTotalLimits() { sentAt.length = 0; dayStart = 0; dayCount = 0; cache.clear() }

async function vt<T>(method: 'get' | 'post', path: string, body?: URLSearchParams): Promise<T | null> {
    const key = apiKey()
    if (!key) throw new Error("A verificação de links precisa de uma chave GRÁTIS do VirusTotal (VIRUSTOTAL_API_KEY no .env).")
    await throttle()
    try {
        const { data } = await axios.request<T>({ method, url: `${API}${path}`, data: body, headers: { 'x-apikey': key, Accept: 'application/json' }, timeout: HTTP_TIMEOUT.api })
        return data
    } catch (err) {
        const status = (err as AxiosError).response?.status
        if (status === 404) return null
        if (status === 429) throw new VirusTotalQuotaError()
        throw err
    }
}

/** Identificador de URL do VirusTotal: base64url sem "=" (RFC 4648 §3.2). */
export function urlId(url: string): string {
    return Buffer.from(url).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Link sem protocolo (ex.: "site.com/x") recebe https://. */
export function withScheme(link: string): string {
    return /^https?:\/\//i.test(link) ? link : `https://${link}`
}

/**
 * Critério do alerta automático (evita falso positivo de um único antivírus):
 * 2+ maliciosos, ou maliciosos + suspeitos somando 3+.
 */
export function isDangerous(stats: ScanStats | undefined): boolean {
    if (!stats) return false
    return stats.malicious >= 2 || stats.malicious + stats.suspicious >= 3
}

/** Apaga a mensagem automaticamente só com 3+ antivírus apontando malicioso. */
export function shouldDelete(stats: ScanStats | undefined): boolean {
    return Boolean(stats && stats.malicious >= 3)
}

export function verdictOf(stats: ScanStats | undefined): ScanVerdict {
    if (!stats) return 'unknown'
    if (stats.malicious > 0) return 'malicious'
    if (stats.suspicious > 0) return 'suspicious'
    if (stats.harmless + stats.undetected > 0) return 'clean'
    return 'unknown'
}

const cache = new Map<string, { at: number, result: ScanResult }>()
function cached(key: string): ScanResult | undefined {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.result
    cache.delete(key)
    return undefined
}
function remember(key: string, result: ScanResult) {
    if (cache.size > 2000) cache.delete(cache.keys().next().value as string)
    cache.set(key, { at: Date.now(), result })
    return result
}

type ObjectReport = { data: { attributes: { last_analysis_stats?: ScanStats } } }
type AnalysisReport = { data: { attributes: { status: string, stats?: ScanStats } } }

/** Verifica um link: usa o relatório existente; se não houver, envia para análise e aguarda (até ~2 min). */
export async function scanUrl(url: string, opts: { pollIntervalMs?: number, maxPolls?: number } = {}): Promise<ScanResult> {
    const id = urlId(url)
    const hit = cached(`url:${id}`)
    if (hit) return hit
    const permalink = `https://www.virustotal.com/gui/url/${id}`

    const report = await vt<ObjectReport>('get', `/urls/${id}`)
    const known = report?.data.attributes.last_analysis_stats
    if (known && verdictOf(known) !== 'unknown') return remember(`url:${id}`, { verdict: verdictOf(known), stats: known, permalink })

    const submitted = await vt<{ data: { id: string } }>('post', '/urls', new URLSearchParams({ url }))
    const analysisId = submitted?.data.id
    if (!analysisId) return { verdict: 'unknown', permalink }
    for (let i = 0; i < (opts.maxPolls ?? 6); i++) {
        await sleep(opts.pollIntervalMs ?? 20_000)
        const analysis = await vt<AnalysisReport>('get', `/analyses/${analysisId}`)
        if (analysis?.data.attributes.status === 'completed') {
            const stats = analysis.data.attributes.stats
            return remember(`url:${id}`, { verdict: verdictOf(stats), stats, permalink })
        }
    }
    return { verdict: 'unknown', permalink }
}

export function sha256(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex')
}

/** Verifica um arquivo SÓ pelo hash (o arquivo não sai do servidor). 'unknown' = o VirusTotal nunca viu. */
export async function scanFileHash(hash: string): Promise<ScanResult> {
    const hit = cached(`file:${hash}`)
    if (hit) return hit
    const report = await vt<ObjectReport>('get', `/files/${hash}`)
    const stats = report?.data.attributes.last_analysis_stats
    const result: ScanResult = { verdict: verdictOf(stats), stats, permalink: `https://www.virustotal.com/gui/file/${hash}` }
    return remember(`file:${hash}`, result)
}
