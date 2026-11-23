import { fileTypeFromBuffer } from "file-type"
import sharp from "sharp"
import { DOC_LIMITS, DocumentToolError } from "./tools.util.js"

/*
 * Validação das entradas do motor de documentos: o tipo é identificado pelo CONTEÚDO (assinatura
 * do arquivo), nunca pela extensão ou pelo nome enviado; tamanho e dimensões são limitados.
 */

export type DocKind = 'pdf' | 'image' | 'office' | 'text'

/** Extensões internas usadas nos arquivos temporários (o nome do usuário nunca é usado). */
export interface DetectedFile { kind: DocKind, ext: string, mime: string }

const OFFICE_MIMES: Record<string, string> = {
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'doc',
    'application/x-cfb': 'doc',
    'application/vnd.oasis.opendocument.text': 'odt',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.oasis.opendocument.spreadsheet': 'ods',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/rtf': 'rtf',
}
const IMAGE_MIMES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** Texto puro: UTF-8 válido, sem bytes de controle (exceto tab/quebra de linha). */
export function looksLikeText(buffer: Buffer): boolean {
    if (!buffer.length) return false
    const sample = buffer.subarray(0, 64 * 1024)
    for (const byte of sample) if (byte === 0 || (byte < 9) || (byte > 13 && byte < 32 && byte !== 27)) return false
    try { new TextDecoder('utf-8', { fatal: true }).decode(sample); return true } catch { return false }
}

export async function detectFile(buffer: Buffer): Promise<DetectedFile> {
    if (buffer.length > DOC_LIMITS.maxInputBytes) {
        throw new DocumentToolError(`O arquivo passa do limite de ${Math.round(DOC_LIMITS.maxInputBytes / 1024 / 1024)} MB.`)
    }
    if (!buffer.length) throw new DocumentToolError("O arquivo está vazio.")
    const type = await fileTypeFromBuffer(buffer)
    if (type?.mime === 'application/pdf') return { kind: 'pdf', ext: 'pdf', mime: type.mime }
    if (type && IMAGE_MIMES[type.mime]) {
        await assertSafeImage(buffer)
        return { kind: 'image', ext: IMAGE_MIMES[type.mime], mime: type.mime }
    }
    if (type && OFFICE_MIMES[type.mime]) return { kind: 'office', ext: OFFICE_MIMES[type.mime], mime: type.mime }
    if (!type && buffer.subarray(0, 5).toString('latin1') === '{\\rtf') return { kind: 'office', ext: 'rtf', mime: 'application/rtf' }
    if (!type && looksLikeText(buffer)) return { kind: 'text', ext: 'txt', mime: 'text/plain' }
    throw new DocumentToolError("Formato não suportado. Envie PDF, imagem (JPG/PNG/WEBP), DOCX/DOC/ODT/RTF/XLSX ou TXT.")
}

/** Rejeita imagens gigantes (bomba de descompressão) antes de qualquer processamento. */
export async function assertSafeImage(buffer: Buffer) {
    let meta
    try {
        meta = await sharp(buffer, { limitInputPixels: DOC_LIMITS.maxImagePixels }).metadata()
    } catch {
        throw new DocumentToolError("Imagem inválida ou grande demais.")
    }
    const w = meta.width ?? 0, h = meta.height ?? 0
    if (!w || !h || w > DOC_LIMITS.maxImageSide || h > DOC_LIMITS.maxImageSide || w * h > DOC_LIMITS.maxImagePixels) {
        throw new DocumentToolError("Imagem com dimensões grandes demais.")
    }
}

/**
 * Intervalo de páginas digitado pelo usuário ("1-3,5,8-") → texto seguro para o qpdf.
 * Só aceita dígitos, vírgulas e hífens; valida contra o total de páginas.
 */
export function parsePageRange(input: string, totalPages: number): string {
    const clean = input.replace(/\s+/g, '')
    if (!/^\d+(-\d*)?(,\d+(-\d*)?)*$/.test(clean)) throw new DocumentToolError("Intervalo de páginas inválido. Exemplo: 1-3,5")
    const parts = clean.split(',').map(part => {
        const [startText, endText] = part.split('-')
        const start = Number(startText)
        const end = part.includes('-') ? (endText ? Number(endText) : totalPages) : start
        if (start < 1 || end < start || end > totalPages) throw new DocumentToolError(`Página fora do documento (ele tem ${totalPages} página(s)).`)
        return start === end ? `${start}` : `${start}-${end}`
    })
    return parts.join(',')
}
