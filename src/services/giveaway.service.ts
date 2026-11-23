import DataStore from "@seald-io/nedb"
import { WASocket } from "baileys"
import fs from "node:fs"
import path from "node:path"
import { randomBytes } from "node:crypto"
import moment from "moment-timezone"
import * as waUtil from "../utils/whatsapp.util.js"
import { randomDelay, showConsoleError } from "../utils/general.util.js"
import { idsOf, sameUser } from "../utils/identity.util.js"
import { TZ } from "../utils/reminder.util.js"
import * as gw from "../utils/giveaway.util.js"
import { ParticipantService } from "./participant.service.js"
import { ChatFeaturesService } from "./chat-features.service.js"

/*
 * Sorteios (!sorteio): três modalidades num só motor, com estado salvo no banco (sobrevive a
 * reinícios, quedas de energia e reconexões).
 *  - inscricao: as pessoas entram até o horário de encerramento; depois o bot sorteia.
 *  - relampago: sorteio na hora entre os membros do grupo, com animação.
 *  - caca: caça à chave protegida. Quatro códigos de desafio (A–D), só um certo; as tentativas vão
 *    no privado; o primeiro acerto ganha. A chave real do prêmio nunca aparece no grupo.
 * Regras de segurança:
 *  - sorteio verificável: só o hash da semente é publicado antes; a semente é revelada no fim;
 *  - chaves dos prêmios criptografadas (AES-256-GCM) no cofre, entregues só ao vencedor, no privado;
 *  - uma operação por sorteio de cada vez (fila por sorteio): sem dois vencedores para o mesmo prêmio;
 *  - entrada única por pessoa (índice único no banco), contando LID e número como a mesma pessoa.
 */

export type GiveawayMode = 'inscricao' | 'relampago' | 'caca'
export type GiveawayStatus = 'open' | 'finished' | 'no_winner' | 'cancelled'
export type DeliveryStatus = 'pending' | 'no_key' | 'delivered' | 'failed'

export interface GiveawayWinner { user: string, prize: number | null, delivery: DeliveryStatus, attempts: number, last_attempt?: number, delivered_at?: number }

export interface Giveaway {
    _id?: string
    id: string
    group_id: string
    group_name: string
    creator: string
    mode: GiveawayMode
    title: string
    winners_count: number
    status: GiveawayStatus
    created_at: number
    closes_at: number
    closed_at?: number
    commitment: string
    sealed_seed: gw.SealedSecret
    seed?: string
    entries_hash?: string
    entries_count?: number
    winners: GiveawayWinner[]
    exclude_admins: boolean
    expiration?: number
    hunt?: { options: string[], correct: number, max_attempts: number }
    history: { at: number, from: string, to: string, by: string, reason: string }[]
}

export interface GiveawayEntry { _id?: string, key: string, giveaway_id: string, user: string, at: number }
export interface HuntClaim { _id?: string, giveaway_id: string, user: string, option: number, correct: boolean, at: number }
export interface Prize { _id?: string, giveaway_id: string, index: number, sealed: gw.SealedSecret, fingerprint: string, status: 'available' | 'reserved' | 'delivered' | 'cancelled', winner?: string }

export const giveawaysDb = new DataStore<Giveaway>({ filename: './storage/databases/giveaways.db', autoload: true })
export const entriesDb = new DataStore<GiveawayEntry>({ filename: './storage/databases/giveaway_entries.db', autoload: true })
export const claimsDb = new DataStore<HuntClaim>({ filename: './storage/databases/giveaway_claims.db', autoload: true })
export const prizesDb = new DataStore<Prize>({ filename: './storage/databases/giveaway_prizes.db', autoload: true })
/** Prêmios guardados antes do sorteio (no privado): nome + chaves, com um código para vincular depois. */
export interface PrizePackage { _id?: string, id: string, owner: string, title: string, created_at: number, status: 'stock' | 'used' | 'deleted', giveaway_id?: string }
export const packagesDb = new DataStore<PrizePackage>({ filename: './storage/databases/giveaway_packages.db', autoload: true })
giveawaysDb.ensureIndex({ fieldName: 'id', unique: true })
packagesDb.ensureIndex({ fieldName: 'id', unique: true })
entriesDb.ensureIndex({ fieldName: 'key', unique: true })

export const LIMITS = {
    activePerGroup: 3,
    maxWinners: 20,
    minMinutes: 1,
    maxDays: 30,
    titleLength: 100,
    keyLength: 300,
    deliveryRetries: 3,
    retryAfterMs: 10 * 60_000,
    maxHuntAttempts: 3,
}

