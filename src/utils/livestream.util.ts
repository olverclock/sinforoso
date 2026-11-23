import axios from "axios"
import { LivePlatform } from "../interfaces/chat-features.interface.js"
import { HTTP_TIMEOUT, showConsoleLibraryError } from "./general.util.js"

/*
 * Verificação de lives (Twitch, Kick, YouTube e TikTok), no estilo dos avisos da Loritta/Streamcord.
 *
 * - Twitch: API oficial Helix (GET /helix/streams, até 100 logins por pedido) com token de app
 *   (client credentials). Precisa de TWITCH_CLIENT_ID e TWITCH_CLIENT_SECRET (grátis em
 *   https://dev.twitch.tv/console/apps). Sem chave, lê a página pública do canal.
 * - Kick: API oficial (https://api.kick.com/public/v1/channels) com token de app, se houver
 *   KICK_CLIENT_ID e KICK_CLIENT_SECRET (grátis em https://kick.com/settings/developer). Sem chave,
 *   usa o endpoint público do site (kick.com/api/v2/channels/{slug}).
 * - YouTube: página pública https://www.youtube.com/@canal/live (sem chave e sem gastar cota).
 * - TikTok: não há API oficial de lives; usa o endpoint público do site (tiktok.com/api-live).
 *   YouTube, TikTok e os modos sem chave dependem do site e podem mudar sem aviso.
 */

export interface LiveStatus {
    live: boolean
    /** Identifica a transmissão (para não avisar a mesma live duas vezes). */
    stream_id?: string
    title?: string
    url: string
    thumbnail?: string
}

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"

/** Normaliza o nome do canal: tira @, espaços e o endereço completo se o usuário colou o link. */
export function normalizeChannel(platform: LivePlatform, input: string): string | null {
    let value = input.trim()
    const patterns: Record<LivePlatform, RegExp> = {
        twitch: /twitch\.tv\/([A-Za-z0-9_]{3,25})/i,
        kick: /kick\.com\/([A-Za-z0-9_-]{3,30})/i,
        youtube: /youtube\.com\/(@[A-Za-z0-9._-]{3,30}|channel\/UC[A-Za-z0-9_-]{22})/i,
        tiktok: /tiktok\.com\/@([A-Za-z0-9._]{2,24})/i,
    }
    const fromUrl = value.match(patterns[platform])
    if (fromUrl) value = fromUrl[1]
    value = value.replace(/^@/, '')
    const valid: Record<LivePlatform, RegExp> = {
        twitch: /^[A-Za-z0-9_]{3,25}$/,
        kick: /^[A-Za-z0-9_-]{3,30}$/,
        youtube: /^([A-Za-z0-9._-]{3,30}|channel\/UC[A-Za-z0-9_-]{22})$/,
        tiktok: /^[A-Za-z0-9._]{2,24}$/,
    }
    return valid[platform].test(value) ? value : null
}

export function channelUrl(platform: LivePlatform, channel: string): string {
    switch (platform) {
        case 'twitch': return `https://www.twitch.tv/${channel}`
        case 'kick': return `https://kick.com/${channel}`
        case 'youtube': return channel.startsWith('channel/') ? `https://www.youtube.com/${channel}` : `https://www.youtube.com/@${channel}`
        case 'tiktok': return `https://www.tiktok.com/@${channel}/live`
    }
}

// ——— Tokens de app (client credentials), guardados até expirar ———
type CachedToken = { token: string, expiresAt: number }
const tokens = new Map<string, CachedToken>()

async function appToken(name: 'twitch' | 'kick', url: string, clientId: string, clientSecret: string): Promise<string> {
    const cached = tokens.get(name)
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token
    const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' })
    const { data } = await axios.post<{ access_token: string, expires_in: number }>(url, body, { timeout: HTTP_TIMEOUT.api })
    tokens.set(name, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 })
    return data.access_token
}

/** Para testes e para quando a chave é trocada. */
export function clearLiveTokens() { tokens.clear() }

function credentials(platform: 'TWITCH' | 'KICK') {
    const id = process.env[`${platform}_CLIENT_ID`]?.trim()
    const secret = process.env[`${platform}_CLIENT_SECRET`]?.trim()
    return id && secret ? { id, secret } : null
}

// ——— Twitch ———
async function twitchHelix(channels: string[], creds: { id: string, secret: string }): Promise<Map<string, LiveStatus>> {
    const result = new Map<string, LiveStatus>()
    for (let i = 0; i < channels.length; i += 100) {
        const batch = channels.slice(i, i + 100)
        const token = await appToken('twitch', 'https://id.twitch.tv/oauth2/token', creds.id, creds.secret)
        const params = new URLSearchParams(batch.map(login => ['user_login', login.toLowerCase()]))
        const { data } = await axios.get<{ data: { id: string, user_login: string, title: string, thumbnail_url: string, type: string }[] }>(
            `https://api.twitch.tv/helix/streams?${params}`,
            { headers: { 'Client-Id': creds.id, Authorization: `Bearer ${token}` }, timeout: HTTP_TIMEOUT.api })
        const live = new Map(data.data.filter(s => s.type === 'live').map(s => [s.user_login.toLowerCase(), s]))
        for (const login of batch) {
            const s = live.get(login.toLowerCase())
            result.set(login, s
                ? { live: true, stream_id: s.id, title: s.title, url: channelUrl('twitch', login), thumbnail: s.thumbnail_url.replace('{width}', '1280').replace('{height}', '720') }
                : { live: false, url: channelUrl('twitch', login) })
        }
    }
    return result
}

