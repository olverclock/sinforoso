import axios from "axios"
import fs from "node:fs"
import path from "node:path"
import { HTTP_TIMEOUT } from "./general.util.js"

/*
 * Envio dos backups para o Google Drive do dono do bot, pela API oficial (grátis), sem biblioteca extra.
 *
 * - Login pelo "fluxo de dispositivo" do Google (o mesmo de TVs): o bot mostra um código, o dono
 *   abre google.com/device no celular e autoriza. Sem senha no bot, sem servidor web.
 *   Docs: https://developers.google.com/identity/protocols/oauth2/limited-input-device
 * - Permissão mínima "drive.file": o bot só enxerga os arquivos que ele mesmo criou no Drive
 *   (não lê nem apaga mais nada da conta).
 * - Upload "resumable" (recomendado pelo Google para redes instáveis):
 *   https://developers.google.com/workspace/drive/api/guides/manage-uploads
 * Precisa de GDRIVE_CLIENT_ID e GDRIVE_CLIENT_SECRET (cliente OAuth do tipo "TVs e dispositivos de
 * entrada limitada", criado de graça no Google Cloud). O passo a passo está em docs/DOCKER.md.
 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

export interface DriveState {
    refresh_token?: string
    folder_id?: string
    linked_at?: number
    /** Nomes dos backups já enviados (para não reenviar). */
    uploaded: string[]
    last_upload?: number
    last_error?: string
}

export interface DriveConfig { clientId: string, clientSecret: string, folderName: string, keep: number, stateFile: string }

export function driveConfig(): DriveConfig {
    const keep = Number(process.env.GDRIVE_KEEP ?? process.env.BACKUP_KEEP ?? 7)
    return {
        clientId: process.env.GDRIVE_CLIENT_ID?.trim() ?? '',
        clientSecret: process.env.GDRIVE_CLIENT_SECRET?.trim() ?? '',
        folderName: process.env.GDRIVE_FOLDER?.trim() || 'Sinforoso Backups',
        keep: Number.isInteger(keep) && keep >= 1 ? Math.min(keep, 365) : 7,
        stateFile: path.resolve('storage', 'gdrive.json'),
    }
}

export const isDriveConfigured = (c = driveConfig()) => Boolean(c.clientId && c.clientSecret)

export class DriveAuthError extends Error {}

// ———————————————— Estado (token guardado no servidor) ————————————————
export function readDriveState(file = driveConfig().stateFile): DriveState {
    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<DriveState>
        return { ...data, uploaded: Array.isArray(data.uploaded) ? data.uploaded : [] }
    } catch {
        return { uploaded: [] }
    }
}

export function writeDriveState(state: DriveState, file = driveConfig().stateFile) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    // 0600: só o usuário do bot lê o token
    fs.writeFileSync(tmp, JSON.stringify({ ...state, uploaded: state.uploaded.slice(-200) }, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, file)
}

const form = (data: Record<string, string>) => new URLSearchParams(data).toString()
const FORM_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded' }

function googleError(err: unknown): string {
    if (axios.isAxiosError(err)) {
        const data = err.response?.data as { error?: string | { message?: string }, error_description?: string } | undefined
        if (typeof data?.error === 'string') return data.error_description ? `${data.error}: ${data.error_description}` : data.error
        if (data?.error?.message) return data.error.message
        return err.code ?? err.message
    }
    return err instanceof Error ? err.message : String(err)
}

// ———————————————— Login por código (fluxo de dispositivo) ————————————————
export interface DeviceCode { device_code: string, user_code: string, verification_url: string, expires_in: number, interval: number }

export async function requestDeviceCode(c = driveConfig()): Promise<DeviceCode> {
    if (!isDriveConfigured(c)) throw new DriveAuthError("Configure GDRIVE_CLIENT_ID e GDRIVE_CLIENT_SECRET no .env (veja docs/DOCKER.md).")
    try {
        const { data } = await axios.post<DeviceCode>(DEVICE_CODE_URL, form({ client_id: c.clientId, scope: DRIVE_SCOPE }), { headers: FORM_HEADERS, timeout: HTTP_TIMEOUT.api })
        return data
    } catch (err) {
        throw new DriveAuthError(`O Google recusou o pedido de login: ${googleError(err)}`)
    }
}

export type PollResult = { status: 'pending' | 'slow_down' } | { status: 'ok', refreshToken: string } | { status: 'denied' | 'expired' }

