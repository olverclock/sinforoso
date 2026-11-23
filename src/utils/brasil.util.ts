import axios from "axios"
import moment from "moment-timezone"
import { HTTP_TIMEOUT } from "./general.util.js"
import { normalizeWord, TZ } from "./reminder.util.js"

/*
 * Consultas brasileiras gratuitas e sem cadastro:
 *  - CEP: ViaCEP (base dos Correios) com BrasilAPI como reserva.
 *  - CEP pelo endereço: busca do ViaCEP por UF/cidade/logradouro, com escolha da faixa de numeração.
 *  - CNPJ: BrasilAPI (dados abertos da Receita Federal) com minhareceita.org como reserva.
 *  - Feriados nacionais: BrasilAPI.
 *  - Loterias: API pública do portal de loterias da Caixa.
 *  - Rastreio: validação do código (padrão UPU S10, com dígito verificador) e link oficial dos
 *    Correios. A consulta automática não é possível: a página oficial usa captcha e a API oficial
 *    só atende contratos empresariais.
 */

const HTTP_OPTIONS = { timeout: HTTP_TIMEOUT.api, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SinforosoBot)' } }
const http = { get: <T>(url: string) => axios.get<T>(url, HTTP_OPTIONS) }

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

// ———————————————— CEP ————————————————
export interface CepInfo {
    cep: string, street: string, complement: string, district: string, city: string, uf: string,
    ddd?: string, ibge?: string, source: string
}

export const onlyDigits = (s: string) => s.replace(/\D/g, '')
export const formatCep = (cep: string) => `${cep.slice(0, 5)}-${cep.slice(5)}`

interface ViaCepItem { cep: string, logradouro: string, complemento: string, bairro: string, localidade: string, uf: string, ddd?: string, ibge?: string, erro?: boolean | string }

const fromViaCep = (d: ViaCepItem): CepInfo => ({
    cep: onlyDigits(d.cep), street: d.logradouro ?? '', complement: d.complemento ?? '', district: d.bairro ?? '',
    city: d.localidade ?? '', uf: d.uf ?? '', ddd: d.ddd || undefined, ibge: d.ibge || undefined, source: 'ViaCEP',
})

/** Endereço de um CEP. null = CEP inexistente. Erro = serviços fora do ar. */
export async function lookupCep(input: string): Promise<CepInfo | null> {
    const cep = onlyDigits(input)
    if (cep.length !== 8) throw new Error("CEP inválido: precisa ter 8 números (ex.: 64200-000).")
    let viaCepFailed = false
    try {
        const { data } = await http.get<ViaCepItem>(`https://viacep.com.br/ws/${cep}/json/`)
        if (!data.erro) return fromViaCep(data)
    } catch {
        viaCepFailed = true
    }
    try {
        const { data } = await http.get<{ cep: string, state: string, city: string, neighborhood: string, street: string }>(`https://brasilapi.com.br/api/cep/v2/${cep}`)
        return { cep: onlyDigits(data.cep), street: data.street ?? '', complement: '', district: data.neighborhood ?? '', city: data.city ?? '', uf: data.state ?? '', source: 'BrasilAPI' }
    } catch (err) {
        const status = axios.isAxiosError(err) ? err.response?.status : undefined
        if (status === 404 || !viaCepFailed) return null
        throw new Error("Os serviços de CEP não responderam. Tente de novo em instantes.")
    }
}

// ———————————————— CEP pelo endereço ————————————————
export interface AddressQuery { street: string, number?: number, district?: string, city: string, uf: string }

const STREET_TYPES: Record<string, string> = {
    r: 'rua', rua: 'rua', av: 'avenida', avenida: 'avenida', tv: 'travessa', trav: 'travessa', travessa: 'travessa',
    al: 'alameda', alameda: 'alameda', pc: 'praca', pca: 'praca', praca: 'praca', est: 'estrada', estrada: 'estrada',
    rod: 'rodovia', rodovia: 'rodovia', vl: 'vila', vila: 'vila', lgo: 'largo', largo: 'largo', bc: 'beco', beco: 'beco',
    qd: 'quadra', quadra: 'quadra',
}

