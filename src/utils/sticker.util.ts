import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs-extra'
import crypto from 'node:crypto'
import webp from "node-webpmux"
import { getTempPath, showConsoleLibraryError } from './general.util.js'
import { fileTypeFromBuffer } from 'file-type'
import { Jimp } from 'jimp'
import { StickerOptions, StickerType } from "../interfaces/library.interface.js"
import botTexts from '../helpers/bot.texts.helper.js'

export async function createSticker(mediaBuffer: Buffer, { pack = 'olverclock', author = 'olver stickers', fps = 9, type = 'resize', maxSeconds }: StickerOptions) {
    try {
        const bufferSticker = await stickerCreation(mediaBuffer, { pack, author, fps, type, maxSeconds })

        return bufferSticker
    } catch (err) {
        showConsoleLibraryError(err, 'createSticker')
        throw new Error(botTexts.library_error)
    }
}

export async function renameSticker(stickerBuffer: Buffer, pack: string, author: string) {
    try {
        const stickerBufferModified = await addExif(stickerBuffer, pack, author)

        return stickerBufferModified
    } catch (err) {
        showConsoleLibraryError(err, 'renameSticker')
        throw new Error(botTexts.library_error)
    }
}

export async function stickerToImage(stickerBuffer: Buffer) {
    try {
        const inputWebpPath = getTempPath('webp')
        const outputPngPath = getTempPath('png')
        fs.writeFileSync(inputWebpPath, stickerBuffer)

        await new Promise<void>((resolve, reject) => {
            ffmpeg(inputWebpPath)
                .save(outputPngPath)
                .on('end', () => resolve())
                .on('error', (err: Error) => reject(err))
        })

        const imageBuffer = fs.readFileSync(outputPngPath)
        fs.unlinkSync(inputWebpPath)
        fs.unlinkSync(outputPngPath)

        return imageBuffer
    } catch (err) {
        showConsoleLibraryError(err, 'stickerToImage')
        throw new Error(botTexts.library_error)
    }
}

async function stickerCreation(mediaBuffer: Buffer, { author, pack, fps, type, maxSeconds }: StickerOptions) {
    try {
        const bufferData = await fileTypeFromBuffer(mediaBuffer)

        if (!bufferData) {
            throw new Error("Unable to retrieve data from sent media.")
        }

        const mime = bufferData.mime
        const isAnimated = mime.startsWith('video') || mime.includes('gif')

        if (mime == 'image/webp') mediaBuffer = await pngConvertion(mediaBuffer)

        const webpBuffer = (isAnimated && maxSeconds)
            ? await soundStickerWebp(mediaBuffer, type, maxSeconds)
            : await webpConvertion(mediaBuffer, isAnimated, fps, type, maxSeconds)
        const stickerBuffer = await addExif(webpBuffer, pack, author)

        return stickerBuffer
    } catch (err) {
        throw err
    }
}

async function addExif(buffer: Buffer, pack: string, author: string) {
    try {
        const img = new webp.Image()
        const stickerPackId = crypto.randomBytes(32).toString('hex')
        const json = { 'sticker-pack-id': stickerPackId, 'sticker-pack-name': pack, 'sticker-pack-publisher': author }
        const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
        const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8')
        const exif = Buffer.concat([exifAttr, jsonBuffer])
        exif.writeUIntLE(jsonBuffer.length, 14, 4)
        await img.load(buffer)
        img.exif = exif
        const stickerBuffer: Buffer = await img.save(null)

        return stickerBuffer as Buffer
    } catch (err) {
        throw err
    }
}

async function pngConvertion(mediaBuffer: Buffer) {
    try {
        const inputMediaPath = getTempPath('webp')
        const outputMediaPath = getTempPath('png')
        fs.writeFileSync(inputMediaPath, mediaBuffer)

        await new Promise<void>((resolve, reject) => {
            ffmpeg(inputMediaPath)
                .save(outputMediaPath)
                .on('end', () => resolve())
                .on('error', (err: Error) => reject(err))
        }).catch((err: unknown) => {
            fs.unlinkSync(inputMediaPath)
            throw err
        })

        const pngBuffer = fs.readFileSync(outputMediaPath)
        fs.unlinkSync(outputMediaPath)
        fs.unlinkSync(inputMediaPath)

        return pngBuffer
    } catch (err) {
        throw err
    }
}

