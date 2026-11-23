import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { pipeline } from "node:stream/promises"
import moment from "moment-timezone"
import { showConsoleError } from "../utils/general.util.js"
import { TZ } from "../utils/reminder.util.js"

/*
 * Backup automático da pasta storage/ (bancos, sessão e configurações) em .tar.gz.
 *
 * - Todo dia às 4h (BACKUP_HOUR), horário de Brasília.
 * - Se o bot estava desligado ou sem energia às 4h, o backup é feito assim que ele liga, e a
 *   verificação a cada 5 minutos cobre o caso de ter perdido o horário por outro motivo.
 *   O backup é local: não depende de internet.
 * - Grava primeiro num arquivo ".partial" e só renomeia no fim: uma queda de energia no meio
 *   nunca deixa um backup quebrado parecendo bom.
 * - Mantém os últimos BACKUP_KEEP (7) e apaga os mais antigos.
 * Formato tar (ustar, POSIX) gerado aqui mesmo, sem biblioteca extra; abre com "tar -xzf".
 */

export const BACKUP_CHECK_MS = 5 * 60_000
const FILE_PREFIX = 'sinforoso-backup-'
const FILE_SUFFIX = '.tar.gz'
/** Pastas de storage/ que não entram no backup (só temporários). */
const EXCLUDED_DIRS = new Set(['temp'])

export interface BackupConfig { sourceDir: string, backupDir: string, hour: number, keep: number }

export function backupConfig(): BackupConfig {
    const hour = Number(process.env.BACKUP_HOUR ?? 4)
    const keep = Number(process.env.BACKUP_KEEP ?? 7)
    return {
        sourceDir: path.resolve('storage'),
        backupDir: path.resolve(process.env.BACKUP_DIR?.trim() || 'backups'),
        hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 4,
        keep: Number.isInteger(keep) && keep >= 1 ? Math.min(keep, 365) : 7,
    }
}

export interface BackupFile { name: string, path: string, size: number, created: number }

// ———————————————— Formato tar (ustar) ————————————————
function octal(value: number, length: number): string {
    return value.toString(8).padStart(length - 1, '0') + '\0'
}

/** Cabeçalho de 512 bytes; nomes longos usam o campo "prefix" do ustar (até 255 bytes). */
export function tarHeader(name: string, size: number, mtimeMs: number, type: 'file' | 'dir'): Buffer {
    const header = Buffer.alloc(512)
    let entryName = name, prefix = ''
    if (Buffer.byteLength(name) > 100) {
        const cut = name.lastIndexOf('/', name.length - 2)
        prefix = name.slice(0, cut); entryName = name.slice(cut + 1)
        if (cut <= 0 || Buffer.byteLength(entryName) > 100 || Buffer.byteLength(prefix) > 155) throw new Error(`Caminho longo demais para o backup: ${name}`)
    }
    header.write(entryName, 0, 100, 'utf8')
    header.write(octal(type === 'dir' ? 0o755 : 0o644, 8), 100, 'ascii')
    header.write(octal(0, 8), 108, 'ascii')
    header.write(octal(0, 8), 116, 'ascii')
    header.write(octal(type === 'dir' ? 0 : size, 12), 124, 'ascii')
    header.write(octal(Math.floor(mtimeMs / 1000), 12), 136, 'ascii')
    header.write('        ', 148, 'ascii')
    header.write(type === 'dir' ? '5' : '0', 156, 'ascii')
    header.write('ustar\0', 257, 'ascii')
    header.write('00', 263, 'ascii')
    header.write(prefix, 345, 155, 'utf8')
    let sum = 0
    for (const byte of header) sum += byte
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii')
    return header
}

