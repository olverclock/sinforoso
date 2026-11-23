import { formatSeconds, showConsoleLibraryError, HTTP_TIMEOUT, getTempPath, errorMessage } from './general.util.js'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'fs-extra'
import ffmpeg from 'fluent-ffmpeg'
import { getFbVideoInfo } from 'fb-downloader-scrapper'
import Tiktok from '@tobyg74/tiktok-api-dl'
import axios from 'axios'
import { Ytdl, parseVideoId, SearchType } from '@distube/ytdl-core'
import { FacebookMedia, InstagramMedia, TiktokMedia, XMedia } from '../interfaces/library.interface.js'
import botTexts from '../helpers/bot.texts.helper.js'

/** Campos lidos do JSON do yt-dlp (-J). */
type YtDlpInfo = {
    webpage_url?: string, uploader?: string, uploader_id?: string, channel?: string, description?: string,
    like_count?: number, formats?: unknown[], entries?: YtDlpInfo[]
}

/**
 * Mensagem de falha do yt-dlp: a linha "ERROR" dele ou, se não houver (ex.: o programa nem
 * iniciou), as últimas linhas de saída com o código. 126/127 = o sistema não conseguiu executá-lo.
 */
export function ytDlpFailure(code: number | null, stderr: string): string {
    const lines = stderr.split('\n').map(l => l.trim()).filter(Boolean)
    const error = lines.filter(line => line.includes('ERROR')).pop()
    if (error) return error
    const tail = lines.slice(-3).join(' | ')
    if (code === 126 || code === 127) return `yt-dlp não conseguiu executar no servidor (código ${code})${tail ? `: ${tail}` : ''}`
    return `yt-dlp terminou com código ${code}${tail ? `: ${tail}` : ''}`
}

/**
 * Execução do yt-dlp oficial. O binário fica em bin/ (npm run setup:yt-dlp) ou em YTDLP_PATH.
 * Exposto como objeto para poder ser substituído nos testes.
 */