export class GiveawayError extends Error {}

// ———————————————— Chave do cofre ————————————————
/**
 * Chave mestra do cofre: GIVEAWAY_VAULT_KEY no .env (64 caracteres hex = 32 bytes) ou, se não houver,
 * gerada uma vez em storage/giveaway-vault.key (permissão 0600). Guarde uma cópia dessa chave: sem
 * ela, as chaves dos prêmios guardadas não podem ser abertas.
 */
let cachedKeys: { enc: Buffer, fp: Buffer } | undefined
export function vaultKeys(): { enc: Buffer, fp: Buffer } {
    if (cachedKeys) return cachedKeys
    const fromEnv = process.env.GIVEAWAY_VAULT_KEY?.trim()
    let master: Buffer
    if (fromEnv) {
        if (!/^[0-9a-fA-F]{64}$/.test(fromEnv)) throw new GiveawayError("GIVEAWAY_VAULT_KEY inválida: use 64 caracteres hexadecimais (32 bytes).")
        master = Buffer.from(fromEnv, 'hex')
    } else {
        const file = path.resolve('storage', 'giveaway-vault.key')
        if (fs.existsSync(file)) master = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex')
        else {
            master = randomBytes(32)
            fs.mkdirSync(path.dirname(file), { recursive: true })
            fs.writeFileSync(file, master.toString('hex'), { mode: 0o600 })
        }
    }
    cachedKeys = gw.deriveKeys(master)
    return cachedKeys
}

/** Para os testes. */
export function resetVaultKeys() { cachedKeys = undefined }

// ———————————————— Fila por sorteio ————————————————
const queues = new Map<string, Promise<unknown>>()
/** Executa uma operação por vez para cada sorteio (inscrição, tentativa, apuração, entrega). */
export function withGiveawayLock<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = queues.get(id) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(work)
    queues.set(id, current)
    current.finally(() => { if (queues.get(id) === current) queues.delete(id) }).catch(() => undefined)
    return current
}

const mention = (id: string) => `@${waUtil.removeWhatsappSuffix(id)}`
export const formatWhen = (ms: number) => moment.tz(ms, TZ).format('DD/MM [às] HH:mm')
export function remaining(ms: number, now = Date.now()): string {
    const minutes = Math.max(0, Math.ceil((ms - now) / 60_000))
    if (minutes < 60) return `${minutes} min`
    const h = Math.floor(minutes / 60), m = minutes % 60
    if (h < 48) return m ? `${h} h ${m} min` : `${h} h`
    return `${Math.round(h / 24)} dias`
}

// ———————————————— Textos dos anúncios (enviados também pelo agendador) ————————————————
export const giveawayTexts = {
    winnersAnnouncement(g: Giveaway): string {
        const list = g.winners.map((w, i) => `${g.winners.length > 1 ? `${i + 1}º ` : '🥇 '}${mention(w.user)}`).join('\n')
        return `🏆 *RESULTADO OFICIAL!*\n\n🎮 *Prêmio:* ${g.title}\n${list}\n🎟️ *Participantes válidos:* ${g.entries_count ?? 0}\n🔖 *Sorteio:* ${g.id}\n\n` +
            `Parabéns! 🎉 O Sinforoso vai enviar o prêmio no *privado*.\n` +
            `🔐 *Verificável:* use *!sorteio verificar ${g.id}* para conferir que o resultado não foi manipulado.`
    },
    noWinner(g: Giveaway): string {
        return g.mode === 'caca'
            ? `⌛ *DESAFIO ENCERRADO!*\n\n🎮 ${g.title}\n\nNinguém acertou dentro do prazo. O prêmio continua guardado para um próximo evento. 🔖 ${g.id}`
            : `⌛ *SORTEIO ENCERRADO SEM PARTICIPANTES*\n\n🎮 ${g.title}\n\nNinguém se inscreveu. O prêmio continua guardado para um próximo evento. 🔖 ${g.id}`
    },
    huntWinner(g: Giveaway): string {
        return `🚨 *CHAVE DESCOBERTA!*\n\n🎮 *Prêmio:* ${g.title}\n🏆 *Primeiro acerto válido:* ${mention(g.winners[0].user)}\n\n✅ Desafio encerrado. A opção certa era a *${gw.OPTION_LETTERS[g.hunt!.correct]}*.\n🔐 O prêmio será entregue no privado. 🔖 ${g.id}`
    },
    delivery(g: Giveaway, key: string): string {
        return `🎉 *PARABÉNS! VOCÊ GANHOU!*\n\n🎮 *Prêmio:* ${g.title}\n👥 *Grupo:* ${g.group_name}\n\n🔑 *Sua chave:*\n${key}\n\n` +
            `📌 Ative apenas pelo site ou aplicativo *oficial* da plataforma.\n🔐 Não compartilhe a sua chave com ninguém.\n🔖 Sorteio: ${g.id}`
    },
    deliveryNoKey(g: Giveaway): string {
        return `🎉 *PARABÉNS! VOCÊ GANHOU!*\n\n🎮 *Prêmio:* ${g.title}\n👥 *Grupo:* ${g.group_name}\n\nEste prêmio é entregue pelo *organizador* (${mention(g.creator)}), que já foi avisado. Se ele cadastrar a chave no bot, ela chega aqui automaticamente. 🔖 ${g.id}`
    },
    organizerManual(g: Giveaway, winner: string): string {
        return `🏆 *Vencedor do sorteio ${g.id}*\n\n🎮 *Prêmio:* ${g.title}\n👥 *Grupo:* ${g.group_name}\n🥇 *Ganhador:* ${mention(winner)}\n\nEste sorteio não tinha chave guardada: entregue o prêmio *manualmente* ao ganhador, ou cadastre a chave aqui para o bot entregar sozinho:\n*!sorteio chave ${g.id} SUA-CHAVE*`
    },
}

