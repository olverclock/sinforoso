/**
 * Supervisor da conexão com o WhatsApp (REL-02).
 *
 * O Baileys deixa a reconexão por conta da aplicação. Este supervisor garante:
 * - uma única conexão ativa por vez: a anterior é desinscrita e encerrada antes de criar outra, e
 *   eventos de conexões antigas são ignorados (contador de geração);
 * - falhas ao iniciar e rejeições durante a reconexão são tratadas e reagendadas (nada de Promise solta);
 * - espera exponencial com variação aleatória (3 s, 6 s, 12 s... até 60 s), para não martelar o servidor;
 * - pedidos de reconexão simultâneos viram um só agendamento;
 * - quedas de rede seguem tentando (no máximo 1 tentativa por minuto). Depois de N falhas seguidas
 *   (padrão 30, cerca de meia hora fora do ar), ou se uma tentativa travar sem dar sinal de vida,
 *   desiste e chama onGiveUp. No bot, isso encerra o processo com código 1, e o Docker o reinicia
 *   com o próprio atraso crescente;
 * - enquanto espera o usuário ler o QR code ou digitar o código de pareamento, nada conta como falha.
 */

export type SupervisedSocket = {
    /** Remove os ouvintes de eventos desta conexão. */
    unsubscribe(): void
    /** Encerra a conexão. */
    end(error?: Error): void
}

export type SupervisorState = 'idle' | 'connecting' | 'open' | 'awaiting_user' | 'stopped'

export interface SupervisorOptions {
    /** Cria uma nova conexão. Recebe o número da geração para filtrar os próprios eventos. */
    start: (generation: number) => Promise<SupervisedSocket>
    /** Chamado uma única vez quando não vale mais a pena tentar. */
    onGiveUp: (reason: string) => void
    log?: (message: string) => void
    baseDelayMs?: number
    maxDelayMs?: number
    maxConsecutiveFailures?: number
    /** Tempo máximo sem nenhuma atividade de conexão (tentativa, queda, abertura) antes de considerar travado. */
    stuckTimeoutMs?: number
    watchdogIntervalMs?: number
    random?: () => number
    now?: () => number
}

export class ConnectionSupervisor {
    private generation = 0
    private current: SupervisedSocket | null = null
    private retryTimer: ReturnType<typeof setTimeout> | null = null
    private watchdogTimer: ReturnType<typeof setInterval> | null = null
    private failures = 0
    private starting = false
    private gaveUp = false
    private lastActivity: number
    private _state: SupervisorState = 'idle'
    private readonly opts: Required<Omit<SupervisorOptions, 'start' | 'onGiveUp'>> & Pick<SupervisorOptions, 'start' | 'onGiveUp'>

    constructor(options: SupervisorOptions) {
        this.opts = {
            log: () => { },
            baseDelayMs: 3_000,
            maxDelayMs: 60_000,
            maxConsecutiveFailures: 30,
            stuckTimeoutMs: 5 * 60_000,
            watchdogIntervalMs: 60_000,
            random: Math.random,
            now: Date.now,
            ...options,
        }
        this.lastActivity = this.opts.now()
    }

    get state(): SupervisorState { return this._state }
    get consecutiveFailures(): number { return this.failures }
    get currentGeneration(): number { return this.generation }

    /** Indica se os eventos da geração informada ainda devem ser tratados. */
    isCurrent(generation: number): boolean {
        return generation === this.generation && this._state !== 'stopped'
    }

    /** Cria a conexão. Nunca rejeita: falhas são registradas e reagendadas. */
    async connect(): Promise<void> {
        if (this._state === 'stopped' || this.starting) return
        this.clearRetry()
        this.starting = true
        this.disposeCurrent()
        const generation = ++this.generation
        this.setState('connecting')
        try {
            const socket = await this.opts.start(generation)
            if (!this.isCurrent(generation)) {
                // Parado ou substituído enquanto iniciava: não deixa conexão órfã
                this.safeDispose(socket)
                return
            }
            this.current = socket
        } catch (err) {
            this.opts.log(`[CONEXÃO] Falha ao iniciar a conexão: ${err instanceof Error ? err.message : String(err)}`)
            this.scheduleReconnect(generation, 'falha ao iniciar')
        } finally {
            this.starting = false
        }
    }

