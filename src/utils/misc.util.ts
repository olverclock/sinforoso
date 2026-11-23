import axios from 'axios'
import { exec } from 'child_process'
import { promisify } from 'util'
const execPromise = promisify(exec)
import { prettyNum } from 'pretty-num'
import qs from 'querystring'
import { showConsoleLibraryError, timestampToDate, HTTP_TIMEOUT } from './general.util.js'
import { brasileiraoData } from './brasileirao.util.js'
import { DDD_STATES } from '../data/ddd.data.js'
import { SYMBOLS_TABLE } from '../data/symbols.data.js'
import { FUNNY_COMPLEMENTS, FUNNY_TEMPLATES } from '../data/funny-phrases.data.js'
import { JSDOM, VirtualConsole } from 'jsdom'
import UserAgent from 'user-agents'
import { AnimeRelease, CurrencyConvert, MangaRelease, MusicLyrics, News, WebSearch, Wheather } from '../interfaces/library.interface.js'
import moment from 'moment-timezone'
import botTexts from '../helpers/bot.texts.helper.js'


const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'

export async function animeReleases() {
    try {
        const URL_BASE = 'https://animesonlinecc.to/'

        // Robust fetching using CURL to bypass TLS fingerprinting/Cloudflare
        const curlCommand = `curl -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "${URL_BASE}"`

        let htmlContent = ''
        try {
            const { stdout } = await execPromise(curlCommand)
            htmlContent = stdout
        } catch (curlErr) {
            // Fallback to axios if curl fails (though unlikely in this context)
            const { data } = await axios.get(URL_BASE, { timeout: HTTP_TIMEOUT.scraping, headers: { "User-Agent": new UserAgent().toString() } })
            htmlContent = data
        }

        const { window: { document } } = new JSDOM(htmlContent)

        // Seletor para "Últimos Episódios" no animesonlinecc.to
        let $episodes = document.querySelectorAll('article.item.se.episodes')
        let animes: AnimeRelease[] = []

        for (let $episode of $episodes) {
            const titleEl = $episode.querySelector('.eptitle h3 a')
            const linkEl = $episode.querySelector('.poster a')

            let name = titleEl?.textContent?.trim()
            let url = linkEl?.getAttribute('href')

            // Fix relative URLs
            if (url && !url.startsWith('http')) {
                url = URL_BASE + (url.startsWith('/') ? url.slice(1) : url)
            }

            // Extract episode from title (ex: "One Piece Episodio 1155")
            // A regex tenta capturar o que vem depois de "Episodio" ou o final da string
            let episode = 'Novo'
            const epMatch = name?.match(/Episodio\s+(\d+)/i)
            if (epMatch) {
                episode = `Ep. ${epMatch[1]}`
                // Limpa o nome para ficar só o título do anime
                name = name?.replace(/Episodio\s+\d+.*/i, '').trim()
            }

            if (!name || !url) {
                continue
            }

            animes.push({
                name,
                episode,
                url
            })
        }

        return animes
    } catch (err) {
        showConsoleLibraryError(err, 'animeReleases')
        throw new Error(botTexts.library_error)
    }
}

/** Campos lidos da resposta da API do MangaDex (/chapter com includes[]=manga). */
type MangaDexChapter = {
    id: string,
    attributes: { chapter?: string | null, title?: string | null },
    relationships: { type: string, attributes?: { title?: Record<string, string> } }[]
}

/** Campos lidos de cada dia da previsão da WeatherAPI (forecast.forecastday[]). */
type WeatherForecastDay = {
    date: string,
    day: {
        condition: { code: number }, maxtemp_c: number, mintemp_c: number, avgtemp_c: number, maxwind_kph: number,
        daily_will_it_rain: number, daily_chance_of_rain: number, daily_will_it_snow: number, daily_chance_of_snow: number, uv: number
    }
}

