import { WASocket } from "baileys"
import { Bot } from "../interfaces/bot.interface.js"
import { Group } from "../interfaces/group.interface.js"
import { Message } from "../interfaces/message.interface.js"
import { funnyRandomPhrases, translateText } from '../utils/misc.util.js'
import * as waUtil from '../utils/whatsapp.util.js'
import { buildText, uppercaseFirst, HTTP_TIMEOUT } from "../utils/general.util.js"
import { messageErrorCommandUsage } from "../utils/commands.util.js"
import botTexts from "../helpers/bot.texts.helper.js"
import miscCommands from "./misc.list.commands.js"
import { GroupController } from "../controllers/group.controller.js"
import path from 'path'
import axios from 'axios'
import { STATIC_PIADAS, STATIC_CURIOSIDADES_BR } from '../helpers/entertainment.data.helper.js'
import { JSDOM } from 'jsdom'
import { randomInt } from 'node:crypto'
import { sameUser } from '../utils/identity.util.js'
import { giveawayCommand } from './misc.giveaway.functions.commands.js'

export async function sorteioCommand(client: WASocket, botInfo: Bot, message: Message, group?: Group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    // Palavra no lugar do número: sistema de sorteios (novo, entrar, caca...). Número: como sempre foi.
    if (!/^\d/.test(message.args[0])) return giveawayCommand(client, botInfo, message, group)

    const chosenNumber = Number(message.text_command)

    if (!chosenNumber || chosenNumber <= 1) {
        throw new Error(miscCommands.sorteio.msgs.error_invalid_value)
    }

    const randomNumber = Math.floor(Math.random() * chosenNumber) + 1
    const replyText = buildText(miscCommands.sorteio.msgs.reply, randomNumber)
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration })
}

export async function sorteiomembroCommand(client: WASocket, botInfo: Bot, message: Message, group?: Group) {
    const groupController = new GroupController()

    if (!message.isGroupMsg || !group) {
        throw new Error(botTexts.permission.group)
    }

    const currentParticipantsIds = await groupController.getParticipantsIds(group.id)

    // Com argumentos: "!sorteiomembro 3 prêmio" sorteia 3 pessoas diferentes (sem o bot)
    if (message.args.filter(Boolean).length) {
        return sorteioVariosMembros(client, botInfo, message, currentParticipantsIds)
    }

    const randomParticipant = currentParticipantsIds[Math.floor(Math.random() * currentParticipantsIds.length)]
    const replyText = buildText(miscCommands.sorteiomembro.msgs.reply, waUtil.removeWhatsappSuffix(randomParticipant))
    await waUtil.replyWithMentions(client, message.chat_id, replyText, [randomParticipant], message.wa_message, { expiration: message.expiration })
}

export const MAX_DRAW_MEMBERS = 50

/** "3 Camisa do time" → { count: 3, prize: "Camisa do time" }; sem número = 1. */
export function parseMemberDrawArgs(args: string[]): { count: number, prize: string } {
    const words = args.filter(Boolean)
    const hasCount = /^\d+$/.test(words[0] ?? '')
    const count = hasCount ? Number(words[0]) : 1
    if (count < 1 || count > MAX_DRAW_MEMBERS) throw new Error(miscCommands.sorteiomembro.msgs.error_count)
    return { count, prize: (hasCount ? words.slice(1) : words).join(' ').trim() }
}

