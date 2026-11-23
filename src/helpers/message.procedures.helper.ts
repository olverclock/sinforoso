import { WASocket } from "baileys";
import { GameHelpType, GameState } from "../interfaces/game.interface.js";
import { Bot } from "../interfaces/bot.interface.js";
import { Group } from "../interfaces/group.interface.js";
import { Message } from "../interfaces/message.interface.js";
import { UserController } from "../controllers/user.controller.js";
import botTexts from "../helpers/bot.texts.helper.js";
import { GroupController } from "../controllers/group.controller.js";
import { buildText, findLinks, removeFormatting, showConsoleError, errorMessage } from "../utils/general.util.js";
import { BotController } from "../controllers/bot.controller.js";
import * as waUtil from "../utils/whatsapp.util.js"
import moment from "moment";
import { GameService } from "../services/game.service.js";
import gameCommands from "../commands/game.list.commands.js";
import { sendQuestion } from "../commands/game.functions.commands.js";
import { AutomationService } from "../services/automation.service.js";
import { CardGameService } from "../services/cardgame.service.js";
import { downloadMediaMessage } from "baileys";
import { ChatFeaturesService } from "../services/chat-features.service.js";
import { apiKey as virusTotalKey, isDangerous, MAX_SCAN_FILE_BYTES, scanFileHash, scanUrl, sha256, shouldDelete, withScheme, ScanResult } from "../utils/virustotal.util.js";
import { automationTexts } from "../commands/utility.automation.texts.commands.js";
import { collectSessionFile } from "../commands/utility.document.functions.commands.js";
import { groupExtraTexts } from "../commands/group.extra.texts.commands.js";
import { CaptchaService } from "../services/captcha.service.js";
import { scamScore } from "../utils/antiscam.util.js";
import { sameUser } from "../utils/identity.util.js";

const userController = new UserController()
const botController = new BotController()
const groupController = new GroupController()

export async function isUserBlocked(client: WASocket, message: Message) {
    const blockedContacts = await waUtil.getBlockedContacts(client)
    return blockedContacts.includes(message.sender)
}

export async function isOwnerRegister(client: WASocket, botInfo: Bot, message: Message) {
    const admins = await userController.getAdmins()

    if (!admins.length && message.command == `${botInfo.prefix}admin`) {
        await userController.registerOwner(message.sender)
        await waUtil.replyText(client, message.chat_id, buildText(botTexts.admin_registered), message.wa_message, { expiration: message.expiration })
        return true
    }

    return false
}

export async function incrementParticipantActivity(client: WASocket, group: Group, message: Message, isCommand: boolean) {
    await groupController.incrementParticipantActivity(group.id, message.sender, message.type, isCommand)

    // Verifica se o participante atingiu o limite de strikes (avisos)
    const shouldBan = await groupController.checkStrikes(group.id, message.sender, group.strike_limit)
    if (shouldBan) {
        const replyText = buildText(botTexts.ban_message, waUtil.removeWhatsappSuffix(message.sender), "AUTO-STRIKE SYSTEM")
        await waUtil.removeParticipant(client, group.id, message.sender)
        await waUtil.sendTextWithMentions(client, group.id, replyText, [message.sender], { expiration: message.expiration })
    }
}

export async function incrementUserCommandsCount(message: Message) {
    await userController.increaseUserCommandsCount(message.sender)
}

export function incrementBotCommandsCount() {
    botController.incrementExecutedCommands()
}

export async function incrementGroupCommandsCount(group: Group) {
    await groupController.incrementGroupCommands(group.id)
}

export function isIgnoredByPvAllowed(botInfo: Bot, message: Message) {
    return (!message.isBotAdmin && !botInfo.commands_pv)
}

export function isIgnoredByGroupMuted(group: Group, message: Message) {
    return (group.muted && !message.isGroupAdmin)
}

export function isIgnoredByAdminMode(bot: Bot, message: Message) {
    return (bot.admin_mode && !message.isBotAdmin)
}

export async function isBotLimitedByGroupRestricted(group: Group, botInfo: Bot) {
    const isBotGroupAdmin = await groupController.isParticipantAdmin(group.id, botInfo.host_number)
    return (group.restricted && !isBotGroupAdmin)
}