    /** A conexão abriu: zera o contador de falhas. */
    markOpen(generation: number): void {
        if (!this.isCurrent(generation)) return
        this.failures = 0
        this.setState('open')
    }

    /** O bot está esperando o usuário (QR code ou código de pareamento): não conta como falha. */
    markAwaitingUser(generation: number): void {
        if (!this.isCurrent(generation)) return
        this.failures = 0
        this.setState('awaiting_user')
    }

    /** Agenda uma nova tentativa com espera crescente. Pedidos repetidos viram um só. */
    scheduleReconnect(generation: number, reason: string): void {
        if (!this.isCurrent(generation) || this.retryTimer || this.gaveUp) return
        this.touch()
        this.failures++
        if (this.failures > this.opts.maxConsecutiveFailures) {
            this.giveUp(`${this.failures - 1} falhas de conexão seguidas (última: ${reason})`)
            return
        }
        const delay = this.nextDelay(this.failures)
        this.setState('connecting')
        this.opts.log(`[CONEXÃO] Reconectando em ${Math.round(delay / 1000)}s (tentativa ${this.failures}/${this.opts.maxConsecutiveFailures}, motivo: ${reason})`)
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null
            void this.connect()
        }, delay)
    }

    /** Espera da tentativa n (1, 2, 3...): base × 2^(n-1), limitada ao máximo, com ±20% de variação. */
    nextDelay(attempt: number): number {
        const exponential = Math.min(this.opts.maxDelayMs, this.opts.baseDelayMs * 2 ** Math.max(0, attempt - 1))
        return Math.round(exponential * (0.8 + this.opts.random() * 0.4))
    }

    /** Parada intencional (ex.: comando de desligar): não reconecta nem aciona o watchdog. */
    stop(): void {
        this.setState('stopped')
        this.clearRetry()
        this.stopWatchdog()
        this.disposeCurrent()
    }

    /** Desiste de vez e avisa (uma única vez). */
    giveUp(reason: string): void {
        if (this.gaveUp) return
        this.gaveUp = true
        this.stop()
        this.opts.log(`[CONEXÃO] Desistindo: ${reason}`)
        this.opts.onGiveUp(reason)
    }

    /** Verifica periodicamente se a conexão travou (tentativa sem abrir, sem cair e sem dar erro). */
    startWatchdog(): void {
        if (this.watchdogTimer) return
        this.watchdogTimer = setInterval(() => this.checkStuck(), this.opts.watchdogIntervalMs)
        this.watchdogTimer.unref?.()
    }

    checkStuck(): void {
        // Esperando a próxima tentativa agendada não é travamento
        if (this._state !== 'connecting' || this.retryTimer) return
        const elapsed = this.opts.now() - this.lastActivity
        if (elapsed > this.opts.stuckTimeoutMs) {
            this.giveUp(`conexão travada: ${Math.round(elapsed / 60_000)} min sem nenhuma resposta`)
        }
    }

    private stopWatchdog(): void {
        if (this.watchdogTimer) clearInterval(this.watchdogTimer)
        this.watchdogTimer = null
    }

    private setState(state: SupervisorState): void {
        this.touch()
        this._state = state
    }

    private touch(): void {
        this.lastActivity = this.opts.now()
    }

    private clearRetry(): void {
        if (this.retryTimer) clearTimeout(this.retryTimer)
        this.retryTimer = null
    }

    private disposeCurrent(): void {
        if (!this.current) return
        const old = this.current
        this.current = null
        this.safeDispose(old)
    }

    private safeDispose(socket: SupervisedSocket): void {
        try { socket.unsubscribe() } catch { /* já removido */ }
        try { socket.end(undefined) } catch { /* já encerrado */ }
    }
}
