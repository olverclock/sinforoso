import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs-extra'
import axios from 'axios'
import { getTempPath, showConsoleLibraryError, HTTP_TIMEOUT } from './general.util.js'
import botTexts from '../helpers/bot.texts.helper.js'

export async function convertMp4ToMp3(sourceType: 'buffer' | 'url', video: Buffer | string) {
    try {
        const inputVideoPath = getTempPath('mp4')
        const outputAudioPath = getTempPath('mp3')

        if (sourceType == 'buffer') {
            if (!Buffer.isBuffer(video)) {
                throw new Error("The media type is Buffer, but the video parameter is not a Buffer.")
            }

            fs.writeFileSync(inputVideoPath, video)
        } else if (sourceType == 'url') {
            if (typeof video != 'string') {
                throw new Error("The media type is URL, but the video parameter is not a String.")
            }

            const { data: mediaResponse } = await axios.get(video, { timeout: HTTP_TIMEOUT.media, responseType: 'arraybuffer' })
            const videoBuffer = Buffer.from(mediaResponse)
            fs.writeFileSync(inputVideoPath, videoBuffer)
        } else {
            throw new Error("Unsupported media type.")
        }

        await new Promise<void>((resolve, reject) => {
            ffmpeg(inputVideoPath)
                .outputOptions(['-vn', '-codec:a libmp3lame', '-q:a 3'])
                .save(outputAudioPath)
                .on('end', () => resolve())
                .on("error", (err) => reject(err))
        }).catch((err) => {
            fs.unlinkSync(inputVideoPath)
            throw err
        })

        const audioBuffer = fs.readFileSync(outputAudioPath)
        fs.unlinkSync(inputVideoPath)
        fs.unlinkSync(outputAudioPath)

        return audioBuffer
    } catch (err) {
        showConsoleLibraryError(err, 'convertMp4ToMp3')
        throw new Error(botTexts.library_error)
    }
}

export async function convertVideoToWhatsApp(sourceType: 'buffer' | 'url', video: Buffer | string) {
    try {
        const inputVideoPath = getTempPath('mp4')
        const outputVideoPath = getTempPath('mp4')

        if (sourceType == 'buffer') {
            if (!Buffer.isBuffer(video)) {
                throw new Error('The media type is Buffer, but the video parameter is not a Buffer.')
            }

            fs.writeFileSync(inputVideoPath, video)
        } else if (sourceType == 'url') {
            if (typeof video != 'string') {
                throw new Error('The media type is URL, but the video parameter is not a String.')
            }

            const { data: mediaResponse } = await axios.get(video, { timeout: HTTP_TIMEOUT.media, responseType: 'arraybuffer' })
            const videoBuffer = Buffer.from(mediaResponse)
            fs.writeFileSync(inputVideoPath, videoBuffer)
        } else {
            throw new Error('Unsupported media type.')
        }

        await new Promise<void>((resolve, reject) => {
            ffmpeg(inputVideoPath)
                .outputOptions([
                    '-c:v libx264',
                    '-profile:v baseline',
                    '-level 3.0',
                    '-pix_fmt yuv420p',
                    '-movflags faststart',
                    '-crf 23',
                    '-preset fast',
                    '-c:a aac',
                    '-b:a 128k',
                    '-ar 44100',
                    '-f mp4'
                ])
                .save(outputVideoPath)
                .on('end', () => resolve())
                .on("error", (err) => reject(err))
        }).catch((err) => {
            fs.unlinkSync(inputVideoPath)
            throw err
        })

        const videoBuffer = fs.readFileSync(outputVideoPath)
        fs.unlinkSync(inputVideoPath)
        fs.unlinkSync(outputVideoPath)

        return videoBuffer
    } catch (err) {
        showConsoleLibraryError(err, 'convertVideoToWhatsApp')
        throw new Error(botTexts.library_error)
    }
}

