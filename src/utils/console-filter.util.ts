/*
 * Filtro das mensagens internas do libsignal (criptografia usada pelo Baileys).
 *
 * O libsignal escreve direto no console, a cada renovação de sessão, objetos inteiros com CHAVES
 * PRIVADAS ("Closing session: SessionEntry { ... privKey ... }"). Isso:
 * - grava segredos nos logs do Docker/CasaOS (risco de segurança);
 * - deixa a sincronização inicial lenta, pois pode acontecer milhares de vezes.
 * Aqui essas mensagens são descartadas, e as falhas reais de descriptografia viram uma linha curta,
 * sem chaves nem stack.
 */

/** Mensagens rotineiras do libsignal, descartadas. */
const SILENT_PREFIXES = [
    'Closing session',
    'Closing open session in favor of incoming prekey bundle',
    'Removing old closed session',
    'Decrypted message with closed session',
    'Migrating session to',
]

/** Falhas que valem um aviso curto (sem os objetos com chaves). */
const SHORT_WARNINGS: [string, string][] = [
    ['Failed to decrypt message with any known session', '[CRIPTOGRAFIA] Uma mensagem não pôde ser descriptografada (normal após trocar de aparelho; o WhatsApp reenvia).'],
    ['Session error', '[CRIPTOGRAFIA] Erro de sessão ao descriptografar uma mensagem.'],
]

type ConsoleMethod = (...args: unknown[]) => void

/** Devolve: 'drop' (descartar), uma mensagem curta para exibir, ou null (exibir normalmente). */
export function classifyConsoleMessage(first: unknown): 'drop' | string | null {
    if (typeof first !== 'string') return null
    if (SILENT_PREFIXES.some(prefix => first.startsWith(prefix))) return 'drop'
    const warning = SHORT_WARNINGS.find(([prefix]) => first.startsWith(prefix))
    return warning ? warning[1] : null
}

let installed = false
const recentShort = new Map<string, number>()

/** Instala o filtro em console.info/warn/error/log (uma única vez). */
export function installConsoleFilter() {
    if (installed) return
    installed = true
    for (const method of ['info', 'warn', 'error', 'log'] as const) {
        const original: ConsoleMethod = console[method].bind(console)
        console[method] = (...args: unknown[]) => {
            const verdict = classifyConsoleMessage(args[0])
            if (verdict === 'drop') return
            if (verdict) {
                // No máximo um aviso igual por minuto
                const last = recentShort.get(verdict) ?? 0
                if (Date.now() - last < 60_000) return
                recentShort.set(verdict, Date.now())
                return original(verdict)
            }
            original(...args)
        }
    }
}

/**
 * Erro interno do Baileys 7.0.0-rc14 que o bot já trata: ao receber o pedido do servidor para
 * conferir as chaves (<notification type="encrypt"> com <digest>), o Baileys lê <count> sem conferir e
 * registra "Cannot read properties of undefined (reading 'attrs')" em handleEncryptNotification.
 * O pedido é atendido por handleServerDigestRequests (whatsapp.util), que registra uma linha própria.
 * Só esse erro exato é reconhecido; qualquer outro aviso do Baileys continua aparecendo.
 */
export function isHandledBaileysError(args: unknown[]): boolean {
    const [bindings, message] = args
    if (message !== "unexpected error in 'handling notification'" || typeof bindings !== 'object' || bindings === null) return false
    const err = (bindings as { err?: { message?: unknown, stack?: unknown } }).err
    return typeof err?.message === 'string' && err.message.includes("reading 'attrs'")
        && typeof err.stack === 'string' && err.stack.includes('handleEncryptNotification')
}

/** Hooks do logger do Baileys (pino, opção "hooks.logMethod"): omite só o erro acima, já tratado. */
export const baileysLogHooks = {
    logMethod(this: unknown, args: unknown[], method: (...a: unknown[]) => void) {
        if (isHandledBaileysError(args)) return
        method.apply(this, args)
    },
}
