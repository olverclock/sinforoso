import { DocumentToolError } from "./tools.util.js"

/*
 * Sessões de coleta para operações com vários arquivos (juntar PDFs, várias imagens → um PDF):
 * o usuário abre a sessão com o comando, envia os arquivos em mensagens separadas e finaliza com
 * "pronto". Cada sessão é isolada por conversa + usuário (arquivos de pessoas diferentes nunca se
 * misturam), expira sozinha e tem limites de quantidade e de tamanho total.
 */

export type SessionKind = 'merge' | 'images'

export interface CollectSession {
    kind: SessionKind
    files: Buffer[]
    bytes: number
    expiresAt: number
}

export const SESSION_LIMITS = {
    ttlMs: 10 * 60_000,
    maxFiles: 20,
    maxTotalBytes: 100 * 1024 * 1024,
    maxSessions: 200,
}

const sessions = new Map<string, CollectSession>()

export const sessionKey = (chatId: string, sender: string) => `${chatId}|${sender}`

function sweep(now = Date.now()) {
    for (const [key, session] of sessions) if (session.expiresAt <= now) sessions.delete(key)
}

export function startSession(key: string, kind: SessionKind, now = Date.now()): CollectSession {
    sweep(now)
    if (!sessions.has(key) && sessions.size >= SESSION_LIMITS.maxSessions) throw new DocumentToolError("Muitas sessões abertas agora. Tente em alguns minutos.")
    const session: CollectSession = { kind, files: [], bytes: 0, expiresAt: now + SESSION_LIMITS.ttlMs }
    sessions.set(key, session)
    return session
}

export function getSession(key: string, now = Date.now()): CollectSession | undefined {
    const session = sessions.get(key)
    if (session && session.expiresAt <= now) { sessions.delete(key); return undefined }
    return session
}

/** Acrescenta um arquivo; renova o prazo da sessão. */
export function addToSession(key: string, file: Buffer, now = Date.now()): CollectSession {
    const session = getSession(key, now)
    if (!session) throw new DocumentToolError("Nenhuma coleta aberta.")
    if (session.files.length >= SESSION_LIMITS.maxFiles) throw new DocumentToolError(`Limite de ${SESSION_LIMITS.maxFiles} arquivos atingido. Envie *pronto*.`)
    if (session.bytes + file.length > SESSION_LIMITS.maxTotalBytes) throw new DocumentToolError("Os arquivos somados passam do limite. Envie *pronto* com os que já mandou.")
    session.files.push(file)
    session.bytes += file.length
    session.expiresAt = now + SESSION_LIMITS.ttlMs
    return session
}

/** Remove e devolve a sessão (para processar ou cancelar). */
export function takeSession(key: string, now = Date.now()): CollectSession | undefined {
    const session = getSession(key, now)
    sessions.delete(key)
    return session
}

/** Para testes. */
export function clearSessions() { sessions.clear() }
