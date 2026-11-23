import axios from "axios";
import { translateText } from "../utils/misc.util.js";
import { HTTP_TIMEOUT } from "../utils/general.util.js";

export interface Giveaway {
    id: number;
    title: string;
    worth: string;
    thumbnail: string;
    description: string;
    instructions: string;
    open_giveaway_url: string;
    published_date: string;
    type: string;
    platforms: string;
    end_date: string;
    status: string;
}

export class FreeStuffService {
    private static instance: FreeStuffService;
    private readonly apiUrl = "https://www.gamerpower.com/api/giveaways";
    private notifiedIds: Set<number> = new Set();
    private translationCache: Map<number, { description: string, instructions: string }> = new Map();

    private constructor() { }

    public static getInstance(): FreeStuffService {
        if (!FreeStuffService.instance) {
            FreeStuffService.instance = new FreeStuffService();
        }
        return FreeStuffService.instance;
    }

    /**
     * Busca todos os giveaways ativos da API do GamerPower
     */
    public async getGiveaways(): Promise<Giveaway[]> {
        try {
            const response = await axios.get(this.apiUrl, { timeout: HTTP_TIMEOUT.api });
            return response.data;
        } catch (error) {
            console.error("Erro ao buscar giveaways:", error);
            throw new Error("⚠️ *ERRO:* Não foi possível buscar os jogos grátis no momento.");
        }
    }

    /**
     * Filtra giveaways relevantes (Games e que não sejam apenas beta keys ou moedas de jogo secundárias se possível)
     * Também verifica se são válidos (status: Active)
     */
    public filterRelevant(giveaways: Giveaway[]): Giveaway[] {
        return giveaways.filter(g =>
            g.status === "Active" &&
            (g.type === "Game" || g.type === "Full Game")
        );
    }

    /**
     * Retorna apenas os novos giveaways (que ainda não foram notificados nesta sessão)
     */
    public getNewGiveaways(giveaways: Giveaway[]): Giveaway[] {
        const relevant = this.filterRelevant(giveaways);
        const news = relevant.filter(g => !this.notifiedIds.has(g.id));

        // Adiciona ao set de notificados
        news.forEach(g => this.notifiedIds.add(g.id));

        return news;
    }

    /**
     * Gera um "sal metálico" aleatório para diversificar as mensagens e evitar filtros de spam.
     */
    private getRandomSalt(): string {
        const salts = ["🎮", "🕹️", "🎁", "✨", "🔥", "🚀", "👾", "⭐", "🔹", "📢"];
        const randomEmoji = salts[Math.floor(Math.random() * salts.length)];
        const uniqueId = Math.random().toString(36).substring(7).toUpperCase();
        return `\n\n_Ref: [${uniqueId}] ${randomEmoji}_`;
    }

    /**
     * Traduz os campos de texto do giveaway para PT-BR com cache para performance
     */
    public async translateGiveaway(g: Giveaway): Promise<{ description: string, instructions: string }> {
        if (this.translationCache.has(g.id)) {
            return this.translationCache.get(g.id)!;
        }

        try {
            const description = await translateText(g.description, "pt");
            const instructions = await translateText(g.instructions, "pt");
            const result = { description, instructions };
            this.translationCache.set(g.id, result);
            return result;
        } catch (error) {
            // Fallback para o original em inglês se a tradução falhar
            return { description: g.description, instructions: g.instructions };
        }
    }

    /**
     * Formata um giveaway em uma mensagem elegante em PT-BR
     */
    public async formatGiveaway(g: Giveaway, mode: "resumido" | "completo" = "completo"): Promise<string> {
        const platform = g.platforms.replace("PC", "Computador");
        const endDate = g.end_date !== "N/A" ? g.end_date : "Por tempo limitado";

        if (mode === "resumido") {
            return `🎮 *JOGO GRÁTIS:* ${g.title}\n` +
                `💻 *PLATAFORMA:* ${platform}\n` +
                `⏰ *VÁLIDO ATÉ:* ${endDate}\n` +
                `🔗 *LINK:* ${g.open_giveaway_url}\n` +
                `━━━━━━━━━━━━━━━━━━━━` +
                this.getRandomSalt();
        }

        // Modo Completo: Traduzindo descrição e instruções
        const { description, instructions } = await this.translateGiveaway(g);

        return `🎮 *JOGO GRÁTIS DETECTADO!* 🎮\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🕹️ *Título:* ${g.title}\n` +
            `💰 *Valor Original:* ~${g.worth}~\n` +
            `💻 *Plataforma:* ${platform}\n` +
            `⏰ *Válido até:* ${endDate}\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📝 *Descrição:* ${description}\n\n` +
            `📥 *COMO RESGATAR:* \n` +
            `${instructions}\n\n` +
            `🔗 *LINK DIRETO:* \n${g.open_giveaway_url}\n` +
            `━━━━━━━━━━━━━━━━━━━━` +
            this.getRandomSalt();
    }
}
