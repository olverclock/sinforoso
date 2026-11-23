import { installConsoleFilter } from "./utils/console-filter.util.js"
// Antes de tudo: esconde do log as chaves e o excesso de mensagens internas do libsignal
installConsoleFilter()
import moment from "moment-timezone"
moment.tz.setDefault('America/Sao_Paulo')
import fs from 'fs-extra'
import path from 'path'
import { tmpdir } from 'node:os'

// Configuração de ambiente para organizar arquivos temporários do ytdl-core
process.env.YTDL_DEBUG_PATH = path.resolve('storage/temp/ytdl_debug')
if (!fs.existsSync(process.env.YTDL_DEBUG_PATH)) fs.mkdirSync(process.env.YTDL_DEBUG_PATH, { recursive: true })

/**
 * Função de limpeza de arquivos temporários do YouTube
 */
async function cleanupTempFiles() {
    try {
        // Sobras com mais de 1 hora: mídias de conversões (pasta temporária do sistema) e arquivos do ytdl
        const dirs = [path.join(tmpdir(), 'lbot-whatsapp'), path.join(tmpdir(), 'lbot-whatsapp', 'docs'), ...(process.env.YTDL_DEBUG_PATH ? [process.env.YTDL_DEBUG_PATH] : [])]
        const removed = cleanupOldTempFiles(60 * 60 * 1000, dirs)
        if (removed) console.log(`\x1b[36m[MAINTENANCE]\x1b[0m ${removed} arquivo(s) temporário(s) antigo(s) removido(s).`)
    } catch (err) { }
}

/**
 * Limpeza e Manutenção de databases NeDB (compactação + limpeza de cache)
 * Executa de forma síncrona no startup via instâncias centralizadas
 */
async function runDatabaseMaintenance() {
    try {
        // Importamos as instâncias reais para garantir que não abrimos o mesmo arquivo 2x
        const { db: sessionDb } = await import('./helpers/session.auth.helper.js')
        const { db: usersDb } = await import('./services/user.service.js')
        const { db: groupsDb } = await import('./services/group.service.js')
        const { db: participantsDb } = await import('./services/participant.service.js')
        const { charCacheDb, userCardsDb } = await import('./services/cardgame.service.js')

        const dbs = [sessionDb, usersDb, groupsDb, participantsDb, charCacheDb, userCardsDb]

        // 1. Compactação sequencial usando as instâncias já carregadas
        for (const database of dbs) {
            await database.compactDatafileAsync()
        }

        // 2. Limpeza de cache de personagens com mais de 30 dias sem acesso
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000)
        await charCacheDb.removeAsync({ discovered_at: { $lt: thirtyDaysAgo } }, { multi: true })

        // 3. Limpeza de participantes de grupos que o bot não está mais
        const activeGroups = await groupsDb.findAsync({})
        const activeGroupIds = activeGroups.map((g: { id: string }) => g.id)

        // Remove participantes que não pertencem a nenhum grupo ativo
        await participantsDb.removeAsync({ group_id: { $nin: activeGroupIds } }, { multi: true })

        console.log('\x1b[36m[MAINTENANCE]\x1b[0m Rotina de limpeza e compactação concluída.')
    } catch (err) {
        console.error('[MAINTENANCE] Erro na manutenção de databases:', err)
    }
}

import databaseMigration from './helpers/database.migrate.helper.js'
import connect from './socket.js'
import { BackupService } from './services/backup.service.js'
import { DriveBackupService } from './services/gdrive-backup.service.js'
import ffmpeg from "fluent-ffmpeg"
import { buildText, getCurrentBotVersion, cleanupOldTempFiles } from "./utils/general.util.js"
import botTexts from "./helpers/bot.texts.helper.js"
// FFMPEG_PATH (ex.: /usr/bin/ffmpeg instalado pelo apt no Docker) tem prioridade sobre o binário do npm
const ffmpegFromEnv = process.env.FFMPEG_PATH?.trim()
if (ffmpegFromEnv) {
    ffmpeg.setFfmpegPath(ffmpegFromEnv)
} else {
    import('@ffmpeg-installer/ffmpeg').then((ffmpegInstaller) => {
        ffmpeg.setFfmpegPath(ffmpegInstaller.path)
    }).catch(() => { })
}

async function init() {
    console.log(buildText(botTexts.starting, getCurrentBotVersion()))

    // Limpeza inicial de temporários e depois a cada 1 hora
    await cleanupTempFiles()
    setInterval(cleanupTempFiles, 60 * 60 * 1000) // a cada 1 hora

    // Manutenção de databases (Centralizada via instâncias singleton)
    await runDatabaseMaintenance()
    setInterval(runDatabaseMaintenance, 24 * 60 * 60 * 1000)

    // Garantir que o banco de dados esteja migrado (Baileys v7) antes de conectar
    await databaseMigration()

    // Backup automático da pasta storage/ (4h da manhã; recupera o horário perdido ao ligar).
    // Não depende da conexão com o WhatsApp nem de internet.
    BackupService.getInstance().start()
    // Cópia dos backups no Google Drive (se configurado): sobe quando houver internet
    DriveBackupService.getInstance().start()

    await connect()
}

// Execução principal. Uma falha antes de conectar (ex.: banco corrompido) encerra com código 1,
// de forma explícita, para o Docker reiniciar.
init().catch((err) => {
    console.error('[INIT] Falha ao iniciar o bot:', err)
    process.exit(1)
})
