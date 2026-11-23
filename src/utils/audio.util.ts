import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs-extra'
import crypto from 'node:crypto'
import { recognizeBytes } from 'shazamio-core'
import { getTempPath, showConsoleLibraryError, HTTP_TIMEOUT } from './general.util.js'
import { hfSpaces } from './hf-spaces.util.js'
import axios from 'axios'
import { AudioModificationType, MusicRecognition } from '../interfaces/library.interface.js'
import botTexts from '../helpers/bot.texts.helper.js'

/**
 * Transcrição pela API gratuita da Groq (Whisper Large v3 Turbo), compatível com a da OpenAI.
 * Plano gratuito sem cartão: 2.000 pedidos/dia e ~8 h de áudio/dia. Requer GROQ_API_KEY no ambiente
 * (chave gratuita em https://console.groq.com/keys). Documentação: https://console.groq.com/docs/speech-to-text
 */
export const groqSpeech = {
    isConfigured: () => Boolean(process.env.GROQ_API_KEY?.trim()),
    async transcribe(audioBuffer: Buffer, mimetype = 'audio/ogg'): Promise<string> {
        const form = new FormData()
        const extension = mimetype.includes('mpeg') ? 'mp3' : mimetype.includes('wav') ? 'wav' : mimetype.includes('mp4') ? 'm4a' : 'ogg'
        form.append('file', new Blob([new Uint8Array(audioBuffer)], { type: mimetype }), `audio.${extension}`)
        form.append('model', 'whisper-large-v3-turbo')
        form.append('language', 'pt')
        form.append('response_format', 'json')
        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY?.trim()}` },
            body: form,
            signal: AbortSignal.timeout(HTTP_TIMEOUT.media),
        })
        if (!response.ok) throw new Error(`Groq respondeu HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`)
        const result = await response.json() as { text?: string }
        return String(result.text ?? '').trim()
    },
}

/**
 * Transcreve o áudio. Ordem: Groq (se GROQ_API_KEY estiver configurada) e depois Whisper Large v3 em
 * Hugging Face Spaces (sem chave, mas com cota anônima pequena; HF_TOKEN gratuito aumenta a cota).
 * Antes usava chaves Deepgram servidas por um link de terceiro (dub.sh), que passou a responder 429.
 */
export async function audioTranscription(audioBuffer: Buffer, mimetype = 'audio/ogg') {
    try {
        if (groqSpeech.isConfigured()) {
            try {
                return await groqSpeech.transcribe(audioBuffer, mimetype)
            } catch (err) {
                showConsoleLibraryError(err, 'audioTranscription (Groq)')
            }
        }
        return await hfSpaces.transcribe(audioBuffer, mimetype)
    } catch (err) {
        showConsoleLibraryError(err, 'audioTranscription')
        throw new Error(botTexts.library_error)
    }
}

/** Converte qualquer áudio/vídeo para WAV mono 16 kHz (formato que o shazamio-core decodifica). */
async function toWavMono16k(mediaBuffer: Buffer): Promise<Buffer> {
    const inputPath = getTempPath('mp3')
    const outputPath = getTempPath('wav')
    fs.writeFileSync(inputPath, mediaBuffer)
    try {
        await new Promise<void>((resolve, reject) => {
            ffmpeg(inputPath).noVideo().audioChannels(1).audioFrequency(16000).format('wav')
                .on('end', () => resolve()).on('error', (err: Error) => reject(err)).save(outputPath)
        })
        return fs.readFileSync(outputPath)
    } finally {
        fs.removeSync(inputPath)
        fs.removeSync(outputPath)
    }
}

type ShazamMetadata = { title?: string, text?: string }
type ShazamResponse = { matches?: unknown[], track?: { title?: string, subtitle?: string, sections?: { metadata?: ShazamMetadata[] }[] } }

/**
 * Reconhece a música com o Shazam (gratuito, sem chave). A assinatura de áudio é gerada localmente
 * pelo shazamio-core (MIT); só a assinatura, não o áudio, é enviada para amp.shazam.com por HTTPS.
 * É a API interna do Shazam (não oficial): pode mudar sem aviso.
 */
export async function musicRecognition(mediaBuffer: Buffer): Promise<MusicRecognition | null> {
    try {
        const wav = new Uint8Array(await toWavMono16k(mediaBuffer))

        // Tenta trechos de 12 s em pontos diferentes do áudio (introduções silenciosas atrapalham).
        for (const offset of [0, 10, 25]) {
            const signatures = recognizeBytes(wav, offset, 12)
            if (!signatures.length) break
            const signature = signatures[0]
            const body = {
                geolocation: { altitude: 300, latitude: -23.55, longitude: -46.63 },
                signature: { samplems: signature.samplems, timestamp: Date.now(), uri: signature.uri },
                timestamp: Date.now(),
                timezone: 'America/Sao_Paulo',
            }
            for (const sig of signatures) sig.free()

            const url = `https://amp.shazam.com/discovery/v5/en-US/BR/android/-/tag/${crypto.randomUUID().toUpperCase()}/${crypto.randomUUID()}` +
                '?sync=true&webv3=true&sampling=true&connected=&shazamapiversion=v3&sharehub=true&hubv5minorversion=v5.1&hidelb=true&video=v3'
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 13)', 'Accept-Language': 'en-US' },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(HTTP_TIMEOUT.api),
            })
            if (!response.ok) throw new Error(`Shazam respondeu HTTP ${response.status}`)
            const result = await response.json() as ShazamResponse

            if (result.matches?.length && result.track) {
                const metadata = result.track.sections?.flatMap(section => section.metadata ?? []) ?? []
                const field = (name: string) => metadata.find(m => m.title?.toLowerCase() === name)?.text
                return {
                    title: result.track.title ?? '-----',
                    artists: result.track.subtitle ?? '-----',
                    album: field('album') ?? '-----',
                    producer: field('label') ?? '-----',
                    release_date: field('released') ?? '-----',
                    duration: '-----',
                }
            }
        }

        return null
    } catch (err) {
        showConsoleLibraryError(err, 'musicRecognition')
        throw new Error(botTexts.library_error)
    }
}