async function sorteioVariosMembros(client: WASocket, botInfo: Bot, message: Message, participantsIds: string[]) {
    const { count, prize } = parseMemberDrawArgs(message.args)
    const pool = participantsIds.filter(id => !sameUser(id, botInfo.host_number))
    if (count > pool.length) throw new Error(buildText(miscCommands.sorteiomembro.msgs.error_not_enough, pool.length))
    // Fisher–Yates com gerador criptográfico: cada membro tem a mesma chance e ninguém sai repetido
    for (let i = pool.length - 1; i > 0; i--) {
        const j = randomInt(0, i + 1)
        ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    const winners = pool.slice(0, count)
    const list = winners.map((id, i) => `${count > 1 ? `${i + 1}º ` : ''}@${waUtil.removeWhatsappSuffix(id)}`).join('\n')
    const replyText = buildText(miscCommands.sorteiomembro.msgs.reply_many, prize ? buildText(miscCommands.sorteiomembro.msgs.reply_prize, prize) : '', list)
    await waUtil.replyWithMentions(client, message.chat_id, replyText, winners, message.wa_message, { expiration: message.expiration })
}

export async function mascoteCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const imagePath = path.resolve('dist/media/mascote.png')
    await waUtil.replyFile(client, message.chat_id, 'imageMessage', imagePath, 'Sinforoso Jr.', message.wa_message, { expiration: message.expiration })
}

export async function viadometroCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    if (!message.isGroupMsg) {
        throw new Error(botTexts.permission.group)
    } else if (!message.isQuoted && !message.mentioned.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    } else if (message.mentioned.length > 1) {
        throw new Error(miscCommands.viadometro.msgs.error_mention)
    }

    const randomNumber = Math.floor(Math.random() * 100)
    const messageToReply = (message.quotedMessage && message.mentioned.length != 1) ? message.quotedMessage?.wa_message : message.wa_message
    const replyText = buildText(miscCommands.viadometro.msgs.reply, randomNumber)
    await waUtil.replyText(client, message.chat_id, replyText, messageToReply, { expiration: message.expiration })
}

export async function detectorCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    if (!message.isGroupMsg) {
        throw new Error(botTexts.permission.group)
    } else if (!message.isQuoted) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const quotedMessage = message.quotedMessage?.wa_message

    if (!quotedMessage) {
        throw new Error(miscCommands.detector.msgs.error_message)
    }

    const imagePathCalibration = path.resolve('dist/media/calibrando.png')
    const imagePathsResult = [
        path.resolve('dist/media/estressealto.png'),
        path.resolve('dist/media/incerteza.png'),
        path.resolve('dist/media/kao.png'),
        path.resolve('dist/media/meengana.png'),
        path.resolve('dist/media/mentiroso.png'),
        path.resolve('dist/media/vaipra.png'),
        path.resolve('dist/media/verdade.png')
    ]

    const randomIndex = Math.floor(Math.random() * imagePathsResult.length)
    const waitReply = miscCommands.detector.msgs.wait
    await waUtil.replyFile(client, message.chat_id, 'imageMessage', imagePathCalibration, waitReply, quotedMessage, { expiration: message.expiration })
    await waUtil.replyFile(client, message.chat_id, 'imageMessage', imagePathsResult[randomIndex], '', quotedMessage, { expiration: message.expiration })
}

export async function roletarussaCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const bulletPosition = Math.floor(Math.random() * 6) + 1
    const currentPosition = Math.floor(Math.random() * 6) + 1
    const hasShooted = (bulletPosition == currentPosition)
    let replyText: string

    if (hasShooted) {
        replyText = miscCommands.roletarussa.msgs.reply_dead
    } else {
        replyText = miscCommands.roletarussa.msgs.reply_alive
    }

    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration })
}

export async function casalCommand(client: WASocket, _botInfo: Bot, message: Message, group?: Group) {
    const groupController = new GroupController()

    if (!message.isGroupMsg || !group) {
        throw new Error(botTexts.permission.group)
    }

    let currentParticipantsIds = await groupController.getParticipantsIds(group.id)

    if (currentParticipantsIds && currentParticipantsIds.length < 2) {
        throw new Error(miscCommands.casal.msgs.error)
    }

    let randomIndex = Math.floor(Math.random() * currentParticipantsIds.length)
    let chosenParticipant1 = currentParticipantsIds[randomIndex]
    currentParticipantsIds.splice(randomIndex, 1)
    randomIndex = Math.floor(Math.random() * currentParticipantsIds.length)
    let chosenParticipant2 = currentParticipantsIds[randomIndex]
    let replyText = buildText(miscCommands.casal.msgs.reply, waUtil.removeWhatsappSuffix(chosenParticipant1), waUtil.removeWhatsappSuffix(chosenParticipant2))
    await waUtil.sendTextWithMentions(client, message.chat_id, replyText, [chosenParticipant1, chosenParticipant2], { expiration: message.expiration })
}

