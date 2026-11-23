import { BaileysEvent, BaileysEventMap, ConnectionState, WASocket } from 'baileys'
import NodeCache from 'node-cache'
import { Bot } from '../interfaces/bot.interface.js'
import botTexts from './bot.texts.helper.js'
import { colorText, showConsoleError } from '../utils/general.util.js'
import { normalizeJid } from '../utils/whatsapp.util.js'
import { ConnectionSupervisor } from './connection.supervisor.helper.js'

/*
 * Tratamento dos eventos do socket do Baileys, um tratador por evento (antes era um único callback
 * com complexidade ciclomática 34). As dependências chegam por parâmetro: em produção, socket.ts
 * (o único módulo que pode importar events/, regra ARCH-005) passa os tratadores reais; nos testes,
 * versões simuladas, sem um WhatsApp de verdade.
 */

type Events = Partial<BaileysEventMap>
type ParticipantsUpdate = BaileysEventMap['group-participants.update']
type AdaptedParticipantsUpdate = Omit<ParticipantsUpdate, 'participants'> & { participants: string[] }
/** O que fazer quando a conexão fecha (ver connectionClose em events/connection.event.ts). */
export type CloseAction = 'reconnect' | 'relogin' | 'stop' | 'fatal'

/** Funções externas usadas pelos tratadores (as reais em produção, simuladas nos testes). */
export interface SocketEventDeps {
    getBot: () => Bot
    askQuestion: (question: string) => Promise<string>
    connectionQr: (qr: string) => Promise<unknown>
    connectionPairingCode: (client: WASocket) => Promise<unknown>
    connectionClose: (state: Partial<ConnectionState>) => Promise<CloseAction>
    connectionOpen: (client: WASocket) => Promise<unknown>
    syncGroupsOnStart: (client: WASocket) => Promise<unknown>
    startFreeGamesMonitor: (client: WASocket) => Promise<unknown>
    executeEventQueue: (client: WASocket, eventsCache: NodeCache) => Promise<unknown>
    queueEvent: (eventsCache: NodeCache, eventName: BaileysEvent, eventData: unknown) => Promise<unknown>
    messageReceived: (client: WASocket, messages: BaileysEventMap['messages.upsert'], botInfo: Bot, messageCache: NodeCache) => Promise<unknown>
    groupParticipantsUpdated: (client: WASocket, update: AdaptedParticipantsUpdate, botInfo: Bot) => Promise<unknown>
    addedOnGroup: (client: WASocket, groups: BaileysEventMap['groups.upsert'], botInfo: Bot) => Promise<unknown>
    partialGroupUpdate: (group: BaileysEventMap['groups.update'][number]) => Promise<unknown>
    log: (...args: unknown[]) => void
}

/** Escolha do usuário (QR code = qualquer valor, "2" = código de pareamento), mantida entre reconexões. */
export interface LoginChoice { connectionType: string | null }

/** Estado de uma conexão (uma geração do supervisor). */
export interface SocketSession {
    client: WASocket
    generation: number
    supervisor: ConnectionSupervisor
    login: LoginChoice
    saveCreds: () => Promise<void>
    eventsCache: NodeCache
    messagesCache: NodeCache
    isBotReady: boolean
    /** Inicialização em andamento (evita rodar duas vezes). */
    readyStarting?: boolean
    /** Rede de segurança: inicializa mesmo sem o aviso de "pendências entregues". */
    readyFallback?: ReturnType<typeof setTimeout>
}

const PAIRING_CODE = '2'

/**
 * Tempo máximo esperando o WhatsApp avisar que entregou as mensagens pendentes (o que acontece
 * depois de um período desligado). Passado esse tempo, o bot entra no ar assim mesmo.
 */
export const READY_FALLBACK_MS = Number(process.env.READY_FALLBACK_S ?? 180) * 1000

function clearReadyFallback(session: SocketSession) {
    if (session.readyFallback) clearTimeout(session.readyFallback)
    session.readyFallback = undefined
}

/** QR code recebido: pergunta o método na primeira vez e mostra o QR (ou pede o código de pareamento). */
async function onQr(session: SocketSession, qr: string, deps: SocketEventDeps) {
    session.supervisor.markAwaitingUser(session.generation)
    if (session.login.connectionType) {
        if (session.login.connectionType != PAIRING_CODE) await deps.connectionQr(qr)
        return
    }
    deps.log(colorText(botTexts.not_connected, '#e0e031'))
    session.login.connectionType = await deps.askQuestion(botTexts.input_connection_method)
    if (session.login.connectionType != PAIRING_CODE) {
        await deps.connectionQr(qr)
        return
    }
    deps.connectionPairingCode(session.client).catch((err: unknown) => {
        // Antes era uma Promise solta: a falha derrubava o processo
        showConsoleError(err, 'CONNECTION')
        session.login.connectionType = null
        session.client.end(new Error("pairing_failed"))
    })
}

/** Conexão fechada: decide entre parar, desistir ou reconectar (com ou sem novo pareamento). */
async function onClose(session: SocketSession, state: Partial<ConnectionState>, deps: SocketEventDeps) {
    const action = await deps.connectionClose(state)
    if (action === 'stop') return session.supervisor.stop()
    if (action === 'fatal') return session.supervisor.giveUp('falha grave no código')
    if (action === 'relogin') session.login.connectionType = null
    session.supervisor.scheduleReconnect(session.generation, action === 'relogin' ? 'sessão encerrada, é preciso parear de novo' : 'conexão fechada')
}

