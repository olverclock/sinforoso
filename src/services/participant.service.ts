import { Participant, Group } from "../interfaces/group.interface.js";
import { MessageTypes } from "../interfaces/message.interface.js";
import { deepMerge, timestampToDate } from '../utils/general.util.js'
import moment from 'moment-timezone'
import DataStore from "@seald-io/nedb";
import { GroupMetadata } from "baileys";
import { normalizeJid } from "../utils/whatsapp.util.js";
import { idsOf, linkIds } from "../utils/identity.util.js";

export const db = new DataStore<Participant>({ filename: './storage/participants.groups.db', autoload: true })

export class ParticipantService {
    private defaultParticipant: Participant = {
        group_id: '',
        user_id: '',
        registered_since: timestampToDate(moment.now()),
        commands: 0,
        admin: false,
        msgs: 0,
        image: 0,
        audio: 0,
        sticker: 0,
        video: 0,
        text: 0,
        other: 0,
        warnings: 0,
        xp: 0,
        level: 1,
        rank: 'Recruta',
        score: 0,
        antiflood: {
            expire: 0,
            msgs: 0
        }
    }

    /**
     * Identificador com que a pessoa está guardada neste grupo. A mesma pessoa pode chegar como
     * número de telefone (@s.whatsapp.net) ou como LID (@lid); procura por todas as formas conhecidas.
     */
    private async storedId(groupId: string, userId: string): Promise<string> {
        const ids = idsOf(normalizeJid(userId))
        if (ids.length === 1) return ids[0]
        const found = await db.findOneAsync({ group_id: groupId, user_id: { $in: ids } }) as Participant | null
        return found?.user_id ?? ids[0]
    }

    public async syncParticipants(groupMeta: GroupMetadata) {
        // Aprende que o LID e o número de telefone de cada participante são a mesma pessoa
        for (const participant of groupMeta.participants) {
            linkIds(participant.id, participant.phoneNumber)
            linkIds(participant.id, participant.lid)
        }
        //Adiciona participantes no banco de dados que entraram enquanto o bot estava off.
        for (const participant of groupMeta.participants) {
            const normalizedUserId = await this.storedId(groupMeta.id, participant.id)
            const isAdmin = (participant.admin) ? true : false
            const isGroupParticipant = await this.isGroupParticipant(groupMeta.id, normalizedUserId)

            if (!isGroupParticipant) {
                await this.addParticipant(groupMeta.id, normalizedUserId, isAdmin)
            } else {
                await db.updateAsync({ group_id: groupMeta.id, user_id: normalizedUserId }, { $set: { admin: isAdmin } }, { upsert: true })
            }
        }

        //Remove participantes do banco de dados que sairam do grupo enquanto o bot estava off.
        const currentParticipants = await this.getParticipantsFromGroup(groupMeta.id)

        for (const participant of currentParticipants) {
            if (!groupMeta.participants.find(groupMetaParticipant => idsOf(normalizeJid(groupMetaParticipant.id)).includes(participant.user_id))) {
                await this.removeParticipant(groupMeta.id, participant.user_id)
            }
        }
    }

    public async addParticipant(groupId: string, userId: string, isAdmin: boolean) {
        const normalizedUserId = normalizeJid(userId)
        const isGroupParticipant = await this.isGroupParticipant(groupId, normalizedUserId)

        if (isGroupParticipant) return

        const participant: Participant = {
            ...this.defaultParticipant,
            group_id: groupId,
            user_id: normalizedUserId,
            admin: isAdmin
        }

        await db.insertAsync(participant)
    }

    public async migrateParticipants() {
        const participants = await this.getAllParticipants()

        for (let participant of participants) {
            const oldParticipantData = participant as unknown // deepMerge aceita dados antigos de formato desconhecido
            const updatedParticipantData: Participant = deepMerge(this.defaultParticipant, oldParticipantData)
            await db.updateAsync({ group_id: participant.group_id, user_id: participant.user_id }, { $set: updatedParticipantData }, { upsert: true })
        }
    }

    public async removeParticipant(groupId: string, userId: string) {
        await db.removeAsync({ group_id: groupId, user_id: { $in: idsOf(normalizeJid(userId)) } }, { multi: true })
    }

    public async removeParticipants(groupId: string) {
        await db.removeAsync({ group_id: groupId }, { multi: true })
    }

    public async setAdmin(groupId: string, userId: string, status: boolean) {
        await db.updateAsync({ group_id: groupId, user_id: await this.storedId(groupId, userId) }, { $set: { admin: status } }, { upsert: true })
    }

    public async getParticipantFromGroup(groupId: string, userId: string) {
        const participant = await db.findOneAsync({ group_id: groupId, user_id: { $in: idsOf(normalizeJid(userId)) } }) as Participant | null
        return participant
    }

    public async getParticipantsFromGroup(groupId: string) {
        const participants = await db.findAsync({ group_id: groupId }) as Participant[]
        return participants
    }

    public async getAllParticipants() {
        const participants = await db.findAsync({}) as Participant[]
        return participants
    }

    public async getParticipantsIdsFromGroup(groupId: string) {
        const participants = await this.getParticipantsFromGroup(groupId)
        return participants.map(participant => participant.user_id)
    }