/** Separa "Av. São Sebastião" em tipo ("avenida") e nome ("São Sebastião"). */
export function splitStreetType(street: string): { type?: string, name: string } {
    const m = street.trim().match(/^([\p{L}]+)\.?\s+(.+)$/u)
    const type = m ? STREET_TYPES[normalizeWord(m[1])] : undefined
    return type && m ? { type, name: m[2].trim() } : { name: street.trim() }
}

/**
 * Lê "Rua X, 123, Bairro, Cidade, UF", "Rua X 123 - Bairro - Cidade/UF" e variações.
 * Cidade e UF são obrigatórias; número e bairro ajudam a achar o CEP exato.
 */
export function parseAddress(input: string): AddressQuery {
    let text = input.replace(/\s+/g, ' ').trim().replace(/\s*\/\s*([A-Za-z]{2})\s*$/, ', $1')
    text = text.replace(/\b\d{5}-?\d{3}\b/g, '').trim()
    const parts = text.split(/\s*[,;]\s*|\s+-\s+/).map(p => p.trim()).filter(Boolean)
    // "Parnaíba PI" no fim, sem vírgula antes da UF
    const tail = parts[parts.length - 1]?.match(/^(.{3,}?)\s+([A-Za-z]{2})$/)
    if (parts.length >= 2 && tail && UFS.includes(tail[2].toUpperCase())) parts.splice(parts.length - 1, 1, tail[1], tail[2])
    const ufIndex = parts.findIndex((p, i) => i > 0 && UFS.includes(p.toUpperCase()))
    if (ufIndex < 2) {
        throw new Error("Endereço incompleto. Use: Rua, número, bairro, cidade, UF\nEx.: Av. São Sebastião, 2840, Parnaíba, PI")
    }
    const uf = parts[ufIndex].toUpperCase()
    const city = parts[ufIndex - 1]
    let [street, ...middle] = parts.slice(0, ufIndex - 1)
    if (!street) throw new Error("Informe a rua. Ex.: Rua das Flores, 100, Centro, Teresina, PI")
    let number: number | undefined
    const numberInStreet = street.match(/^(.*?)(?:\s+n[º°o.]?\s*|\s+)(\d{1,6})$/i)
    if (numberInStreet) { street = numberInStreet[1].trim(); number = Number(numberInStreet[2]) }
    const rest: string[] = []
    for (const part of middle) {
        const n = part.match(/^(?:n[º°o.]?\s*)?(\d{1,6})\s*[a-z]?$/i)
        if (n && number === undefined) number = Number(n[1])
        else if (!/^(?:s\/?n|sem n[uú]mero)$/i.test(part)) rest.push(part)
    }
    if (splitStreetType(street).name.length < 3) throw new Error("O nome da rua precisa ter pelo menos 3 letras.")
    if (city.length < 3) throw new Error("O nome da cidade precisa ter pelo menos 3 letras.")
    return { street, number, district: rest.join(' ') || undefined, city, uf }
}

export interface NumberRange { from: number, to: number, parity?: 'par' | 'impar' }

/** Faixa de numeração do campo "complemento" do ViaCEP: "até 999/1000", "de 2838 ao fim - lado par"... */
export function parseRange(complement: string): NumberRange | null {
    const c = normalizeWord(complement)
    if (!c) return null
    const parity = /\b(?:lado )?par\b|\(l par\)/.test(c) ? 'par' : /\b(?:lado )?impar\b|\(l impar\)/.test(c) ? 'impar' : undefined
    let m: RegExpMatchArray | null
    if ((m = c.match(/de (\d+)(?:\/\d+)? a (\d+)(?:\/(\d+))?/))) return { from: Number(m[1]), to: Number(m[3] ?? m[2]), parity }
    if ((m = c.match(/de (\d+)(?:\/\d+)? ao fim/))) return { from: Number(m[1]), to: Infinity, parity }
    if ((m = c.match(/ate (\d+)(?:\/(\d+))?/))) return { from: 0, to: Number(m[2] ?? m[1]), parity }
    if (parity) return { from: 0, to: Infinity, parity }
    return null
}