export async function convertVideoToThumbnail(sourceType: "file" | "buffer" | "url", video: Buffer | string) {
    try {
        let inputPath: string | undefined
        const outputThumbnailPath = getTempPath('jpg')

        if (sourceType == "file") {
            if (typeof video !== 'string') {
                throw new Error('The media type is File, but the video parameter is not a String.')
            }

            inputPath = video
        } else if (sourceType == "buffer") {
            if (!Buffer.isBuffer(video)) {
                throw new Error('The media type is Buffer, but the video parameter is not a Buffer.')
            }

            inputPath = getTempPath('mp4')
            fs.writeFileSync(inputPath, video)
        } else if (sourceType == "url") {
            if (typeof video !== 'string') {
                throw new Error('The media type is URL, but the video parameter is not a String.')
            }
            // Otimização Profissional: Não baixar o vídeo inteiro via Axios.
            // Usar FFMPEG diretamente na URL para extrair o primeiro frame.
            inputPath = video
        }

        await new Promise<void>(async (resolve, reject) => {
            ffmpeg(inputPath)
                .addOption("-y")
                .inputOptions(["-ss 00:00:00", "-threads 1"])
                .outputOptions(["-vf scale=32:-1", "-vframes 1", "-f image2"])
                .save(outputThumbnailPath)
                .on('end', () => resolve())
                .on('error', (err) => {
                    // Se o FFMPEG falhar (SIGSEGV, 403, etc.), não quebramos o comando inteiro.
                    // Apenas logamos e lançamos para o catch interno tratar como "sem thumbnail".
                    reject(err)
                })
        }).catch((err) => {
            if (sourceType == 'buffer' && inputPath) {
                fs.unlinkSync(inputPath)
            }
            // Logar erro interno mas permitir que o fluxo continue se possível
            console.error(`[FFMPEG DEBUG] Erro na geração de thumbnail: ${err.message}`)
            throw err
        })

        if (sourceType == 'buffer' && inputPath) {
            fs.unlinkSync(inputPath)
        }

        if (fs.existsSync(outputThumbnailPath)) {
            const thumbBase64: Base64URLString = fs.readFileSync(outputThumbnailPath).toString('base64')
            fs.unlinkSync(outputThumbnailPath)
            return thumbBase64
        }

        return undefined
    } catch (err) {
        // Silencioso para permitir que o vídeo seja enviado mesmo sem thumbnail se o erro foi no FFMPEG
        return undefined
    }
}

export async function extractAudioFromVideo(sourceType: "file" | "buffer" | "url", video: Buffer | string) {
    let inputVideoPath = getTempPath('mp4')
    const outputAudioPath = getTempPath('mp3')

    if (sourceType == "file") {
        if (typeof video !== 'string') {
            throw new Error('The media type is File, but the video parameter is not a String.')
        }

        inputVideoPath = video
    } else if (sourceType == 'buffer') {
        if (!Buffer.isBuffer(video)) {
            throw new Error('The media type is Buffer, but the video parameter is not a Buffer.')
        }

        fs.writeFileSync(inputVideoPath, video)
    } else if (sourceType == 'url') {
        if (typeof video != 'string') {
            throw new Error('The media type is URL, but the video parameter is not a String.')
        }

        const { data: mediaResponse } = await axios.get(video, { timeout: HTTP_TIMEOUT.media,
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        })
        const videoBuffer = Buffer.from(mediaResponse)
        fs.writeFileSync(inputVideoPath, videoBuffer)
    } else {
        throw new Error('Unsupported media type.')
    }

    await new Promise<void>(async (resolve, reject) => {
        ffmpeg(inputVideoPath)
            .noVideo()
            .audioCodec('libmp3lame')
            .audioBitrate('192k')
            .format('mp3')
            .save(outputAudioPath)
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
    }).catch((err) => {
        if (sourceType != 'file' && inputVideoPath) {
            fs.unlinkSync(inputVideoPath)
        }

        throw err
    })

    if (sourceType != 'file' && inputVideoPath) {
        fs.unlinkSync(inputVideoPath)
    }

    const audioBuffer = fs.readFileSync(outputAudioPath)
    fs.unlinkSync(outputAudioPath)

    return audioBuffer

}