/** Limite oficial do WhatsApp para figurinha animada (README do WhatsApp/stickers, Android). */
export const ANIMATED_STICKER_MAX_BYTES = 500 * 1024

/**
 * Figurinha com som: precisa caber nos 500 KB do WhatsApp. Acima disso o celular decodifica devagar,
 * a animação roda mais lenta que o som e os dois se perdem. Tenta da melhor fluidez para a menor,
 * com redução de ruído (vídeo de celular tem muito ruído, que pesa no WebP) e compressão máxima.
 */
const SOUND_STICKER_ATTEMPTS = [
    { fps: 12, quality: 10 },
    { fps: 10, quality: 5 },
    { fps: 8, quality: 1 },
]

async function soundStickerWebp(mediaBuffer: Buffer, type: StickerType, maxSeconds: number): Promise<Buffer> {
    let webp: Buffer | null = null
    for (const attempt of SOUND_STICKER_ATTEMPTS) {
        webp = await webpConvertion(mediaBuffer, true, attempt.fps, type, maxSeconds, { quality: attempt.quality, denoise: true })
        if (webp.length <= ANIMATED_STICKER_MAX_BYTES) break
    }
    return webp!
}

async function webpConvertion(mediaBuffer: Buffer, isAnimated: boolean, fps: number, type: StickerType, maxSeconds?: number, tuning: { quality?: number, denoise?: boolean } = {}) {
    try {
        let inputMediaPath
        let options
        let outputMediaPath = getTempPath('webp')

        if (isAnimated) {
            inputMediaPath = getTempPath('mp4')
            options = [
                "-vcodec libwebp",
                "-filter:v",
                // hqdn3d: reduz o ruído antes de comprimir (só na figurinha com som, que tem limite de tamanho)
                tuning.denoise ? `hqdn3d,fps=fps=${fps}` : `fps=fps=${fps}`,
                "-lossless 0",
                tuning.denoise ? "-compression_level 6" : "-compression_level 4",
                `-q:v ${tuning.quality ?? 10}`,
                // Figurinha com som: repetição infinita (o WhatsApp controla o loop e toca o som 3 vezes);
                // sem som, mantém como sempre foi
                maxSeconds ? "-loop 0" : "-loop 1",
                "-preset picture",
                "-an",
                "-vsync 0",
                "-s 512:512",
                // Figurinha com som: a animação dura o mesmo que o áudio, para os dois ficarem sincronizados
                ...(maxSeconds ? ["-t", String(maxSeconds)] : [])
            ]
        } else {
            inputMediaPath = getTempPath('png')
            mediaBuffer = await editImage(mediaBuffer, type)
            options = [
                "-vcodec libwebp",
                "-loop 0",
                "-lossless 1",
                "-q:v 100"
            ]
        }

        fs.writeFileSync(inputMediaPath, mediaBuffer)

        await new Promise<void>((resolve, reject) => {
            ffmpeg(inputMediaPath)
                .outputOptions(options)
                .save(outputMediaPath)
                .on('end', () => resolve())
                .on('error', (err) => reject(err))
        }).catch((err) => {
            fs.unlinkSync(inputMediaPath)
            throw err
        })

        const webpBuffer = fs.readFileSync(outputMediaPath)
        fs.unlinkSync(outputMediaPath)
        fs.unlinkSync(inputMediaPath)

        return webpBuffer
    } catch (err) {
        throw err
    }
}

async function editImage(imageBuffer: Buffer, type: StickerType) {
    try {
        const image = await Jimp.read(imageBuffer)

        if (type === 'resize') {
            image.resize({ w: 512, h: 512 })
        } else if (type === 'contain') {
            image.contain({ w: 512, h: 512 })
        } else if (type === 'circle') {
            image.resize({ w: 512, h: 512 })
            image.circle()
        }

        return await image.getBuffer('image/png')
    } catch (err) {
        throw err
    }
}