export function numberInRange(n: number, range: NumberRange): boolean {
    if (n < range.from || n > range.to) return false
    if (range.parity === 'par') return n % 2 === 0
    if (range.parity === 'impar') return n % 2 === 1
    return true
}

export interface AddressMatch { info: CepInfo, score: number, exactNumber: boolean }

/** Ordena os resultados: bairro igual, número dentro da faixa e mesmo tipo de logradouro sobem. */
export function rankAddresses(items: CepInfo[], query: AddressQuery): AddressMatch[] {
    const wantedType = splitStreetType(query.street).type
    const district = query.district ? normalizeWord(query.district) : ''
    return items.map(info => {
        let score = 0
        const range = parseRange(info.complement)
        // "(L Par)" sem números só diz o lado da rua: vale pouco, não é a faixa exata
        const parityOnly = range !== null && range.from === 0 && range.to === Infinity
        const fits = query.number !== undefined && range !== null && numberInRange(query.number, range)
        const exactNumber = fits && !parityOnly
        if (exactNumber) score += 5
        else if (fits) score += 1
        else if (query.number !== undefined && range !== null) score -= 3
        if (district && normalizeWord(info.district).includes(district)) score += 4
        else if (district && district.includes(normalizeWord(info.district)) && info.district) score += 2
        if (wantedType && normalizeWord(info.street).startsWith(wantedType)) score += 1
        return { info, score, exactNumber }
    }).sort((a, b) => b.score - a.score)
}

/** Busca o CEP pelo endereço (até 50 resultados do ViaCEP), já ordenado pelo mais provável. */
export async function searchCepByAddress(query: AddressQuery): Promise<AddressMatch[]> {
    const { name } = splitStreetType(query.street)
    const url = `https://viacep.com.br/ws/${query.uf}/${encodeURIComponent(query.city)}/${encodeURIComponent(name)}/json/`
    let data: ViaCepItem[]
    try {
        data = (await http.get<ViaCepItem[]>(url)).data
    } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 400) throw new Error("Endereço inválido para a busca. Confira a cidade e a UF.")
        throw new Error("O serviço de CEP (ViaCEP) não respondeu. Tente de novo em instantes.")
    }
    if (!Array.isArray(data)) return []
    return rankAddresses(data.map(fromViaCep), query)
}

// ———————————————— CNPJ ————————————————
/** Confere os dois dígitos verificadores do CNPJ (só números). */
export function isValidCnpj(input: string): boolean {
    const cnpj = onlyDigits(input)
    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false
    const digit = (base: string) => {
        const weights = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        const sum = weights.reduce((acc, w, i) => acc + Number(base[i]) * w, 0)
        const r = sum % 11
        return r < 2 ? 0 : 11 - r
    }
    const d1 = digit(cnpj.slice(0, 12))
    const d2 = digit(cnpj.slice(0, 12) + d1)
    return cnpj.endsWith(`${d1}${d2}`)
}

export const formatCnpj = (c: string) => `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`

export interface CnpjInfo {
    cnpj: string, razao_social: string, nome_fantasia?: string, descricao_situacao_cadastral?: string,
    data_inicio_atividade?: string, cnae_fiscal_descricao?: string, natureza_juridica?: string, porte?: string,
    capital_social?: number, logradouro?: string, numero?: string, complemento?: string, bairro?: string,
    municipio?: string, uf?: string, cep?: string, ddd_telefone_1?: string, email?: string | null,
    opcao_pelo_simples?: boolean | null, opcao_pelo_mei?: boolean | null, descricao_identificador_matriz_filial?: string,
    qsa?: { nome_socio: string, qualificacao_socio: string }[]
}

