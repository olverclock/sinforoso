/*
 * Tabela e rodadas do Brasileirão (Séries A e B) pelas páginas públicas de classificação do Terra.
 * Implementação própria (substitui uma biblioteca externa). O ID do campeonato muda a cada
 * temporada: ele é lido da página oficial da tabela no Terra (cache de 6 horas), com um ID
 * conhecido como reserva. Assim o !brasileirao não fica preso numa temporada antiga.
 */
import axios from 'axios'
import { JSDOM } from 'jsdom'
import UserAgent from 'user-agents'

export interface TeamRow {
    nome: string, escudo: string, posicao: string, pontos: string, jogos: string, vitorias: string, empates: string,
    derrotas: string, gols_pro: string, gols_contra: string, saldo_gols: string, aproveitamento: string
}
export interface Match {
    partida: string, data: string, local: string, time_casa: string, time_fora: string,
    gols_casa: string, gols_fora: string, resultado_texto: string
}
export interface Round { rodada: string, inicio: string, rodada_atual: boolean, partidas: Match[] }
export interface BrasileiraoData { tabela: TeamRow[], rodadas?: Round[] }

type Serie = 'A' | 'B'

const TERRA_PAGES: Record<Serie, string> = {
    A: 'https://www.terra.com.br/esportes/futebol/brasileiro-serie-a/tabela/',
    B: 'https://www.terra.com.br/esportes/futebol/brasileiro-serie-b/tabela/',
}
/** IDs da temporada 2026, conferidos nas páginas do Terra; usados se a página não responder. */
const FALLBACK_IDS: Record<Serie, string> = { A: '1456', B: '1461' }
const API = 'https://p1.trrsf.com/api/musa-soccer'
const TIMEOUT_MS = 20_000
const ID_CACHE_MS = 6 * 60 * 60 * 1000
const idCache = new Map<Serie, { id: string, at: number }>()

async function getHtml(url: string): Promise<string> {
    const { data } = await axios.get(url, { timeout: TIMEOUT_MS, headers: { 'User-Agent': new UserAgent().toString() }, responseType: 'text' })
    return String(data)
}

/** ID do campeonato da temporada atual, lido da página oficial (com cache e reserva). */
export async function championshipId(serie: Serie, now = Date.now()): Promise<string> {
    const cached = idCache.get(serie)
    if (cached && now - cached.at < ID_CACHE_MS) return cached.id
    let id = FALLBACK_IDS[serie]
    try {
        const found = /ms-standings-light\?idChampionship=(\d+)/.exec(await getHtml(TERRA_PAGES[serie]))?.[1]
        if (found) id = found
    } catch { /* página fora do ar: usa o ID de reserva */ }
    idCache.set(serie, { id, at: now })
    return id
}

const query = (id: string) => `?idChampionship=${id}&idPhase=&language=pt-BR&country=BR&nav=N&timezone=BR`
const text = (el: Element | null | undefined) => el?.textContent?.trim() ?? ''

export function parseTable(html: string): TeamRow[] {
    const { document } = new JSDOM(html).window
    return [...document.querySelectorAll('table > tbody > tr')].map(row => {
        const cell = (title: string) => text(row.querySelector(`td[title="${title}"]`))
        return {
            nome: row.querySelector('.team-name > a')?.getAttribute('title') ?? '',
            escudo: row.querySelector('.shield > a > img')?.getAttribute('src') ?? '',
            posicao: text(row.querySelector('.position')),
            pontos: text(row.querySelector('.points')),
            jogos: cell('Jogos'), vitorias: cell('Vitórias'), empates: cell('Empates'), derrotas: cell('Derrotas'),
            gols_pro: cell('Gols Pró'), gols_contra: cell('Gols Contra'), saldo_gols: cell('Saldo de Gols'),
            aproveitamento: `${cell('Aproveitamento')}%`,
        }
    }).filter(team => team.nome)
}

export function parseRounds(html: string): Round[] {
    const { document } = new JSDOM(html).window
    return [...document.querySelectorAll('ul.rounds > li')].map(item => {
        const [date = ''] = (item.querySelector('.date-round')?.getAttribute('data-date') ?? '').split(' ')
        const [year, month, day] = date.split('-')
        const partidas = [...item.querySelectorAll('li.match')].flatMap(matchEl => {
            const teams = matchEl.querySelector('meta[itemprop="name"]')?.getAttribute('content')
            if (!teams) return []
            const [time_casa = '', time_fora = ''] = teams.split(' x ').map(t => t.trim())
            const gols_casa = text(matchEl.querySelector('.goals.home'))
            const gols_fora = text(matchEl.querySelector('.goals.away'))
            return [{
                partida: teams, data: text(matchEl.querySelector('div.details > strong.date-manager')),
                local: text(matchEl.querySelector('div.details > span.stadium')),
                time_casa, time_fora, gols_casa, gols_fora,
                resultado_texto: `${time_casa} ${gols_casa} x ${gols_fora} ${time_fora}`,
            }]
        })
        return { rodada: text(item.querySelector('h3')), inicio: day ? `${day}/${month}/${year}` : '', rodada_atual: item.getAttribute('class') === 'round', partidas }
    })
}

export async function brasileiraoData(serie: Serie): Promise<BrasileiraoData> {
    const id = await championshipId(serie)
    const tabela = parseTable(await getHtml(`${API}/ms-standings-light${query(id)}`))
    if (!tabela.length) throw new Error(`Tabela da Série ${serie} indisponível na fonte agora`)
    const rodadas = parseRounds(await getHtml(`${API}/ms-standings-games-light${query(id)}`))
    return { tabela, rodadas }
}