export async function sendPrivateWelcome(client: WASocket, botInfo: Bot, message: Message) {
    const user = await userController.getUser(message.sender)

    if (user && !user.receivedWelcome) {
        const replyText = buildText(botTexts.new_user, botInfo.name, message.pushname)
        await waUtil.sendText(client, message.chat_id, replyText, { expiration: message.expiration })
        await userController.setReceivedWelcome(user.id, true)
    }
}

export async function readUserMessage(client: WASocket, message: Message) {
    await waUtil.readMessage(client, message.chat_id, message.sender, message.message_id)
}

export async function updateUserName(message: Message) {
    if (message.pushname) {
        await userController.setName(message.sender, message.pushname)
    }
}

export async function isUserLimitedByCommandRate(client: WASocket, botInfo: Bot, message: Message) {
    if (botInfo.command_rate.status) {
        const currentTimestamp = Math.round(moment.now() / 1000)
        const { isBotAdmin } = message
        const user = await userController.getUser(message.sender)

        if (isBotAdmin) return false

        if (user) {
            let isUserLimited: boolean

            if (user.command_rate.limited) {
                const hasExpiredLimited = currentTimestamp > user.command_rate.expire_limited

                if (hasExpiredLimited) await userController.setLimitedUser(user.id, false, botInfo, currentTimestamp)

                isUserLimited = hasExpiredLimited ? false : true
            } else {
                const hasExpiredCommands = currentTimestamp > user.command_rate.expire_cmds

                if (hasExpiredCommands) await userController.expireCommandsRate(user.id, currentTimestamp)
                else await userController.incrementCommandRate(user.id)

                if (!hasExpiredCommands && user.command_rate.cmds >= botInfo.command_rate.max_cmds_minute) {
                    await userController.setLimitedUser(user.id, true, botInfo, currentTimestamp)
                    isUserLimited = true
                } else {
                    isUserLimited = false
                }
            }

            if (isUserLimited) {
                const replyText = buildText(botTexts.command_rate_limited_message, botInfo.command_rate.block_time)
                await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration })
                return true
            }

        } else {
            await userController.registerUser(message.sender, message.pushname)
        }
    }

    return false
}

export async function isCommandBlockedGlobally(client: WASocket, botInfo: Bot, message: Message) {
    const commandBlocked = botInfo.block_cmds.includes(waUtil.removePrefix(botInfo.prefix, message.command))

    if (commandBlocked && !message.isBotAdmin) {
        const replyText = buildText(botTexts.globally_blocked_command, message.command)
        await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration })
        return true
    }

    return false
}

export async function isCommandBlockedGroup(client: WASocket, group: Group, botInfo: Bot, message: Message) {
    const commandBlocked = group.block_cmds.includes(waUtil.removePrefix(botInfo.prefix, message.command))

    if (commandBlocked && !message.isGroupAdmin) {
        const replyText = buildText(botTexts.group_blocked_command, message.command)
        await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration })
        return true
    }

    return false
}

export async function isDetectedByWordFilter(client: WASocket, botInfo: Bot, group: Group, message: Message) {
    const { isGroupAdmin, body, caption } = message
    const groupAdmins = await groupController.getAdminsIds(group.id)
    const isBotAdmin = groupAdmins.some(id => sameUser(id, botInfo.host_number))
    const userText = body || caption
    const userTextNoFormatting = removeFormatting(userText)
    const userWords = userTextNoFormatting.split(' ')
    const wordsFiltered = userWords.filter(userWord => group.word_filter.includes(removeFormatting(userWord.toLowerCase())) == true)

    if (wordsFiltered.length && isBotAdmin && !isGroupAdmin) {
        await waUtil.deleteMessage(client, message.wa_message, false)
        return true
    }

    return false
}

export async function autoReply(client: WASocket, botInfo: Bot, group: Group, message: Message) {
    if (group.auto_reply.status) {
        const { body, caption } = message
        const groupAdmins = await groupController.getAdminsIds(group.id)
        const isBotGroupAdmin = groupAdmins.some(id => sameUser(id, botInfo.host_number))
        const userText = body || caption
        const userTextNoFormatting = removeFormatting(userText)
        const userWords = userTextNoFormatting.split(' ').map(word => word.toLowerCase())
        const wordsDetected = userWords.filter(userWord => group.auto_reply.config.find(config => config.word == userWord))

        if (wordsDetected.length && isBotGroupAdmin) {
            const configWord = group.auto_reply.config.find(config => config.word == wordsDetected[0])

            if (configWord) {
                await waUtil.replyText(client, message.chat_id, configWord?.reply, message.wa_message, { expiration: message.expiration })
            }
        }
    }
}

