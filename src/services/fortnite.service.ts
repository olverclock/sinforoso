import axios from "axios";
import { errorStatus, HTTP_TIMEOUT } from "../utils/general.util.js";

export interface FortniteStats {
    nick: string;
    level: number;
    overall: StatGroup;
    solo: StatGroup;
    duo: StatGroup;
    squad: StatGroup;
}

interface StatGroup {
    wins: number;
    winRate: number;
    kills: number;
    kd: number;
    matches: number;
}

export class FortniteService {
    private static instance: FortniteService;
    private readonly apiKey = "94f8b746-6296-409c-96ef-836e5fb70b63";
    private readonly baseUrl = "https://fortnite-api.com/v2/stats/br/v2";

    private constructor() { }

    public static getInstance(): FortniteService {
        if (!FortniteService.instance) {
            FortniteService.instance = new FortniteService();
        }
        return FortniteService.instance;
    }

    /**
     * Busca estatísticas profissionais via Fortnite-API.com
     */
    public async getStats(nick: string): Promise<FortniteStats> {
        try {
            const response = await axios.get(this.baseUrl, { timeout: HTTP_TIMEOUT.api,
                params: { name: nick },
                headers: { "Authorization": this.apiKey }
            });

            const data = response.data.data;
            const stats = data.stats.all;

            return {
                nick: data.account.name,
                level: data.battlePass.level,
                overall: this.mapStats(stats.overall),
                solo: this.mapStats(stats.solo),
                duo: this.mapStats(stats.duo),
                squad: this.mapStats(stats.squad)
            };
        } catch (error) {
            if (errorStatus(error) === 403) {
                throw new Error("🔒 *ESTATÍSTICAS PRIVADAS:* Este jogador configurou o perfil como privado no Fortnite.");
            }
            if (errorStatus(error) === 404) {
                throw new Error("❌ *USUÁRIO NÃO ENCONTRADO:* Verifique se o nickname está correto.");
            }
            throw new Error("⚠️ *ERRO NA API:* Não foi possível carregar os dados. Tente novamente mais tarde.");
        }
    }

    private mapStats(raw: Partial<StatGroup> | null | undefined): StatGroup {
        if (!raw) return { wins: 0, winRate: 0, kills: 0, kd: 0, matches: 0 };
        return {
            wins: raw.wins || 0,
            winRate: raw.winRate || 0,
            kills: raw.kills || 0,
            kd: raw.kd || 0,
            matches: raw.matches || 0
        };
    }
}