export async function textToVoice(lang: "pt" | 'en' | 'ja' | 'es' | 'it' | 'ru' | 'ko' | 'sv', text: string) {
    try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`
        const { data: audioBuffer } = await axios.get(url, { timeout: HTTP_TIMEOUT.media, responseType: 'arraybuffer' })
        return Buffer.from(audioBuffer)
    } catch (err) {
        showConsoleLibraryError(err, 'textToVoice')
        throw new Error(botTexts.library_error)
    }
}

export async function audioModified(audioBuffer: Buffer, type: AudioModificationType) {
    try {
        const inputAudioPath = getTempPath('mp3')
        const outputAudioPath = getTempPath('mp3')
        let options: string[] = []
        fs.writeFileSync(inputAudioPath, audioBuffer)

        switch (type) {
            case "estourar":
                options = ["-y", "-filter_complex", "acrusher=level_in=3:level_out=5:bits=10:mode=log:aa=1"]
                break
            case "reverso":
                options = ["-y", "-filter_complex", "areverse"]
                break
            case "grave":
                options = ["-y", "-af", "asetrate=44100*0.5,aresample=44100,atempo=1.20"]
                break
            case "agudo":
                options = ["-y", "-af", "asetrate=44100*1.1,aresample=44100,atempo=0.70"]
                break
            case "x2":
                options = ["-y", "-filter:a", "atempo=2.0", "-vn"]
                break
            case "volume":
                options = ["-y", "-filter:a", "volume=4.0"]
                break
            default:
                fs.unlinkSync(inputAudioPath)
                throw new Error(`This type of editing is not supported`)
        }

        await new Promise<void>((resolve, reject) => {
            ffmpeg(inputAudioPath)
                .outputOptions(options)
                .save(outputAudioPath)
                .on('end', () => resolve())
                .on("error", (err) => reject(err))
        }).catch((err) => {
            fs.unlinkSync(inputAudioPath)
            throw err
        })

        const bufferModifiedAudio = fs.readFileSync(outputAudioPath)
        fs.unlinkSync(inputAudioPath)
        fs.unlinkSync(outputAudioPath)

        return bufferModifiedAudio
    } catch (err) {
        showConsoleLibraryError(err, 'audioTranscription')
        throw new Error(botTexts.library_error)
    }
}