/** Uma consulta ao Google: o dono já autorizou? */
export async function pollDeviceToken(deviceCode: string, c = driveConfig()): Promise<PollResult> {
    try {
        const { data } = await axios.post<{ refresh_token?: string }>(TOKEN_URL, form({
            client_id: c.clientId, client_secret: c.clientSecret, device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }), { headers: FORM_HEADERS, timeout: HTTP_TIMEOUT.api })
        if (!data.refresh_token) throw new DriveAuthError("O Google não devolveu o token de acesso permanente.")
        return { status: 'ok', refreshToken: data.refresh_token }
    } catch (err) {
        if (err instanceof DriveAuthError) throw err
        const code = axios.isAxiosError(err) ? (err.response?.data as { error?: string } | undefined)?.error : undefined
        if (code === 'authorization_pending') return { status: 'pending' }
        if (code === 'slow_down') return { status: 'slow_down' }
        if (code === 'access_denied') return { status: 'denied' }
        if (code === 'expired_token') return { status: 'expired' }
        throw new DriveAuthError(`Falha no login do Google: ${googleError(err)}`)
    }
}

/** Token de acesso (1 hora) a partir do token permanente. Token revogado/expirado → DriveAuthError. */
export async function accessToken(refreshToken: string, c = driveConfig()): Promise<string> {
    try {
        const { data } = await axios.post<{ access_token: string }>(TOKEN_URL, form({
            client_id: c.clientId, client_secret: c.clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token',
        }), { headers: FORM_HEADERS, timeout: HTTP_TIMEOUT.api })
        return data.access_token
    } catch (err) {
        const code = axios.isAxiosError(err) ? (err.response?.data as { error?: string } | undefined)?.error : undefined
        if (code === 'invalid_grant' || code === 'invalid_client' || code === 'unauthorized_client') {
            throw new DriveAuthError("O acesso ao Google Drive foi revogado ou expirou. Conecte de novo com: backup drive")
        }
        throw err // rede: tenta de novo depois
    }
}

export async function revokeToken(refreshToken: string): Promise<void> {
    await axios.post(REVOKE_URL, form({ token: refreshToken }), { headers: FORM_HEADERS, timeout: HTTP_TIMEOUT.api }).catch(() => undefined)
}

// ———————————————— Arquivos no Drive ————————————————
const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

export interface DriveFile { id: string, name: string, size?: string, createdTime?: string }

/** Pasta dos backups (criada pelo bot; com drive.file ele só vê o que criou). */
export async function ensureFolder(token: string, name: string, knownId?: string): Promise<string> {
    if (knownId) {
        try {
            const { data } = await axios.get<{ id: string, trashed?: boolean }>(`${FILES_URL}/${knownId}?fields=id,trashed`, { headers: auth(token), timeout: HTTP_TIMEOUT.api })
            if (!data.trashed) return data.id
        } catch (err) {
            if (!(axios.isAxiosError(err) && err.response?.status === 404)) throw err
        }
    }
    const { data } = await axios.post<{ id: string }>(`${FILES_URL}?fields=id`, { name, mimeType: FOLDER_MIME }, { headers: auth(token), timeout: HTTP_TIMEOUT.api })
    return data.id
}

/** Upload resumable: abre a sessão e envia o arquivo inteiro. */
export async function uploadFile(token: string, folderId: string, filePath: string, mimeType = 'application/gzip'): Promise<DriveFile> {
    const body = await fs.promises.readFile(filePath)
    const name = path.basename(filePath)
    const session = await axios.post(UPLOAD_URL, { name, parents: [folderId] }, {
        headers: { ...auth(token), 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mimeType, 'X-Upload-Content-Length': String(body.length) },
        timeout: HTTP_TIMEOUT.api,
    })
    const location = session.headers?.location
    if (typeof location !== 'string') throw new Error("O Google Drive não abriu a sessão de upload.")
    const { data } = await axios.put<DriveFile>(location, body, {
        headers: { 'Content-Type': mimeType, 'Content-Length': String(body.length) },
        timeout: Math.max(HTTP_TIMEOUT.media, 10 * 60_000), maxBodyLength: Infinity, maxContentLength: Infinity,
    })
    return data
}

export async function listBackups(token: string, folderId: string): Promise<DriveFile[]> {
    const q = `'${folderId}' in parents and trashed = false`
    const { data } = await axios.get<{ files: DriveFile[] }>(FILES_URL, {
        params: { q, orderBy: 'createdTime desc', fields: 'files(id,name,size,createdTime)', pageSize: 1000, spaces: 'drive' },
        headers: auth(token), timeout: HTTP_TIMEOUT.api,
    })
    return data.files ?? []
}

export async function deleteFile(token: string, id: string): Promise<void> {
    await axios.delete(`${FILES_URL}/${id}`, { headers: auth(token), timeout: HTTP_TIMEOUT.api })
}