export async function isDetectedByAntiLink(client: WASocket, botInfo: Bot, group: Group, message: Message) {
    const { body, caption, isGroupAdmin } = message
    const userText = body || caption
    const groupAdmins = await groupController.getAdminsIds(group.id)
    const isBotAdmin = groupAdmins.some(id => sameUser(id, botInfo.host_number))

    if (group.antilink.status && !isBotAdmin) {
        await groupController.setAntiLink(group.id, false)
    } else if (group.antilink.status && !isGroupAdmin) {
        // findLinks: mesmo resultado da regex anterior, em tempo linear (corrige ReDoS — ver utils/general.util.ts)
        const detectedURLS = findLinks(userText)

        if (detectedURLS) {
            let needDeleteMessage = false

            if (group.antilink.exceptions.length) {
                const allowedURLS = detectedURLS.map(url => url.toLowerCase()).filter(url => group.antilink.exceptions.filter(exception => url.includes(exception.toLowerCase())).length)
                needDeleteMessage = detectedURLS.length != allowedURLS.length
            } else {
                needDeleteMessage = true
            }

            if (needDeleteMessage) {
                const replyText = buildText(botTexts.detected_link, waUtil.removeWhatsappSuffix(message.sender))
                await waUtil.deleteMessage(client, message.wa_message, false)
                await waUtil.sendTextWithMentions(client, message.chat_id, replyText, [message.sender], { expiration: message.expiration })
                return true
            }
        }
    }

    return false
}

export async function isDetectedByAntiFlood(client: WASocket, botInfo: Bot, group: Group, message: Message) {
    const currentTimestamp = Math.round(moment.now() / 1000)
    const { isGroupAdmin } = message
    const participant = await groupController.getParticipant(group.id, message.sender)

    if (!participant || isGroupAdmin || !group.antiflood.status) return false

    const hasExpiredMessages = currentTimestamp > participant.antiflood.expire

    if (hasExpiredMessages) {
        const expireTimestamp = currentTimestamp + group.antiflood.interval
        await groupController.expireParticipantAntiFlood(group.id, message.sender, expireTimestamp)
    } else {
        await groupController.incrementAntiFloodMessage(group.id, message.sender)
    }

    if (!hasExpiredMessages && participant.antiflood.msgs >= group.antiflood.max_messages) {
        const replyText = buildText(botTexts.antiflood_ban_messages, waUtil.removeWhatsappSuffix(message.sender), botInfo.name)
        await waUtil.removeParticipant(client, message.chat_id, message.sender)
        await waUtil.sendTextWithMentions(client, message.chat_id, replyText, [message.sender], { expiration: message.expiration })
        return true
    } else {
        return false
    }
}

export async function isDetectedByAntiVcard(client: WASocket, _botInfo: Bot, _group: Group, message: Message) {
    const { type, isGroupAdmin } = message
    if (type === 'contactMessage' || type === 'contactsArrayMessage') {
        if (!isGroupAdmin) {
            await waUtil.deleteMessage(client, message.wa_message, false)
            return true
        }
    }
    return false
}