export const ytDlp = {
    binaryPath(): string {
        return process.env.YTDLP_PATH?.trim() || path.resolve('bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
    },

    ffmpegPath(): string | undefined {
        const fromEnv = process.env.FFMPEG_PATH?.trim()
        if (fromEnv) return fromEnv
        try {
            return (createRequire(import.meta.url)('@ffmpeg-installer/ffmpeg') as { path: string }).path
        } catch {
            return undefined
        }
    },

    run(args: string[], timeoutMs = 180_000): Promise<{ stdout: Buffer, stderr: string }> {
        const binary = ytDlp.binaryPath()
        if (!fs.existsSync(binary)) {
            return Promise.reject(new Error(`yt-dlp não encontrado em ${binary}. Rode: npm run setup:yt-dlp`))
        }
        const ffmpegPath = ytDlp.ffmpegPath()
        // O YouTube exige um runtime JavaScript (wiki EJS do yt-dlp); usamos o próprio Node do bot
        const fullArgs = ['--js-runtimes', `node:${process.execPath}`, ...(ffmpegPath ? ['--ffmpeg-location', ffmpegPath] : []), ...args]
        return new Promise((resolve, reject) => {
            const child = spawn(binary, fullArgs, { windowsHide: true })
            const stdout: Buffer[] = []
            let stderr = ''
            const timer = setTimeout(() => { child.kill(); reject(new Error(`yt-dlp: tempo esgotado (${timeoutMs / 1000}s)`)) }, timeoutMs)
            child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
            child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
            child.on('error', (err) => { clearTimeout(timer); reject(err) })
            child.on('close', (code) => {
                clearTimeout(timer)
                if (code === 0) resolve({ stdout: Buffer.concat(stdout), stderr })
                else reject(new Error(ytDlpFailure(code, stderr)))
            })
        })
    },

    /** Baixa para um arquivo temporário (necessário para juntar vídeo + áudio) e devolve o conteúdo. */
    async downloadToBuffer(args: string[], extension: 'mp4' | 'm4a'): Promise<Buffer> {
        const output = getTempPath(extension)
        try {
            await ytDlp.run([...args, '--no-warnings', '--no-part', '-o', output])
            return fs.readFileSync(output)
        } finally {
            fs.removeSync(output)
        }
    },
}

export async function xMedia(url: string) {
    try {
        const newURL = url.replace(/twitter\.com|x\.com/g, 'api.vxtwitter.com')
        const { data: xResponse } = await axios.get(newURL, { timeout: HTTP_TIMEOUT.scraping })

        if (!xResponse.media_extended) {
            return null
        }

        const xMedia: XMedia = {
            text: xResponse.text,
            media: xResponse.media_extended.map((media: { type: string, url: string }) => {
                return {
                    type: (media.type === 'video') ? 'video' : 'image',
                    url: media.url
                }
            })
        }

        return xMedia
    } catch (err) {
        showConsoleLibraryError(err, 'xMedia')
        throw new Error(botTexts.library_error)
    }
}

export async function tiktokMedia(url: string) {
    try {
        const tiktokResponse = await Tiktok.Downloader(url, { version: "v1" })
        let mediaUrl: string | string[]

        if (tiktokResponse.status === 'error') {
            return null
        }

        if (tiktokResponse.result?.type == 'video') {
            if (tiktokResponse.result?.video?.playAddr?.length) {
                mediaUrl = tiktokResponse.result?.video?.playAddr[0]
            } else {
                return null
            }
        } else if (tiktokResponse.result?.type == 'image') {
            if (tiktokResponse.result?.images) {
                mediaUrl = tiktokResponse.result?.images
            } else {
                return null
            }
        } else {
            return null
        }

        const tiktokMedia: TiktokMedia = {
            author_profile: tiktokResponse.result?.author?.nickname,
            description: tiktokResponse.result?.desc,
            type: tiktokResponse.result?.type,
            duration: tiktokResponse.result?.type == "video" ? parseInt(((tiktokResponse.result?.video?.duration as number) / 1000).toFixed(0)) : null,
            url: mediaUrl
        }

        return tiktokMedia
    } catch (err) {
        showConsoleLibraryError(err, 'tiktokMedia')
        throw new Error(botTexts.library_error)
    }
}

export async function facebookMedia(url: string) {
    try {
        const facebookResponse = await getFbVideoInfo(url)
        const facebookMedia: FacebookMedia = {
            url: facebookResponse.url,
            duration: parseInt((facebookResponse.duration_ms / 1000).toFixed(0)),
            sd: facebookResponse.sd,
            hd: facebookResponse.hd,
            title: facebookResponse.title,
            thumbnail: facebookResponse.thumbnail
        }

        return facebookMedia
    } catch (err) {
        showConsoleLibraryError(err, 'facebookMedia')
        throw new Error(botTexts.library_error)
    }
}

/**
 * Instagram pelo yt-dlp oficial (npm run setup:yt-dlp). O método antigo (instagram-url-direct) passou
 * a receber 401 do Instagram. Funciona com vídeos e reels públicos; posts só de foto exigem login.
 */
/** Erro do yt-dlp → explicação para o usuário (o motivo técnico fica no log). */
export function instagramErrorMessage(err: unknown): string {
    const text = errorMessage(err)
    if (/No video formats found|no video in this post/i.test(text)) return "Este post do Instagram tem apenas fotos, e o Instagram exige login para baixá-las. Vídeos e reels públicos funcionam."
    if (/rate.?limit|429|too many requests/i.test(text)) return "O Instagram limitou os downloads deste servidor por um tempo. Tente de novo mais tarde."
    if (/login|private|not available|unavailable|restricted/i.test(text)) return "O Instagram exigiu login para este post (privado, restrito por idade ou removido). Tente outro link público."
    if (/Unsupported URL|is not a valid URL|Unable to extract/i.test(text)) return "Não reconheci esse link do Instagram. Envie o link de um post, reel ou vídeo público (instagram.com/p/... ou /reel/...)."
    if (/yt-dlp não encontrado/i.test(text)) return "O baixador de vídeos (yt-dlp) não está instalado no servidor. Rode: npm run setup:yt-dlp"
    if (/não conseguiu executar no servidor/i.test(text)) return "O baixador de vídeos (yt-dlp) não consegue executar neste servidor. Reconstrua a imagem com: docker compose build --no-cache && docker compose up -d"
    if (/tempo esgotado|timed out/i.test(text)) return "O Instagram demorou demais para responder. Tente de novo."
    return botTexts.library_error
}

/** Melhor imagem de um item sem vídeo (fotos de carrossel), pela lista de miniaturas do yt-dlp. */
function bestImage(entry: YtDlpInfo): string | undefined {
    const thumbs = (entry as YtDlpInfo & { thumbnails?: { url?: string, width?: number, height?: number }[], thumbnail?: string }).thumbnails ?? []
    const best = [...thumbs].filter(t => t.url).sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))[0]
    return best?.url ?? (entry as YtDlpInfo & { thumbnail?: string }).thumbnail
}