export class GiveawayService {
    private readonly participants = new ParticipantService()

    // ———————————————— Consulta ————————————————
    async get(id: string): Promise<Giveaway | null> {
        return giveawaysDb.findOneAsync({ id: id.trim().toUpperCase() }) as Promise<Giveaway | null>
    }

    async require(id: string, groupId?: string): Promise<Giveaway> {
        const g = await this.get(id)
        if (!g || (groupId && g.group_id !== groupId)) throw new GiveawayError(`Sorteio *${id.toUpperCase()}* não encontrado${groupId ? ' neste grupo' : ''}.`)
        return g
    }

    async active(groupId: string): Promise<Giveaway[]> {
        const list = await giveawaysDb.findAsync({ group_id: groupId, status: 'open' }) as Giveaway[]
        return list.sort((a, b) => a.closes_at - b.closes_at)
    }

    async history(groupId: string, limit = 10): Promise<Giveaway[]> {
        const list = await giveawaysDb.findAsync({ group_id: groupId, status: { $in: ['finished', 'no_winner', 'cancelled'] } }) as Giveaway[]
        return list.sort((a, b) => (b.closed_at ?? 0) - (a.closed_at ?? 0)).slice(0, limit)
    }

    async entriesCount(id: string): Promise<number> {
        return entriesDb.countAsync({ giveaway_id: id })
    }

    async isEntered(id: string, user: string): Promise<boolean> {
        return Boolean(await entriesDb.findOneAsync({ giveaway_id: id, user: { $in: idsOf(user) } }))
    }

    async prizesCount(id: string): Promise<number> {
        return prizesDb.countAsync({ giveaway_id: id, status: { $ne: 'cancelled' } })
    }

    // ———————————————— Criação ————————————————
    async create(input: { groupId: string, groupName: string, creator: string, mode: GiveawayMode, title: string, winners: number, closesAt: number, excludeAdmins?: boolean, maxAttempts?: number, expiration?: number }, now = Date.now()): Promise<Giveaway> {
        const title = input.title.replace(/\s+/g, ' ').trim()
        if (!title) throw new GiveawayError("Informe o nome do prêmio.")
        if (title.length > LIMITS.titleLength) throw new GiveawayError(`Nome do prêmio longo demais (máximo ${LIMITS.titleLength} caracteres).`)
        if (!Number.isInteger(input.winners) || input.winners < 1 || input.winners > LIMITS.maxWinners) throw new GiveawayError(`Quantidade de vencedores: de 1 a ${LIMITS.maxWinners}.`)
        if (input.mode !== 'relampago') {
            if (input.closesAt - now < LIMITS.minMinutes * 60_000) throw new GiveawayError("O encerramento precisa ser daqui a pelo menos 1 minuto.")
            if (input.closesAt - now > LIMITS.maxDays * 86_400_000) throw new GiveawayError(`O encerramento pode ser em até ${LIMITS.maxDays} dias.`)
        }
        const open = await giveawaysDb.countAsync({ group_id: input.groupId, status: 'open' })
        if (open >= LIMITS.activePerGroup) throw new GiveawayError(`Este grupo já tem ${LIMITS.activePerGroup} sorteios abertos. Encerre ou cancele algum antes.`)

        let id = gw.newGiveawayId()
        while (await this.get(id)) id = gw.newGiveawayId()
        const { seed, commitment } = gw.newCommitment()
        const hunt = input.mode === 'caca' ? (() => {
            const { options, correctIndex } = gw.huntOptions(gw.newChallengeCode())
            const max = input.maxAttempts ?? 1
            return { options, correct: correctIndex, max_attempts: Math.min(Math.max(1, max), LIMITS.maxHuntAttempts) }
        })() : undefined
        const doc: Giveaway = {
            id, group_id: input.groupId, group_name: input.groupName, creator: input.creator, mode: input.mode, title,
            winners_count: input.mode === 'caca' ? 1 : input.winners, status: 'open', created_at: now, closes_at: input.mode === 'relampago' ? now : input.closesAt,
            commitment, sealed_seed: gw.sealSecret(seed, vaultKeys().enc, `seed:${id}`), winners: [], exclude_admins: Boolean(input.excludeAdmins),
            expiration: input.expiration, hunt, history: [{ at: now, from: 'none', to: 'open', by: input.creator, reason: 'criado' }],
        }
        await giveawaysDb.insertAsync(doc)
        return doc
    }