export async function caracoroaCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    const coinSides = ['cara', 'coroa']
    const userChoice = message.text_command.toLowerCase()

    if (!message.args.length || !coinSides.includes(userChoice)) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const chosenSide = coinSides[Math.floor(Math.random() * coinSides.length)]
    const imagePath = chosenSide === 'cara' ? path.resolve('dist/media/cara.png') : path.resolve('dist/media/coroa.png')
    const waitText = miscCommands.caracoroa.msgs.wait
    await waUtil.replyText(client, message.chat_id, waitText, message.wa_message, { expiration: message.expiration })
    const isUserVictory = chosenSide == userChoice
    let replyText: string

    if (isUserVictory) {
        replyText = buildText(miscCommands.caracoroa.msgs.reply_victory, uppercaseFirst(chosenSide))
    } else {
        replyText = buildText(miscCommands.caracoroa.msgs.reply_defeat, uppercaseFirst(chosenSide))
    }

    await waUtil.replyFile(client, message.chat_id, 'imageMessage', imagePath, replyText, message.wa_message, { expiration: message.expiration })

}

export async function pptCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    const validChoices = ["pedra", "papel", "tesoura"]
    const userChoice = message.text_command.toLocaleLowerCase()
    const randomIndex = Math.floor(Math.random() * validChoices.length)

    if (!message.args.length || !validChoices.includes(userChoice)) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    let botChoice = validChoices[randomIndex]
    let botIconChoice: string
    let userIconChoice: string
    let isUserVictory: boolean | undefined

    if (botChoice == "pedra") {
        botIconChoice = "✊"
        if (userChoice == "pedra") userIconChoice = "✊";
        else if (userChoice == "tesoura") isUserVictory = false, userIconChoice = "✌️";
        else isUserVictory = true, userIconChoice = "✋";
    } else if (botChoice == "papel") {
        botIconChoice = "✋"
        if (userChoice == "pedra") isUserVictory = false, userIconChoice = "✊";
        else if (userChoice == "tesoura") isUserVictory = true, userIconChoice = "✌️";
        else userIconChoice = "✋";
    } else {
        botIconChoice = "✌️"
        if (userChoice == "pedra") isUserVictory = true, userIconChoice = "✊";
        else if (userChoice == "tesoura") userIconChoice = "✌️";
        else isUserVictory = false, userIconChoice = "✋";
    }

    let replyText: string

    if (isUserVictory === true) {
        replyText = buildText(miscCommands.ppt.msgs.reply_victory, userIconChoice, botIconChoice)
    } else if (isUserVictory === false) {
        replyText = buildText(miscCommands.ppt.msgs.reply_defeat, userIconChoice, botIconChoice)
    } else {
        replyText = buildText(miscCommands.ppt.msgs.reply_draw, userIconChoice, botIconChoice)
    }

    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration })
}

export async function gadometroCommand(client: WASocket, botInfo: Bot, message: Message, group?: Group) {
    if (!message.isGroupMsg || !group) {
        throw new Error(botTexts.permission.group)
    } else if (!message.isQuoted && !message.mentioned.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    } else if (message.mentioned.length > 1) {
        throw new Error(miscCommands.gadometro.msgs.error_mention)
    }

    const randomNumber = Math.floor(Math.random() * 100)
    const messageToReply = (message.quotedMessage && message.mentioned.length != 1) ? message.quotedMessage?.wa_message : message.wa_message
    const replyText = buildText(miscCommands.gadometro.msgs.reply, randomNumber)
    await waUtil.replyText(client, message.chat_id, replyText, messageToReply, { expiration: message.expiration })
}