export async function instagramMedia(url: string): Promise<InstagramMedia> {
    // Só o link (sem texto antes/depois e sem parâmetros de rastreio como ?igsh=)
    const link = url.match(/https?:\/\/(?:www\.)?instagram\.com\/[^\s?#]+/i)?.[0] ?? url.trim()
    let info: YtDlpInfo
    try {
        info = JSON.parse((await ytDlp.run(['-J', '--no-warnings', '--no-playlist', link], 60_000)).stdout.toString('utf8')) as YtDlpInfo
    } catch (err) {
        showConsoleLibraryError(err, 'instagramMedia')
        throw new Error(instagramErrorMessage(err))
    }

    try {
        const entries = info.entries?.length ? info.entries : [info]
        const media: InstagramMedia['media'] = []
        for (const [index, entry] of entries.entries()) {
            if (!entry.formats?.length) {
                // Foto de um carrossel que também tem vídeo: envia a imagem em tamanho original
                const image = entries.length > 1 ? bestImage(entry) : undefined
                if (image) media.push({ type: 'image', url: image })
                continue
            }
            const buffer = await ytDlp.downloadToBuffer(['-f', 'b[ext=mp4]/bv*+ba/b', '--merge-output-format', 'mp4', '--no-playlist', ...(entries.length > 1 ? ['--playlist-items', String(index + 1)] : []), entry.webpage_url ?? link], 'mp4')
            media.push({ type: 'video', buffer })
        }
        if (!media.length) throw new Error("No video formats found")
        return {
            author_username: info.channel ?? info.uploader_id ?? '',
            author_fullname: info.uploader ?? '',
            caption: info.description ?? '',
            likes: info.like_count ?? 0,
            media
        }
    } catch (err) {
        showConsoleLibraryError(err, 'instagramMedia')
        throw new Error(instagramErrorMessage(err))
    }
}



/** Metadados do vídeo do YouTube (busca por texto ou link). O download é feito por youtubeAudio/youtubeVideo. */
export async function youtubeMedia(text: string) {
    try {
        // ytdl-core v5: parseVideoId também aceita um ID solto de 11 caracteres; para manter o
        // comportamento da v4 (validateURL), só tratamos como link quando o texto é uma URL do YouTube.
        const isURLValid = /^(https?:\/\/)?([\w-]+\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(text.trim())
        const yt = new Ytdl()
        let videoId: string | undefined

        if (isURLValid) {
            videoId = parseVideoId(text.trim())
        } else {
            const videos = await yt.search(text, { type: SearchType.Video })
            videoId = videos[0]?.id
        }

        if (!videoId) return null

        const videoInfo = await yt.getInfo(videoId)
        return {
            id_video: videoId,
            title: videoInfo.videoDetails.title || 'YouTube Video',
            description: videoInfo.videoDetails.description || '',
            duration: Number(videoInfo.videoDetails.lengthSeconds),
            channel: videoInfo.videoDetails.author?.name || 'YouTube',
            is_live: videoInfo.videoDetails.isLive || false,
            duration_formatted: formatSeconds(Number(videoInfo.videoDetails.lengthSeconds)),
            url: `https://www.youtube.com/watch?v=${videoId}`,
            thumbnail: videoInfo.videoDetails.thumbnails[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        }
    } catch (err) {
        showConsoleLibraryError(err, 'youtubeMedia')
        throw new Error(botTexts.library_error)
    }
}

/** Lê um stream do ytdl-core inteiro para a memória. */
function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = []
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('end', () => resolve(Buffer.concat(chunks)))
        stream.on('error', reject)
    })
}

/**
 * Áudio do vídeo (m4a/webm). Usa o download nativo do ytdl-core, que trata assinaturas e PO token
 * do YouTube (baixar o link direto do formato com axios recebia 403). Reserva: yt-dlp.
 */
export async function youtubeAudio(videoId: string): Promise<Buffer> {
    try {
        const yt = new Ytdl()
        const info = await yt.getInfo(videoId)
        return await streamToBuffer(yt.download(info, { quality: 'highestaudio', filter: { hasAudio: true, hasVideo: false } }))
    } catch (err) {
        showConsoleLibraryError(err, 'youtubeAudio (ytdl-core)')
        try {
            return await ytDlp.downloadToBuffer(['-f', 'ba[ext=m4a]/ba/b', '--no-playlist', `https://www.youtube.com/watch?v=${videoId}`], 'm4a')
        } catch (fallbackErr) {
            showConsoleLibraryError(fallbackErr, 'youtubeAudio (yt-dlp)')
            throw new Error(botTexts.library_error)
        }
    }
}

/** Limites do !yt: tamanho máximo do arquivo e resolução máxima (o WhatsApp mostra bem até 1080p). */
export const ytLimits = () => {
    const mb = Number(process.env.YT_MAX_MB ?? 50)
    const height = Number(process.env.YT_MAX_HEIGHT ?? 1080)
    return { maxBytes: (Number.isFinite(mb) && mb > 0 ? mb : 50) * 1024 * 1024, maxHeight: Number.isFinite(height) && height >= 144 ? height : 1080 }
}

/** Campos do formato usados na escolha (ytdl-core: FormatMetadata). */
export interface YtFormat { hasVideo: boolean, hasAudio: boolean, container: string, videoCodec?: string, height?: number, bitrate?: number, contentLength?: number }

/** Tamanho do formato: o informado pelo YouTube ou estimado pelo bitrate × duração. */
export function formatBytes(f: YtFormat, durationSec: number): number {
    return f.contentLength || Math.round(((f.bitrate ?? 0) * durationSec) / 8)
}

/**
 * Escolhe vídeo e áudio para juntar SEM recomprimir: vídeo H.264 (avc1, toca em qualquer celular,
 * inclusive iPhone) em MP4 com a maior resolução até maxHeight cujo tamanho, somado ao áudio AAC,
 * caiba em maxBytes. Se nem a menor couber, fica com a menor.
 */
export function pickYoutubeFormats<T extends YtFormat>(formats: readonly T[], durationSec: number, limits = ytLimits()): { video: T, audio: T } | null {
    const audio = formats.filter(f => f.hasAudio && !f.hasVideo && f.container === 'mp4').sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]
    const mp4Videos = formats.filter(f => f.hasVideo && !f.hasAudio && f.container === 'mp4' && (f.height ?? 0) <= limits.maxHeight)
    const h264 = mp4Videos.filter(f => /^avc1/i.test(f.videoCodec ?? ''))
    // Sem H.264 listado (raro): qualquer MP4, como antes
    const videos = (h264.length ? h264 : mp4Videos)
        .sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.bitrate ?? 0) - (a.bitrate ?? 0))
    if (!audio || !videos.length) return null
    const audioBytes = formatBytes(audio, durationSec)
    const video = videos.find(v => formatBytes(v, durationSec) + audioBytes <= limits.maxBytes) ?? videos[videos.length - 1]
    return { video, audio }
}