export async function lookupCnpj(input: string): Promise<CnpjInfo | null> {
    const cnpj = onlyDigits(input)
    if (!isValidCnpj(cnpj)) throw new Error("CNPJ inválido: confira os 14 números (os dígitos verificadores não batem).")
    const sources = [`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, `https://minhareceita.org/${cnpj}`]
    let notFound = 0
    for (const url of sources) {
        try {
            return (await http.get<CnpjInfo>(url)).data
        } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 404) notFound++
        }
    }
    if (notFound) return null
    throw new Error("Os serviços de CNPJ não responderam. Tente de novo em instantes.")
}

// ———————————————— FERIADOS ————————————————
export interface Holiday { date: string, name: string, type: string }

const holidayCache = new Map<number, Holiday[]>()

export async function fetchHolidays(year: number): Promise<Holiday[]> {
    if (year < 1900 || year > 2199) throw new Error("Ano fora do intervalo aceito (1900 a 2199).")
    const cached = holidayCache.get(year)
    if (cached) return cached
    let data: Holiday[]
    try {
        data = (await http.get<Holiday[]>(`https://brasilapi.com.br/api/feriados/v1/${year}`)).data
    } catch {
        throw new Error("O serviço de feriados (BrasilAPI) não respondeu. Tente de novo em instantes.")
    }
    holidayCache.set(year, data)
    return data
}

/** Próximos feriados a partir de hoje (inclui hoje), juntando o ano seguinte quando necessário. */
export async function upcomingHolidays(count: number, nowMs = Date.now()): Promise<Holiday[]> {
    const today = moment.tz(nowMs, TZ).format('YYYY-MM-DD')
    const year = moment.tz(nowMs, TZ).year()
    let list = (await fetchHolidays(year)).filter(h => h.date >= today)
    if (list.length < count) list = list.concat(await fetchHolidays(year + 1))
    return list.slice(0, count)
}

// ———————————————— LOTERIAS ————————————————
export const LOTTERIES: Record<string, { api: string, name: string }> = {
    megasena: { api: 'megasena', name: 'Mega-Sena' },
    lotofacil: { api: 'lotofacil', name: 'Lotofácil' },
    quina: { api: 'quina', name: 'Quina' },
    lotomania: { api: 'lotomania', name: 'Lotomania' },
    timemania: { api: 'timemania', name: 'Timemania' },
    duplasena: { api: 'duplasena', name: 'Dupla Sena' },
    diadesorte: { api: 'diadesorte', name: 'Dia de Sorte' },
    supersete: { api: 'supersete', name: 'Super Sete' },
    maismilionaria: { api: 'maismilionaria', name: '+Milionária' },
}

const LOTTERY_ALIASES: Record<string, string> = {
    mega: 'megasena', megasena: 'megasena', 'mega-sena': 'megasena', 'mega sena': 'megasena',
    lotofacil: 'lotofacil', facil: 'lotofacil', quina: 'quina', lotomania: 'lotomania', mania: 'lotomania',
    timemania: 'timemania', time: 'timemania', dupla: 'duplasena', duplasena: 'duplasena', 'dupla sena': 'duplasena',
    diadesorte: 'diadesorte', 'dia de sorte': 'diadesorte', dia: 'diadesorte', supersete: 'supersete', 'super sete': 'supersete',
    super7: 'supersete', 'super 7': 'supersete', maismilionaria: 'maismilionaria', milionaria: 'maismilionaria',
    '+milionaria': 'maismilionaria', 'mais milionaria': 'maismilionaria',
}

/** "mega 2800" → { game: 'megasena', contest: 2800 }. Sem jogo = Mega-Sena. */
export function parseLotteryArgs(args: string[]): { game: string, contest?: number } {
    const last = args[args.length - 1]
    const contest = last && /^\d{1,5}$/.test(last) ? Number(last) : undefined
    const nameWords = contest !== undefined ? args.slice(0, -1) : args
    const name = normalizeWord(nameWords.join(' ')).trim()
    if (!name) return { game: 'megasena', contest }
    const game = LOTTERY_ALIASES[name] ?? LOTTERY_ALIASES[name.replace(/[\s-]/g, '')]
    if (!game) throw new Error(`Jogo não reconhecido. Opções: ${Object.values(LOTTERIES).map(l => l.name).join(', ')}.`)
    return { game, contest }
}

