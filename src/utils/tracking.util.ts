import axios from "axios"
import { HTTP_TIMEOUT } from "./general.util.js"

/*
 * Rastreio de encomendas pela API do Site Rastreio / Wonca Labs (https://www.siterastreio.com.br/api-correios),
 * contratada pelo dono do bot com a própria chave (RASTREIO_API_KEY). Grátis até 1.000 consultas/mês.
 *   POST https://api.wonca.com.br/wonca.labs.v1.LabsService/Track
 *   Authorization: Apikey <chave>      body: { "code": "...", "carrier": "CARRIER_CORREIOS" }
 * A resposta traz "carrier" e os dados da transportadora em "payload" (os mesmos que os Correios
 * mostram no rastreio público). A leitura abaixo aceita o formato dos Correios (objetos → eventos) e,
 * se o formato mudar, procura a lista de eventos de forma genérica.
 */

export const TRACK_URL = 'https://api.wonca.com.br/wonca.labs.v1.LabsService/Track'
export const trackingApiKey = () => process.env.RASTREIO_API_KEY?.trim() ?? ''

export interface TrackEvent { date?: string, description: string, detail?: string, location?: string, destination?: string }
export interface TrackResult { code: string, events: TrackEvent[], category?: string, expected?: string, message?: string }

export class TrackingError extends Error {}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | undefined => typeof v === 'string' && v.trim() ? v.trim() : (typeof v === 'number' ? String(v) : undefined)

/** "unidade": { endereco: { cidade, uf }, nome, tipo } → "Agência dos Correios - São Paulo/SP" */
function placeOf(unit: unknown): string | undefined {
    if (!isObj(unit)) return str(unit)
    const address = isObj(unit.endereco) ? unit.endereco : unit
    const city = str(address.cidade) ?? str(address.city)
    const uf = str(address.uf) ?? str(address.state)
    const name = str(unit.nome) ?? str(unit.tipo) ?? str(unit.name)
    const where = city ? `${city}${uf ? `/${uf}` : ''}` : uf
    return [name, where].filter(Boolean).join(' - ') || undefined
}

function dateOf(e: Obj): string | undefined {
    const raw = e.dtHrCriado ?? e.dataHora ?? e.date ?? e.datetime ?? e.data
    if (isObj(raw)) return str(raw.date) ?? str(raw.value)
    return str(raw)
}

function eventOf(e: Obj): TrackEvent | null {
    const description = str(e.descricao) ?? str(e.description) ?? str(e.status) ?? str(e.titulo)
    if (!description) return null
    return {
        date: dateOf(e),
        description,
        detail: str(e.detalhe) ?? str(e.detail),
        location: placeOf(e.unidade ?? e.local ?? e.location),
        destination: placeOf(e.unidadeDestino ?? e.destino ?? e.destination),
    }
}

/** Primeira lista de objetos com cara de evento (tem descrição/status), em qualquer nível. */
function findEvents(node: unknown, depth = 0): Obj[] | null {
    if (depth > 6) return null
    if (Array.isArray(node)) {
        const objs = node.filter(isObj)
        if (objs.length && objs.some(o => str(o.descricao) ?? str(o.description) ?? str(o.status))) return objs
        for (const item of node) { const found = findEvents(item, depth + 1); if (found) return found }
        return null
    }
    if (!isObj(node)) return null
    for (const key of ['eventos', 'events', 'historico', 'history']) {
        if (Array.isArray(node[key])) { const found = findEvents(node[key], depth + 1); if (found) return found }
    }
    for (const value of Object.values(node)) { const found = findEvents(value, depth + 1); if (found) return found }
    return null
}