    // ———————————————— Inscrições ————————————————
    async join(id: string, groupId: string, user: string, now = Date.now()): Promise<{ g: Giveaway, added: boolean, total: number }> {
        const g = await this.require(id, groupId)
        return withGiveawayLock(g.id, async () => {
            const fresh = await this.require(g.id)
            if (fresh.mode !== 'inscricao') throw new GiveawayError("Este evento não usa inscrições.")
            if (fresh.status !== 'open' || now >= fresh.closes_at) throw new GiveawayError("As inscrições deste sorteio já foram encerradas.")
            if (fresh.exclude_admins && await this.participants.isGroupAdmin(fresh.group_id, user)) throw new GiveawayError("Administradores não participam deste sorteio (regra definida na criação).")
            if (await this.isEntered(fresh.id, user)) return { g: fresh, added: false, total: await this.entriesCount(fresh.id) }
            try {
                await entriesDb.insertAsync({ key: `${fresh.id}|${idsOf(user)[0]}`, giveaway_id: fresh.id, user: idsOf(user)[0], at: now })
            } catch {
                return { g: fresh, added: false, total: await this.entriesCount(fresh.id) } // índice único: entrada repetida
            }
            return { g: fresh, added: true, total: await this.entriesCount(fresh.id) }
        })
    }

    async leave(id: string, groupId: string, user: string, now = Date.now()): Promise<{ removed: boolean, total: number }> {
        const g = await this.require(id, groupId)
        return withGiveawayLock(g.id, async () => {
            const fresh = await this.require(g.id)
            if (fresh.status !== 'open' || now >= fresh.closes_at) throw new GiveawayError("As inscrições já foram encerradas; não dá mais para sair.")
            const removed = await entriesDb.removeAsync({ giveaway_id: fresh.id, user: { $in: idsOf(user) } }, { multi: true })
            return { removed: removed > 0, total: await this.entriesCount(fresh.id) }
        })
    }

    // ———————————————— Cofre de prêmios ————————————————
    /** Cadastra chaves (uma por item). Só o criador ou um administrador do grupo. Recusa chaves repetidas. */
    async addKeys(id: string, user: string, keys: string[]): Promise<{ added: number, duplicates: number, masked: string[], total: number }> {
        const g = await this.require(id)
        if (!sameUser(user, g.creator) && !(await this.participants.isGroupAdmin(g.group_id, user))) throw new GiveawayError("Só quem criou o sorteio ou um administrador do grupo pode cadastrar os prêmios.")
        if (g.status === 'cancelled') throw new GiveawayError("Este sorteio foi cancelado.")
        const clean = keys.map(k => k.trim()).filter(Boolean)
        if (!clean.length) throw new GiveawayError("Envie a chave depois do ID. Ex.: !sorteio chave ABC12 XXXXX-XXXXX-XXXXX")
        if (clean.some(k => k.length > LIMITS.keyLength)) throw new GiveawayError(`Chave longa demais (máximo ${LIMITS.keyLength} caracteres).`)
        return withGiveawayLock(g.id, async () => {
            const { enc, fp } = vaultKeys()
            let added = 0, duplicates = 0
            const masked: string[] = []
            let index = await prizesDb.countAsync({ giveaway_id: g.id })
            for (const key of clean) {
                const fingerprint = gw.secretFingerprint(key, fp)
                if (await prizesDb.findOneAsync({ fingerprint, status: { $ne: 'cancelled' } })) { duplicates++; continue }
                await prizesDb.insertAsync({ giveaway_id: g.id, index, sealed: gw.sealSecret(key, enc, `prize:${g.id}:${index}`), fingerprint, status: 'available' })
                index++; added++
                masked.push(gw.maskSecret(key))
            }
            await this.assignPrizes(g.id)
            return { added, duplicates, masked, total: await this.prizesCount(g.id) }
        })
    }

