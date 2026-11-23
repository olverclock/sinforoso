import DataStore from "@seald-io/nedb"
import { randomInt } from "node:crypto"

/*
 * Amigo secreto por grupo (!amigosecreto): as pessoas entram pela lista, um administrador sorteia
 * e cada um recebe o seu amigo no privado. O sorteio forma um único ciclo (A→B→C→…→A): ninguém
 * tira a si mesmo e ninguém fica sem presente.
 */

export interface SecretSantaPair { giver: string, receiver: string }

export interface SecretSanta {
    _id?: string
    group_id: string
    status: 'open' | 'drawn'
    created_by: string
    created_at: number
    /** Observação livre: valor, data, local... */
    note: string
    participants: string[]
    /**
     * Quem tirou quem (só depois do sorteio). Lista, e não objeto: o NeDB não aceita chaves com
     * ponto, e os IDs do WhatsApp ("...@s.whatsapp.net") têm ponto.
     */
    pairs: SecretSantaPair[]
}

export const db = new DataStore<SecretSanta>({ filename: './storage/databases/secret_santa.db', autoload: true })

export const MIN_PARTICIPANTS = 3
export const MAX_PARTICIPANTS = 200

/** Embaralhamento Fisher–Yates com gerador criptográfico. */
export function shuffle<T>(items: T[]): T[] {
    const copy = [...items]
    for (let i = copy.length - 1; i > 0; i--) {
        const j = randomInt(0, i + 1)
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
}

/** Sorteio em ciclo único: cada pessoa tira a próxima da ordem embaralhada. */
export function drawPairs(participants: string[]): Record<string, string> {
    const unique = [...new Set(participants)]
    if (unique.length < MIN_PARTICIPANTS) throw new Error(`São necessárias pelo menos ${MIN_PARTICIPANTS} pessoas para sortear.`)
    const order = shuffle(unique)
    const pairs: Record<string, string> = {}
    order.forEach((giver, i) => { pairs[giver] = order[(i + 1) % order.length] })
    return pairs
}

export class SecretSantaService {
    get(groupId: string): Promise<SecretSanta | null> {
        return db.findOneAsync({ group_id: groupId }) as Promise<SecretSanta | null>
    }

    async create(groupId: string, createdBy: string, note: string): Promise<SecretSanta> {
        if (await this.get(groupId)) throw new Error("Já existe um amigo secreto neste grupo. Para começar outro, cancele o atual.")
        return db.insertAsync({ group_id: groupId, status: 'open', created_by: createdBy, created_at: Date.now(), note, participants: [createdBy], pairs: [] }) as Promise<SecretSanta>
    }

    private async require(groupId: string): Promise<SecretSanta> {
        const current = await this.get(groupId)
        if (!current) throw new Error("Não há amigo secreto neste grupo. Um administrador pode criar com: amigosecreto criar")
        return current
    }

    async join(groupId: string, userId: string): Promise<{ game: SecretSanta, added: boolean }> {
        const game = await this.require(groupId)
        if (game.status === 'drawn') throw new Error("O sorteio já foi feito; não dá mais para entrar.")
        if (game.participants.includes(userId)) return { game, added: false }
        if (game.participants.length >= MAX_PARTICIPANTS) throw new Error(`Limite de ${MAX_PARTICIPANTS} participantes.`)
        game.participants.push(userId)
        await db.updateAsync({ _id: game._id }, { $set: { participants: game.participants } }, {})
        return { game, added: true }
    }

    async leave(groupId: string, userId: string): Promise<{ game: SecretSanta, removed: boolean }> {
        const game = await this.require(groupId)
        if (game.status === 'drawn') throw new Error("O sorteio já foi feito; não dá mais para sair. Um administrador pode cancelar e refazer.")
        const before = game.participants.length
        game.participants = game.participants.filter(p => p !== userId)
        await db.updateAsync({ _id: game._id }, { $set: { participants: game.participants } }, {})
        return { game, removed: game.participants.length < before }
    }

    async draw(groupId: string): Promise<SecretSanta> {
        const game = await this.require(groupId)
        if (game.status === 'drawn') throw new Error("O sorteio já foi feito. Cada um pode pedir o seu de novo com: amigosecreto meu")
        game.pairs = Object.entries(drawPairs(game.participants)).map(([giver, receiver]) => ({ giver, receiver }))
        game.status = 'drawn'
        await db.updateAsync({ _id: game._id }, { $set: { pairs: game.pairs, status: 'drawn' } }, {})
        return game
    }

    async cancel(groupId: string): Promise<boolean> {
        return (await db.removeAsync({ group_id: groupId }, { multi: true })) > 0
    }
}

/** Quem a pessoa tirou, ou undefined. */
export function receiverOf(game: SecretSanta, giver: string): string | undefined {
    return game.pairs.find(p => p.giver === giver)?.receiver
}