/** Lista arquivos e pastas (caminhos com "/"), pulando os temporários. */
export function listEntries(root: string, base = ''): { rel: string, abs: string, dir: boolean }[] {
    const out: { rel: string, abs: string, dir: boolean }[] = []
    let names: fs.Dirent[]
    try { names = fs.readdirSync(path.join(root, base), { withFileTypes: true }) } catch { return out }
    for (const entry of names.sort((a, b) => a.name.localeCompare(b.name))) {
        const rel = base ? `${base}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
            if (!base && EXCLUDED_DIRS.has(entry.name)) continue
            out.push({ rel, abs: path.join(root, rel), dir: true }, ...listEntries(root, rel))
        } else if (entry.isFile() && !entry.name.endsWith('.partial')) {
            out.push({ rel, abs: path.join(root, rel), dir: false })
        }
    }
    return out
}

async function* tarStream(sourceDir: string, rootName: string): AsyncGenerator<Buffer> {
    yield tarHeader(`${rootName}/`, 0, Date.now(), 'dir')
    for (const entry of listEntries(sourceDir)) {
        if (entry.dir) { yield tarHeader(`${rootName}/${entry.rel}/`, 0, Date.now(), 'dir'); continue }
        let data: Buffer, mtime: number
        try {
            data = await fs.promises.readFile(entry.abs)
            mtime = (await fs.promises.stat(entry.abs)).mtimeMs
        } catch { continue } // arquivo apagado durante o backup
        yield tarHeader(`${rootName}/${entry.rel}`, data.length, mtime, 'file')
        yield data
        if (data.length % 512) yield Buffer.alloc(512 - (data.length % 512))
    }
    yield Buffer.alloc(1024) // dois blocos vazios: fim do arquivo tar
}

// ———————————————— Agenda ————————————————
/** Momento do último horário de backup que já deveria ter acontecido (hoje ou ontem às 4h). */
export function lastScheduledSlot(nowMs: number, hour: number): number {
    const slot = moment.tz(nowMs, TZ).set({ hour, minute: 0, second: 0, millisecond: 0 })
    if (slot.valueOf() > nowMs) slot.subtract(1, 'day')
    return slot.valueOf()
}

export function isBackupDue(nowMs: number, lastBackupMs: number | null, hour: number): boolean {
    return lastBackupMs === null || lastBackupMs < lastScheduledSlot(nowMs, hour)
}

export class BackupService {
    private static instance: BackupService
    private timer?: ReturnType<typeof setInterval>
    private running?: Promise<BackupFile>

    static getInstance() {
        if (!BackupService.instance) BackupService.instance = new BackupService()
        return BackupService.instance
    }

    constructor(private readonly config: () => BackupConfig = backupConfig) {}

    list(): BackupFile[] {
        const { backupDir } = this.config()
        let names: string[]
        try { names = fs.readdirSync(backupDir) } catch { return [] }
        return names
            .filter(n => n.startsWith(FILE_PREFIX) && n.endsWith(FILE_SUFFIX))
            .map(name => {
                const stat = fs.statSync(path.join(backupDir, name))
                return { name, path: path.join(backupDir, name), size: stat.size, created: stat.mtimeMs }
            })
            .sort((a, b) => b.created - a.created)
    }

    /** Faz um backup agora (um por vez: chamadas simultâneas esperam o mesmo). */
    create(nowMs = Date.now()): Promise<BackupFile> {
        this.running ??= this.write(nowMs).finally(() => { this.running = undefined })
        return this.running
    }

    private async write(nowMs: number): Promise<BackupFile> {
        const { sourceDir, backupDir, keep } = this.config()
        if (!fs.existsSync(sourceDir)) throw new Error(`Pasta de dados não encontrada: ${sourceDir}`)
        await fs.promises.mkdir(backupDir, { recursive: true })
        const stamp = moment.tz(nowMs, TZ).format('YYYY-MM-DD_HH-mm-ss')
        const name = `${FILE_PREFIX}${stamp}${FILE_SUFFIX}`
        const finalPath = path.join(backupDir, name)
        const partial = `${finalPath}.partial`
        try {
            await pipeline(tarStream(sourceDir, 'storage'), zlib.createGzip({ level: 6 }), fs.createWriteStream(partial))
            await fs.promises.rename(partial, finalPath)
        } catch (err) {
            await fs.promises.rm(partial, { force: true })
            throw err
        }
        this.rotate(keep)
        const stat = fs.statSync(finalPath)
        return { name, path: finalPath, size: stat.size, created: stat.mtimeMs }
    }

    /** Apaga os backups mais antigos, mantendo "keep", e restos ".partial" de quedas de energia. */
    rotate(keep: number): string[] {
        const { backupDir } = this.config()
        const removed: string[] = []
        for (const old of this.list().slice(keep)) { fs.rmSync(old.path, { force: true }); removed.push(old.name) }
        try {
            for (const n of fs.readdirSync(backupDir)) if (n.endsWith('.partial') && !this.running) fs.rmSync(path.join(backupDir, n), { force: true })
        } catch { /* pasta ainda não existe */ }
        return removed
    }

    /** Faz o backup se o horário de hoje (ou de ontem) passou sem backup. */
    async runIfDue(nowMs = Date.now()): Promise<BackupFile | null> {
        const last = this.list()[0]?.created ?? null
        if (!isBackupDue(nowMs, last, this.config().hour)) return null
        const file = await this.create(nowMs)
        console.log(`\x1b[36m[BACKUP]\x1b[0m Backup criado: ${file.name} (${formatBytes(file.size)}).`)
        return file
    }

    /** Verifica agora (recupera o backup perdido) e depois a cada 5 minutos. */
    start() {
        if (process.env.BACKUP_ENABLED === '0' || this.timer) return
        const check = () => this.runIfDue().catch(err => showConsoleError(err, "BACKUP"))
        void check()
        this.timer = setInterval(check, BACKUP_CHECK_MS)
        this.timer.unref?.()
    }

    stop() {
        if (this.timer) clearInterval(this.timer)
        this.timer = undefined
    }
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}