async function twitchPage(login: string): Promise<LiveStatus> {
    const { data } = await axios.get<string>(channelUrl('twitch', login), { headers: { 'User-Agent': BROWSER_UA }, timeout: HTTP_TIMEOUT.api, responseType: 'text' })
    const live = /"isLiveBroadcast":true/.test(data)
    const started = data.match(/"startDate":"([^"]+)"/)?.[1]
    const title = data.match(/<meta property="og:description" content="([^"]*)"/)?.[1]
    return { live, stream_id: live ? started : undefined, title, url: channelUrl('twitch', login) }
}

// ——— Kick ———
async function kickOfficial(slugs: string[], creds: { id: string, secret: string }): Promise<Map<string, LiveStatus>> {
    const result = new Map<string, LiveStatus>()
    for (let i = 0; i < slugs.length; i += 50) {
        const batch = slugs.slice(i, i + 50)
        const token = await appToken('kick', 'https://id.kick.com/oauth/token', creds.id, creds.secret)
        const params = new URLSearchParams(batch.map(slug => ['slug', slug.toLowerCase()]))
        const { data } = await axios.get<{ data: { slug: string, stream_title?: string, stream?: { is_live: boolean, start_time?: string, thumbnail?: string } }[] }>(
            `https://api.kick.com/public/v1/channels?${params}`,
            { headers: { Authorization: `Bearer ${token}` }, timeout: HTTP_TIMEOUT.api })
        const bySlug = new Map(data.data.map(c => [c.slug.toLowerCase(), c]))
        for (const slug of batch) {
            const c = bySlug.get(slug.toLowerCase())
            const live = Boolean(c?.stream?.is_live)
            result.set(slug, { live, stream_id: live ? c?.stream?.start_time : undefined, title: c?.stream_title, url: channelUrl('kick', slug), thumbnail: live ? c?.stream?.thumbnail : undefined })
        }
    }
    return result
}

async function kickPublic(slug: string): Promise<LiveStatus> {
    const { data } = await axios.get<{ livestream?: { id: number, session_title?: string, is_live?: boolean, thumbnail?: { url?: string } } | null }>(
        `https://kick.com/api/v2/channels/${encodeURIComponent(slug.toLowerCase())}`,
        { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' }, timeout: HTTP_TIMEOUT.api })
    const stream = data.livestream
    const live = Boolean(stream && stream.is_live !== false)
    return { live, stream_id: live ? String(stream!.id) : undefined, title: stream?.session_title, url: channelUrl('kick', slug), thumbnail: stream?.thumbnail?.url }
}

// ——— YouTube ———
export function parseYoutubeLivePage(html: string, channel: string): LiveStatus {
    const live = /"isLiveNow":true/.test(html)
    const videoId = html.match(/"videoDetails":\{"videoId":"([A-Za-z0-9_-]{11})"/)?.[1]
    const title = html.match(/"videoDetails":\{[^}]*?"title":"((?:[^"\\]|\\.)*)"/)?.[1]
    if (!live || !videoId) return { live: false, url: channelUrl('youtube', channel) }
    return {
        live: true,
        stream_id: videoId,
        title: title ? JSON.parse(`"${title}"`) as string : undefined,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault_live.jpg`,
    }
}

async function youtubeLive(channel: string): Promise<LiveStatus> {
    const { data } = await axios.get<string>(`${channelUrl('youtube', channel)}/live`, {
        headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'pt-BR,pt;q=0.9', Cookie: 'CONSENT=YES+1' },
        timeout: HTTP_TIMEOUT.api, responseType: 'text',
    })
    return parseYoutubeLivePage(data, channel)
}

// ——— TikTok ———
async function tiktokLive(user: string): Promise<LiveStatus> {
    const { data } = await axios.get<{ data?: { user?: { roomId?: string, status?: number }, liveRoom?: { status?: number, title?: string, coverUrl?: string } } }>(
        `https://www.tiktok.com/api-live/user/room/?aid=1988&uniqueId=${encodeURIComponent(user)}&sourceType=54`,
        { headers: { 'User-Agent': BROWSER_UA }, timeout: HTTP_TIMEOUT.api })
    // status 2 = ao vivo (4 = encerrada), como no TikTok-Live-Connector
    const room = data.data?.liveRoom
    const live = room?.status === 2 || data.data?.user?.status === 2
    return { live, stream_id: live ? data.data?.user?.roomId : undefined, title: room?.title, url: channelUrl('tiktok', user), thumbnail: live ? room?.coverUrl : undefined }
}

/** Verifica um conjunto de canais de uma plataforma. Canais com erro ficam de fora do resultado. */
export async function checkLives(platform: LivePlatform, channels: string[]): Promise<Map<string, LiveStatus>> {
    const unique = [...new Set(channels)]
    if (!unique.length) return new Map()
    try {
        if (platform === 'twitch') {
            const creds = credentials('TWITCH')
            if (creds) return await twitchHelix(unique, creds)
        }
        if (platform === 'kick') {
            const creds = credentials('KICK')
            if (creds) return await kickOfficial(unique, creds)
        }
    } catch (err) {
        showConsoleLibraryError(err, `checkLives (${platform}, API oficial)`)
        return new Map()
    }
    const single = { twitch: twitchPage, kick: kickPublic, youtube: youtubeLive, tiktok: tiktokLive }[platform]
    const result = new Map<string, LiveStatus>()
    for (const channel of unique) {
        try {
            result.set(channel, await single(channel))
        } catch (err) {
            showConsoleLibraryError(err, `checkLives (${platform}: ${channel})`)
        }
    }
    return result
}