/** Lê o "payload" (objeto ou texto JSON) no formato dos Correios ou genérico. */
export function parseTrackingPayload(payload: unknown, code: string): TrackResult {
    let data: unknown = payload
    if (typeof data === 'string') { try { data = JSON.parse(data) } catch { data = {} } }
    const root = isObj(data) ? data : {}
    const object = Array.isArray(root.objetos) && isObj(root.objetos[0]) ? root.objetos[0] : root
    const events = (findEvents(object) ?? []).map(eventOf).filter((e): e is TrackEvent => e !== null)
    const category = isObj(object.tipoPostal) ? (str(object.tipoPostal.descricao) ?? str(object.tipoPostal.categoria)) : str(object.servico)
    return {
        code: str(object.codObjeto) ?? code,
        events,
        category,
        expected: str(object.dtPrevista) ?? str(object.dataPrevista),
        message: str(object.mensagem) ?? str(object.message),
    }
}

function apiError(err: unknown): TrackingError {
    if (!axios.isAxiosError(err)) return new TrackingError("Não foi possível consultar o rastreio agora.")
    const status = err.response?.status ?? 0
    const body = err.response?.data as { code?: string, message?: string } | undefined
    const code = body?.code ?? ''
    if (status === 401 || status === 403 || code === 'unauthenticated' || code === 'permission_denied') {
        return new TrackingError("A chave da API de rastreio é inválida ou foi desativada (RASTREIO_API_KEY).")
    }
    if (status === 402 || status === 429 || code === 'resource_exhausted') {
        return new TrackingError("Acabaram as consultas de rastreio deste mês. Tente de novo no mês que vem.")
    }
    if (status === 404 || code === 'not_found') return new TrackingError("Objeto não encontrado nos Correios (pode levar até 24 h para aparecer depois da postagem).")
    if (code === 'invalid_argument') return new TrackingError(body?.message ? `Código recusado pela API: ${body.message}` : "Código recusado pela API.")
    return new TrackingError("O serviço de rastreio não respondeu. Tente de novo em instantes.")
}

export async function fetchTracking(code: string, carrier = 'CARRIER_CORREIOS', key = trackingApiKey()): Promise<TrackResult> {
    if (!key) throw new TrackingError("API de rastreio não configurada.")
    let data: { carrier?: string, payload?: unknown }
    try {
        data = (await axios.post(TRACK_URL, { code, carrier }, {
            headers: { 'Content-Type': 'application/json', Authorization: `Apikey ${key}` },
            timeout: HTTP_TIMEOUT.api,
        })).data
    } catch (err) {
        throw apiError(err)
    }
    if (process.env.DEBUG_RASTREIO === '1') console.log('[RASTREIO] resposta da API:', JSON.stringify(data).slice(0, 4000))
    return parseTrackingPayload(data?.payload ?? data, code)
}

// ———————————————— Cache e limite (economiza a cota mensal) ————————————————
export const TRACK_CACHE_MS = 30 * 60_000
const cache = new Map<string, { result: TrackResult, at: number }>()
const usage = new Map<string, { day: string, count: number }>()

export const dailyLimit = () => {
    const n = Number(process.env.RASTREIO_LIMITE_DIA ?? 10)
    return Number.isInteger(n) && n >= 0 ? n : 10
}

export function clearTrackingState() { cache.clear(); usage.clear() }

export function cachedTracking(code: string, now = Date.now()): TrackResult | null {
    const hit = cache.get(code)
    return hit && now - hit.at < TRACK_CACHE_MS ? hit.result : null
}

export function storeTracking(result: TrackResult, now = Date.now()) {
    cache.set(result.code, { result, at: now })
    if (cache.size > 500) cache.delete(cache.keys().next().value as string)
}

/** Conta uma consulta à API para a pessoa; false quando ela já passou do limite do dia. */
export function takeQuota(userId: string, now = Date.now()): boolean {
    const limit = dailyLimit()
    if (limit === 0) return true // 0 = sem limite
    const day = new Date(now).toISOString().slice(0, 10)
    const entry = usage.get(userId)
    const count = entry?.day === day ? entry.count : 0
    if (count >= limit) return false
    usage.set(userId, { day, count: count + 1 })
    return true
}
