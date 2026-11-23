import { WASocket } from "baileys"
import fs from "node:fs"
import moment from "moment-timezone"
import { Bot } from "../interfaces/bot.interface.js"
import { Group } from "../interfaces/group.interface.js"
import { Message } from "../interfaces/message.interface.js"
import { buildText } from "../utils/general.util.js"
import * as waUtil from "../utils/whatsapp.util.js"
import { TZ } from "../utils/reminder.util.js"
import { BackupService, backupConfig, formatBytes } from "../services/backup.service.js"
import { DriveBackupService, LinkOutcome } from "../services/gdrive-backup.service.js"
import { driveConfig, isDriveConfigured } from "../utils/gdrive.util.js"
import { backupTexts as t } from "./admin.backup.texts.commands.js"

/** Limite para enviar o backup pelo próprio WhatsApp. */
export const MAX_SEND_BACKUP_BYTES = 100 * 1024 * 1024

async function reply(client: WASocket, message: Message, text: string): Promise<void> {
    await waUtil.replyText(client, message.chat_id, text, message.wa_message, { expiration: message.expiration })
}

const when = (ms: number) => moment.tz(ms, TZ).format('DD/MM/YYYY HH:mm')

function linkOutcomeText(outcome: LinkOutcome): string {
    if (outcome.status === 'error') return buildText(t.backup.msgs.drive_error, outcome.message)
    if (outcome.status === 'ok') return buildText(t.backup.msgs.drive_linked, driveConfig().folderName)
    return buildText(outcome.status === 'denied' ? t.backup.msgs.drive_denied : t.backup.msgs.drive_expired)
}

/** !backup drive [status|agora|desconectar] — só no privado. */
export async function backupDrive(client: WASocket, message: Message, option: string) {
    if (message.isGroupMsg) throw new Error(t.backup.msgs.drive_private)
    if (!isDriveConfigured()) throw new Error(t.backup.msgs.drive_not_configured)
    const service = DriveBackupService.getInstance()
    if (option === 'status') {
        const s = service.status()
        const error = s.lastError ? buildText(t.backup.msgs.drive_status_error, s.lastError) : ''
        return reply(client, message, buildText(t.backup.msgs.drive_status, s.linked ? 'sim ✅' : 'não ❌', s.uploaded, s.lastUpload ? when(s.lastUpload) : '-', driveConfig().folderName, error))
    }
    if (option === 'agora' || option === 'enviar') {
        if (!service.status().linked) throw new Error(buildText(t.backup.msgs.drive_not_linked))
        const sent = await service.sync()
        const s = service.status()
        if (!sent && s.lastError) throw new Error(s.lastError)
        return reply(client, message, sent ? buildText(t.backup.msgs.drive_sync_done, sent) : t.backup.msgs.drive_sync_none)
    }
    if (option === 'desconectar' || option === 'sair') {
        return reply(client, message, await service.unlink() ? t.backup.msgs.drive_unlinked : buildText(t.backup.msgs.drive_not_linked))
    }
    const chatId = message.chat_id
    const code = await service.startLink(async outcome => {
        await waUtil.sendText(client, chatId, linkOutcomeText(outcome)).catch(() => undefined)
    })
    await reply(client, message, buildText(t.backup.msgs.drive_code, code.verification_url, code.user_code, Math.round(code.expires_in / 60)))
}

export async function backupCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const service = BackupService.getInstance()
    const config = backupConfig()
    const option = (message.args[0] ?? '').toLowerCase()

    if (!option || option === 'agora') {
        await reply(client, message, t.backup.msgs.wait)
        const file = await service.create()
        return reply(client, message, buildText(t.backup.msgs.reply_created, file.name, formatBytes(file.size), config.backupDir, service.list().length))
    }
    if (option === 'lista' || option === 'listar') {
        const files = service.list()
        if (!files.length) return reply(client, message, buildText(t.backup.msgs.reply_list_empty))
        let text = buildText(t.backup.msgs.reply_list_title, files.length, config.backupDir)
        for (const f of files) text += buildText(t.backup.msgs.reply_list_item, when(f.created), formatBytes(f.size))
        return reply(client, message, text + buildText(t.backup.msgs.reply_next, config.hour))
    }
    if (option === 'drive') return backupDrive(client, message, (message.args[1] ?? '').toLowerCase())
    if (option === 'enviar') {
        if (message.isGroupMsg) throw new Error(t.backup.msgs.error_private)
        const latest = service.list()[0] ?? await service.create()
        if (latest.size > MAX_SEND_BACKUP_BYTES) throw new Error(buildText(t.backup.msgs.error_too_big, formatBytes(latest.size), config.backupDir))
        const buffer = await fs.promises.readFile(latest.path)
        await waUtil.replyDocumentFromBuffer(client, message.chat_id, buffer, latest.name, 'application/gzip', buildText(t.backup.msgs.send_caption, when(latest.created)), message.wa_message, { expiration: message.expiration })
        return
    }
    throw new Error(buildText(t.backup.msgs.error_option))
}
