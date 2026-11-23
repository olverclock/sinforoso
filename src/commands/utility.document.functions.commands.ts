import { downloadMediaMessage, WASocket, WAMessage } from "baileys"
import { Bot } from "../interfaces/bot.interface.js"
import { Group } from "../interfaces/group.interface.js"
import { Message } from "../interfaces/message.interface.js"
import { buildText } from "../utils/general.util.js"
import * as waUtil from "../utils/whatsapp.util.js"
import * as doc from "../utils/document/pdf.util.js"
import { detectFile, DetectedFile } from "../utils/document/validate.util.js"
import { DOC_LIMITS, DocumentToolError } from "../utils/document/tools.util.js"
import { documentQueue } from "../utils/document/queue.util.js"
import { addToSession, getSession, sessionKey, SessionKind, startSession, takeSession } from "../utils/document/session.util.js"
import { documentTexts as t } from "./utility.document.texts.commands.js"
import { DEFAULT_EXPIRY_DAYS, MAX_EXPIRY_DAYS, uploadToStorageTo } from "../utils/storageto.util.js"

const PDF_MIME = 'application/pdf'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
/** Texto maior que isso vai como arquivo .txt em vez de mensagem. */
const MAX_TEXT_MESSAGE = 3500

const opts = (message: Message) => ({ expiration: message.expiration })
async function reply(client: WASocket, message: Message, text: string) {
    await waUtil.replyText(client, message.chat_id, text, message.wa_message, opts(message))
}
async function sendDoc(client: WASocket, message: Message, buffer: Buffer, fileName: string, mime: string, caption = '') {
    await waUtil.replyDocumentFromBuffer(client, message.chat_id, buffer, fileName, mime, caption, message.wa_message, opts(message))
}
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`

/** Nome do documento original, sem extensão e sem caracteres proibidos em nomes de arquivo. */
export function originalBaseName(message: Message): string | undefined {
    const source = message.quotedMessage?.isMedia ? message.quotedMessage.wa_message : (message.isMedia ? message.wa_message : undefined)
    const name = waUtil.unwrapCaptionedDocument(source?.message)?.documentMessage?.fileName
    if (!name) return
    const base = [...name.replace(/\.[^./\\]{1,8}$/, '')].filter(c => c.charCodeAt(0) >= 32).join('')
        .replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 120)
    return base || undefined
}

/** Nome do arquivo gerado: o nome original (com um complemento) ou o nome padrão. */
export function outputName(message: Message, fallback: string, ext: string, suffix = ''): string {
    const base = originalBaseName(message)
    return base ? `${base}${suffix}.${ext}` : fallback
}

/**
 * Páginas em linguagem natural: "10-50", "10 a 50", "da página 10 à 50", "10 até 50" → "10-50";
 * intervalos do qpdf ("1-3,5,8-") passam direto.
 */
export function naturalPageRange(args: string[]): string {
    const text = args.join(' ').trim()
    if (/^[\d,\s-]+$/.test(text) && /[,-]/.test(text)) return text.replace(/\s+/g, '')
    const numbers = text.match(/\d+/g) ?? []
    if (numbers.length === 1) return numbers[0]
    if (numbers.length === 2) return `${numbers[0]}-${numbers[1]}`
    throw new DocumentToolError(buildText(t.pdf.msgs.error_need_pages))
}

/** Arquivo da mensagem: a mídia respondida ou a própria mídia com o comando na legenda. */
export async function inputFile(message: Message): Promise<{ buffer: Buffer, detected: DetectedFile } | null> {
    const source: { media?: { file_length: number | Long }, wa_message: WAMessage } | undefined =
        message.quotedMessage?.isMedia ? message.quotedMessage : (message.isMedia ? message : undefined)
    if (!source) return null
    if (Number(source.media?.file_length ?? 0) > DOC_LIMITS.maxInputBytes) {
        throw new DocumentToolError(`O arquivo passa do limite de ${Math.round(DOC_LIMITS.maxInputBytes / 1024 / 1024)} MB.`)
    }
    const buffer = await downloadMediaMessage(source.wa_message, "buffer", {})
    return { buffer, detected: await detectFile(buffer) }
}

/** Coloca o trabalho na fila do motor e avisa o usuário (espera ou posição na fila). */
async function queued<T>(client: WASocket, message: Message, work: () => Promise<T>): Promise<T> {
    const job = documentQueue.enqueue(sessionKey(message.chat_id, message.sender), work)
    await reply(client, message, job.position > 0 ? buildText(t.pdf.msgs.queued, job.position + 1) : t.pdf.msgs.wait)
    return job.result
}

async function requirePdf(message: Message): Promise<Buffer> {
    const file = await inputFile(message)
    if (!file || file.detected.kind !== 'pdf') throw new DocumentToolError(buildText(t.pdf.msgs.error_need_pdf))
    return file.buffer
}

type PdfAction = (client: WASocket, message: Message, args: string[]) => Promise<void>

const PDF_ACTIONS: Record<string, PdfAction> = {
    info: async (client, message) => {
        const pdf = await requirePdf(message)
        const info = await doc.pdfInfo(pdf)
        await reply(client, message, buildText(t.pdf.msgs.info, info.encrypted && !info.pages ? '?' : info.pages, mb(info.sizeBytes), info.encrypted ? 'sim' : 'não', info.title ?? '-', info.author ?? '-', info.pageSize ?? '-'))
    },
    texto: async (client, message) => {
        const pdf = await requirePdf(message)
        const text = await queued(client, message, () => doc.pdfText(pdf))
        if (!doc.hasRealText(text)) return reply(client, message, buildText(t.pdf.msgs.text_empty))
        await sendLongText(client, message, t.pdf.msgs.text_title, text)
    },
    extrair: async (client, message, args) => {
        if (!args[0]) throw new DocumentToolError(buildText(t.pdf.msgs.error_need_pages))
        const range = naturalPageRange(args)
        const pdf = await requirePdf(message)
        const result = await queued(client, message, () => doc.extractPages(pdf, range))
        await sendDoc(client, message, result, outputName(message, 'paginas.pdf', 'pdf', ` (páginas ${range})`), PDF_MIME, buildText(t.pdf.msgs.extracted, range))
    },
    separar: async (client, message, args) => PDF_ACTIONS.extrair(client, message, args),
    ocr: async (client, message) => ocrpdfFlow(client, message),
    remover: async (client, message, args) => {
        if (!args[0]) throw new DocumentToolError(buildText(t.pdf.msgs.error_need_pages))
        const pdf = await requirePdf(message)
        await sendDoc(client, message, await queued(client, message, () => doc.removePages(pdf, naturalPageRange(args))), outputName(message, 'sem-paginas.pdf', 'pdf', ' (sem páginas)'), PDF_MIME, t.pdf.msgs.done)
    },
    dividir: async (client, message, args) => {
        const pdf = await requirePdf(message)
        const size = Number(args[0] ?? 1)
        if (!Number.isInteger(size) || size < 1) throw new DocumentToolError("Use um número inteiro de páginas por parte. Ex: *dividir 10*")
        const parts = await queued(client, message, () => doc.splitPdf(pdf, size))
        for (const [i, part] of parts.entries()) await sendDoc(client, message, part, outputName(message, `parte-${String(i + 1).padStart(2, '0')}.pdf`, 'pdf', ` - parte ${String(i + 1).padStart(2, '0')}`), PDF_MIME)
        await reply(client, message, buildText(t.pdf.msgs.split_done, parts.length))
    },
    girar: async (client, message, args) => {
        const pdf = await requirePdf(message)
        const degrees = Number(args[0] ?? 90)
        await sendDoc(client, message, await queued(client, message, () => doc.rotatePdf(pdf, degrees, args[1])), outputName(message, 'girado.pdf', 'pdf', ' (girado)'), PDF_MIME, t.pdf.msgs.done)
    },
    comprimir: async (client, message, args) => {
        const profile = (args[0]?.toLowerCase() ?? 'media').replace('média', 'media') as doc.CompressProfile
        if (!['alta', 'media', 'baixa'].includes(profile)) throw new DocumentToolError("Use *alta*, *media* ou *baixa*.")
        const pdf = await requirePdf(message)
        const result = await queued(client, message, () => doc.compressPdf(pdf, profile))
        if (result.after >= result.before) return reply(client, message, t.pdf.msgs.compressed_none)
        const percent = Math.round((1 - result.after / result.before) * 100)
        await sendDoc(client, message, result.pdf, outputName(message, 'comprimido.pdf', 'pdf', ' (comprimido)'), PDF_MIME, buildText(t.pdf.msgs.compressed, mb(result.before), mb(result.after), percent))
    },
    imagens: async (client, message, args) => {
        const pdf = await requirePdf(message)
        const format = args.includes('png') ? 'png' : 'jpg'
        const range = args.find(arg => /^\d/.test(arg))
        const images = await queued(client, message, () => doc.pdfToImages(pdf, format, range))
        for (const image of images) await waUtil.replyFileFromBuffer(client, message.chat_id, 'imageMessage', image, '', message.wa_message, opts(message))
    },
    pesquisavel: async (client, message) => {
        const pdf = await requirePdf(message)
        await sendDoc(client, message, await queued(client, message, () => doc.searchablePdf({ pdf })), outputName(message, 'pesquisavel.pdf', 'pdf', ' (pesquisável)'), PDF_MIME, t.pdf.msgs.done)
    },
    proteger: async (client, message, args) => {
        if (!args[0]) throw new DocumentToolError(buildText(t.pdf.msgs.error_need_password))
        const pdf = await requirePdf(message)
        await sendDoc(client, message, await queued(client, message, () => doc.protectPdf(pdf, args[0])), outputName(message, 'protegido.pdf', 'pdf', ' (protegido)'), PDF_MIME, t.pdf.msgs.done)
    },
    desproteger: async (client, message, args) => {
        if (!args[0]) throw new DocumentToolError(buildText(t.pdf.msgs.error_need_password))
        const pdf = await requirePdf(message)
        await sendDoc(client, message, await queued(client, message, () => doc.unlockPdf(pdf, args[0])), outputName(message, 'sem-senha.pdf', 'pdf', ' (sem senha)'), PDF_MIME, t.pdf.msgs.done)
    },
    juntar: async (client, message) => openSession(client, message, 'merge'),
    fotos: async (client, message) => openSession(client, message, 'images'),
    pronto: async (client, message) => finishSession(client, message),
    cancelar: async (client, message) => {
        const key = sessionKey(message.chat_id, message.sender)
        const had = Boolean(takeSession(key)) || documentQueue.cancel(key)
        await reply(client, message, had ? t.pdf.msgs.session_cancelled : buildText(t.pdf.msgs.session_none))
    },
}

async function sendLongText(client: WASocket, message: Message, title: string, text: string) {
    if (text.length <= MAX_TEXT_MESSAGE) return reply(client, message, title + text)
    await sendDoc(client, message, Buffer.from(text, 'utf8'), 'texto.txt', 'text/plain', t.ocr.msgs.sent_as_file)
}

async function openSession(client: WASocket, message: Message, kind: SessionKind) {
    startSession(sessionKey(message.chat_id, message.sender), kind)
    await reply(client, message, buildText(kind === 'merge' ? t.pdf.msgs.session_merge : t.pdf.msgs.session_images))
}

async function finishSession(client: WASocket, message: Message) {
    const session = takeSession(sessionKey(message.chat_id, message.sender))
    if (!session) throw new DocumentToolError(buildText(t.pdf.msgs.session_none))
    const min = session.kind === 'merge' ? 2 : 1
    if (session.files.length < min) throw new DocumentToolError(buildText(t.pdf.msgs.session_few, min))
    const files = session.files
    const result = await queued(client, message, () => session.kind === 'merge' ? doc.mergePdfs(files) : doc.imagesToPdf(files))
    await sendDoc(client, message, result, session.kind === 'merge' ? 'juntado.pdf' : 'imagens.pdf', PDF_MIME, t.pdf.msgs.done)
}

/**
 * Recebe arquivos de uma coleta aberta (chamado para toda mensagem com mídia que não é comando).
 * Devolve true quando o arquivo foi aproveitado pela coleta.
 */
/** Uma fila por sessão: arquivos enviados em sequência entram na MESMA ordem, mesmo que um baixe mais rápido. */
const collectChains = new Map<string, Promise<unknown>>()

export function collectSessionFile(client: WASocket, message: Message): Promise<boolean> {
    const key = sessionKey(message.chat_id, message.sender)
    const previous = collectChains.get(key) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(() => collectOne(client, message, key))
    collectChains.set(key, current)
    current.finally(() => { if (collectChains.get(key) === current) collectChains.delete(key) }).catch(() => undefined)
    return current
}

async function collectOne(client: WASocket, message: Message, key: string): Promise<boolean> {
    const session = getSession(key)
    if (!session || !message.isMedia || message.isBotMessage) return false
    if (Number(message.media?.file_length ?? 0) > DOC_LIMITS.maxInputBytes) throw new DocumentToolError("Arquivo grande demais para a coleta.")
    const buffer = await downloadMediaMessage(message.wa_message, "buffer", {})
    const detected = await detectFile(buffer)
    const wanted = session.kind === 'merge' ? 'pdf' : 'image'
    if (detected.kind !== wanted) {
        await reply(client, message, buildText(t.pdf.msgs.session_wrong_type, wanted === 'pdf' ? 'PDF' : 'uma imagem'))
        return true
    }
    const updated = addToSession(key, buffer)
    await reply(client, message, buildText(t.pdf.msgs.session_added, updated.files.length))
    return true
}

// ———————————————— COMANDOS ————————————————
export async function pdfCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const [option, ...args] = message.args
    if (!option) throw new DocumentToolError(buildText(t.pdf.guide))
    const action = PDF_ACTIONS[option.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')]
    if (!action) throw new DocumentToolError(buildText(t.pdf.msgs.error_option))
    await action(client, message, args)
}

export async function ocrCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const file = await inputFile(message)
    if (!file || (file.detected.kind !== 'image' && file.detected.kind !== 'pdf')) throw new DocumentToolError(buildText(t.ocr.msgs.error_need_file))
    const result = await queued(client, message, async () => file.detected.kind === 'image'
        ? { text: await doc.ocrImage(file.buffer), usedOcr: true }
        : doc.ocrPdfText(file.buffer))
    if (!result.text.trim()) return reply(client, message, t.ocr.msgs.empty)
    const title = buildText(t.ocr.msgs.reply, result.usedOcr ? t.ocr.msgs.ocr_note : '', '')
    await sendLongText(client, message, title, result.text)
}

export async function topdfCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const file = await inputFile(message)
    if (!file) {
        if (!message.text_command.trim()) throw new DocumentToolError(buildText(t.topdf.msgs.error_need_file))
        const text = Buffer.from(message.text_command, 'utf8')
        const pdf = await queued(client, message, () => doc.officeToPdf(text, { kind: 'text', ext: 'txt', mime: 'text/plain' }))
        return sendDoc(client, message, pdf, 'texto.pdf', PDF_MIME, t.pdf.msgs.done)
    }
    if (file.detected.kind === 'pdf') throw new DocumentToolError(buildText(t.topdf.msgs.already_pdf))
    const pdf = await queued(client, message, () => file.detected.kind === 'image'
        ? doc.imagesToPdf([file.buffer])
        : doc.officeToPdf(file.buffer, file.detected))
    await sendDoc(client, message, pdf, outputName(message, 'documento.pdf', 'pdf'), PDF_MIME, t.pdf.msgs.done)
}

/** Qualquer arquivo (PDF escaneado, imagem, DOCX, DOC, TXT...) → PDF pesquisável com OCR. */
async function ocrpdfFlow(client: WASocket, message: Message) {
    const file = await inputFile(message)
    if (!file) throw new DocumentToolError(buildText(t.ocrpdf.msgs.error_need_file))
    const { detected, buffer } = file
    const result = await queued(client, message, async () => {
        if (detected.kind === 'image') return { pdf: await doc.searchablePdf({ images: [buffer] }), pages: 1, ocrPages: 1 }
        const pdf = detected.kind === 'pdf' ? buffer : await doc.officeToPdf(buffer, detected)
        return doc.ocrToSearchablePdf(pdf)
    })
    const caption = result.ocrPages
        ? buildText(t.ocrpdf.msgs.done, result.ocrPages, result.pages)
        : buildText(t.ocrpdf.msgs.done_no_ocr, result.pages)
    await sendDoc(client, message, result.pdf, outputName(message, 'documento-ocr.pdf', 'pdf', result.ocrPages ? ' (OCR)' : ''), PDF_MIME, caption)
}

export async function ocrpdfCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    await ocrpdfFlow(client, message)
}

export async function pdfdocxCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const pdf = await requirePdf(message)
    const { docx, usedOcr } = await queued(client, message, () => doc.pdfToDocx(pdf))
    await sendDoc(client, message, docx, outputName(message, 'documento.docx', 'docx'), DOCX_MIME, buildText(t.pdfdocx.msgs.done, usedOcr ? t.pdfdocx.msgs.ocr_note : ''))
}

// ———————————————— COMPARTILHAR (storage.to) ————————————————
const UPLOAD_MAX_MB = Number(process.env.STORAGETO_MAX_MB ?? 100)
const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'application/pdf': 'pdf' }

/** "7 senha" → dias e senha, validando os limites da API do storage.to. */
export function parseUploadArgs(args: string[]): { days?: number, password?: string } {
    const result: { days?: number, password?: string } = {}
    for (const arg of args) {
        if (/^\d+$/.test(arg) && result.days === undefined) {
            const days = Number(arg)
            if (days < 1 || days > MAX_EXPIRY_DAYS) throw new DocumentToolError(buildText(t.upload.msgs.error_days))
            result.days = days
        } else {
            if (result.password !== undefined || !/^\S{4,100}$/.test(arg)) throw new DocumentToolError(t.upload.msgs.error_password)
            result.password = arg
        }
    }
    return result
}

/** Nome do arquivo: o original (documentos) ou um nome com a extensão do tipo. */
function uploadFilename(source: { wa_message: WAMessage }, mimetype: string): string {
    const content = source.wa_message.message
    const original = content?.documentMessage?.fileName ?? content?.documentWithCaptionMessage?.message?.documentMessage?.fileName
    if (original) return original
    const ext = MIME_EXT[mimetype.split(';')[0].trim()] ?? 'bin'
    return `arquivo-${new Date().toISOString().slice(0, 10)}.${ext}`
}

export async function uploadCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const options = parseUploadArgs(message.args)
    const source = message.quotedMessage?.isMedia ? message.quotedMessage : (message.isMedia ? message : undefined)
    if (!source?.media) throw new DocumentToolError(buildText(t.upload.msgs.error_need_file))
    if (Number(source.media.file_length ?? 0) > UPLOAD_MAX_MB * 1024 * 1024) throw new DocumentToolError(buildText(t.upload.msgs.error_size, UPLOAD_MAX_MB))
    const mimetype = source.media.mimetype || 'application/octet-stream'
    await reply(client, message, t.upload.msgs.wait)
    const buffer = await downloadMediaMessage(source.wa_message, "buffer", {})
    const result = await uploadToStorageTo(buffer, uploadFilename(source, mimetype), mimetype, options)
    const expires = result.expiresAt ? new Date(result.expiresAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : `${options.days ?? DEFAULT_EXPIRY_DAYS} dia(s)`
    await reply(client, message, buildText(t.upload.msgs.reply, result.filename, result.humanSize ? ` (${result.humanSize})` : '', result.url, expires, options.password ? t.upload.msgs.password_note : ''))
}