    /** Liga prêmios disponíveis aos vencedores que ainda não têm um (na ordem do sorteio). */
    private async assignPrizes(id: string): Promise<void> {
        const g = await this.require(id)
        let changed = false
        for (const w of g.winners) {
            if (w.prize !== null) continue
            const prize = (await prizesDb.findAsync({ giveaway_id: id, status: 'available' }) as Prize[]).sort((a, b) => a.index - b.index)[0]
            if (!prize) break
            await prizesDb.updateAsync({ _id: prize._id }, { $set: { status: 'reserved', winner: w.user } }, {})
            w.prize = prize.index
            if (w.delivery === 'no_key') w.delivery = 'pending'
            changed = true
        }
        if (changed) await giveawaysDb.updateAsync({ id }, { $set: { winners: g.winners } }, {})
    }

    // ———————————————— Prêmios guardados antes (código do prêmio) ————————————————
    /** Guarda nome + chaves no privado e devolve o código do prêmio (P + 5 letras/números). */
    async storePackage(owner: string, title: string, keys: string[], now = Date.now()): Promise<{ pkg: PrizePackage, added: number, duplicates: number, masked: string[] }> {
        const name = title.replace(/\s+/g, ' ').trim()
        if (!name) throw new GiveawayError("Informe o nome do prêmio. Ex.: !sorteio premio Elden Ring (Steam) | XXXXX-XXXXX")
        if (name.length > LIMITS.titleLength) throw new GiveawayError(`Nome do prêmio longo demais (máximo ${LIMITS.titleLength} caracteres).`)
        const clean = keys.map(k => k.trim()).filter(Boolean)
        if (!clean.length) throw new GiveawayError("Envie pelo menos uma chave depois do |. Ex.: !sorteio premio Elden Ring | XXXXX-XXXXX")
        if (clean.length > LIMITS.maxWinners) throw new GiveawayError(`No máximo ${LIMITS.maxWinners} chaves por prêmio.`)
        if (clean.some(k => k.length > LIMITS.keyLength)) throw new GiveawayError(`Chave longa demais (máximo ${LIMITS.keyLength} caracteres).`)
        let id = `P${gw.newGiveawayId()}`
        while (await packagesDb.findOneAsync({ id })) id = `P${gw.newGiveawayId()}`
        const pkg: PrizePackage = { id, owner: idsOf(owner)[0], title: name, created_at: now, status: 'stock' }
        const { enc, fp } = vaultKeys()
        let added = 0, duplicates = 0
        const masked: string[] = []
        for (const key of clean) {
            const fingerprint = gw.secretFingerprint(key, fp)
            if (await prizesDb.findOneAsync({ fingerprint, status: { $ne: 'cancelled' } })) { duplicates++; continue }
            await prizesDb.insertAsync({ giveaway_id: `pkg:${id}`, index: added, sealed: gw.sealSecret(key, enc, `prize:pkg:${id}:${added}`), fingerprint, status: 'available' })
            added++
            masked.push(gw.maskSecret(key))
        }
        if (!added) throw new GiveawayError("Essas chaves já estão guardadas em outro prêmio ou sorteio.")
        await packagesDb.insertAsync(pkg)
        return { pkg, added, duplicates, masked }
    }

    async packageKeys(id: string): Promise<number> {
        return prizesDb.countAsync({ giveaway_id: `pkg:${id}`, status: 'available' })
    }

    async myPackages(owner: string): Promise<(PrizePackage & { keys: number })[]> {
        const list = await packagesDb.findAsync({ owner: { $in: idsOf(owner) }, status: 'stock' }) as PrizePackage[]
        const out: (PrizePackage & { keys: number })[] = []
        for (const p of list.sort((a, b) => b.created_at - a.created_at)) out.push({ ...p, keys: await this.packageKeys(p.id) })
        return out
    }

