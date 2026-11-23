import { WASocket } from "baileys";
import { Bot } from "../interfaces/bot.interface.js";
import { Group } from "../interfaces/group.interface.js";
import { Message } from "../interfaces/message.interface.js";
import { commandExist } from "../utils/commands.util.js";
import * as procs from './message.procedures.helper.js'

export async function handlePrivateMessage(client: WASocket, botInfo: Bot, message: Message) {
    const isCommand = commandExist(botInfo.prefix, message.command)
    const isAutosticker = ((message.type === 'videoMessage' || message.type === "imageMessage") && botInfo.autosticker)
    let callCommand: boolean

    //Verifica se o usuário está bloqueado, se estiver retorna.
    if (await procs.isUserBlocked(client, message)) {
        return false
    }

    //Atualize o nome do usuário
    await procs.updateUserName(message)

    //Verifica se é um registro de dono, se for retorne.
    if (await procs.isOwnerRegister(client, botInfo, message)) {
        return false
    }

    //Se o PV do bot não estiver liberado e o usuário não for um admin, retorne.
    if (procs.isIgnoredByPvAllowed(botInfo, message)) {
        return false
    }

    //Se o modo admin estiver ativado e o usuário não for um admin do bot, retorne.
    if (procs.isIgnoredByAdminMode(botInfo, message)) {
        return false
    }

    //Se o usuário não tiver recebido boas vindas no PV, faça-o
    await procs.sendPrivateWelcome(client, botInfo, message)

    //Leia a mensagem do usuário
    await procs.readUserMessage(client, message)

    //Proteção de links e arquivos (VirusTotal), em segundo plano, se ativada no chat
    procs.scanMessageThreats(client, botInfo, undefined, message, isCommand)

    //Arquivos de uma coleta aberta (!pdf juntar / !pdf fotos)
    procs.collectDocumentFile(client, message, isCommand)

    if (isCommand || isAutosticker) {
        //Se a taxa de comandos estiver ativado e o usuário estiver limitado, retorne.
        if (await procs.isUserLimitedByCommandRate(client, botInfo, message)) {
            return false
        }

        //Se o comando estiver bloqueado globalmente, retorne.
        if (await procs.isCommandBlockedGlobally(client, botInfo, message)) {
            return false
        }

        //Incrementa contagem de comandos do usuário
        await procs.incrementUserCommandsCount(message)

        //Incrementa contagem de comandos do bot
        procs.incrementBotCommandsCount()

        callCommand = true
    } else {
        const isClaimMessage = await procs.handleCardClaim(client, botInfo, message)
        if (isClaimMessage) return false

        const isGameMessage = await procs.handleGameMessage(client, botInfo, undefined, message)
        if (isGameMessage) return false

        callCommand = false
    }

    return callCommand
}

export async function handleGroupMessage(client: WASocket, group: Group, botInfo: Bot, message: Message) {
    const isCommand = commandExist(botInfo.prefix, message.command)
    const isAutosticker = ((message.type === 'videoMessage' || message.type === "imageMessage") && group?.autosticker)
    let callCommand: boolean

    //Atualize o nome do usuário
    await procs.updateUserName(message)

    //Se o grupo estiver restrito para admins e o bot não for um admin, retorne.
    if (await procs.isBotLimitedByGroupRestricted(group, botInfo)) {
        return false
    }

    //Se o antilink estiver ativado, e for detectado um link na mensagem, retorne.
    if (await procs.isDetectedByAntiLink(client, botInfo, group, message)) {
        return false
    }

    //Se uma palavra do filtro for detectada, retorne.
    if (await procs.isDetectedByWordFilter(client, botInfo, group, message)) {
        return false
    }

    //Se o Anti-VCard estiver ativado, e for detectado um VCard, retorne.
    if (await procs.isDetectedByAntiVcard(client, botInfo, group, message)) {
        return false
    }

    //Se o Anti-Catalog estiver ativado, e for detectado um catálogo, retorne.
    if (await procs.isDetectedByAntiCatalog(client, botInfo, group, message)) {
        return false
    }

    //Se o Anti-FLOOD estiver ativado, e for detectada como FLOOD, retorne.
    if (await procs.isDetectedByAntiFlood(client, botInfo, group, message)) {
        return false
    }

    //Proteção de links e arquivos (VirusTotal), em segundo plano, se ativada no grupo
    procs.scanMessageThreats(client, botInfo, group, message, isCommand)

    //Verificação de novos membros e filtro de golpes, em segundo plano, se ativados no grupo
    procs.groupGuards(client, botInfo, group, message, isCommand)

    //Arquivos de uma coleta aberta (!pdf juntar / !pdf fotos)
    procs.collectDocumentFile(client, message, isCommand)

    //Verifica se é um registro de dono, se for retorne.
    if (await procs.isOwnerRegister(client, botInfo, message)) {
        return false
    }

    //Incrementa a contagem do participante e verifica strikes.
    await procs.incrementParticipantActivity(client, group, message, isCommand)

    //Se o grupo estiver mutado e o participante não for um admin, retorne.
    if (procs.isIgnoredByGroupMuted(group, message)) {
        return false
    }

    //Se o modo admin estiver ativado e o usuário não for um admin do bot, retorne.
    if (procs.isIgnoredByAdminMode(botInfo, message)) {
        return false
    }

    //Verifica se o usuário está bloqueado, se estiver retorna.
    if (await procs.isUserBlocked(client, message)) {
        return false
    }

    //Leia a mensagem do usuário
    await procs.readUserMessage(client, message)

    if (isCommand || isAutosticker) {
        //Se a taxa de comandos estiver ativa e o usuário estiver limitado, retorne.
        if (await procs.isUserLimitedByCommandRate(client, botInfo, message)) {
            return false
        }

        //Se o comando estiver bloqueado globalmente, retorne.
        if (await procs.isCommandBlockedGlobally(client, botInfo, message)) {
            return false
        }

        //Se o comando estiver bloqueado no grupo, retorne.
        if (await procs.isCommandBlockedGroup(client, group, botInfo, message)) {
            return false
        }

        //Incrementa contagem de comandos do usuário
        await procs.incrementUserCommandsCount(message)

        //Incrementa contagem de comandos do bot
        procs.incrementBotCommandsCount()

        //Incrementa contagem de comandos do grupo
        await procs.incrementGroupCommandsCount(group)

        callCommand = true
    } else {
        const isClaimMessage = await procs.handleCardClaim(client, botInfo, message)
        if (isClaimMessage) return false

        const isGameMessage = await procs.handleGameMessage(client, botInfo, group, message)
        if (isGameMessage) return false

        await procs.autoReply(client, botInfo, group, message)

        callCommand = false
    }

    return callCommand
}