export async function mangaReleases() {
    try {
        // MangaDex API: Clean, Ad-free and supports PT-BR officially
        const URL_BASE = 'https://api.mangadex.org/chapter?limit=10&translatedLanguage[]=pt-br&order[readableAt]=desc&includes[]=manga'
        const { data: response } = await axios.get(URL_BASE, { timeout: HTTP_TIMEOUT.api,
            headers: { "User-Agent": "SinforosoBot/3.0 (+https://github.com/olverclock/sinforoso)" }
        })

        if (!response || response.result !== 'ok') {
            throw new Error("MangaDex API returned an invalid response.")
        }

        const mangas: MangaRelease[] = response.data.map((chapter: MangaDexChapter) => {
            const mangaRelationship = chapter.relationships.find((rel) => rel.type === 'manga')
            const mangaAttributes = mangaRelationship?.attributes

            // Tenta obter o título em inglês, português ou o primeiro disponível
            const title = mangaAttributes?.title?.en ||
                mangaAttributes?.title?.['pt-br'] ||
                Object.values(mangaAttributes?.title || {})[0] ||
                "Título Desconhecido"

            const chapterNum = chapter.attributes.chapter || '0'
            const chapterTitle = chapter.attributes.title ? ` - ${chapter.attributes.title}` : ''

            return {
                name: title,
                chapter: `${chapterNum}${chapterTitle}`,
                url: `https://mangadex.org/chapter/${chapter.id}`
            }
        })

        return mangas
    } catch (err) {
        showConsoleLibraryError(err, 'mangaReleases')
        throw new Error(botTexts.library_error)
    }
}

export async function brasileiraoTable(serie: "A" | "B") {
    try {
        if (serie !== "A" && serie !== "B") throw new Error("Unsupported league")
        return await brasileiraoData(serie)
    } catch (err) {
        showConsoleLibraryError(err, 'brasileiraoTable')
        throw new Error(botTexts.library_error)
    }
}

export async function moviedbTrendings(type: 'movie' | 'tv' = "movie") {
    try {
        let num = 0
        const BASE_URL = `https://api.themoviedb.org/3/trending/${type}/day?api_key=6618ac868ff51ffa77d586ee89223f49&language=pt-BR`
        const { data: movieDbResponse } = await axios.get(BASE_URL, { timeout: HTTP_TIMEOUT.api })
        const trendings: string = movieDbResponse.results.map((item: { title: string; name: string; overview: string }) => {
            num++
            return `${num}°: *${item.title || item.name}.*\n\`Sinopse:\` ${item.overview} \n`
        }).join('\n')

        return trendings
    } catch (err) {
        showConsoleLibraryError(err, 'moviedbTrendings')
        throw new Error(botTexts.library_error)
    }
}

export async function calcExpression(expr: string) {
    try {
        const URL_BASE = 'https://api.mathjs.org/v4/'
        expr = expr.replace(/[Xx\xD7]/g, "*")
        expr = expr.replace(/\xF7/g, "/")
        expr = expr.replace(/,/g, ".")
        expr = expr.replace("em", "in")

        const { data: calcResponse } = await axios.post(URL_BASE, { expr }, { timeout: HTTP_TIMEOUT.api })
        let calcResult = calcResponse.result;

        if (calcResult == "NaN" || calcResult == "Infinity") {
            return null
        }

        calcResult = calcResult.split(" ")
        calcResult[0] = (calcResult[0].includes("e")) ? prettyNum(calcResult[0]) : calcResult[0]
        calcResult = calcResult.join(" ")

        return calcResult as string
    } catch (err) {
        showConsoleLibraryError(err, 'calcExpression')
        throw new Error(botTexts.library_error)
    }
}

/**
 * Manchetes do Google Notícias pelo feed RSS público (gratuito, sem chave).
 * Antes usava uma biblioteca que raspava a página do Google (parou de funcionar).
 */
