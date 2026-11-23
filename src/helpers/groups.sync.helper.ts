import { WASocket } from 'baileys'
import { BotController } from '../controllers/bot.controller.js'
import { buildText, showConsoleError, colorText } from '../utils/general.util.js'
import { GroupController } from '../controllers/group.controller.js'
import botTexts from '../helpers/bot.texts.helper.js'
import * as waUtil from '../utils/whatsapp.util.js'
import { antifakeAllows, inList, sameUser } from '../utils/identity.util.js'

export async function syncGroupsOnStart(client: WASocket) {
    try {
        const groupsMetadata = await waUtil.getAllGroups(client)

        if (groupsMetadata.length) {
            let groupController = new GroupController()
            await groupController.syncGroups(groupsMetadata)

            // Executa syncResources em background para não bloquear o startup
            // O bot já pode responder mensagens enquanto isso acontece
            syncResources(client).then(() => {
                console.log(colorText(botTexts.groups_loaded))
            }).catch(err => {
                showConsoleError(err, "SYNC-RESOURCES-BACKGROUND")
            })
        }

        return true
    } catch (err) {
        showConsoleError(err, "GROUPS-START-UPDATE")
        client.end(new Error("fatal_error"))
    }
    return true
}

async function syncResources(client: WASocket) {
    const groupController = new GroupController()
    const currentGroups = await groupController.getAllGroups()
    const botInfo = new BotController().getBot()

    // Sincronização sequencial controlada para evitar erro 408 (Connection was lost)
    for (const group of currentGroups) {
        const participants = await groupController.getParticipants(group.id)
        const isBotAdmin = botInfo.host_number ? await groupController.isParticipantAdmin(group.id, botInfo.host_number) : false
        let bannedByBlackList = 0
        let bannedByAntiFake = 0

        if (isBotAdmin) {
            // Processar participantes do grupo sequencialmente para garantir atomicidade e evitar spam de rede
            for (const participant of participants) {
                const isUserBlacklisted = inList(group.blacklist, participant.user_id)
                const isBotNumber = sameUser(participant.user_id, botInfo.host_number)

                //Sync LISTA-NEGRA
                if (isUserBlacklisted) {
                    await waUtil.removeParticipant(client, group.id, participant.user_id)
                    bannedByBlackList++
                    continue
                }

                //Sync ANTI-FAKE
                if (group.antifake.status) {
                    // Confere o número de telefone real (o LID não revela o país); desconhecido = não remove
                    const allowed = antifakeAllows(participant.user_id, group.antifake.exceptions.prefixes, group.antifake.exceptions.numbers)

                    if (allowed === false && !participant.admin && !isBotNumber) {
                        await waUtil.removeParticipant(client, group.id, participant.user_id)
                        bannedByAntiFake++
                    }
                }
            }

            if (bannedByBlackList) {
                const replyText = buildText(botTexts.sync_blacklist, bannedByBlackList)
                await waUtil.sendText(client, group.id, replyText, { expiration: group.expiration })
            }

            if (bannedByAntiFake) {
                const replyText = buildText(botTexts.sync_antifake, bannedByAntiFake)
                await waUtil.sendText(client, group.id, replyText, { expiration: group.expiration })
            }
        } else if (group.antifake.status) {
            await groupController.setAntiFake(group.id, false)
        }
    }
}