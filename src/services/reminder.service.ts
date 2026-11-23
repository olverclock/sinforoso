import DataStore from "@seald-io/nedb"
import { WASocket } from "baileys"
import moment from "moment-timezone"
import * as waUtil from "../utils/whatsapp.util.js"
import { randomDelay, showConsoleError } from "../utils/general.util.js"
import { nextOccurrence, Repeat, TZ } from "../utils/reminder.util.js"

/*
 * Lembretes (!lembrete) e mensagens agendadas do grupo (!agendar), guardados no banco: sobrevivem a
 * reinícios. Quando o bot fica desligado ou sem internet no horário, o lembrete sai assim que
 * ele volta, com um aviso de atraso. Se o envio falhar, fica para a próxima verificação.
 */

export type ReminderKind = 'personal' | 'group'

export interface Reminder {
    _id?: string
    chat_id: string
    /** Quem criou (recebe a menção nos lembretes pessoais em grupo). */
    creator: string
    kind: ReminderKind
    text: string
    /** Próximo envio (ms). */
    when: number
    repeat: Repeat
    created_at: number
    expiration?: number
}

export const db = new DataStore<Reminder>({ filename: './storage/databases/reminders.db', autoload: true })
db.ensureIndex({ fieldName: 'when' })

/** Limites para ninguém lotar o banco. */
export const MAX_REMINDERS_PER_USER = 30
export const MAX_SCHEDULED_PER_GROUP = 50
/** Atraso a partir do qual o lembrete avisa que saiu atrasado. */
export const LATE_NOTICE_MS = 2 * 60_000
/** Lembrete que não consegue ser entregue por tanto tempo é descartado (ou vai para a próxima repetição). */
export const GIVE_UP_AFTER_MS = 3 * 24 * 60 * 60_000

export function reminderMessage(r: Reminder, now = Date.now()): string {
    const late = now - r.when > LATE_NOTICE_MS
        ? `\n\n_⏱️ Era para ${moment.tz(r.when, TZ).format('DD/MM [às] HH:mm')}: o bot estava desligado ou sem internet nesse horário._`
        : ''
    if (r.kind === 'group') return `📢 *Mensagem agendada*\n\n${r.text}${late}`
    const mention = r.chat_id.endsWith('@g.us') ? `@${waUtil.removeWhatsappSuffix(r.creator)} ` : ''
    return `⏰ *Lembrete* ${mention}\n\n${r.text}${late}`
}

export class ReminderService {
    async add(reminder: Omit<Reminder, '_id' | 'created_at'>): Promise<Reminder> {
        if (reminder.kind === 'group') {
            const count = await db.countAsync({ chat_id: reminder.chat_id, kind: 'group' })
            if (count >= MAX_SCHEDULED_PER_GROUP) throw new Error(`Este grupo já tem ${MAX_SCHEDULED_PER_GROUP} mensagens agendadas. Apague alguma com o comando de remover.`)
        } else {
            const count = await db.countAsync({ creator: reminder.creator, kind: 'personal' })
            if (count >= MAX_REMINDERS_PER_USER) throw new Error(`Você já tem ${MAX_REMINDERS_PER_USER} lembretes. Apague algum com o comando de remover.`)
        }
        return db.insertAsync({ ...reminder, created_at: Date.now() }) as Promise<Reminder>
    }

    /** Lembretes visíveis para a pessoa neste chat, em ordem de horário (a posição é o número para remover). */
    async list(chatId: string, userId: string): Promise<Reminder[]> {
        const docs = await db.findAsync({ chat_id: chatId, $or: [{ kind: 'group' }, { kind: 'personal', creator: userId }] }) as Reminder[]
        return docs.sort((a, b) => a.when - b.when)
    }

    /**
     * Remove pelo número mostrado na lista. Lembrete pessoal: só quem criou. Mensagem agendada do
     * grupo: só administradores do grupo.
     */
    async removeAt(chatId: string, userId: string, position: number, isGroupAdmin: boolean): Promise<Reminder> {
        const list = await this.list(chatId, userId)
        const target = list[position - 1]
        if (!target) throw new Error("Número não encontrado na lista.")
        if (target.kind === 'group' && !isGroupAdmin) throw new Error("Só administradores do grupo podem apagar mensagens agendadas.")
        await db.removeAsync({ _id: target._id }, {})
        return target
    }

    async due(now = Date.now()): Promise<Reminder[]> {
        const docs = await db.findAsync({ when: { $lte: now } }) as Reminder[]
        return docs.sort((a, b) => a.when - b.when)
    }

    /** Depois de enviado: repetição vai para a próxima data; único é apagado. */
    async markSent(reminder: Reminder, now = Date.now()): Promise<void> {
        const next = nextOccurrence(reminder.when, reminder.repeat, now)
        if (next === null) await db.removeAsync({ _id: reminder._id }, {})
        else await db.updateAsync({ _id: reminder._id }, { $set: { when: next } }, {})
    }

    /** Remove tudo de um chat (por exemplo quando o bot sai do grupo). */
    async removeChat(chatId: string): Promise<number> {
        return db.removeAsync({ chat_id: chatId }, { multi: true })
    }

    /** Envia os lembretes vencidos. Um erro de envio deixa o lembrete para a próxima rodada. */
    async sendDue(client: WASocket, now = Date.now()): Promise<number> {
        let sent = 0
        for (const reminder of await this.due(now)) {
            try {
                const text = reminderMessage(reminder, now)
                const options = { expiration: reminder.expiration }
                if (reminder.kind === 'personal' && reminder.chat_id.endsWith('@g.us')) await waUtil.sendTextWithMentions(client, reminder.chat_id, text, [reminder.creator], options)
                else await waUtil.sendText(client, reminder.chat_id, text, options)
                await this.markSent(reminder, now)
                sent++
                await randomDelay(800, 1600)
            } catch (err) {
                showConsoleError(err, "LEMBRETE")
                // Falhando há dias (ex.: o bot saiu do grupo): desiste deste e segue para os outros
                if (now - reminder.when > GIVE_UP_AFTER_MS) { await this.markSent(reminder, now); continue }
                // Sem conexão: para aqui e tenta tudo de novo na próxima verificação
                break
            }
        }
        return sent
    }
}