export async function newsGoogle(lang = 'pt') {
    try {
        const edition = lang === 'pt' ? 'hl=pt-BR&gl=BR&ceid=BR:pt-419' : `hl=${lang}&gl=US&ceid=US:${lang}`
        const { data: xml } = await axios.get(`https://news.google.com/rss?${edition}`, { timeout: HTTP_TIMEOUT.api, headers: { 'User-Agent': BROWSER_UA } })
        const { window: { document } } = new JSDOM(xml, { contentType: 'text/xml', virtualConsole: new VirtualConsole() })
        const newsResponse: News[] = [...document.querySelectorAll('item')].slice(0, 10).map(item => {
            const source = item.querySelector('source')?.textContent?.trim() ?? 'Google Notícias'
            const rawTitle = item.querySelector('title')?.textContent?.trim() ?? ''
            const pubDate = item.querySelector('pubDate')?.textContent
            return {
                title: rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle,
                published: pubDate ? moment(pubDate).tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm') : '',
                author: source,
                url: item.querySelector('link')?.textContent?.trim() ?? ''
            }
        })
        return newsResponse
    } catch (err) {
        showConsoleLibraryError(err, 'newsGoogle')
        throw new Error(botTexts.library_error)
    }
}

type TranslationLanguage = "pt" | "es" | "en" | "ja" | "it" | "ru" | "ko"

/** Divide o texto em pedaços de até `max` caracteres, preferindo quebrar em fim de frase. */
function splitForTranslation(text: string, max = 450): string[] {
    const parts: string[] = []
    let rest = text.trim()
    while (rest.length > max) {
        const slice = rest.slice(0, max)
        const cut = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('\n'), slice.lastIndexOf('! '), slice.lastIndexOf('? '))
        const at = cut > max / 2 ? cut + 1 : (slice.lastIndexOf(' ') > 0 ? slice.lastIndexOf(' ') : max)
        parts.push(rest.slice(0, at).trim())
        rest = rest.slice(at).trim()
    }
    if (rest) parts.push(rest)
    return parts
}

/**
 * Tradução gratuita pela API pública do MyMemory (https://mymemory.translated.net/doc/spec.php),
 * com detecção automática do idioma de origem. Limite anônimo: ~5.000 caracteres/dia por IP;
 * com MYMEMORY_EMAIL no ambiente, ~50.000/dia. Antes usava @vitalets/google-translate-api, que passou
 * a receber "429 Too Many Requests" do Google.
 */
export async function translateText(text: string, lang: TranslationLanguage) {
    try {
        const target = lang === 'pt' ? 'pt-BR' : lang
        const email = process.env.MYMEMORY_EMAIL?.trim()
        const translated: string[] = []
        for (const part of splitForTranslation(text)) {
            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(part)}&langpair=${encodeURIComponent(`autodetect|${target}`)}` + (email ? `&de=${encodeURIComponent(email)}` : '')
            const { data } = await axios.get(url, { timeout: HTTP_TIMEOUT.api })
            const result = String(data?.responseData?.translatedText ?? '')
            if (Number(data?.responseStatus) !== 200 || !result || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(result)) {
                throw new Error(`MyMemory: ${data?.responseDetails || result || 'resposta inválida'}`)
            }
            translated.push(result)
        }
        return translated.join(' ')
    } catch (err) {
        showConsoleLibraryError(err, 'translateText')
        throw new Error(botTexts.library_error)
    }
}

export async function shortenUrl(url: string) {
    try {
        const URL_BASE = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`
        const { data: shortenResponse } = await axios.get(URL_BASE, { timeout: HTTP_TIMEOUT.api })

        if (!shortenResponse) {
            return null
        }

        return shortenResponse as string
    } catch (err) {
        showConsoleLibraryError(err, 'shortenUrl')
        throw new Error(botTexts.library_error)
    }
}