export interface LotteryResult {
    numero: number, dataApuracao: string, listaDezenas: string[], listaDezenasSegundoSorteio?: string[] | null,
    trevosSorteados?: string[] | null, nomeTimeCoracaoMesSorte?: string | null, acumulado: boolean,
    dataProximoConcurso?: string, valorEstimadoProximoConcurso?: number, localSorteio?: string, nomeMunicipioUFSorteio?: string,
    listaRateioPremio: { descricaoFaixa: string, numeroDeGanhadores: number, valorPremio: number }[]
}

export async function fetchLottery(game: string, contest?: number): Promise<LotteryResult> {
    const info = LOTTERIES[game]
    if (!info) throw new Error("Jogo não reconhecido.")
    try {
        const { data } = await http.get<LotteryResult>(`https://servicebus2.caixa.gov.br/portaldeloterias/api/${info.api}${contest ? `/${contest}` : ''}`)
        if (!data?.numero) throw new Error("vazio")
        return data
    } catch (err) {
        if (contest && axios.isAxiosError(err) && [404, 500].includes(err.response?.status ?? 0)) throw new Error(`Concurso ${contest} da ${info.name} não encontrado.`)
        throw new Error("O site de loterias da Caixa não respondeu. Tente de novo em instantes.")
    }
}

export const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ———————————————— RASTREIO ————————————————
const COUNTRIES: Record<string, string> = {
    BR: 'Brasil', CN: 'China', HK: 'Hong Kong', SG: 'Singapura', US: 'Estados Unidos', GB: 'Reino Unido', DE: 'Alemanha',
    FR: 'França', ES: 'Espanha', PT: 'Portugal', IT: 'Itália', NL: 'Holanda', BE: 'Bélgica', CH: 'Suíça', SE: 'Suécia',
    JP: 'Japão', KR: 'Coreia do Sul', TW: 'Taiwan', MY: 'Malásia', TH: 'Tailândia', AR: 'Argentina', CL: 'Chile',
    CA: 'Canadá', MX: 'México', AU: 'Austrália', IL: 'Israel', IN: 'Índia', LT: 'Lituânia', LV: 'Letônia', PL: 'Polônia',
}

/** Tipo pelo primeiro caractere (padrão internacional UPU S10, usado em envios internacionais). */
const S10_SERVICES: Record<string, string> = {
    E: 'EMS (expresso)', C: 'Encomenda (pacote)', R: 'Carta registrada', L: 'Pequeno pacote/carta com rastreio', V: 'Carta com valor declarado',
}

export interface TrackingCode { code: string, valid: boolean, country?: string, service?: string }

/**
 * Valida o código de rastreio (2 letras, 8 números, 1 dígito verificador, 2 letras do país).
 * Dígito verificador: pesos 8,6,4,2,3,5,9,7; resto de 11 (10 → 0, 11 → 5).
 */
export function parseTrackingCode(input: string): TrackingCode {
    const code = input.replace(/[\s.-]/g, '').toUpperCase()
    const m = code.match(/^([A-Z]{2})(\d{8})(\d)([A-Z]{2})$/)
    if (!m) return { code, valid: false }
    const weights = [8, 6, 4, 2, 3, 5, 9, 7]
    const sum = [...m[2]].reduce((acc, d, i) => acc + Number(d) * weights[i], 0)
    let check = 11 - (sum % 11)
    if (check === 10) check = 0
    if (check === 11) check = 5
    const country = COUNTRIES[m[4]] ?? m[4]
    const service = m[4] !== 'BR' ? S10_SERVICES[m[1][0]] : undefined
    return { code, valid: check === Number(m[3]), country, service }
}

export const CORREIOS_TRACKING_URL = 'https://rastreamento.correios.com.br/app/index.php'
