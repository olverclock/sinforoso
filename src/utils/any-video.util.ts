/*
 * Baixador universal (!bx e !sbx): descobre o site pelo link e usa o baixador dele (YouTube,
 * Instagram, TikTok, X, Facebook). Qualquer outro site vai pelo yt-dlp oficial, que suporta mais de
 * mil sites (Kwai, Vimeo, Reddit, Twitch clips, Dailymotion, Pinterest, Threads, Bluesky...).
 */
import { parseVideoId } from '@distube/ytdl-core'
import { showConsoleLibraryError } from './general.util.js'
import botTexts from '../helpers/bot.texts.helper.js'
import { clipVideo, TimeRange, ytDlpSection } from './clip.util.js'
import * as download from './download.util.js'

export type VideoProvider = 'youtube' | 'instagram' | 'tiktok' | 'x' | 'facebook' | 'other'

/** Link sem vídeo (post só de fotos, slideshow do TikTok...). */
export class NoVideoError extends Error {}
/** O site só libera o vídeo para quem está logado (o bot baixa só conteúdo público). */
export class LoginRequiredError extends Error {}

const PROVIDERS: [VideoProvider, RegExp][] = [
    ['youtube', /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i],
    ['instagram', /(^|\.)instagram\.com$/i],
    ['tiktok', /(^|\.)tiktok\.com$/i],
    ['x', /(^|\.)(x\.com|twitter\.com)$/i],
    ['facebook', /(^|\.)(facebook\.com|fb\.watch|fb\.com)$/i],
]

export const isLink = (text: string) => /^https?:\/\/\S+$/i.test(text.trim())

/** Site do link (pelo domínio). Texto que não é link: null (o !bx busca no YouTube). */
export function videoProvider(text: string): VideoProvider | null {
    if (!isLink(text)) return null
    let host: string
    try { host = new URL(text.trim()).hostname } catch { return null }
    return PROVIDERS.find(([, re]) => re.test(host))?.[0] ?? 'other'
}

/** Domínio para mostrar na mensagem ("kwai.com"). */
export function siteName(url: string): string {
    try { return new URL(url.trim()).hostname.replace(/^(www|m)\./i, '') } catch { return 'site' }
}

/**
 * Qualquer outro site, pelo yt-dlp: prefere H.264/AAC em MP4 (toca em qualquer celular), até 720p e
 * dentro do limite de tamanho do bot. Com trecho, baixa só o pedaço.
 */
export async function genericVideo(url: string, range: TimeRange | null, lang?: string | null): Promise<Buffer> {
    const mb = Math.floor(download.ytLimits().maxBytes / 1024 / 1024)
    try {
        return await download.ytDlp.downloadToBuffer([
            '-f', lang ? `bv*+ba[language^=${lang}]/bv*+ba/b` : 'bv*+ba/b', '-S', 'lang,vcodec:h264,acodec:aac,res:720,ext:mp4:m4a', // lang: faixa de áudio original antes das dublagens
            // Alguns sites só têm AVI/WebM: --recode-video converte para MP4 só quando precisa
            '--merge-output-format', 'mp4', '--recode-video', 'mp4', '--max-filesize', `${mb}M`, '--no-playlist',
            ...(range ? ['--download-sections', ytDlpSection(range), '--force-keyframes-at-cuts'] : []),
            url.trim(),
        ], 'mp4')
    } catch (err) {
        showConsoleLibraryError(err, 'genericVideo (yt-dlp)')
        const why = err instanceof Error ? err.message : String(err)
        if (/no video formats|unsupported url|no media found|there'?s no video|not found|http error 404/i.test(why)) throw new NoVideoError('sem vídeo')
        if (/logged-in|login required|log in|sign in|cookies|private/i.test(why)) throw new LoginRequiredError('exige login')
        throw new Error(botTexts.library_error)
    }
}

/** Primeiro vídeo do link, como arquivo (para a figurinha do !sbx). */
async function providerVideo(provider: VideoProvider, url: string, range: TimeRange | null, lang: string | null): Promise<{ buffer: Buffer, clipped: boolean }> {
    if (provider === 'youtube') {
        const id = parseVideoId(url.trim())
        if (!id) throw new NoVideoError('link do YouTube sem vídeo')
        await download.assertAudioLanguage(id, lang)
        // Só o trecho (yt-dlp); se falhar, o vídeo inteiro pelo caminho normal e recorta depois
        if (range) {
            try { return { buffer: await download.youtubeVideoSection(id, range, lang), clipped: true } } catch { /* reserva abaixo */ }
        }
        return { buffer: await download.youtubeVideo(id, lang), clipped: false }
    }
    if (provider === 'instagram') {
        const video = (await download.instagramMedia(url)).media.find(m => m.type === 'video')
        if (!video) throw new NoVideoError('post sem vídeo')
        return { buffer: video.buffer ?? await download.mediaBuffer(video.url!), clipped: false }
    }
    if (provider === 'tiktok') {
        const tiktok = await download.tiktokMedia(url)
        const link = Array.isArray(tiktok?.url) ? tiktok?.url[0] : tiktok?.url
        if (!tiktok || tiktok.type !== 'video' || !link) throw new NoVideoError('tiktok sem vídeo')
        return { buffer: await download.mediaBuffer(link), clipped: false }
    }
    if (provider === 'x') {
        const video = (await download.xMedia(url))?.media.find(m => m.type === 'video')
        if (!video) throw new NoVideoError('post sem vídeo')
        return { buffer: await download.mediaBuffer(video.url), clipped: false }
    }
    if (provider === 'facebook') {
        return { buffer: await download.mediaBuffer((await download.facebookMedia(url)).sd), clipped: false }
    }
    return { buffer: await genericVideo(url, range, lang), clipped: !!range }
}

/** Vídeo de qualquer site, já no trecho pedido (se houver). */
export async function anyVideo(url: string, range: TimeRange | null, lang: string | null = null): Promise<Buffer> {
    const provider = videoProvider(url)
    if (!provider) throw new NoVideoError('não é link')
    const { buffer, clipped } = await providerVideo(provider, url, range, lang)
    return (range && !clipped) ? clipVideo(buffer, range) : buffer
}