/** Converte o link de redirecionamento do Bing (bing.com/ck/a?...&u=a1<base64url>) no endereço real. */
function bingTargetUrl(href: string) {
    try {
        if (!href.includes('bing.com/ck/a')) return href
        const encoded = new URL(href).searchParams.get('u')
        if (!encoded?.startsWith('a1')) return href
        return Buffer.from(encoded.slice(2).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    } catch {
        return href
    }
}

/**
 * Pesquisa na web pela página pública de resultados do Bing (gratuita, sem chave), com a Wikipédia
 * em português como complemento quando o Bing não traz resultados. Antes usava o DuckDuckGo, que
 * passou a responder com um desafio anti-robô (0 resultados).
 */
export async function webSearch(texto: string) {
    try {
        const { data: html } = await axios.get(`https://www.bing.com/search?q=${encodeURIComponent(texto)}&setlang=pt-BR&cc=BR`, {
            timeout: HTTP_TIMEOUT.scraping,
            headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'pt-BR,pt;q=0.9' }
        })
        const { window: { document } } = new JSDOM(html, { virtualConsole: new VirtualConsole() })
        const results: WebSearch[] = []

        document.querySelectorAll('li.b_algo').forEach(item => {
            const link = item.querySelector('h2 a')
            const href = link?.getAttribute('href')
            if (link && href) {
                results.push({
                    title: link.textContent?.trim() || "Sem título",
                    url: bingTargetUrl(href),
                    description: item.querySelector('.b_caption p, p')?.textContent?.trim() || null
                })
            }
        })

        if (!results.length) {
            const { data } = await axios.get(`https://pt.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(texto)}&limit=5`, { timeout: HTTP_TIMEOUT.api, headers: { 'User-Agent': BROWSER_UA } })
            for (const page of (data?.pages ?? []) as { key: string, title: string, description?: string | null }[]) {
                results.push({ title: page.title, url: `https://pt.wikipedia.org/wiki/${encodeURIComponent(page.key)}`, description: page.description ?? null })
            }
        }

        return results.slice(0, 8)
    } catch (err) {
        showConsoleLibraryError(err, 'webSearch')
        throw new Error(botTexts.library_error)
    }
}

const WEATHER_KEY = '516f58a20b6c4ad3986123104242805'

