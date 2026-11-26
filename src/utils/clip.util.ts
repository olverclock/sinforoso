/*
 * Recorte por tempo ("de 1:20 até 1:45") para os downloads e figurinhas.
 * Formatos aceitos no fim do comando: 1:20-1:45 · 1:20 a 1:45 · 1:20 até 1:45 · 80-105 ·
 * 1m20s-1m45s · 1m-2m30s · 1:02:03-1:05:00. O recorte é preciso (reencoda só o trecho).
 */
import ffmpeg from "fluent-ffmpeg"
import fs from "fs-extra"
import { getTempPath } from "./general.util.js"

export interface TimeRange { start: number, end: number }

/** Erro de uso do recorte (mensagem já pronta para a pessoa). */
export class ClipError extends Error {}

// Número solto só até 3 dígitos (segundos): assim uma busca como "copa 2022-2026" não vira recorte
const TIME = String.raw`(?:\d{1,2}:\d{1,2}:\d{1,2}|\d{1,3}:\d{1,2}|\d+h(?:\d+m)?(?:\d+s?)?|\d+m(?:\d+s?)?|\d+s|\d{1,3})`
const RANGE = new RegExp(String.raw`(?:^|\s)(?:de\s+)?(${TIME})\s*(?:-|–|a|até|ate|ao?)\s*(${TIME})\s*$`, "i")

/** "1:20" → 80 · "1:02:03" → 3723 · "1m20s" → 80 · "1h2m" → 3720 · "45" → 45. */
export function parseTime(text: string): number | null {
    const t = text.trim().toLowerCase()
    if (/^\d+(:\d{1,2}){1,2}$/.test(t)) {
        const parts = t.split(":").map(Number)
        if (parts.slice(1).some(p => p >= 60)) return null
        return parts.reduce((acc, p) => acc * 60 + p, 0)
    }
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(t)
    if (!m || (!m[1] && !m[2] && !m[3])) return null
    return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

/** Separa o trecho pedido do resto do texto (link ou busca). Sem trecho: range = null. */
export function parseTimeRange(text: string): { rest: string, range: TimeRange | null } {
    const match = RANGE.exec(text.trim())
    if (!match) return { rest: text.trim(), range: null }
    const start = parseTime(match[1]), end = parseTime(match[2])
    if (start === null || end === null) throw new ClipError("Horário inválido no trecho. Use, por exemplo, *1:20-1:45* (minuto:segundo).")
    if (end <= start) throw new ClipError("O fim do trecho precisa ser depois do começo. Ex.: *1:20-1:45*.")
    return { rest: text.trim().slice(0, match.index).trim(), range: { start, end } }
}

export const rangeLength = (range: TimeRange) => range.end - range.start

/** 80 → "1:20" · 3723 → "1:02:03". */
export function formatClock(seconds: number): string {
    const s = Math.floor(seconds), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
    const two = (n: number) => String(n).padStart(2, "0")
    return h ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`
}

/** Para o --download-sections do yt-dlp: "*80-105". */
export const ytDlpSection = (range: TimeRange) => `*${range.start}-${range.end}`

async function runClip(input: Buffer, inExt: "mp4" | "mp3", outExt: "mp4" | "mp3", range: TimeRange, codec: string[]): Promise<Buffer> {
    const inputPath = getTempPath(inExt), outputPath = getTempPath(outExt)
    try {
        await fs.writeFile(inputPath, input)
        await new Promise<void>((resolve, reject) => {
            // -ss/-to depois da entrada: corte exato no quadro (não só no quadro-chave)
            ffmpeg(inputPath).outputOptions(["-ss", String(range.start), "-to", String(range.end), ...codec])
                .on("end", () => resolve()).on("error", (err: Error) => reject(err)).save(outputPath)
        })
        const out = await fs.readFile(outputPath)
        if (out.length < 1024) throw new ClipError("O trecho pedido está fora da duração do vídeo.")
        return out
    } catch (err) {
        if (err instanceof ClipError) throw err
        throw new ClipError("Não consegui recortar esse trecho. Confira se ele está dentro da duração do vídeo.")
    } finally {
        await fs.remove(inputPath).catch(() => undefined)
        await fs.remove(outputPath).catch(() => undefined)
    }
}

/** Recorta um vídeo MP4 (H.264 + AAC, pronto para o WhatsApp). */
export function clipVideo(video: Buffer, range: TimeRange): Promise<Buffer> {
    return runClip(video, "mp4", "mp4", range, ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"])
}

/** Recorta um áudio MP3. */
export function clipAudio(audio: Buffer, range: TimeRange): Promise<Buffer> {
    return runClip(audio, "mp3", "mp3", range, ["-vn", "-c:a", "libmp3lame", "-b:a", "192k"])
}
