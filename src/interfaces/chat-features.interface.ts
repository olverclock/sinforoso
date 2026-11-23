/** Plataformas de live suportadas pelo !live. */
export type LivePlatform = 'twitch' | 'kick' | 'youtube' | 'tiktok'

export interface LiveChannel {
    platform: LivePlatform
    /** Nome do canal como o usuário digitou (login da Twitch, slug do Kick, @ do YouTube ou TikTok). */
    channel: string
    /** Último estado visto: true = ao vivo. undefined = ainda não verificado. */
    live?: boolean
    /** Identificador da última live avisada (evita avisar a mesma live duas vezes). */
    last_stream_id?: string
}

export type PhraseScheduleMode = 'daily' | 'interval'

/** Frase do banco de frases automáticas (autor só para citações de domínio público). */
export interface Phrase { text: string, author?: string }

/** Configurações dos recursos automáticos de um chat (grupo ou privado). */
export interface ChatFeatures {
    chat_id: string
    freegames: {
        status: boolean
        /** IDs do GamerPower já postados neste chat. */
        posted_ids: number[]
    }
    lives: {
        status: boolean
        channels: LiveChannel[]
    }
    phrases: {
        status: boolean
        mode: PhraseScheduleMode
        /** Horário diário "HH:MM" (fuso America/Sao_Paulo). */
        time: string
        /** Intervalo em minutos para o modo "interval". */
        interval_minutes: number
        /** Momento (ms) do último envio. */
        last_sent: number
        /** Posição na ordem embaralhada das frases deste chat. */
        cursor: number
    }
    linkscan: {
        status: boolean
    }
    /** Regras do grupo (!regras); "auto" envia as regras para quem entra. */
    rules: {
        text: string
        auto: boolean
    }
    /** Verificação de novos membros (!verificacao): quem entra responde uma conta simples. */
    captcha: {
        status: boolean
        minutes: number
    }
    /** Filtro de golpes (!antigolpe). */
    antiscam: {
        status: boolean
    }
    /** Convites do Discord do grupo (!discord): nome da comunidade + link. */
    discord: DiscordInvite[]
    /** Sorteios (!sorteio): animações ligadas ou só texto. */
    giveaway: {
        animations: boolean
    }
}

export interface DiscordInvite { name: string, url: string }
