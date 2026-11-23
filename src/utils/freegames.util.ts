import axios from "axios"
import { HTTP_TIMEOUT } from "./general.util.js"

/*
 * Jogos grátis para resgatar e manter, pela API pública do GamerPower
 * (https://www.gamerpower.com/api-read), sem chave. Filtro do !jogosgratis:
 * - só lojas Epic Games, Steam, GOG, Ubisoft e EA (Origin/EA app);
 * - só jogos completos (type "Game"), ativos e gratuitos;
 * - sem ofertas que avisam restrição de região (a API não tem campo de região, então o texto da
 *   oferta é analisado; ofertas restritas a EUA/Europa etc. ficam de fora).
 */

const GAMERPOWER_FILTER_URL = "https://www.gamerpower.com/api/filter?platform=epic-games-store.steam.gog.ubisoft.origin&type=game"

/** Nome da loja como aparece em `platforms` → nome exibido. */
const STORES: [RegExp, string][] = [
    [/epic games store/i, "Epic Games"],
    [/\bsteam\b/i, "Steam"],
    [/\bgog\b/i, "GOG"],
    [/ubisoft/i, "Ubisoft"],
    [/\b(origin|ea app|ea)\b/i, "EA app"],
]

/** Frases que indicam que a oferta não vale para todos os países. */
const REGION_LOCK = [
    /region[- ]?(locked|lock|restricted|specific)/i,
    /not (available|redeemable|valid) in (your|some|certain|all)/i,
    /(only|exclusively) (available |redeemable |valid )?(in|for) (the )?(us|usa|united states|uk|eu|europe|north america|na|canada|asia|selected (regions|countries))\b/i,
    /\b(us|usa|eu|uk|na)[- ]only\b/i,
    /selected (regions|countries) only/i,
]

export interface FreeGame {
    id: number
    title: string
    image: string
    url: string
    stores: string[]
    worth: string
    end_date: string
}

interface GamerPowerGiveaway {
    id: number
    title: string
    worth: string
    thumbnail: string
    image: string
    description: string
    instructions: string
    open_giveaway_url: string
    type: string
    platforms: string
    end_date: string
    status: string
}

/** Lojas permitidas presentes na oferta (vazio = nenhuma das lojas do filtro). */
export function storesOf(platforms: string): string[] {
    return STORES.filter(([pattern]) => pattern.test(platforms)).map(([, name]) => name)
}

export function hasRegionLock(text: string): boolean {
    return REGION_LOCK.some(pattern => pattern.test(text))
}

/** Remove o sufixo " (Epic Games) Giveaway" / " Key Giveaway" do título. */
export function cleanTitle(title: string): string {
    return title.replace(/\s*\((epic games|steam|gog|ubisoft|origin|ea app)\)\s*/gi, ' ').replace(/\s*(key\s+)?giveaway\s*$/i, '').replace(/\s+/g, ' ').trim()
}

export function toFreeGame(g: GamerPowerGiveaway): FreeGame | null {
    const stores = storesOf(g.platforms)
    if (g.status !== "Active" || g.type !== "Game" || !stores.length) return null
    if (hasRegionLock(`${g.title} ${g.description} ${g.instructions}`)) return null
    return {
        id: g.id,
        title: cleanTitle(g.title),
        image: g.image || g.thumbnail,
        url: g.open_giveaway_url,
        stores,
        worth: g.worth,
        end_date: g.end_date,
    }
}

// ———————————————— DISPONIBILIDADE NO PAÍS ————————————————
/*
 * O GamerPower não informa a região. Algumas ofertas da Epic abrem com "Este conteúdo está
 * indisponível no momento em sua plataforma ou região". Para não divulgar o que não dá para
 * resgatar aqui, cada oferta é conferida na própria loja, para o país configurado (FREEGAMES_COUNTRY,
 * padrão BR):
 *  - Epic: a lista oficial de jogos grátis da loja para o país (freeGamesPromotions);
 *  - Steam: a página do app na loja do país (appdetails com cc=país);
 *  - demais lojas e chaves de sites parceiros: sem como conferir ("unknown"), seguem normalmente.
 */

export type Availability = 'confirmed' | 'unavailable' | 'unknown'
export interface CheckedFreeGame extends FreeGame { availability: Availability }

export const freeGamesCountry = () => (process.env.FREEGAMES_COUNTRY?.trim().toUpperCase() || 'BR').slice(0, 2)

const EPIC_PROMOTIONS_URL = (country: string) => `https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=pt-BR&country=${country}&allowCountries=${country}`
const CHECK_CACHE_MS = 30 * 60_000
const redirectCache = new Map<string, { url: string | null, at: number }>()
const epicCache = new Map<string, { slugs: Set<string>, titles: Set<string>, at: number }>()

const normalizeTitle = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '')

/** Para os testes. */
export function clearAvailabilityCache() { redirectCache.clear(); epicCache.clear() }

