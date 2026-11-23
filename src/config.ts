import { pino } from 'pino'
import { isJidBroadcast, AuthenticationState, WAVersion, UserFacingSocketConfig, Browsers, WAMessageKey, makeCacheableSignalKeyStore } from 'baileys'
import NodeCache from 'node-cache'
import { getMessageFromCache } from './utils/whatsapp.util.js'
import { baileysLogHooks } from './utils/console-filter.util.js'

const PINO_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']
function baileysLogLevel(): string {
    const level = process.env.BAILEYS_LOG_LEVEL?.trim().toLowerCase() ?? 'silent'
    return PINO_LEVELS.includes(level) ? level : 'silent'
}

export default function configSocket(state: AuthenticationState, retryCache: NodeCache, version: WAVersion, messageCache: NodeCache) {
    // Hook oficial do pino (docs/api.md, "logMethod"): deixa de registrar só o erro do Baileys que o
    // bot já trata (pedido <digest>); o próprio bot registra uma linha clara quando atende o pedido
    const logger = pino({ level: baileysLogLevel(), hooks: baileysLogHooks as unknown as pino.LoggerOptions['hooks'] })
    const config: UserFacingSocketConfig = {
        // Cache das chaves em memória, como recomenda o README do Baileys: menos leituras no banco
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
        version,
        msgRetryCounterCache: retryCache,
        defaultQueryTimeoutMs: 60000,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        qrTimeout: undefined,
        browser: Browsers.ubuntu('Sinforoso'),
        // Diagnóstico: BAILEYS_LOG_LEVEL=warn (ou info) no .env mostra os avisos internos do Baileys
        logger,
        shouldIgnoreJid: (jid: string) => isJidBroadcast(jid) || jid?.endsWith('@newsletter'),
        getMessage: async (key: WAMessageKey) => {
            const message = (key.id) ? getMessageFromCache(key.id, messageCache) : undefined
            return message
        }
    }

    return config
}