export async function bafometroCommand(client: WASocket, botInfo: Bot, message: Message, group?: Group) {
    if (!message.isGroupMsg || !group) {
        throw new Error(botTexts.permission.group)
    } else if (!message.isQuoted && !message.mentioned.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    } else if (message.mentioned.length > 1) {
        throw new Error(miscCommands.bafometro.msgs.error_mention)
    }

    const randomNumber = Math.floor(Math.random() * 100)
    const messageToReply = (message.quotedMessage && message.mentioned.length != 1) ? message.quotedMessage?.wa_message : message.wa_message
    const replyText = buildText(miscCommands.bafometro.msgs.reply, randomNumber)
    await waUtil.replyText(client, message.chat_id, replyText, messageToReply, { expiration: message.expiration })
}

export async function top5Command(client: WASocket, botInfo: Bot, message: Message, group?: Group) {
    const groupController = new GroupController()

    if (!message.isGroupMsg || !group) {
        throw new Error(botTexts.permission.group)
    } else if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    let rankingTheme = message.text_command
    let currentParticipantsIds = await groupController.getParticipantsIds(group.id)

    if (currentParticipantsIds.length < 5) {
        throw new Error(miscCommands.top5.msgs.error_members)
    }

    let replyText = buildText(miscCommands.top5.msgs.reply_title, rankingTheme)
    let mentionList = []

    for (let i = 1; i <= 5; i++) {
        let icon

        switch (i) {
            case 1:
                icon = '🥇'
                break
            case 2:
                icon = '🥈'
                break
            case 3:
                icon = '🥉'
                break
            default:
                icon = ''
        }

        let randomIndex = Math.floor(Math.random() * currentParticipantsIds.length)
        let chosenParticipant = currentParticipantsIds[randomIndex]
        replyText += buildText(miscCommands.top5.msgs.reply_item, icon, i, waUtil.removeWhatsappSuffix(chosenParticipant))
        mentionList.push(chosenParticipant)
        currentParticipantsIds.splice(currentParticipantsIds.indexOf(chosenParticipant), 1)
    }

    await waUtil.sendTextWithMentions(client, message.chat_id, replyText, mentionList, { expiration: message.expiration })
}

export async function parCommand(client: WASocket, botInfo: Bot, message: Message, group?: Group) {
    if (!message.isGroupMsg || !group) {
        throw new Error(botTexts.permission.group)
    } else if (message.mentioned.length !== 2) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const randomNumber = Math.floor(Math.random() * 100)
    let replyText = buildText(miscCommands.par.msgs.reply, waUtil.removeWhatsappSuffix(message.mentioned[0]), waUtil.removeWhatsappSuffix(message.mentioned[1]), randomNumber)
    await waUtil.sendTextWithMentions(client, message.chat_id, replyText, message.mentioned, { expiration: message.expiration })
}

export async function chanceCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const randomNumber = Math.floor(Math.random() * 100)
    const replyText = buildText(miscCommands.chance.msgs.reply, randomNumber, message.text_command)
    const messageToReply = (message.isQuoted && message.quotedMessage) ? message.quotedMessage?.wa_message : message.wa_message
    await waUtil.replyText(client, message.chat_id, replyText, messageToReply, { expiration: message.expiration })
}

export async function fraseCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const phraseResult = await funnyRandomPhrases()
    const replyText = buildText(miscCommands.frase.msgs.reply, phraseResult)
    const imagePath = path.resolve('dist/media/frasesinforosojr.png')
    await waUtil.replyFile(client, message.chat_id, 'imageMessage', imagePath, replyText, message.wa_message, { expiration: message.expiration })
}

