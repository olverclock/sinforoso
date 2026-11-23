import axios, { AxiosError } from "axios"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { HTTP_TIMEOUT } from "./general.util.js"

/*
 * Cliente da API oficial do storage.to (https://storage.to/docs/api) para gerar links de download
 * dos arquivos enviados no WhatsApp. Uso da API oficial permitido nos termos (https://storage.to/terms).
 *
 * Fluxo oficial: POST /upload/init → PUT dos bytes no endereço pré-assinado (multipart acima de
 * 50 MB) → POST /upload/confirm, que devolve o link. Sem conta: 50 arquivos/24 h por IP, expira em
 * 3 dias (até 7). Com STORAGETO_API_TOKEN (conta grátis) não há limite diário de arquivos.
 */

const API = "https://storage.to/api"
/** Tipos recusados pelo storage.to (https://storage.to/docs/file-types). */
export const BLOCKED_EXTENSIONS = ['exe', 'scr', 'com', 'pif', 'apk', 'ipa']
export const MAX_EXPIRY_DAYS = 7
export const DEFAULT_EXPIRY_DAYS = 3

export interface UploadResult { id: string, url: string, filename: string, humanSize?: string, expiresAt?: string, ownerToken?: string }

export class StorageToError extends Error { }

/** Token de visitante: gerado uma vez e guardado em storage/ (identifica os envios do bot sem conta). */
function visitorToken(): string {
    const file = path.resolve('storage', 'storageto-visitor.txt')
    try {
        const saved = fs.readFileSync(file, 'utf8').trim()
        if (/^[a-f0-9]{32,}$/.test(saved)) return saved
    } catch { /* ainda não existe */ }
    const token = crypto.randomBytes(24).toString('hex')
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, token, { mode: 0o600 }) } catch { /* usa só nesta execução */ }
    return token
}

function headers(extra: Record<string, string> = {}) {
    const apiToken = process.env.STORAGETO_API_TOKEN?.trim()
    return {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Visitor-Token': visitorToken(),
        ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
        ...extra,
    }
}

/** Mensagem amigável para os erros documentados ({ success: false, error }). */
function friendly(err: unknown): StorageToError {
    if (err instanceof StorageToError) return err
    const response = (err as AxiosError<{ error?: string }>).response
    const status = response?.status
    if (status === 429) return new StorageToError("O limite gratuito do storage.to foi atingido (50 arquivos por dia sem conta). Tente mais tarde.")
    if (status === 422 && response?.data?.error) return new StorageToError(`O storage.to recusou o arquivo: ${response.data.error}`)
    if (status && status >= 500) return new StorageToError("O storage.to está com instabilidade agora. Tente de novo em alguns minutos.")
    return new StorageToError("Não foi possível enviar o arquivo ao storage.to.")
}

