import DataStore from "@seald-io/nedb";
import { User } from "../interfaces/user.interface.js";
import moment from "moment";
import { Bot } from "../interfaces/bot.interface.js";
import { deepMerge } from "../utils/general.util.js";
import { normalizeJid } from "../utils/whatsapp.util.js";
export const db = new DataStore<User>({ filename: './storage/users.db', autoload: true })

export class UserService {
    private static instance: UserService;

    private constructor() { }

    public static getInstance(): UserService {
        if (!UserService.instance) {
            UserService.instance = new UserService();
        }
        return UserService.instance;
    }

    private defaultUser: User = {
        id: '',
        name: '',
        commands: 0,
        receivedWelcome: false,
        owner: false,
        admin: false,
        command_rate: {
            limited: false,
            expire_limited: 0,
            cmds: 1,
            expire_cmds: Math.round(moment.now() / 1000) + 60
        },
        fortnite_nick: '',
        free_games_sub: false,
        free_games_mode: "completo",
        xp: 0,
        cards_collected: 0,
        daily_rolls: {
            count: 0,
            reset_date: moment().format('YYYY-MM-DD')
        },
        roll_streak: 0,
        last_roll_date: ''
    }

    public async registerUser(userId: string, name?: string | null) {
        const normalizedUserId = normalizeJid(userId)
        const user = await this.getUser(normalizedUserId)

        // Baileys v7: Permitir IDs normais (@s.whatsapp.net) e novos LIDs (@lid)
        if (!user) {
            if (!userId.endsWith('@s.whatsapp.net') && !userId.endsWith('@lid')) return

            const userData: User = {
                ...this.defaultUser,
                id: normalizedUserId,
                name: name || 'Usuário'
            }
            await db.insertAsync(userData)
        } else if (name && name !== 'Usuário' && user.name !== name) {
            await this.setName(normalizedUserId, name)
        }

        // Auto-Sync Admin: Garantir que privilégios sejam espelhados entre IDs (Ex: Celular LID <-> Web JID)
        // Só tenta sincronizar se o usuário atual NÃO for admin mas existir outro com mesmo nome que SEJA
        if (name && name !== 'Usuário') {
            await this.autoSyncAdmin(normalizedUserId, name)
        }
    }

    private async autoSyncAdmin(userId: string, name: string) {
        const currentUser = await this.getUser(userId)
        if (currentUser && currentUser.admin) return // Já é admin, nada a fazer

        const existingAdmin = await db.findOneAsync({ name: name, admin: true, id: { $ne: userId } }) as User | null
        if (existingAdmin) {
            await db.updateAsync({ id: userId }, { $set: { admin: true, owner: existingAdmin.owner } })
        }
    }

    public async migrateUsers() {
        const users = await this.getUsers()

        for (let user of users) {
            const oldUserData = user as unknown // deepMerge aceita dados antigos de formato desconhecido
            const updatedUserData: User = deepMerge(this.defaultUser, oldUserData)
            await db.updateAsync({ id: user.id }, { $set: updatedUserData }, { upsert: true })
        }
    }

    public async getUser(userId: string) {
        const user = await db.findOneAsync({ id: normalizeJid(userId) }) as User | null
        return user
    }

    public async getUsers() {
        const users = await db.findAsync({}) as User[]
        return users
    }

    public async setAdmin(userId: string, admin: boolean) {
        // Usar upsert para garantir que o usuário seja criado se ainda não existir
        await db.updateAsync({ id: normalizeJid(userId) }, { $set: { admin } }, { upsert: true })
    }

    public async getAdmins() {
        const admins = await db.findAsync({ admin: true }) as User[]
        return admins
    }

    public async setOwner(userId: string) {
        // Garantir registro e promoção atômica com upsert
        await db.updateAsync({ id: normalizeJid(userId) }, { $set: { owner: true, admin: true } }, { upsert: true })
    }

    public async getOwner() {
        const owner = await db.findOneAsync({ owner: true }) as User | null
        return owner
    }

    public async setName(userId: string, name: string) {
        await db.updateAsync({ id: normalizeJid(userId) }, { $set: { name } }, { upsert: true })
    }

    public async setReceivedWelcome(userId: string, status = true) {
        await db.updateAsync({ id: normalizeJid(userId) }, { $set: { receivedWelcome: status } }, { upsert: true })
    }

