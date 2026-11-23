import {WASocket, ParticipantAction} from 'baileys'
import { buildText, showConsoleError} from '../utils/general.util.js'
import { Bot } from '../interfaces/bot.interface.js'
import { Group } from '../interfaces/group.interface.js'
import { GroupController } from '../controllers/group.controller.js'
import botTexts from '../helpers/bot.texts.helper.js'
import { removeParticipant, sendTextWithMentions, removeWhatsappSuffix } from '../utils/whatsapp.util.js'
import { ChatFeaturesService } from '../services/chat-features.service.js'
import { antifakeAllows, inList, linkIds, phoneOf, sameUser } from '../utils/identity.util.js'
import { CaptchaService } from '../services/captcha.service.js'
import { ReminderService } from '../services/reminder.service.js'
import { groupExtraTexts } from '../commands/group.extra.texts.commands.js'

export async function groupParticipantsUpdated (client: WASocket, event: {id: string, author: string, participants: string[], action: ParticipantAction}, botInfo: Bot){
    try{
        const groupController = new GroupController()
        const isBotUpdate = sameUser(event.participants[0], botInfo.host_number)
        const group = await groupController.getGroup(event.id)

        if (!group) {
            return
        }

        if (event.action === 'add') {
            const isParticipant = await groupController.isParticipant(group.id, event.participants[0])

            if (isParticipant) return

            if (await isParticipantBlacklisted(client, botInfo, group, event.participants[0])) return
            else if (await isParticipantFake(client, botInfo, group, event.participants[0])) return
            
            await sendWelcome(client, group, botInfo, event.participants[0])
            await groupController.addParticipant(group.id, event.participants[0])
            await onMemberJoined(client, botInfo, group, event.participants[0])
        } else if (event.action === "remove"){
            const isParticipant = await groupController.isParticipant(group.id, event.participants[0])

            if (!isParticipant) return
            
            if (isBotUpdate) await groupController.removeGroup(event.id)
            else await groupController.removeParticipant(group.id, event.participants[0])
            await onMemberLeft(group.id, event.participants[0], isBotUpdate)
        } else if (event.action === "promote"){
            const isAdmin = await groupController.isParticipantAdmin(group.id, event.participants[0])

            if (isAdmin) return
        
            await groupController.setAdmin(event.id, event.participants[0], true)
        } else if (event.action === "demote"){
            const isAdmin = await groupController.isParticipantAdmin(group.id, event.participants[0])

            if (!isAdmin) return
            
            await groupController.setAdmin(event.id, event.participants[0], false)
        }
    } catch (err){
        showConsoleError(err, "GROUP-PARTICIPANTS-UPDATE")
        client.end(new Error("fatal_error"))
    }
}

async function isParticipantBlacklisted(client: WASocket, botInfo: Bot, group: Group, userId: string){
    const groupController = new GroupController()
    const isUserBlacklisted = inList(group.blacklist, userId)
    const isBotAdmin = botInfo.host_number ? await groupController.isParticipantAdmin(group.id, botInfo.host_number) : false

    if (isBotAdmin && isUserBlacklisted) {
        const replyText = buildText(botTexts.blacklist_ban_message, removeWhatsappSuffix(userId), botInfo.name)
        await removeParticipant(client, group.id, userId)
        await sendTextWithMentions(client, group.id, replyText, [userId], {expiration: group.expiration})
        return true
    }

    return false
}

async function isParticipantFake(client: WASocket, botInfo: Bot, group: Group, userId: string){
    if (group.antifake.status){
        const groupController = new GroupController()
        const isBotAdmin = botInfo.host_number ? await groupController.isParticipantAdmin(group.id, botInfo.host_number) : false
        const isGroupAdmin = await groupController.isParticipantAdmin(group.id, userId)
        const isBotNumber = sameUser(userId, botInfo.host_number)

        if (isBotAdmin){
            // Quem entra pode chegar só com o LID: pede os dados do grupo para descobrir o número
            if (!phoneOf(userId)) await learnPhoneNumbers(client, group.id)
            const allowed = antifakeAllows(userId, group.antifake.exceptions.prefixes, group.antifake.exceptions.numbers)

            // allowed === null: número desconhecido, não dá para saber o país; ninguém é removido por engano
            if (allowed === false && !isBotNumber && !isGroupAdmin){
                const replyText = buildText(botTexts.antifake_ban_message, phoneOf(userId) ?? removeWhatsappSuffix(userId), botInfo.name)
                await sendTextWithMentions(client, group.id, replyText , [userId], {expiration: group.expiration})
                await removeParticipant(client, group.id, userId)
                return true
            }
        } else {
            await groupController.setAntiFake(group.id, false)
        }
    }

    return false
}

async function sendWelcome(client: WASocket, group: Group, _botInfo: Bot, userId: string){
    if (group.welcome.status) {
        const customMessage = group.welcome.msg ?  group.welcome.msg + "\n\n" : ""
        const welcomeMessage = buildText(botTexts.group_welcome_message, removeWhatsappSuffix(userId), group.name, customMessage)
        await sendTextWithMentions(client, group.id, welcomeMessage, [userId], {expiration: group.expiration})
    }
}

/**
 * Recursos extras na entrada de um membro: verificação anti-robô (!verificacao) e envio das regras
 * (!regrasauto). Erros aqui só são registrados: nunca derrubam a conexão.
 */
async function onMemberJoined(client: WASocket, botInfo: Bot, group: Group, userId: string) {
    try {
        if (sameUser(userId, botInfo.host_number)) return
const settings = await new ChatFeaturesService().get(group.id)
        const texts = groupExtraTexts
        if (settings.captcha.status && !(await new GroupController().isParticipantAdmin(group.id, userId))) {
            const question = await new CaptchaService().start(group.id, userId, settings.captcha.minutes, group.expiration)
            const challenge = buildText(texts.verificacao.msgs.challenge, removeWhatsappSuffix(userId), question, settings.captcha.minutes)
            await sendTextWithMentions(client, group.id, challenge, [userId], { expiration: group.expiration })
        }
        if (settings.rules.auto && settings.rules.text) {
            const rules = buildText(texts.regrasauto.msgs.welcome, removeWhatsappSuffix(userId), settings.rules.text)
            await sendTextWithMentions(client, group.id, rules, [userId], { expiration: group.expiration })
        }
    } catch (err) {
        showConsoleError(err, "GROUP-JOIN-EXTRAS")
    }
}

/** Saída: descarta a verificação pendente; se quem saiu foi o bot, também os agendamentos do grupo. */
async function onMemberLeft(groupId: string, userId: string, isBotUpdate: boolean) {
    try {
        await new CaptchaService().remove(groupId, userId)
        if (isBotUpdate) await new ReminderService().removeChat(groupId)
    } catch (err) {
        showConsoleError(err, "GROUP-LEAVE-EXTRAS")
    }
}

/** Liga LID e número de telefone dos participantes a partir dos dados oficiais do grupo. */
async function learnPhoneNumbers(client: WASocket, groupId: string) {
    try {
        const metadata = await client.groupMetadata(groupId)
        for (const p of metadata.participants) { linkIds(p.id, p.phoneNumber); linkIds(p.id, p.lid) }
    } catch (err) {
        showConsoleError(err, "GROUP-METADATA")
    }
}