/** Nome seguro para o arquivo (sem caminho, sem caracteres de controle, até 255 caracteres). */
export function safeFilename(name: string): string {
    const base = path.basename(name.replace(/\\/g, '/')).replace(/[\x00-\x1f<>:"|?*]/g, '_').replace(/^\.+/, '').trim()
    return (base || 'arquivo').slice(0, 255)
}

export function extensionOf(filename: string): string {
    return path.extname(filename).slice(1).toLowerCase()
}

/** Envia o arquivo e devolve o link. `days` (1–7) e `password` (4–100) são opcionais. */
export async function uploadToStorageTo(buffer: Buffer, filename: string, contentType: string, opts: { days?: number, password?: string } = {}): Promise<UploadResult> {
    const name = safeFilename(filename)
    if (BLOCKED_EXTENSIONS.includes(extensionOf(name))) throw new StorageToError(`O storage.to não aceita arquivos .${extensionOf(name)} (regra deles contra malware).`)
    if (!buffer.length) throw new StorageToError("O arquivo está vazio.")
    const base = { filename: name, content_type: contentType || 'application/octet-stream', size: buffer.length }
    try {
        const { data: init } = await axios.post(`${API}/upload/init`, base, { headers: headers(), timeout: HTTP_TIMEOUT.api })
        if (init.type === 'multipart') await uploadMultipart(buffer, init)
        else await axios.put(init.upload_url, buffer, { headers: { 'Content-Type': base.content_type }, timeout: HTTP_TIMEOUT.media, maxBodyLength: Infinity, maxContentLength: Infinity })
        const { data: confirmed } = await axios.post(`${API}/upload/confirm`, { ...base, r2_key: init.r2_key }, { headers: headers(), timeout: HTTP_TIMEOUT.api })
        const file = confirmed.file
        const owner = { Authorization: `Owner ${confirmed.owner_token}` }
        let expiresAt: string | undefined = file.expires_at
        if (opts.days && opts.days !== DEFAULT_EXPIRY_DAYS) {
            const { data } = await axios.post(`${API}/file/${file.id}/expiry`, { days: opts.days }, { headers: headers(owner), timeout: HTTP_TIMEOUT.api })
            expiresAt = data?.file?.expires_at ?? data?.expires_at ?? expiresAt
        }
        if (opts.password) await axios.post(`${API}/file/${file.id}/password`, { password: opts.password }, { headers: headers(owner), timeout: HTTP_TIMEOUT.api })
        return { id: file.id, url: file.url, filename: file.filename, humanSize: file.human_size, expiresAt, ownerToken: confirmed.owner_token }
    } catch (err) {
        throw friendly(err)
    }
}

/** Apaga um arquivo enviado (DELETE /file/{id}), provando a posse com o owner_token. */
export async function deleteFromStorageTo(id: string, ownerToken: string): Promise<void> {
    if (!/^[A-Za-z0-9]{4,20}$/.test(id)) throw new StorageToError("Identificador de arquivo inválido.")
    try {
        await axios.delete(`${API}/file/${id}`, { headers: headers({ Authorization: `Owner ${ownerToken}` }), timeout: HTTP_TIMEOUT.api })
    } catch (err) {
        throw friendly(err)
    }
}

interface MultipartInit { upload_id: string, part_size: number, total_parts: number, initial_urls: Record<string, string>, owner_token?: string }

/** Multipart (arquivos acima de 50 MB): envia cada parte, pede URLs que faltarem e finaliza com os ETags. */
async function uploadMultipart(buffer: Buffer, init: MultipartInit) {
    const owner: Record<string, string> = init.owner_token ? { Authorization: `Owner ${init.owner_token}` } : {}
    const urls = new Map<number, string>(Object.entries(init.initial_urls ?? {}).map(([n, url]) => [Number(n), url]))
    const missing = Array.from({ length: init.total_parts }, (_, i) => i + 1).filter(n => !urls.has(n))
    if (missing.length) {
        const { data } = await axios.post(`${API}/upload/parts`, { upload_id: init.upload_id, part_numbers: missing }, { headers: headers(owner), timeout: HTTP_TIMEOUT.api })
        for (const part of data.part_urls as { partNumber: number, url: string }[]) urls.set(part.partNumber, part.url)
    }
    const parts: { partNumber: number, etag: string }[] = []
    try {
        for (let n = 1; n <= init.total_parts; n++) {
            const chunk = buffer.subarray((n - 1) * init.part_size, n * init.part_size)
            const response = await axios.put(urls.get(n)!, chunk, { timeout: HTTP_TIMEOUT.media, maxBodyLength: Infinity, maxContentLength: Infinity })
            const etag = response.headers?.etag as string | undefined
            if (!etag) throw new StorageToError("O storage.to não confirmou uma parte do envio.")
            parts.push({ partNumber: n, etag })
        }
        await axios.post(`${API}/upload/complete-multipart`, { upload_id: init.upload_id, parts }, { headers: headers(owner), timeout: HTTP_TIMEOUT.api })
    } catch (err) {
        // Cancela o envio parcial no servidor deles
        await axios.post(`${API}/upload/abort`, { upload_id: init.upload_id }, { headers: headers(owner), timeout: HTTP_TIMEOUT.api }).catch(() => undefined)
        throw err
    }
}
