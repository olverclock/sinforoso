import DataStore from "@seald-io/nedb"
import { WASocket } from "baileys"
import { randomInt } from "node:crypto"
import * as waUtil from "../utils/whatsapp.util.js"
import { showConsoleError } from "../utils/general.util.js"
import { normalizeWord } from "../utils/reminder.util.js"
import { ParticipantService } from "./participant.service.js"

/*
 * Verificação de novos membros (!verificacao): quem entra recebe uma continha simples e precisa
 * responder no grupo dentro do prazo; senão é removido (quando o bot é administrador). As
 * verificações pendentes ficam no banco, então um reinício do bot não perde nenhuma.
 */

export interface PendingVerification {
    _id?: string
    group_id: string
    user_id: string
    answer: number
    expires_at: number
    attempts: number
    expiration?: number
}

export const db = new DataStore<PendingVerification>({ filename: './storage/databases/captcha.db', autoload: true })

export const MAX_ATTEMPTS = 3
export const MIN_MINUTES = 1
export const MAX_MINUTES = 60

const NUMBER_WORDS: Record<string, number> = {
    zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
    onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20,
}

/** Primeiro número da resposta, em dígitos ("12") ou por extenso ("doze"). */
export function readAnswer(text: string): number | null {
    const digits = text.match(/-?\d+/)
    if (digits) return Number(digits[0])
    for (const word of normalizeWord(text).split(/[^a-z]+/)) if (NUMBER_WORDS[word] !== undefined) return NUMBER_WORDS[word]
    return null
}

export function makeQuestion(): { question: string, answer: number } {
    const a = randomInt(2, 10), b = randomInt(1, 10)
    return randomInt(0, 2) === 0 || a <= b
        ? { question: `${a} + ${b}`, answer: a + b }
        : { question: `${a} - ${b}`, answer: a - b }
}

export type CheckResult = { status: 'none' | 'ok' | 'failed' } | { status: 'wrong', remaining: number }

export class CaptchaService {
    private readonly participants = new ParticipantService()

    async start(groupId: string, userId: string, minutes: number, expiration?: number): Promise<string> {
        const { question, answer } = makeQuestion()
        await db.removeAsync({ group_id: groupId, user_id: userId }, { multi: true })
        await db.insertAsync({ group_id: groupId, user_id: userId, answer, expires_at: Date.now() + minutes * 60_000, attempts: 0, expiration })
        return question
    }

    get(groupId: string, userId: string): Promise<PendingVerification | null> {
        return db.findOneAsync({ group_id: groupId, user_id: userId }) as Promise<PendingVerification | null>
    }

    async remove(groupId: string, userId: string): Promise<void> {
        await db.removeAsync({ group_id: groupId, user_id: userId }, { multi: true })
    }

    /** Confere a mensagem de quem está em verificação. Mensagens sem número não contam como tentativa. */
    async check(groupId: string, userId: string, text: string): Promise<CheckResult> {
        const pending = await this.get(groupId, userId)
        if (!pending || pending.expires_at === 0) return { status: 'none' }
        const answer = readAnswer(text)
        if (answer === null) return { status: 'none' }
        if (answer === pending.answer) { await this.remove(groupId, userId); return { status: 'ok' } }
        const attempts = pending.attempts + 1
        // Errou demais: vence na hora (a remoção acontece em processExpired)
        if (attempts >= MAX_ATTEMPTS) { await db.updateAsync({ _id: pending._id }, { $set: { attempts, expires_at: 0 } }, {}); return { status: 'failed' } }
        await db.updateAsync({ _id: pending._id }, { $set: { attempts } }, {})
        return { status: 'wrong', remaining: MAX_ATTEMPTS - attempts }
    }

    expired(now = Date.now()): Promise<PendingVerification[]> {
        return db.findAsync({ expires_at: { $lte: now } }) as Promise<PendingVerification[]>
    }

    /**
     * Remove do grupo quem não respondeu a tempo (ou errou demais). Sem permissão de administrador o
     * bot só avisa. Erro de conexão: a verificação fica para a próxima rodada.
     */
    async processExpired(client: WASocket, botId: string, now = Date.now()): Promise<number> {
        let removed = 0
        for (const pending of await this.expired(now)) {
            try {
                const stillHere = await this.participants.isGroupParticipant(pending.group_id, pending.user_id)
                if (!stillHere) { await this.remove(pending.group_id, pending.user_id); continue }
                const botIsAdmin = await this.participants.isGroupAdmin(pending.group_id, botId)
                const mention = `@${waUtil.removeWhatsappSuffix(pending.user_id)}`
                if (botIsAdmin) {
                    await waUtil.sendTextWithMentions(client, pending.group_id, `🚫 ${mention} foi removido(a) por não concluir a verificação de novo membro.`, [pending.user_id], { expiration: pending.expiration })
                    await waUtil.removeParticipant(client, pending.group_id, pending.user_id)
                    removed++
                } else {
                    await waUtil.sendTextWithMentions(client, pending.group_id, `⚠️ ${mention} não concluiu a verificação, mas não posso remover: preciso ser *administrador* do grupo.`, [pending.user_id], { expiration: pending.expiration })
                }
                await this.remove(pending.group_id, pending.user_id)
            } catch (err) {
                showConsoleError(err, "VERIFICACAO")
                break
            }
        }
        return removed
    }
}
