import DataStore from "@seald-io/nedb"
import { ChatFeatures, LiveChannel } from "../interfaces/chat-features.interface.js"
import { deepMerge } from "../utils/general.util.js"

/**
 * Configurações dos recursos automáticos por chat (jogos grátis, lives, frases, verificação de links).
 * Banco próprio: não altera o formato de grupos e usuários já existentes.
 */
export const db = new DataStore<ChatFeatures>({ filename: './storage/databases/chat_features.db', autoload: true })

export function defaultChatFeatures(chatId: string): ChatFeatures {
    return {
        chat_id: chatId,
        freegames: { status: false, posted_ids: [] },
        lives: { status: false, channels: [] },
        phrases: { status: false, mode: 'daily', time: '08:00', interval_minutes: 24 * 60, last_sent: 0, cursor: 0 },
        linkscan: { status: false },
        rules: { text: '', auto: false },
        captcha: { status: false, minutes: 5 },
        antiscam: { status: false },
        discord: [],
        giveaway: { animations: true },
    }
}

/** Limite de IDs de jogos guardados por chat (os mais recentes). */
const MAX_POSTED_IDS = 500

export class ChatFeaturesService {
    async get(chatId: string): Promise<ChatFeatures> {
        const saved = await db.findOneAsync({ chat_id: chatId }) as ChatFeatures | null
        // deepMerge completa campos novos em registros antigos
        return deepMerge(defaultChatFeatures(chatId), saved ?? {})
    }

    async save(features: ChatFeatures): Promise<void> {
        const { _id, ...data } = features as ChatFeatures & { _id?: string }
        void _id
        await db.updateAsync({ chat_id: features.chat_id }, data, { upsert: true })
    }

    /** Lê, altera e salva o registro de um chat. */
    async update(chatId: string, change: (features: ChatFeatures) => void): Promise<ChatFeatures> {
        const features = await this.get(chatId)
        change(features)
        features.freegames.posted_ids = features.freegames.posted_ids.slice(-MAX_POSTED_IDS)
        await this.save(features)
        return features
    }

    /** Todos os chats com um recurso ativo. */
    async listActive(feature: 'freegames' | 'lives' | 'phrases' | 'linkscan' | 'captcha' | 'antiscam'): Promise<ChatFeatures[]> {
        const docs = await db.findAsync({ [`${feature}.status`]: true }) as ChatFeatures[]
        return docs.map(d => deepMerge(defaultChatFeatures(d.chat_id), d))
    }

    async isLinkScanActive(chatId: string): Promise<boolean> {
        const doc = await db.findOneAsync({ chat_id: chatId, 'linkscan.status': true })
        return Boolean(doc)
    }

    /** Remove o canal (mesma plataforma e nome, sem diferenciar maiúsculas). Devolve se existia. */
    static sameChannel(a: Pick<LiveChannel, 'platform' | 'channel'>, b: Pick<LiveChannel, 'platform' | 'channel'>) {
        return a.platform === b.platform && a.channel.toLowerCase() === b.channel.toLowerCase()
    }
}