/** yt-dlp (reserva): mesmas regras em filtro de formato. */
export function ytDlpVideoFormat(limits = ytLimits()): string {
    const mb = Math.floor(limits.maxBytes / 1024 / 1024)
    const h = limits.maxHeight
    return [
        `bv*[vcodec^=avc1][ext=mp4][height<=${h}][filesize<?${Math.floor(mb * 0.85)}M]+ba[ext=m4a]`,
        `bv*[vcodec^=avc1][ext=mp4][height<=720]+ba[ext=m4a]`,
        `b[ext=mp4][height<=720]`,
        'b',
    ].join('/')
}

/**
 * Vídeo em MP4 na melhor qualidade que caiba no limite (padrão: até 1080p e 50 MB). O YouTube
 * entrega vídeo e áudio separados: os dois são baixados pelo ytdl-core e juntados com o ffmpeg
 * sem recodificar (qualidade original). Reserva: yt-dlp com as mesmas regras.
 */
export async function youtubeVideo(videoId: string): Promise<Buffer> {
    const videoPath = getTempPath('mp4'), audioPath = getTempPath('m4a'), outputPath = getTempPath('mp4')
    try {
        const yt = new Ytdl()
        const info = await yt.getInfo(videoId)
        const duration = Number(info.videoDetails.lengthSeconds) || 0
        const limits = ytLimits()
        const chosen = pickYoutubeFormats(info.formats as unknown as (YtFormat & typeof info.formats[number])[], duration, limits)
        // Sem lista de formatos para escolher: deixa o ytdl-core escolher, com o mesmo teto de resolução
        const isMp4Video = (f: { hasVideo: boolean, hasAudio: boolean, container: string, height?: number }) => f.hasVideo && !f.hasAudio && f.container === 'mp4' && (f.height ?? 0) <= limits.maxHeight
        const [video, audio] = await Promise.all([
            streamToBuffer(yt.download(info, chosen ? { format: chosen.video } : { quality: 'highestvideo', filter: isMp4Video })),
            streamToBuffer(yt.download(info, chosen ? { format: chosen.audio } : { quality: 'highestaudio', filter: { hasAudio: true, hasVideo: false, container: 'mp4' } })),
        ])
        fs.writeFileSync(videoPath, video)
        fs.writeFileSync(audioPath, audio)
        await new Promise<void>((resolve, reject) => {
            ffmpeg().input(videoPath).input(audioPath).outputOptions(['-c copy', '-movflags +faststart'])
                .on('end', () => resolve()).on('error', (err: Error) => reject(err)).save(outputPath)
        })
        return fs.readFileSync(outputPath)
    } catch (err) {
        showConsoleLibraryError(err, 'youtubeVideo (ytdl-core)')
        try {
            return await ytDlp.downloadToBuffer(['-f', ytDlpVideoFormat(), '--merge-output-format', 'mp4', '--no-playlist', `https://www.youtube.com/watch?v=${videoId}`], 'mp4')
        } catch (fallbackErr) {
            showConsoleLibraryError(fallbackErr, 'youtubeVideo (yt-dlp)')
            throw new Error(botTexts.library_error)
        }
    } finally {
        for (const file of [videoPath, audioPath, outputPath]) fs.removeSync(file)
    }
}