/** Remove acentos: "Parnaíba" → "Parnaiba". */
export function stripAccents(text: string): string {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Descobre a cidade certa antes de buscar o tempo. A WeatherAPI erra com acentos ("Parnaíba" não
 * acha nada e "Parnaíba, Piauí" devolve outra cidade, em MG), então a busca oficial (search.json) é
 * feita sem acentos e depois com o texto original; vence o resultado cujo nome bate com o digitado,
 * de preferência no Brasil. A previsão é pedida pelo identificador exato ("id:123").
 */
export async function resolveWeatherLocation(location: string): Promise<string> {
    const typed = location.trim()
    const wantedName = stripAccents(typed.split(',')[0]).toLowerCase().trim()
    const attempts = [...new Set([stripAccents(typed), typed])]
    for (const query of attempts) {
        try {
            const { data } = await axios.get<{ id: number, name: string, country: string }[]>(
                `http://api.weatherapi.com/v1/search.json?key=${WEATHER_KEY}&q=${encodeURIComponent(query)}`, { timeout: HTTP_TIMEOUT.api })
            if (!Array.isArray(data) || !data.length) continue
            const sameName = (r: { name: string }) => stripAccents(r.name).toLowerCase() === wantedName
            const isBrazil = (r: { country: string }) => /bra[sz]il/i.test(r.country)
            const best = data.find(r => sameName(r) && isBrazil(r)) ?? data.find(sameName) ?? data.find(isBrazil) ?? data[0]
            return `id:${best.id}`
        } catch {
            // busca falhou: tenta a próxima forma ou cai no texto sem acento
        }
    }
    return stripAccents(typed)
}

export async function wheatherInfo(location: string) {
    try {
        const query = await resolveWeatherLocation(location)
        const WEATHER_API_URL = `http://api.weatherapi.com/v1/forecast.json?key=${WEATHER_KEY}&q=${encodeURIComponent(query)}&days=3&aqi=no&alerts=no`
        const { data: wheatherResult } = await axios.get(WEATHER_API_URL, { timeout: HTTP_TIMEOUT.api })
        const { data: wheatherConditions } = await axios.get("https://www.weatherapi.com/docs/conditions.json", { timeout: HTTP_TIMEOUT.api, responseType: 'json' })
        const currentCondition = wheatherConditions.find((condition: { code: number }) =>
            condition.code === wheatherResult.current.condition.code
        ).languages.find((language: { lang_iso: string }) =>
            language.lang_iso == 'pt'
        )

        let weatherResponse: Wheather = {
            location: {
                name: wheatherResult.location.name,
                region: wheatherResult.location.region,
                country: wheatherResult.location.country,
                current_time: timestampToDate(wheatherResult.location.localtime_epoch * 1000)
            },
            current: {
                last_updated: timestampToDate(wheatherResult.current.last_updated_epoch * 1000),
                temp: `${wheatherResult.current.temp_c} C°`,
                feelslike: `${wheatherResult.current.feelslike_c} C°`,
                condition: wheatherResult.current.is_day ? currentCondition.day_text : currentCondition.night_text,
                wind: `${wheatherResult.current.wind_kph} Km/h`,
                humidity: `${wheatherResult.current.humidity} %`,
                cloud: `${wheatherResult.current.cloud} %`
            },
            forecast: []
        }

        wheatherResult.forecast.forecastday.forEach((forecast: WeatherForecastDay) => {
            const conditionDay = wheatherConditions.find((condition: { code: number }) =>
                condition.code == forecast.day.condition.code
            ).languages.find((lang: { lang_iso: string }) =>
                lang.lang_iso == 'pt'
            )
            const [year, month, day] = forecast.date.split("-")
            const forecastDay = {
                day: `${day}/${month}/${year}`,
                max: `${forecast.day.maxtemp_c} C°`,
                min: `${forecast.day.mintemp_c} C°`,
                avg: `${forecast.day.avgtemp_c} C°`,
                condition: `${conditionDay.day_text}`,
                max_wind: `${forecast.day.maxwind_kph} Km/h`,
                rain: `${forecast.day.daily_will_it_rain ? "Sim" : "Não"}`,
                chance_rain: `${forecast.day.daily_chance_of_rain} %`,
                snow: `${forecast.day.daily_will_it_snow ? "Sim" : "Não"}`,
                chance_snow: `${forecast.day.daily_chance_of_snow} %`,
                uv: forecast.day.uv
            }
            weatherResponse.forecast.push(forecastDay)
        })

        return weatherResponse
    } catch (err) {
        showConsoleLibraryError(err, 'wheatherInfo')
        throw new Error(botTexts.library_error)
    }
}

/**
 * Letra pela API aberta e gratuita do LRCLIB (https://lrclib.net/docs) e capa pela API de busca do
 * iTunes (gratuita, sem chave). Antes usava genius-lyrics, que deixou de funcionar.
 */
export async function musicLyrics(text: string) {
    try {
        const { data: songs } = await axios.get(`https://lrclib.net/api/search?q=${encodeURIComponent(text)}`, {
            timeout: HTTP_TIMEOUT.api,
            headers: { 'User-Agent': 'Sinforoso-WhatsApp-Bot (https://github.com/olverclock/sinforoso)' }
        })
        const song = (songs as { trackName: string, artistName: string, plainLyrics?: string | null, instrumental?: boolean }[])
            .find(item => !item.instrumental && item.plainLyrics?.trim())

        if (!song) {
            return null
        }

        let image = ''
        try {
            const { data: itunes } = await axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(`${song.trackName} ${song.artistName}`)}&entity=song&limit=1&country=BR`, { timeout: HTTP_TIMEOUT.api })
            image = String(itunes?.results?.[0]?.artworkUrl100 ?? '').replace('100x100bb', '600x600bb')
        } catch {
            // a capa é opcional
        }

        const musicResult: MusicLyrics = {
            title: song.trackName,
            artist: song.artistName,
            image,
            lyrics: song.plainLyrics!.trim()
        }

        return musicResult
    } catch (err) {
        showConsoleLibraryError(err, 'musicLyrics')
        throw new Error(botTexts.library_error)
    }
}

export async function convertCurrency(currency: "dolar" | "euro" | "real" | "iene", value: number) {
    try {
        const URL_BASE = 'https://economia.awesomeapi.com.br/json/last/'
        value = parseInt(value.toString().replace(",", "."))
        let params: string | undefined

        switch (currency) {
            case 'dolar':
                params = "USD-BRL,USD-EUR,USD-JPY"
                break
            case 'euro':
                params = "EUR-BRL,EUR-USD,EUR-JPY"
                break
            case 'iene':
                params = "JPY-BRL,JPY-USD,JPY-EUR"
                break
            case 'real':
                params = "BRL-USD,BRL-EUR,BRL-JPY"
                break
        }

        const { data: convertResponse } = await axios.get(URL_BASE + params, { timeout: HTTP_TIMEOUT.api })
        let convertResult: CurrencyConvert = {
            value: value,
            currency: currency,
            convertion: []
        }

        for (let convertion in convertResponse) {
            let currencyType = ''
            let currencySymbol = ''

            switch (convertResponse[convertion].codein) {
                case "BRL":
                    currencyType = "Real"
                    currencySymbol = "R$"
                    break
                case "EUR":
                    currencyType = "Euro"
                    currencySymbol = "Є"
                    break
                case "USD":
                    currencyType = "Dólar"
                    currencySymbol = "$"
                    break
                case "JPY":
                    currencyType = "Iene"
                    currencySymbol = "¥"
                    break
            }

            let arrayDateUpdated = convertResponse[convertion].create_date.split(" ")[0].split("-")
            let hourUpdated = convertResponse[convertion].create_date.split(" ")[1]
            convertResult.convertion.push({
                currency: currencyType,
                convertion_name: convertResponse[convertion].name,
                value_converted: (convertResponse[convertion].bid * value).toFixed(2),
                value_converted_formatted: `${currencySymbol} ${(convertResponse[convertion].bid * value).toFixed(2)}`,
                updated: `${arrayDateUpdated[2]}/${arrayDateUpdated[1]}/${arrayDateUpdated[0]} às ${hourUpdated}`
            })
        }

        return convertResult
    } catch (err) {
        showConsoleLibraryError(err, 'convertCurrency')
        throw new Error(botTexts.library_error)
    }
}

export async function infoDDD(ddd: string) {
    // Dados locais (Anatel): sem download a cada uso
    const found = DDD_STATES.find(state => state.ddds.includes(ddd.trim()))
    return found ? { state: found.state, region: found.region } : null
}

export async function symbolsASCI() {
    return SYMBOLS_TABLE
}


export async function simSimi(text: string) {
    try {
        const URL_BASE = 'https://api.simsimi.vn/v2/simtalk'
        const config = {
            url: URL_BASE,
            method: "post",
            timeout: HTTP_TIMEOUT.api,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: qs.stringify({ text, lc: 'pt' })
        }

        const { data: simiResponse } = await axios(config).catch((err) => {
            if (err.response?.data?.message) {
                return err.response
            } else {
                throw err
            }
        })

        return simiResponse.message as string | null | undefined
    } catch (err) {
        showConsoleLibraryError(err, 'simSimi')
        throw new Error(botTexts.library_error)
    }
}

export async function funnyRandomPhrases() {
    // Modelos e complementos locais; cada lacuna recebe um complemento diferente
    let phrase = FUNNY_TEMPLATES[Math.floor(Math.random() * FUNNY_TEMPLATES.length)]
    const pool = [...FUNNY_COMPLEMENTS]
    for (let i = 1; i <= 3 && phrase.includes(`{p${i}}`); i++) {
        const [chosen] = pool.splice(Math.floor(Math.random() * pool.length), 1)
        phrase = phrase.replace(`{p${i}}`, `*${chosen}*`)
    }
    return phrase
}