    /** Prêmio guardado desta pessoa, pelo código (PXXXXX) ou pelo nome (sem diferenciar maiúsculas/acentos). */
    async findPackage(owner: string, codeOrName: string): Promise<PrizePackage | null> {
        const mine = await packagesDb.findAsync({ owner: { $in: idsOf(owner) }, status: 'stock' }) as PrizePackage[]
        const query = codeOrName.trim()
        const norm = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
        return mine.find(p => p.id === query.toUpperCase()) ?? mine.find(p => norm(p.title) === norm(query)) ?? null
    }

    async deletePackage(owner: string, id: string): Promise<PrizePackage> {
        const pkg = await packagesDb.findOneAsync({ id: id.trim().toUpperCase(), owner: { $in: idsOf(owner) }, status: 'stock' }) as PrizePackage | null
        if (!pkg) throw new GiveawayError(`Prêmio *${id.toUpperCase()}* não encontrado entre os seus prêmios guardados.`)
        await prizesDb.updateAsync({ giveaway_id: `pkg:${pkg.id}` }, { $set: { status: 'cancelled' } }, { multi: true })
        await packagesDb.updateAsync({ id: pkg.id }, { $set: { status: 'deleted' } }, {})
        return pkg
    }

    /**
     * Move as chaves do prêmio guardado para o sorteio: cada chave é descriptografada e criptografada
     * de novo amarrada ao sorteio (AAD novo). Só o dono do prêmio pode vincular. Devolve quantas.
     */
    async linkPackage(packageId: string, giveawayId: string, owner: string): Promise<number> {
        const pkg = await packagesDb.findOneAsync({ id: packageId, status: 'stock' }) as PrizePackage | null
        if (!pkg || !sameUser(pkg.owner, owner)) throw new GiveawayError("Prêmio guardado não encontrado (ou é de outra pessoa).")
        return withGiveawayLock(giveawayId, async () => {
            const { enc } = vaultKeys()
            const keys = (await prizesDb.findAsync({ giveaway_id: `pkg:${pkg.id}`, status: 'available' }) as Prize[]).sort((a, b) => a.index - b.index)
            let index = await prizesDb.countAsync({ giveaway_id: giveawayId })
            for (const k of keys) {
                const plain = gw.openSecret(k.sealed, enc, `prize:pkg:${pkg.id}:${k.index}`)
                await prizesDb.updateAsync({ _id: k._id }, { $set: { giveaway_id: giveawayId, index, sealed: gw.sealSecret(plain, enc, `prize:${giveawayId}:${index}`) } }, {})
                index++
            }
            await packagesDb.updateAsync({ id: pkg.id }, { $set: { status: 'used', giveaway_id: giveawayId } }, {})
            await this.assignPrizes(giveawayId)
            return keys.length
        })
    }

    // ———————————————— Apuração ————————————————
    /**
     * Encerra e sorteia (inscricao/relampago): congela a lista, sorteia com a semente comprometida,
     * registra os vencedores e revela a semente. Idempotente: sorteio já encerrado não é refeito.
     */
    async close(id: string, by: string, candidates?: string[], now = Date.now()): Promise<Giveaway> {
        const g = await this.require(id)
        return withGiveawayLock(g.id, async () => {
            const fresh = await this.require(g.id)
            if (fresh.status !== 'open') return fresh
            if (fresh.mode === 'caca') return this.finishHunt(fresh, by, 'prazo encerrado', now)
            const pool = candidates ?? (await entriesDb.findAsync({ giveaway_id: fresh.id }) as GiveawayEntry[]).map(e => e.user)
            const list = gw.canonicalList(pool)
            const seed = gw.openSecret(fresh.sealed_seed, vaultKeys().enc, `seed:${fresh.id}`)
            const picked = gw.deterministicPick(seed, list, fresh.winners_count)
            const status: GiveawayStatus = picked.length ? 'finished' : 'no_winner'
            const update = {
                status, closed_at: now, seed, entries_hash: gw.listHash(list), entries_count: list.length,
                winners: picked.map(user => ({ user, prize: null, delivery: 'no_key' as DeliveryStatus, attempts: 0 })),
                history: [...fresh.history, { at: now, from: 'open', to: status, by, reason: candidates ? 'sorteio relâmpago' : 'apuração' }],
            }
            await giveawaysDb.updateAsync({ id: fresh.id }, { $set: update }, {})
            if (candidates) await this.saveCandidates(fresh.id, list, now)
            await this.assignPrizes(fresh.id)
            return this.require(fresh.id)
        })
    }

