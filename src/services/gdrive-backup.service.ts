import { showConsoleError } from "../utils/general.util.js"
import * as drive from "../utils/gdrive.util.js"
import { BackupService, BACKUP_CHECK_MS } from "./backup.service.js"

/*
 * Cópia dos backups para o Google Drive. O backup local continua sendo feito às 4h (BackupService);
 * aqui, a cada 5 minutos, os backups locais que ainda não estão no Drive são enviados. Assim:
 * - sem internet às 4h: o backup local é feito e sobe para o Drive quando a internet voltar;
 * - sem energia às 4h: ao ligar, o backup local é feito e enviado logo em seguida.
 * No Drive ficam os GDRIVE_KEEP mais recentes (padrão: o mesmo de BACKUP_KEEP).
 */

const BACKUP_NAME = /^sinforoso-backup-.*\.tar\.gz$/

export interface DriveStatus { configured: boolean, linked: boolean, uploaded: number, lastUpload?: number, lastError?: string, linking: boolean }

export type LinkOutcome = { status: 'ok' } | { status: 'denied' | 'expired' } | { status: 'error', message: string }

export class DriveBackupService {
    private static instance: DriveBackupService
    private timer?: ReturnType<typeof setInterval>
    private syncing?: Promise<number>
    private linking = false

    static getInstance() {
        if (!DriveBackupService.instance) DriveBackupService.instance = new DriveBackupService()
        return DriveBackupService.instance
    }

    constructor(
        private readonly config: () => drive.DriveConfig = drive.driveConfig,
        private readonly backups: () => BackupService = () => BackupService.getInstance(),
        private readonly sleep: (ms: number) => Promise<void> = ms => new Promise(r => { const t = setTimeout(r, ms); t.unref?.() }),
    ) {}

    private state() { return drive.readDriveState(this.config().stateFile) }
    private save(state: drive.DriveState) { drive.writeDriveState(state, this.config().stateFile) }

    status(): DriveStatus {
        const state = this.state()
        return { configured: drive.isDriveConfigured(this.config()), linked: Boolean(state.refresh_token), uploaded: state.uploaded.length, lastUpload: state.last_upload, lastError: state.last_error, linking: this.linking }
    }

    /**
     * Começa a conexão: devolve o código para o dono digitar em google.com/device e fica consultando
     * o Google em segundo plano até ele autorizar (ou o código vencer). onDone avisa o resultado.
     */
    async startLink(onDone: (outcome: LinkOutcome) => Promise<void>): Promise<drive.DeviceCode> {
        if (this.linking) throw new drive.DriveAuthError("Já há uma conexão em andamento. Use o código enviado antes (ou espere ele vencer).")
        const code = await drive.requestDeviceCode(this.config())
        this.linking = true
        void this.pollUntilDone(code).then(onDone, err => onDone({ status: 'error', message: err instanceof Error ? err.message : String(err) }))
            .catch(err => showConsoleError(err, "GDRIVE_LINK"))
            .finally(() => { this.linking = false })
        return code
    }

    private async pollUntilDone(code: drive.DeviceCode): Promise<LinkOutcome> {
        const deadline = Date.now() + code.expires_in * 1000
        let interval = Math.max(code.interval || 5, 5) * 1000
        while (Date.now() < deadline) {
            await this.sleep(interval)
            let result: drive.PollResult
            try {
                result = await drive.pollDeviceToken(code.device_code, this.config())
            } catch (err) {
                if (err instanceof drive.DriveAuthError) return { status: 'error', message: err.message }
                continue // rede instável: tenta de novo no próximo intervalo
            }
            if (result.status === 'pending') continue
            if (result.status === 'slow_down') { interval += 5000; continue }
            if (result.status !== 'ok') return { status: result.status }
            const state = this.state()
            this.save({ ...state, refresh_token: result.refreshToken, linked_at: Date.now(), last_error: undefined })
            void this.sync().catch(err => showConsoleError(err, "GDRIVE_SYNC"))
            return { status: 'ok' }
        }
        return { status: 'expired' }
    }

    async unlink(): Promise<boolean> {
        const state = this.state()
        if (!state.refresh_token) return false
        await drive.revokeToken(state.refresh_token)
        this.save({ uploaded: state.uploaded })
        return true
    }

    /** Envia os backups locais que faltam (um envio por vez). Devolve quantos subiram. */
    sync(): Promise<number> {
        this.syncing ??= this.doSync().finally(() => { this.syncing = undefined })
        return this.syncing
    }

    private async doSync(): Promise<number> {
        const config = this.config()
        let state = this.state()
        if (!drive.isDriveConfigured(config) || !state.refresh_token) return 0
        const local = this.backups().list().slice(0, config.keep).reverse() // mais antigo primeiro
        const pending = local.filter(file => !state.uploaded.includes(file.name))
        if (!pending.length) return 0

        let token: string
        try {
            token = await drive.accessToken(state.refresh_token, config)
        } catch (err) {
            if (err instanceof drive.DriveAuthError) {
                this.save({ ...state, refresh_token: undefined, last_error: err.message })
                console.log(`\x1b[33m[BACKUP]\x1b[0m ${err.message}`)
                return 0
            }
            this.save({ ...state, last_error: `Sem conexão com o Google (${err instanceof Error ? err.message : String(err)}). Tento de novo em 5 minutos.` })
            return 0
        }

        let sent = 0
        try {
            const folderId = await drive.ensureFolder(token, config.folderName, state.folder_id)
            state = { ...state, folder_id: folderId }
            for (const file of pending) {
                await drive.uploadFile(token, folderId, file.path)
                state = { ...state, uploaded: [...state.uploaded, file.name], last_upload: Date.now(), last_error: undefined }
                this.save(state)
                sent++
                console.log(`\x1b[36m[BACKUP]\x1b[0m Enviado ao Google Drive: ${file.name}`)
            }
            await this.rotate(token, folderId, config.keep)
        } catch (err) {
            this.save({ ...state, last_error: `Falha ao enviar ao Google Drive (${err instanceof Error ? err.message : String(err)}). Tento de novo em 5 minutos.` })
            showConsoleError(err, "GDRIVE_UPLOAD")
        }
        return sent
    }

    /** No Drive ficam só os "keep" backups mais recentes (apenas arquivos criados pelo bot). */
    private async rotate(token: string, folderId: string, keep: number) {
        const files = (await drive.listBackups(token, folderId)).filter(f => BACKUP_NAME.test(f.name))
        for (const old of files.slice(keep)) await drive.deleteFile(token, old.id)
    }

    /** Verifica agora e depois a cada 5 minutos. */
    start() {
        if (this.timer || !drive.isDriveConfigured(this.config())) return
        const check = () => this.sync().catch(err => showConsoleError(err, "GDRIVE_SYNC"))
        // Espera um pouco no início para o backup de recuperação (feito ao ligar) terminar
        const first = setTimeout(check, 60_000); first.unref?.()
        this.timer = setInterval(check, BACKUP_CHECK_MS)
        this.timer.unref?.()
    }

    stop() {
        if (this.timer) clearInterval(this.timer)
        this.timer = undefined
    }
}