export async function isDetectedByAntiCatalog(client: WASocket, _botInfo: Bot, _group: Group, message: Message) {
    const { body, caption, type, isGroupAdmin } = message
    const userText = body || caption
    const isCatalogLink = userText.match(/wa\.me\/(p|c)\//i)
    if (type === 'productMessage' || isCatalogLink) {
        if (!isGroupAdmin) {
            await waUtil.deleteMessage(client, message.wa_message, false)
            return true
        }
    }
    return false
}

/** Termos aceitos para pedir ajuda no Show do Milhão. */
const GAME_HELP_TERMS = ['pulos', 'pular', 'cartas', 'universitários', 'universitarios', 'placas', 'ajuda alex', 'alex']
const msgsShow = () => gameCommands.showdomilhao.msgs

/** Converte o texto em um tipo de ajuda (ex.: "pular" → pulos, "alex" → placas) ou null. */
export function parseGameHelp(text: string): GameHelpType | null {
    const lower = text.toLowerCase()
    if (!GAME_HELP_TERMS.includes(lower)) return null
    if (lower.includes('pul')) return 'pulos'
    if (lower.includes('cart')) return 'cartas'
    if (lower.includes('univ')) return 'universitarios'
    return 'placas'
}

/** Converte "1".."4" ou "A".."D" (maiúscula ou minúscula) no índice da alternativa, ou -1. */
export function parseGameAnswer(text: string): number {
    if (/^[1-4]$/.test(text)) return parseInt(text) - 1
    if (/^[a-dA-D]$/.test(text)) return text.toLowerCase().charCodeAt(0) - 97
    return -1
}

/** Participante do modo grupo com XP e pontos zerados (ou negativos) está eliminado. */
async function isEliminated(chatId: string, sender: string) {
    const participant = await groupController.getParticipant(chatId, sender)
    return Boolean(participant && participant.xp <= 0 && participant.score <= 0)
}

/** No privado só o dono responde; no grupo, quem não foi eliminado. */
async function canAnswerGame(game: GameState, sender: string) {
    if (game.mode === 'private') return game.participants[0] === sender
    return !(await isEliminated(game.chatId, sender))
}

async function useGameHelp(client: WASocket, game: GameState, helpType: GameHelpType, message: Message) {
    const gameService = GameService.getInstance()
    const options = { expiration: message.expiration }
    try {
        // Cancela o timer de expiração pois o usuário interagiu
        AutomationService.getInstance().clearGameTimeout(game.chatId)
        const response = await gameService.useHelp(game.chatId, helpType)
        await waUtil.replyText(client, game.chatId, buildText(msgsShow().help_used, helpType.toUpperCase(), response.content), message.wa_message, options)
        if (helpType === 'pulos') {
            const updatedGame = gameService.getActiveGame(game.chatId)
            if (updatedGame) await sendQuestion(client, updatedGame, message)
        }
    } catch (error) {
        await waUtil.replyText(client, game.chatId, `❌ ${errorMessage(error)}`, message.wa_message, options)
    }
    return true
}

/** Agenda a próxima pergunta para daqui a 3 s. */
function scheduleNextQuestion(client: WASocket, chatId: string, message: Message) {
    const gameService = GameService.getInstance()
    setTimeout(async () => {
        // Erro aqui seria rejeição não tratada (encerra o processo no Node 24).
        try {
            await gameService.nextQuestion(chatId)
            const nextGame = await gameService.getActiveGame(chatId)
            if (nextGame) await sendQuestion(client, nextGame, message)
        } catch (err) {
            showConsoleError(err, "GAME_NEXT_QUESTION_TIMER")
        }
    }, 3000)
}

async function onCorrectAnswer(client: WASocket, game: GameState, result: { gameOver: boolean, game: GameState }, message: Message) {
    const options = { expiration: message.expiration }
    await waUtil.replyWithMentions(client, game.chatId, buildText(msgsShow().correct, waUtil.removeWhatsappSuffix(message.sender)), [message.sender], message.wa_message, options)
    if (!result.gameOver) return scheduleNextQuestion(client, game.chatId, message)
    const prizeFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(result.game.accumulatedPrize)
    await waUtil.sendText(client, game.chatId, buildText(msgsShow().game_over, prizeFormatted), options)
}

async function onWrongAnswer(client: WASocket, game: GameState, gameOver: boolean, message: Message) {
    const options = { expiration: message.expiration }
    const sender = waUtil.removeWhatsappSuffix(message.sender)
    await waUtil.replyWithMentions(client, game.chatId, buildText(msgsShow().wrong, sender), [message.sender], message.wa_message, options)
    // No modo privado, errar é fim de jogo
    if (game.mode === 'private') {
        await waUtil.sendText(client, game.chatId, buildText(msgsShow().game_over, "R$ 0,00"), options)
        return
    }
    if (await isEliminated(game.chatId, message.sender)) {
        await waUtil.sendTextWithMentions(client, game.chatId, buildText(msgsShow().eliminated, sender), [message.sender], options)
    }
    if (gameOver) await waUtil.sendText(client, game.chatId, buildText(msgsShow().game_over, "R$ 0,00"), options)
}

async function submitGameAnswer(client: WASocket, game: GameState, answerIndex: number, message: Message) {
    try {
        // Cancela o timer de expiração pois o usuário interagiu com uma resposta
        AutomationService.getInstance().clearGameTimeout(game.chatId)
        const result = await GameService.getInstance().submitAnswer(game.chatId, message.sender, answerIndex)
        if (result.correct) await onCorrectAnswer(client, game, result, message)
        else await onWrongAnswer(client, game, result.gameOver, message)
        return true
    } catch (error) {
        console.error("Erro ao processar resposta do jogo:", error)
        return false
    }
}

/** Resposta ou pedido de ajuda no Show do Milhão. Devolve true quando a mensagem foi consumida pelo jogo. */
export async function handleGameMessage(client: WASocket, _botInfo: Bot, _group: Group | undefined, message: Message) {
    const game = GameService.getInstance().getActiveGame(message.chat_id)
    if (!game || game.status !== 'waiting_answer') return false
    if (!(await canAnswerGame(game, message.sender))) return false

    const userText = (message.body || message.caption || "").trim()
    const helpType = parseGameHelp(userText)
    if (helpType) return useGameHelp(client, game, helpType, message)

    const answerIndex = parseGameAnswer(userText)
    if (answerIndex === -1 || !game.currentQuestion) return false
    return submitGameAnswer(client, game, answerIndex, message)
}

export async function handleCardClaim(client: WASocket, _botInfo: Bot, message: Message) {
    const cardService = CardGameService.getInstance();
    const userText = (message.body || message.caption || "").trim();

    // Se for um código numérico de 3 dígitos
    if (/^\d{3}$/.test(userText)) {
        const result = await cardService.tryClaim(message.chat_id, message.sender, userText);
        if (result.success) {
            await waUtil.replyText(client, message.chat_id, result.message, message.wa_message, { expiration: message.expiration });
            return true;
        }
    }
    return false;
}

// ———————————————— PROTEÇÃO DE LINKS E ARQUIVOS (VirusTotal) ————————————————
const chatFeatures = new ChatFeaturesService()
/** Máximo de links verificados por mensagem (a cota grátis é 4 por minuto). */
const MAX_LINKS_PER_MESSAGE = 3
/** Tipos verificados pelo hash: documentos (inclui APK, ZIP, EXE, PDF etc.). */
const SCANNED_FILE_TYPES = ['documentMessage', 'documentWithCaptionMessage']

async function alertThreat(client: WASocket, botInfo: Bot, group: Group | undefined, message: Message, template: string, target: string, result: ScanResult) {
    const stats = result.stats!
    let text = buildText(template, target, stats.malicious, stats.suspicious, result.permalink ?? '')
    const canDelete = Boolean(group) && shouldDelete(stats) && await groupController.isParticipantAdmin(group!.id, botInfo.host_number)
    if (canDelete) {
        await waUtil.deleteMessage(client, message.wa_message, false)
        text += automationTexts.scanlinks.msgs.deleted
        await waUtil.sendText(client, message.chat_id, text, { expiration: message.expiration })
        return
    }
    await waUtil.replyText(client, message.chat_id, text, message.wa_message, { expiration: message.expiration })
}

async function runThreatScan(client: WASocket, botInfo: Bot, group: Group | undefined, message: Message, isCommand: boolean) {
    if (isCommand || message.isBotMessage || !virusTotalKey()) return
    const links = (findLinks(`${message.body} ${message.caption}`) ?? []).slice(0, MAX_LINKS_PER_MESSAGE)
    const isFile = SCANNED_FILE_TYPES.includes(message.type) && Number(message.media?.file_length ?? 0) <= MAX_SCAN_FILE_BYTES
    if (!links.length && !isFile) return
    if (!(await chatFeatures.isLinkScanActive(message.chat_id))) return

    for (const link of links) {
        const url = withScheme(link)
        const result = await scanUrl(url)
        if (isDangerous(result.stats)) return alertThreat(client, botInfo, group, message, automationTexts.scanlinks.msgs.alert_link, url, result)
    }
    if (isFile) {
        const buffer = await downloadMediaMessage(message.wa_message, "buffer", {})
        const result = await scanFileHash(sha256(buffer))
        const name = waUtil.unwrapCaptionedDocument(message.wa_message.message)?.documentMessage?.fileName ?? 'arquivo'
        if (isDangerous(result.stats)) await alertThreat(client, botInfo, group, message, automationTexts.scanlinks.msgs.alert_file, name, result)
    }
}

/**
 * Verificação automática (quando !scanlinks está ativo no chat). Roda em segundo plano: a análise
 * do VirusTotal pode levar até 2 minutos e não pode atrasar o tratamento das mensagens.
 */
export function scanMessageThreats(client: WASocket, botInfo: Bot, group: Group | undefined, message: Message, isCommand: boolean) {
    runThreatScan(client, botInfo, group, message, isCommand).catch(err => showConsoleError(err, "LINK_SCAN"))
}

/**
 * Coleta de arquivos do motor de documentos (!pdf juntar / !pdf fotos): mídias enviadas pelo usuário
 * com coleta aberta naquela conversa. Roda em segundo plano para não atrasar as demais mensagens.
 */
export function collectDocumentFile(client: WASocket, message: Message, isCommand: boolean) {
    if (isCommand || !message.isMedia) return
    collectSessionFile(client, message).catch(async (err) => {
        await waUtil.replyText(client, message.chat_id, `❌ ${errorMessage(err)}`, message.wa_message, { expiration: message.expiration }).catch(() => undefined)
    })
}

// ———————————————— VERIFICAÇÃO DE NOVOS MEMBROS E FILTRO DE GOLPES ————————————————
const captchaService = new CaptchaService()

/** Resposta de quem está em verificação (!verificacao). */
async function checkCaptchaAnswer(client: WASocket, botInfo: Bot, group: Group, message: Message, text: string) {
    const result = await captchaService.check(group.id, message.sender, text)
    if (result.status === 'none') return
    const user = waUtil.removeWhatsappSuffix(message.sender)
    const msgs = groupExtraTexts.verificacao.msgs
    const reply = result.status === 'ok' ? buildText(msgs.passed, user)
        : result.status === 'wrong' ? buildText(msgs.wrong, user, result.remaining)
        : buildText(msgs.failed, user)
    await waUtil.replyWithMentions(client, message.chat_id, reply, [message.sender], message.wa_message, { expiration: message.expiration })
    if (result.status === 'failed') await captchaService.processExpired(client, botInfo.host_number)
}

/** Filtro de golpes (!antigolpe): avisa e, se o bot for admin, apaga. Admins não são verificados. */
async function checkScam(client: WASocket, botInfo: Bot, group: Group, message: Message, text: string) {
    if (message.isGroupAdmin) return
    const verdict = scamScore(text)
    if (!verdict.isScam) return
    if (!(await chatFeatures.get(group.id)).antiscam.status) return
    const msgs = groupExtraTexts.antigolpe.msgs
    let alert = buildText(msgs.alert, waUtil.removeWhatsappSuffix(message.sender), [...new Set(verdict.reasons)].join(', '))
    if (await groupController.isParticipantAdmin(group.id, botInfo.host_number)) {
        await waUtil.deleteMessage(client, message.wa_message, false)
        alert += msgs.deleted
        await waUtil.sendTextWithMentions(client, message.chat_id, alert, [message.sender], { expiration: message.expiration })
        return
    }
    await waUtil.replyWithMentions(client, message.chat_id, alert, [message.sender], message.wa_message, { expiration: message.expiration })
}

async function runGroupGuards(client: WASocket, botInfo: Bot, group: Group, message: Message, isCommand: boolean) {
    if (isCommand || message.isBotMessage) return
    const text = `${message.body ?? ''} ${message.caption ?? ''}`.trim()
    if (!text) return
    await checkCaptchaAnswer(client, botInfo, group, message, text)
    await checkScam(client, botInfo, group, message, text)
}

/**
 * Verificação de novos membros e filtro de golpes, em segundo plano (não atrasam as demais
 * mensagens; um erro aqui só é registrado no log).
 */
export function groupGuards(client: WASocket, botInfo: Bot, group: Group, message: Message, isCommand: boolean) {
    runGroupGuards(client, botInfo, group, message, isCommand).catch(err => showConsoleError(err, "GROUP_GUARDS"))
}