    /** Relâmpago: guarda a lista congelada como inscrições, para a verificação poder ser refeita. */
    private async saveCandidates(id: string, list: string[], now: number) {
        for (const user of list) await entriesDb.insertAsync({ key: `${id}|${user}`, giveaway_id: id, user, at: now }).catch(() => undefined)
    }

    // ———————————————— Caça à chave ————————————————
    async attemptHunt(id: string, user: string, letter: string, now = Date.now()): Promise<{ result: 'correct' | 'wrong', g: Giveaway, remaining: number }> {
        const g = await this.require(id)
        const option = gw.OPTION_LETTERS.indexOf(letter.trim().toUpperCase())
        if (option < 0) throw new GiveawayError("Escolha uma opção: A, B, C ou D.")
        return withGiveawayLock(g.id, async () => {
            const fresh = await this.require(g.id)
            if (fresh.mode !== 'caca' || !fresh.hunt) throw new GiveawayError("Este evento não é uma caça à chave.")
            if (fresh.status !== 'open' || now >= fresh.closes_at) throw new GiveawayError("Este desafio já terminou.")
            if (!(await this.participants.isGroupParticipant(fresh.group_id, user))) throw new GiveawayError("Só membros do grupo do desafio podem participar.")
            if (fresh.exclude_admins && await this.participants.isGroupAdmin(fresh.group_id, user)) throw new GiveawayError("Administradores não participam deste desafio (regra definida na criação).")
            const used = await claimsDb.countAsync({ giveaway_id: fresh.id, user: { $in: idsOf(user) } })
            if (used >= fresh.hunt.max_attempts) throw new GiveawayError(`Você já usou suas ${fresh.hunt.max_attempts} tentativa(s) neste desafio.`)
            const correct = option === fresh.hunt.correct
            await claimsDb.insertAsync({ giveaway_id: fresh.id, user: idsOf(user)[0], option, correct, at: now })
            if (!correct) return { result: 'wrong', g: fresh, remaining: fresh.hunt.max_attempts - used - 1 }
            const finished = await this.finishHunt(fresh, user, 'primeiro acerto', now, user)
            return { result: 'correct', g: finished, remaining: 0 }
        })
    }

    /** Fecha a caça (com ou sem vencedor). Chamado dentro da fila do sorteio. */
    private async finishHunt(g: Giveaway, by: string, reason: string, now: number, winner?: string): Promise<Giveaway> {
        const status: GiveawayStatus = winner ? 'finished' : 'no_winner'
        const seed = gw.openSecret(g.sealed_seed, vaultKeys().enc, `seed:${g.id}`)
        await giveawaysDb.updateAsync({ id: g.id }, { $set: {
            status, closed_at: now, seed, entries_count: await claimsDb.countAsync({ giveaway_id: g.id }),
            winners: winner ? [{ user: idsOf(winner)[0], prize: null, delivery: 'no_key', attempts: 0 }] : [],
            history: [...g.history, { at: now, from: 'open', to: status, by, reason }],
        } }, {})
        await this.assignPrizes(g.id)
        return this.require(g.id)
    }

    async cancel(id: string, by: string, groupId: string, now = Date.now()): Promise<Giveaway> {
        const g = await this.require(id, groupId)
        return withGiveawayLock(g.id, async () => {
            const fresh = await this.require(g.id)
            if (fresh.status !== 'open') throw new GiveawayError("Só dá para cancelar sorteios abertos.")
            await giveawaysDb.updateAsync({ id: fresh.id }, { $set: { status: 'cancelled', closed_at: now, history: [...fresh.history, { at: now, from: 'open', to: 'cancelled', by, reason: 'cancelado por admin' }] } }, {})
            await prizesDb.updateAsync({ giveaway_id: fresh.id, status: 'available' }, { $set: { status: 'cancelled' } }, { multi: true })
            return this.require(fresh.id)
        })
    }

