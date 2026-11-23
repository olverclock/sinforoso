import axios from 'axios'
import { getRandomFilename, showConsoleLibraryError, errorMessage, errorStatus, HTTP_TIMEOUT } from './general.util.js'
import format from 'format-duration'
import { JSDOM, VirtualConsole } from 'jsdom'
import { hfSpaces } from './hf-spaces.util.js'
import getEmojiMixUrl, { checkSupported } from 'emoji-mixer'
import { ImageUploadService } from 'node-upload-images'
import { AnimeRecognition, ImageSearch } from '../interfaces/library.interface.js'
import botTexts from '../helpers/bot.texts.helper.js'

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'

export async function uploadImage(imageBuffer: Buffer) {
    try {
        const service = new ImageUploadService('pixhost.to')
        const { directLink } = await service.uploadFromBinary(imageBuffer, getRandomFilename("png"))

        return directLink
    } catch (err) {
        showConsoleLibraryError(err, 'uploadImage')
        throw new Error(botTexts.library_error)
    }
}

export async function checkEmojiMixSupport(emoji1: string, emoji2: string) {
    try {
        const emojiSupport = {
            emoji1: checkSupported(emoji1, true) ? true : false,
            emoji2: checkSupported(emoji2, true) ? true : false
        }

        return emojiSupport
    } catch (err) {
        showConsoleLibraryError(err, 'checkEmojiMixSupport')
        throw new Error(botTexts.library_error)
    }
}

export async function emojiMix(emoji1: string, emoji2: string) {
    try {
        const emojiUrl = getEmojiMixUrl(emoji1, emoji2, false, true)

        if (!emojiUrl) {
            return null
        }

        const { data: imageBuffer } = await axios.get(emojiUrl, { timeout: HTTP_TIMEOUT.media, responseType: 'arraybuffer' })

        return imageBuffer as Buffer
    } catch (err) {
        showConsoleLibraryError(err, 'emojiMix')
        throw new Error(botTexts.library_error)
    }
}

/**
 * Remove o fundo com BiRefNet em Hugging Face Spaces (gratuito, sem chave; HF_TOKEN gratuito aumenta a cota).
 * Antes dependia do site freebackgroundremover.com, que deixou de responder.
 */
export async function removeBackground(imageBuffer: Buffer) {
    try {
        return await hfSpaces.removeBackground(imageBuffer, 'image/png')
    } catch (err) {
        showConsoleLibraryError(err, 'removeBackground')
        if (/ZeroGPU|quota|cota/i.test(errorMessage(err))) {
            throw new Error("O limite gratuito do serviço de remoção de fundo foi atingido. Tente novamente mais tarde.")
        }
        throw new Error("No momento o motor de remoção de fundo está indisponível. Tente novamente em alguns minutos.")
    }
}

export async function animeRecognition(imageBuffer: Buffer) {
    try {
        const URL_BASE = 'https://api.trace.moe/search?anilistInfo'
        const { data: animesResponse } = await axios.post(URL_BASE, imageBuffer, { timeout: HTTP_TIMEOUT.media,
            headers: {
                "Content-type": "image/jpeg"
            }
        }).catch((err: unknown) => {
            if (errorStatus(err) == 429) {
                throw new Error('Too many requests at moment.')
            } else if (errorStatus(err) == 400) {
                return { data: null }
            } else {
                throw err
            }
        })

        if (!animesResponse || !animesResponse.result) {
            return null
        }

        const animes = animesResponse.result
        const msInitial = Math.round(animes[0].from * 1000)
        const msFinal = Math.round(animes[0].to * 1000)
        const animeInfo: AnimeRecognition = {
            initial_time: format(msInitial),
            final_time: format(msFinal),
            episode: animes[0].episode,
            title: animes[0].anilist.title.english || animes[0].anilist.title.romaji,
            similarity: parseInt((animes[0].similarity * 100).toFixed(2)),
            preview_url: animes[0].video
        }

        return animeInfo
    } catch (err) {
        showConsoleLibraryError(err, 'animeRecognition')
        throw new Error(botTexts.library_error)
    }
}

/**
 * Busca de imagens no Bing (página pública de resultados; gratuita, sem chave).
 * Antes usava @victorsouzaleal/googlethis, que deixou de funcionar ("Could not execute search").
 */
export async function imageSearch(text: string): Promise<ImageSearch[]> {
    try {
        const { data: html } = await axios.get(`https://www.bing.com/images/search?q=${encodeURIComponent(text)}&form=HDRSC2&first=1&safeSearch=Strict`, {
            timeout: HTTP_TIMEOUT.scraping,
            headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'pt-BR,pt;q=0.9' }
        })
        const { window: { document } } = new JSDOM(html, { virtualConsole: new VirtualConsole() })
        const images: ImageSearch[] = []

        document.querySelectorAll('a.iusc').forEach((anchor) => {
            try {
                const meta = JSON.parse(anchor.getAttribute('m') ?? '{}') as { murl?: string, turl?: string, t?: string }
                if (meta.murl?.startsWith('http')) {
                    images.push({ url: meta.murl, thumbnail: meta.turl ?? meta.murl, title: meta.t ?? '' })
                }
            } catch {
                // metadado inválido: ignora este resultado
            }
        })

        if (!images.length) {
            throw new Error("Nenhum resultado foi encontrado para esta pesquisa.")
        }

        return images
    } catch (err) {
        showConsoleLibraryError(err, 'imageSearch')
        throw new Error(botTexts.library_error)
    }
}