/** Notificações pendentes recebidas: inicializa o bot uma única vez por conexão. */
async function onReady(session: SocketSession, deps: SocketEventDeps) {
    clearReadyFallback(session)
    if (session.isBotReady || session.readyStarting) return
    session.readyStarting = true
    const { client } = session
    try {
        await client.waitForSocketOpen()
        await deps.connectionOpen(client)
        await deps.syncGroupsOnStart(client)
        session.isBotReady = true
        await deps.startFreeGamesMonitor(client)
        await deps.executeEventQueue(client, session.eventsCache)
        deps.log(colorText(botTexts.server_started))
    } catch (err) {
        // Antes o bot ficava conectado mas nunca "pronto"; agora reconecta
        session.readyStarting = false
        showConsoleError(err, 'CONNECTION')
        client.end(new Error("startup_failed"))
    }
}

export async function onConnectionUpdate(session: SocketSession, update: Partial<ConnectionState>, deps: SocketEventDeps) {
    const { connection, qr, receivedPendingNotifications } = update
    if (receivedPendingNotifications) return onReady(session, deps)
    if (qr) return onQr(session, qr, deps)
    if (connection == 'connecting') return deps.log(colorText(botTexts.connecting))
    if (connection == 'open') {
        session.supervisor.markOpen(session.generation)
        clearReadyFallback(session)
        session.readyFallback = setTimeout(() => {
            session.readyFallback = undefined
            if (!session.supervisor.isCurrent(session.generation) || session.isBotReady) return
            deps.log(colorText("[CONEXÃO] O WhatsApp ainda não terminou de entregar as mensagens pendentes; iniciando o bot assim mesmo.", "#de9a07"))
            void onReady(session, deps)
        }, READY_FALLBACK_MS)
        session.readyFallback.unref?.()
        return deps.log(colorText("Conexão aberta! Recebendo as mensagens do período em que o bot ficou desligado (pode levar alguns minutos)...", "#22e3dd"))
    }
    if (connection === 'close') {
        clearReadyFallback(session)
        return onClose(session, update, deps)
    }
}

async function onParticipantsUpdate(session: SocketSession, update: ParticipantsUpdate, botInfo: Bot, deps: SocketEventDeps) {
    const jids = update.participants.map(p => normalizeJid(typeof p === 'string' ? p : p.id))
    const adapted = { ...update, participants: jids }
    if (session.isBotReady) await deps.groupParticipantsUpdated(session.client, adapted, botInfo)
    else await deps.queueEvent(session.eventsCache, "group-participants.update", adapted)
}

async function onGroupsUpdate(session: SocketSession, groups: BaileysEventMap['groups.update'], deps: SocketEventDeps) {
    // Só atualizações de um único grupo sem lista de participantes (nome, descrição, configurações)
    if (groups.length != 1 || groups[0].participants != undefined) return
    if (session.isBotReady) await deps.partialGroupUpdate(groups[0])
    else await deps.queueEvent(session.eventsCache, "groups.update", groups)
}

type Handler = (session: SocketSession, events: Events, botInfo: Bot, deps: SocketEventDeps) => Promise<unknown> | unknown

/**
 * Tratadores na mesma ordem de antes. O rótulo é o que aparece no console se o tratador falhar;
 * a falha de um não impede os seguintes (antes, um erro em connection.update pulava o creds.update).
 */
const HANDLERS: [keyof BaileysEventMap, string, Handler][] = [
    ['connection.update', 'Erro crítico no loop de eventos:', (s, e, _b, d) => onConnectionUpdate(s, e['connection.update']!, d)],
    ['creds.update', 'Erro ao salvar as credenciais:', (s) => s.saveCreds()],
    ['messages.upsert', 'Erro ao processar mensagem:', (s, e, b, d) => s.isBotReady ? d.messageReceived(s.client, e['messages.upsert']!, b, s.messagesCache) : undefined],
    ['group-participants.update', 'Erro ao atualizar participantes:', (s, e, b, d) => onParticipantsUpdate(s, e['group-participants.update']!, b, d)],
    ['groups.upsert', 'Erro ao processar novo grupo:', (s, e, b, d) => s.isBotReady ? d.addedOnGroup(s.client, e['groups.upsert']!, b) : d.queueEvent(s.eventsCache, "groups.upsert", e['groups.upsert'])],
    ['groups.update', 'Erro ao atualizar dados do grupo:', (s, e, _b, d) => onGroupsUpdate(s, e['groups.update']!, d)],
]

/** Cria o tratador passado para client.ev.process. */
export function createSocketEventProcessor(session: SocketSession, deps: SocketEventDeps) {
    return async (events: Events) => {
        // Eventos de uma conexão antiga (já substituída) são ignorados
        if (!session.supervisor.isCurrent(session.generation)) return
        let botInfo: Bot
        try {
            botInfo = deps.getBot()
        } catch (err) {
            deps.log(colorText("[SOCKET] Erro crítico no loop de eventos:", "#f44336"), err)
            return
        }
        for (const [event, label, handler] of HANDLERS) {
            if (!events[event]) continue
            try {
                await handler(session, events, botInfo, deps)
            } catch (err) {
                deps.log(colorText(`[SOCKET] ${label}`, "#f44336"), err)
            }
        }
    }
}