    public async getAdminsFromGroup(groupId: string) {
        const admins = await db.findAsync({ group_id: groupId, admin: true }) as Participant[]
        return admins
    }

    public async getAdminsIdsFromGroup(groupId: string) {
        const admins = await db.findAsync({ group_id: groupId, admin: true }) as Participant[]
        return admins.map(admin => admin.user_id)
    }

    public async isGroupParticipant(groupId: string, userId: string) {
        const participantsIds = await this.getParticipantsIdsFromGroup(groupId)
        const ids = idsOf(normalizeJid(userId))
        return participantsIds.some(id => ids.includes(id))
    }

    public async isGroupAdmin(groupId: string, userId: string) {
        const adminsIds = await this.getAdminsIdsFromGroup(groupId)
        const ids = idsOf(normalizeJid(userId))
        return adminsIds.some(id => ids.includes(id))
    }

    public async incrementParticipantActivity(groupId: string, userId: string, type: MessageTypes, isCommand: boolean) {
        let incrementedUser: {
            msgs: number,
            commands?: number,
            text?: number,
            image?: number,
            video?: number,
            sticker?: number,
            audio?: number,
            other?: number
        } = { msgs: 1 }

        if (isCommand) incrementedUser.commands = 1

        switch (type) {
            case "conversation":
            case "extendedTextMessage":
                incrementedUser.text = 1
                break
            case "imageMessage":
                incrementedUser.image = 1
                break
            case "videoMessage":
                incrementedUser.video = 1
                break
            case "stickerMessage":
                incrementedUser.sticker = 1
                break
            case "audioMessage":
                incrementedUser.audio = 1
                break
            case "documentMessage":
                incrementedUser.other = 1
                break
        }

        await db.updateAsync({ group_id: groupId, user_id: await this.storedId(groupId, userId) }, { $inc: incrementedUser }, { upsert: true })

        // Gamificação: Incrementa XP por atividade (10 XP por mensagem/comando)
        await this.addXp(groupId, userId, 10)
    }

    public async addXp(groupId: string, userId: string, amount: number) {
        const participant = await this.getParticipantFromGroup(groupId, userId)
        if (!participant) return

        const newXp = (participant.xp || 0) + amount
        const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1
        const newRank = this.getRankByLevel(newLevel)

        await db.updateAsync(
            { group_id: groupId, user_id: participant.user_id },
            { $set: { xp: newXp, level: newLevel, rank: newRank } }
        )
    }

    public async addScore(groupId: string, userId: string, amount: number) {
        await db.updateAsync(
            { group_id: groupId, user_id: await this.storedId(groupId, userId) },
            { $inc: { score: amount } },
            { upsert: true }
        )
    }

    private getRankByLevel(level: number): string {
        if (level >= 100) return 'Lenda Viva'
        if (level >= 80) return 'Marechal'
        if (level >= 60) return 'General'
        if (level >= 50) return 'Coronel'
        if (level >= 40) return 'Major'
        if (level >= 30) return 'Capitão'
        if (level >= 20) return 'Tenente'
        if (level >= 15) return 'Sargento'
        if (level >= 10) return 'Cabo'
        if (level >= 5) return 'Veterano'
        if (level >= 2) return 'Soldado'
        return 'Recruta'
    }

    public async getParticipantActivityLowerThan(group: Group, num: number) {
        const inactives = await db.findAsync({ group_id: group.id, msgs: { $lt: num } }).sort({ msgs: -1 }) as Participant[]
        return inactives
    }

    public async getParticipantsActivityRanking(group: Group, qty: number) {
        let participantsLeaderboard = await db.findAsync({ group_id: group.id }).sort({ msgs: -1 }) as Participant[]
        const qty_leaderboard = (qty > participantsLeaderboard.length) ? participantsLeaderboard.length : qty
        return participantsLeaderboard.splice(0, qty_leaderboard)
    }

    public async addWarning(groupId: string, userId: string) {
        await db.updateAsync({ group_id: groupId, user_id: await this.storedId(groupId, userId) }, { $inc: { warnings: 1 } }, { upsert: true })
    }

    public async removeWarning(groupId: string, userId: string) {
        await db.updateAsync({ group_id: groupId, user_id: await this.storedId(groupId, userId) }, { $inc: { warnings: -1 } }, { upsert: true })
    }

    public async removeParticipantsWarnings(groupId: string) {
        await db.updateAsync({ group_id: groupId }, { $set: { warnings: 0 } })
    }

    public async expireParticipantAntiFlood(groupId: string, userId: string, newExpireTimestamp: number) {
        await db.updateAsync({ group_id: groupId, user_id: await this.storedId(groupId, userId) }, { $set: { 'antiflood.expire': newExpireTimestamp, 'antiflood.msgs': 1 } }, { upsert: true })
    }

    public async incrementAntiFloodMessage(groupId: string, userId: string) {
        await db.updateAsync({ group_id: groupId, user_id: await this.storedId(groupId, userId) }, { $inc: { 'antiflood.msgs': 1 } }, { upsert: true })
    }

    public async checkStrikes(groupId: string, userId: string, limit: number): Promise<boolean> {
        const participant = await this.getParticipantFromGroup(groupId, userId)
        if (!participant) return false
        return (participant.warnings >= limit)
    }
}