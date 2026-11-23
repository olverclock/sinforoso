import crypto from "node:crypto"
import { DocumentToolError } from "./tools.util.js"

/*
 * Fila do motor de documentos: tarefas pesadas (OCR, conversão, compressão) rodam uma por vez por
 * padrão, para nunca saturar o Orange Pi nem atrasar as mensagens do WhatsApp (o processamento
 * acontece em processos externos; o loop do Baileys só aguarda a Promise).
 *
 * - concorrência configurável (DOC_CONCURRENCY), limite de fila (DOC_MAX_QUEUE);
 * - uma tarefa por usuário em cada conversa (sem duplicadas);
 * - tempo máximo por tarefa; cancelamento enquanto aguarda; estados claros.
 */

export type JobState = 'pending' | 'processing' | 'done' | 'failed' | 'cancelled' | 'expired'

interface Job<T = unknown> {
    id: string
    owner: string
    state: JobState
    run: () => Promise<T>
    resolve: (value: T) => void
    reject: (reason: unknown) => void
    queuedAt: number
}

export class DocumentQueue {
    private pending: Job[] = []
    private active = new Map<string, Job>()
    private owners = new Set<string>()

    constructor(
        private readonly concurrency = Math.max(1, Number(process.env.DOC_CONCURRENCY ?? 1)),
        private readonly maxQueue = Math.max(1, Number(process.env.DOC_MAX_QUEUE ?? 10)),
        private readonly jobTimeoutMs = Number(process.env.DOC_JOB_TIMEOUT_S ?? 600) * 1000,
        private readonly maxWaitMs = Number(process.env.DOC_MAX_WAIT_S ?? 900) * 1000,
    ) { }

    /** Quantas tarefas estão à frente de quem entrar agora. */
    get waiting() { return this.pending.length + this.active.size }

    isBusy(owner: string) { return this.owners.has(owner) }

    /** Agenda uma tarefa. `owner` = conversa + usuário. Rejeita duplicada e fila cheia. */
    enqueue<T>(owner: string, run: () => Promise<T>): { id: string, position: number, result: Promise<T> } {
        if (this.owners.has(owner)) throw new DocumentToolError("Você já tem um documento sendo processado. Aguarde terminar.")
        if (this.pending.length >= this.maxQueue) throw new DocumentToolError("A fila de documentos está cheia. Tente de novo em alguns minutos.")
        const id = crypto.randomUUID()
        const position = this.waiting
        const result = new Promise<T>((resolve, reject) => {
            this.pending.push({ id, owner, state: 'pending', run, resolve: resolve as (v: unknown) => void, reject, queuedAt: Date.now() } as Job)
        })
        this.owners.add(owner)
        this.pump()
        return { id, position, result }
    }

    /** Cancela a tarefa do usuário se ela ainda estiver aguardando. */
    cancel(owner: string): boolean {
        const index = this.pending.findIndex(job => job.owner === owner)
        if (index < 0) return false
        const [job] = this.pending.splice(index, 1)
        this.finish(job, 'cancelled', new DocumentToolError("Processamento cancelado."))
        return true
    }

    private finish(job: Job, state: JobState, error?: unknown, value?: unknown) {
        job.state = state
        this.active.delete(job.id)
        this.owners.delete(job.owner)
        if (error) job.reject(error)
        else job.resolve(value)
    }

    private pump() {
        while (this.active.size < this.concurrency && this.pending.length) {
            const job = this.pending.shift()!
            if (Date.now() - job.queuedAt > this.maxWaitMs) {
                this.finish(job, 'expired', new DocumentToolError("O pedido expirou na fila. Envie de novo."))
                continue
            }
            job.state = 'processing'
            this.active.set(job.id, job)
            let timer: ReturnType<typeof setTimeout> | undefined
            const timeout = new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new DocumentToolError("O processamento demorou demais e foi interrompido.")), this.jobTimeoutMs)
            })
            Promise.race([job.run(), timeout])
                .then(value => this.finish(job, 'done', undefined, value), err => this.finish(job, 'failed', err))
                .finally(() => { clearTimeout(timer); this.pump() })
        }
    }
}

export const documentQueue = new DocumentQueue()
