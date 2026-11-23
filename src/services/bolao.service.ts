import DataStore from "@seald-io/nedb";
import { UserService } from "./user.service.js";

export interface Bet {
    participant_id: string;
    prediction: string;
}

export interface Pool {
    _id?: string;
    group_id: string;
    event_name: string;
    options?: string[]; // Optional: can be open-ended
    bets: Bet[];
    active: boolean;
    created_at: number;
}

export const db = new DataStore<Pool>({ filename: './storage/bolao.db', autoload: true });

export class BolaoService {
    private userService = UserService.getInstance();

    async createPool(group_id: string, event_name: string): Promise<Pool> {
        const existing = await db.findOneAsync({ group_id, active: true });
        if (existing) throw new Error("Já existe um bolão ativo neste grupo!");

        const newPool: Pool = {
            group_id,
            event_name,
            bets: [],
            active: true,
            created_at: Date.now()
        };

        return await db.insertAsync(newPool);
    }

    async placeBet(group_id: string, participant_id: string, prediction: string): Promise<void> {
        const pool = await db.findOneAsync({ group_id, active: true });
        if (!pool) throw new Error("Não há nenhum bolão ativo no momento!");

        const existingBetIndex = pool.bets.findIndex(b => b.participant_id === participant_id);
        if (existingBetIndex !== -1) {
            pool.bets[existingBetIndex].prediction = prediction;
        } else {
            pool.bets.push({ participant_id, prediction });
        }

        await db.updateAsync({ _id: pool._id }, { $set: { bets: pool.bets } });
    }

    async resolvePool(group_id: string, winning_prediction: string): Promise<{ winners: string[], xp_awarded: number }> {
        const pool = await db.findOneAsync({ group_id, active: true });
        if (!pool) throw new Error("Não há nenhum bolão ativo para encerrar!");

        const winners = pool.bets.filter(b => b.prediction.toLowerCase() === winning_prediction.toLowerCase());
        const xp_per_winner = 500; // Standard reward

        for (const winner of winners) {
            await this.userService.addXp(winner.participant_id, xp_per_winner);
        }

        await db.updateAsync({ _id: pool._id }, { $set: { active: false } });

        return {
            winners: winners.map(w => w.participant_id),
            xp_awarded: xp_per_winner
        };
    }

    async getActivePool(group_id: string): Promise<Pool | null> {
        return await db.findOneAsync({ group_id, active: true });
    }
}
