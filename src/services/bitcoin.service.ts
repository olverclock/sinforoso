import axios from "axios";
import { HTTP_TIMEOUT } from "../utils/general.util.js";

export interface BitcoinPrices {
    brl: number;
    usd: number;
    eur: number;
    last_update: string;
}

export class BitcoinService {
    private static instance: BitcoinService;
    private readonly baseUrl = "https://blockchain.info/ticker";

    private constructor() { }

    public static getInstance(): BitcoinService {
        if (!BitcoinService.instance) {
            BitcoinService.instance = new BitcoinService();
        }
        return BitcoinService.instance;
    }

    /**
     * Busca cotações do Bitcoin via blockchain.info (Altamente confiável e grátis)
     */
    public async getPrices(): Promise<BitcoinPrices> {
        try {
            const response = await axios.get(this.baseUrl, { timeout: HTTP_TIMEOUT.api });
            const data = response.data;

            return {
                brl: data.BRL.last,
                usd: data.USD.last,
                eur: data.EUR.last,
                last_update: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
            };
        } catch (error) {
            throw new Error("⚠️ *ERRO FINANCEIRO:* Não foi possível obter a cotação do Bitcoin no momento.");
        }
    }
}