    public async increaseUserCommandsCount(userId: string) {
        await db.updateAsync({ id: normalizeJid(userId) }, { $inc: { commands: 1 } }, { upsert: true })
    }

    public async expireCommandsRate(userId: string, currentTimestamp: number) {
        const expireTimestamp = currentTimestamp + 60
        await db.updateAsync({ id: normalizeJid(userId) }, { $set: { 'command_rate.expire_cmds': expireTimestamp, 'command_rate.cmds': 1 } }, { upsert: true })
    }

    public async incrementCommandRate(userId: string) {
        await db.updateAsync({ id: normalizeJid(userId) }, { $inc: { "command_rate.cmds": 1 } }, { upsert: true })
    }

    public async setLimitedUser(userId: string, isLimited: boolean, botInfo: Bot, currentTimestamp: number) {
        if (isLimited) {
            await db.updateAsync({ id: normalizeJid(userId) }, { $set: { 'command_rate.limited': isLimited, 'command_rate.expire_limited': currentTimestamp + botInfo.command_rate.block_time } }, { upsert: true })
        } else {
            await db.updateAsync({ id: normalizeJid(userId) }, { $set: { 'command_rate.limited': isLimited, 'command_rate.expire_limited': 0, 'command_rate.cmds': 1, 'command_rate.expire_cmds': currentTimestamp + 60 } }, { upsert: true })
        }
    }

    public async setFortniteNick(userId: string, nick: string) {
        await db.updateAsync({ id: normalizeJid(userId) }, { $set: { fortnite_nick: nick } }, { upsert: true })
    }

    public async setFreeGamesSub(userId: string, sub: boolean) {
        await db.updateAsync({ id: normalizeJid(userId) }, { $set: { free_games_sub: sub } }, { upsert: true })
    }

    public async setFreeGamesMode(userId: string, mode: "resumido" | "completo") {
        await db.updateAsync({ id: normalizeJid(userId) }, { $set: { free_games_mode: mode } }, { upsert: true })
    }

    public async addXp(userId: string, amount: number) {
        await db.updateAsync({ id: normalizeJid(userId) }, { $inc: { xp: amount } }, { upsert: true })
    }

    public async spendXp(userId: string, amount: number): Promise<boolean> {
        const user = await this.getUser(userId)
        if (!user || (user.xp || 0) < amount) return false
        await db.updateAsync({ id: normalizeJid(userId) }, { $inc: { xp: -amount } })
        return true
    }

    public async incrementCardsCollected(userId: string) {
        await db.updateAsync({ id: normalizeJid(userId) }, { $inc: { cards_collected: 1 } }, { upsert: true })
    }

    public async getRollsInfo(userId: string) {
        let user = await this.getUser(userId)
        const today = moment().format('YYYY-MM-DD')

        if (!user || user.daily_rolls?.reset_date !== today) {
            await db.updateAsync(
                { id: normalizeJid(userId) },
                { $set: { 'daily_rolls.reset_date': today, 'daily_rolls.count': 0 } },
                { upsert: true }
            )
            user = await this.getUser(userId)
        }

        return user?.daily_rolls || { count: 0, reset_date: today }
    }

    public async useRoll(userId: string) {
        const normalizedId = normalizeJid(userId)
        const today = moment().format('YYYY-MM-DD')
        const yesterday = moment().subtract(1, 'day').format('YYYY-MM-DD')
        const user = await this.getUser(normalizedId)

        // Update streak logic
        let newStreak = 1
        if (user?.last_roll_date === yesterday) {
            newStreak = (user.roll_streak || 0) + 1
        } else if (user?.last_roll_date === today) {
            newStreak = user.roll_streak || 1 // Don't increment if already rolled today
        }

        await db.updateAsync(
            { id: normalizedId },
            {
                $inc: { 'daily_rolls.count': 1 },
                $set: { last_roll_date: today, roll_streak: newStreak }
            },
            { upsert: true }
        )
    }

    /**
     * Checks if user is eligible for a weekly streak bonus (7 consecutive days).
     * Returns true if streak is exactly 7 (triggers bonus and resets).
     */
    public async checkAndResetWeeklyStreak(userId: string): Promise<boolean> {
        const user = await this.getUser(userId)
        if (user && (user.roll_streak || 0) >= 7) {
            await db.updateAsync(
                { id: normalizeJid(userId) },
                { $set: { roll_streak: 0 } }
            )
            return true
        }
        return false
    }
}