export async function curiosidadeCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    try {
        // 50% de chance para fonte global vs fonte brasileira
        const sourceToggle = Math.random() > 0.5

        if (sourceToggle) {
            // Fonte Global: UselessFacts
            // Se a fonte ou a tradução falharem, usa a lista brasileira em vez de responder com erro.
            const fact = await axios.get('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', { timeout: HTTP_TIMEOUT.api })
                .then(({ data }) => translateText(String(data.text), 'pt'))
                .catch(() => STATIC_CURIOSIDADES_BR[Math.floor(Math.random() * STATIC_CURIOSIDADES_BR.length)])
            const replyText = buildText(miscCommands.curiosidade.msgs.reply, fact)
            await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration })
        } else {
            // Fonte Brasileira: Estática Local (Curada e sem propaganda)
            const randomBr = STATIC_CURIOSIDADES_BR[Math.floor(Math.random() * STATIC_CURIOSIDADES_BR.length)]
            const replyText = buildText(miscCommands.curiosidade.msgs.reply, randomBr)
            await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration })
        }
    } catch (err) {
        throw new Error("Não consegui buscar uma curiosidade agora. Tente novamente mais tarde.")
    }
}

export async function horoscopoCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    const signs = ['aries', 'touro', 'gemeos', 'cancer', 'leao', 'virgem', 'libra', 'escorpiao', 'sagitario', 'capricornio', 'aquario', 'peixes']
    const signArg = message.args[0]?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")

    if (!signArg || !signs.includes(signArg)) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    try {
        // Scraper robusto para UOL Universa usando JSDOM
        const { data: html } = await axios.get(`https://www.uol.com.br/universa/horoscopo/${signArg}/horoscopo-do-dia/`, { timeout: HTTP_TIMEOUT.scraping,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        })

        const dom = new JSDOM(html)
        const document = dom.window.document

        // Tenta extrair a previsão diária (Target Principal: .horoscope-open-content p)
        let prediction = document.querySelector('.horoscope-open-content p')?.textContent?.trim()

        if (!prediction) {
            // Backup 1: Busca no bloco de texto geral da UOL
            prediction = document.querySelector('.text p')?.textContent?.trim()
        }

        if (!prediction) {
            // Backup 2: Busca por ID diário
            prediction = document.querySelector('#diario p')?.textContent?.trim()
        }

        if (!prediction) throw new Error("Estrutura da página mudou.")

        const replyText = buildText(miscCommands.horoscopo.msgs.reply, signArg.toUpperCase(), prediction)
        await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration })
    } catch (err) {
        throw new Error("Não consegui obter o horóscopo hoje. Tente mais tarde.")
    }
}

export async function piadaCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    try {
        // 70% de chance para fonte local (garante variedade e qualidade PT-BR)
        // 30% de chance para fonte externa (JokeAPI)
        const sourceToggle = Math.random() > 0.3

        let jokeText = ""

        if (sourceToggle) {
            // Fonte Local: Estática (Sem repetição constante e 100% PT-BR)
            jokeText = STATIC_PIADAS[Math.floor(Math.random() * STATIC_PIADAS.length)]
        } else {
            // Fonte Externa: JokeAPI
            const { data } = await axios.get('https://v2.jokeapi.dev/joke/Any?lang=pt&blacklistFlags=nsfw,religious,political,racist,sexist,explicit', { timeout: HTTP_TIMEOUT.api })
            if (data.type === 'single') {
                jokeText = data.joke
            } else {
                jokeText = `${data.setup}\n\n... ${data.delivery}`
            }
        }

        const replyText = buildText(miscCommands.piada.msgs.reply, jokeText)
        await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration })
    } catch (err) {
        // Fallback total se a rede falhar
        const fallbackJoke = STATIC_PIADAS[Math.floor(Math.random() * STATIC_PIADAS.length)]
        const replyText = buildText(miscCommands.piada.msgs.reply, fallbackJoke)
        await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration })
    }
}