    // ———————————————— Entrega no privado ————————————————
    /**
     * Envia o prêmio de cada vencedor ainda não entregue. O vencedor é sempre o registrado no
     * sorteio (nunca um número digitado por alguém). Falha de envio não marca como entregue.
     */
    async deliver(client: WASocket, id: string, now = Date.now(), onlyUser?: string): Promise<{ delivered: number, failed: number, waitingKey: number }> {
        return withGiveawayLock(id, async () => {
            const g = await this.require(id)
            let delivered = 0, failed = 0, waitingKey = 0
            for (const w of g.winners) {
                if (onlyUser && !sameUser(onlyUser, w.user)) continue
                if (w.delivery === 'delivered' && !onlyUser) continue
                if (w.prize === null) {
                    waitingKey++
                    if (w.attempts === 0) {
                        await waUtil.sendTextWithMentions(client, w.user, giveawayTexts.deliveryNoKey(g), [g.creator]).catch(() => undefined)
                        await waUtil.sendTextWithMentions(client, g.creator, giveawayTexts.organizerManual(g, w.user), [w.user]).catch(() => undefined)
                        w.attempts = 1
                    }
                    continue
                }
                const prize = await prizesDb.findOneAsync({ giveaway_id: g.id, index: w.prize }) as Prize | null
                if (!prize) { waitingKey++; continue }
                try {
                    const key = gw.openSecret(prize.sealed, vaultKeys().enc, `prize:${g.id}:${prize.index}`)
                    await waUtil.sendText(client, w.user, giveawayTexts.delivery(g, key))
                    Object.assign(w, { delivery: 'delivered', delivered_at: now, last_attempt: now, attempts: w.attempts + 1 })
                    await prizesDb.updateAsync({ _id: prize._id }, { $set: { status: 'delivered' } }, {})
                    delivered++
                } catch (err) {
                    showConsoleError(err, "SORTEIO_ENTREGA")
                    Object.assign(w, { delivery: 'failed', last_attempt: now, attempts: w.attempts + 1 })
                    failed++
                }
            }
            await giveawaysDb.updateAsync({ id: g.id }, { $set: { winners: g.winners } }, {})
            return { delivered, failed, waitingKey }
        })
    }

    // ———————————————— Anúncio do resultado ————————————————
    /**
     * Anuncia no grupo. Com animações ligadas: roleta e depois troféu com o resultado na legenda.
     * O vencedor já está gravado antes da animação (ela é só visual). Se a mídia falhar ou estiver
     * desligada, o resultado sai em texto, com as mesmas informações e menções.
     */
    async announceResult(client: WASocket, g: Giveaway, mediaDir = path.resolve('dist', 'media')): Promise<'animation' | 'text'> {
        const options = { expiration: g.expiration }
        const mentions = g.winners.map(w => w.user)
        const text = g.status === 'no_winner' ? giveawayTexts.noWinner(g) : g.mode === 'caca' ? giveawayTexts.huntWinner(g) : giveawayTexts.winnersAnnouncement(g)
        const animations = (await new ChatFeaturesService().get(g.group_id)).giveaway.animations
        if (g.status === 'finished' && g.mode !== 'caca' && animations) {
            try {
                const roulette = fs.readFileSync(path.join(mediaDir, 'giveaway-roulette.mp4'))
                const trophy = fs.readFileSync(path.join(mediaDir, 'giveaway-winner.mp4'))
                await waUtil.sendGif(client, g.group_id, roulette, `🎬 Sorteando *${g.title}* entre ${g.entries_count ?? 0} participante(s)...`, options)
                await new Promise(r => setTimeout(r, 3500))
                await waUtil.sendGif(client, g.group_id, trophy, text, { ...options, mentions })
                return 'animation'
            } catch (err) {
                showConsoleError(err, "SORTEIO_ANIMACAO")
            }
        }
        await waUtil.sendTextWithMentions(client, g.group_id, text, mentions, options)
        return 'text'
    }

    // ———————————————— Agendador ————————————————
    /** Encerra os sorteios vencidos (também os que venceram com o bot desligado) e refaz entregas. */
    async runDue(client: WASocket, announce: (g: Giveaway) => Promise<void>, now = Date.now()): Promise<number> {
        let closed = 0
        const due = await giveawaysDb.findAsync({ status: 'open', mode: { $in: ['inscricao', 'caca'] }, closes_at: { $lte: now } }) as Giveaway[]
        for (const g of due) {
            try {
                const result = await this.close(g.id, 'agendador', undefined, now)
                await announce(result)
                if (result.status === 'finished') await this.deliver(client, result.id, now)
                closed++
                await randomDelay(800, 1500)
            } catch (err) {
                showConsoleError(err, "SORTEIO_AGENDADOR")
            }
        }
        const pending = await giveawaysDb.findAsync({ status: 'finished' }) as Giveaway[]
        for (const g of pending) {
            const retry = g.winners.some(w => (w.delivery === 'pending' && w.prize !== null)
                || (w.delivery === 'failed' && w.attempts < LIMITS.deliveryRetries && now - (w.last_attempt ?? 0) >= LIMITS.retryAfterMs))
            if (retry) await this.deliver(client, g.id, now).catch(err => showConsoleError(err, "SORTEIO_ENTREGA"))
        }
        return closed
    }
}
