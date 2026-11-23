
export interface CasinoResult {
    slots: string[];
    multiplier: number;
    isWin: boolean;
}

export class CasinoService {
    private static instance: CasinoService;
    private readonly emojis = ["🍒", "🍋", "🍇", "🍏", "🎰", "💎", "🍎"];
    private readonly cooldowns: Map<string, number> = new Map();

    private constructor() { }

    public static getInstance(): CasinoService {
        if (!CasinoService.instance) {
            CasinoService.instance = new CasinoService();
        }
        return CasinoService.instance;
    }

    /**
     * Gera um resultado aleatório para o cassino
     */
    public rollSlots(): CasinoResult {
        const slots = [
            this.getRandomEmoji(),
            this.getRandomEmoji(),
            this.getRandomEmoji()
        ];

        const multiplier = this.calculateMultiplier(slots);
        return {
            slots,
            multiplier,
            isWin: multiplier > 0
        };
    }

    /**
     * Calcula o multiplicador com base nos resultados
     * 3 iguais = 10x
     * 2 iguais = 2x
     * Diferentes = 0x
     */
    private calculateMultiplier(slots: string[]): number {
        const [s1, s2, s3] = slots;

        if (s1 === s2 && s2 === s3) {
            return 10;
        }

        if (s1 === s2 || s2 === s3 || s1 === s3) {
            return 2;
        }

        return 0;
    }

    private getRandomEmoji(): string {
        return this.emojis[Math.floor(Math.random() * this.emojis.length)];
    }

    /**
     * Verifica e atualiza o cooldown para um usuário
     */
    public checkCooldown(userId: string): { canRun: boolean, remaining?: number } {
        const now = Date.now();
        const lastRun = this.cooldowns.get(userId) || 0;
        const cooldownMs = 30000; // 30 segundos

        if (now - lastRun < cooldownMs) {
            return {
                canRun: false,
                remaining: Math.ceil((cooldownMs - (now - lastRun)) / 1000)
            };
        }

        this.cooldowns.set(userId, now);
        return { canRun: true };
    }
}