/** Destino do link do GamerPower (ele redireciona para a página da loja). */
export async function resolveGiveawayUrl(url: string, now = Date.now()): Promise<string | null> {
    const cached = redirectCache.get(url)
    if (cached && now - cached.at < CHECK_CACHE_MS) return cached.url
    const response = await axios.get(url, { timeout: HTTP_TIMEOUT.api, maxRedirects: 0, validateStatus: s => s >= 200 && s < 400, headers: { 'User-Agent': 'Mozilla/5.0' } })
    const location = typeof response.headers?.location === 'string' ? response.headers.location : null
    redirectCache.set(url, { url: location, at: now })
    return location
}

interface EpicElement { title: string, productSlug?: string | null, catalogNs?: { mappings?: { pageSlug?: string }[] | null } | null, offerMappings?: { pageSlug?: string }[] | null, price?: { totalPrice?: { discountPrice?: number } }, promotions?: { promotionalOffers?: { promotionalOffers: unknown[] }[] } | null }

/** Páginas e títulos dos jogos grátis agora na Epic do país. */
export async function epicFreeInCountry(country: string, now = Date.now()): Promise<{ slugs: Set<string>, titles: Set<string> }> {
    const cached = epicCache.get(country)
    if (cached && now - cached.at < CHECK_CACHE_MS) return cached
    const { data } = await axios.get<{ data: { Catalog: { searchStore: { elements: EpicElement[] } } } }>(EPIC_PROMOTIONS_URL(country), { timeout: HTTP_TIMEOUT.api })
    const slugs = new Set<string>(), titles = new Set<string>()
    for (const e of data?.data?.Catalog?.searchStore?.elements ?? []) {
        const freeNow = (e.promotions?.promotionalOffers ?? []).some(p => p.promotionalOffers?.length) || e.price?.totalPrice?.discountPrice === 0
        if (!freeNow) continue
        titles.add(normalizeTitle(e.title))
        for (const slug of [e.productSlug, ...(e.catalogNs?.mappings ?? []).map(m => m.pageSlug), ...(e.offerMappings ?? []).map(m => m.pageSlug)]) {
            if (slug) slugs.add(slug.replace(/\/home$/, '').toLowerCase())
        }
    }
    const result = { slugs, titles, at: now }
    epicCache.set(country, result)
    return result
}

/** O app da Steam está à venda/ativo na loja do país? null = não deu para saber. */
export async function steamAvailableIn(appId: string, country: string): Promise<boolean | null> {
    const { data } = await axios.get<Record<string, { success: boolean }>>(`https://store.steampowered.com/api/appdetails?appids=${appId}&cc=${country.toLowerCase()}&filters=basic`, { timeout: HTTP_TIMEOUT.api })
    const entry = data?.[appId]
    return entry ? entry.success === true : null
}

/** Confere uma oferta. Qualquer erro de consulta vira "unknown" (a oferta não é escondida por falha de rede). */
export async function checkAvailability(game: FreeGame, country = freeGamesCountry()): Promise<Availability> {
    try {
        const target = await resolveGiveawayUrl(game.url) ?? game.url
        const epic = target.match(/store\.epicgames\.com\/(?:[a-z-]+\/)?(?:p|product)\/([^/?#]+)/i)
        if (epic) {
            const free = await epicFreeInCountry(country)
            return free.slugs.has(epic[1].toLowerCase()) || free.titles.has(normalizeTitle(game.title)) ? 'confirmed' : 'unavailable'
        }
        const steam = target.match(/store\.steampowered\.com\/app\/(\d+)/i)
        if (steam) {
            const available = await steamAvailableIn(steam[1], country)
            return available === null ? 'unknown' : available ? 'confirmed' : 'unavailable'
        }
        return 'unknown'
    } catch {
        return 'unknown'
    }
}

/** Jogos grátis já separados entre os que dá para resgatar no país e os que não dá. */
export async function fetchFreeGamesForCountry(country = freeGamesCountry()): Promise<{ available: CheckedFreeGame[], unavailable: CheckedFreeGame[] }> {
    const games = await fetchFreeGames()
    const checked: CheckedFreeGame[] = []
    for (const game of games) checked.push({ ...game, availability: await checkAvailability(game, country) })
    return { available: checked.filter(g => g.availability !== 'unavailable'), unavailable: checked.filter(g => g.availability === 'unavailable') }
}

/** Jogos grátis válidos agora, do mais novo para o mais antigo (ordem da API). */
export async function fetchFreeGames(): Promise<FreeGame[]> {
    const { data, status } = await axios.get<GamerPowerGiveaway[] | { status: number }>(GAMERPOWER_FILTER_URL, { timeout: HTTP_TIMEOUT.api, validateStatus: s => s === 200 || s === 201 })
    // A API responde 201 com um objeto quando não há ofertas no filtro
    if (status === 201 || !Array.isArray(data)) return []
    return data.map(toFreeGame).filter((g): g is FreeGame => g !== null)
}
