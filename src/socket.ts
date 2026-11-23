import { makeWASocket, fetchLatestBaileysVersion, WASocket } from 'baileys'
import NodeCache from 'node-cache'
import configSocket from './config.js'
import { askQuestion, colorText } from './utils/general.util.js'
import { BotController } from './controllers/bot.controller.js'
import { ConnectionSupervisor, SupervisedSocket } from './helpers/connection.supervisor.helper.js'
import { useNeDBAuthState } from './helpers/session.auth.helper.js'
import { createSocketEventProcessor, LoginChoice, SocketEventDeps, SocketSession } from './helpers/socket.events.helper.js'
import { syncGroupsOnStart } from './helpers/groups.sync.helper.js'
import { executeEventQueue, queueEvent } from './helpers/events.queue.helper.js'
import { AutomationService } from './services/automation.service.js'
import { FeatureSchedulerService } from './services/feature-scheduler.service.js'
import { connectionClose, connectionOpen, connectionPairingCode, connectionQr } from './events/connection.event.js'
import { messageReceived } from './events/message-received.event.js'
import { addedOnGroup } from './events/group-added.event.js'
import { groupParticipantsUpdated } from './events/group-participants-updated.event.js'
import { partialGroupUpdate } from './events/group-partial-update.event.js'
import { ackStatusStanzas, handleServerDigestRequests } from './utils/whatsapp.util.js'

//Cache de tentativa de envios
const retryCache = new NodeCache()
//Cache de eventos na fila até o bot inicializar
const eventsCache = new NodeCache()
//Cache de mensagens para serem reenviadas em caso de falha
const messagesCache = new NodeCache({ stdTTL: 5 * 60, useClones: false })

// Escolha do usuário (QR code ou código de pareamento), mantida entre reconexões até a sessão expirar
const login: LoginChoice = { connectionType: null }

/** Tratadores reais dos eventos (só socket.ts pode importar events/, regra ARCH-005). */
const eventDeps: SocketEventDeps = {
    getBot: () => new BotController().getBot(),
    askQuestion,
    connectionQr,
    connectionPairingCode,
    connectionClose,
    connectionOpen,
    syncGroupsOnStart,
    startFreeGamesMonitor: async (client) => {
        // Jogos grátis do !free (por usuário) e automações por chat (!jogosgratis, lives, frases)
        FeatureSchedulerService.getInstance().start(client)
        await AutomationService.getInstance().startFreeGamesMonitor(client)
    },
    executeEventQueue,
    queueEvent,
    messageReceived,
    groupParticipantsUpdated,
    addedOnGroup,
    partialGroupUpdate,
    log: (...args) => console.log(...args),
}

/**
 * Uma conexão por vez, reconexão com espera crescente e encerramento do processo (código 1) quando
 * não há mais como se recuperar. No Docker, "restart: unless-stopped" reinicia o processo.
 */
export const connectionSupervisor = new ConnectionSupervisor({
    start: startSocket,
    log: (message) => console.log(colorText(message, "#de9a07")),
    onGiveUp: (reason) => {
        console.log(colorText(`[CONEXÃO] Encerrando o processo para reiniciar do zero: ${reason}`, "#f44336"))
        process.exit(1)
    },
})

/** Inicia a conexão supervisionada. Nunca rejeita. */
export default async function connect() {
    connectionSupervisor.startWatchdog()
    await connectionSupervisor.connect()
}

async function startSocket(generation: number): Promise<SupervisedSocket> {
    const { state, saveCreds } = await useNeDBAuthState()
    const { version } = await fetchLatestBaileysVersion()
    const client: WASocket = makeWASocket(configSocket(state, retryCache, version, messagesCache))
    // Confirma os <status> que o Baileys rc14 deixa sem resposta (evita a queda "Stream Errored (ack)")
    ackStatusStanzas(client)
    // Atende o pedido do servidor para conferir as chaves (<digest>), que o Baileys rc14 não trata
    handleServerDigestRequests(client)
    eventsCache.set("events", [])

    const session: SocketSession = { client, generation, supervisor: connectionSupervisor, login, saveCreds, eventsCache, messagesCache, isBotReady: false }
    const unsubscribe = client.ev.process(createSocketEventProcessor(session, eventDeps))

    return { unsubscribe, end: (error?: Error) => client.end(error) }
}
