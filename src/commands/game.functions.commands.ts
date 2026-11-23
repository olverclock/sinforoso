import { WASocket } from "baileys";
import { Bot } from "../interfaces/bot.interface.js";
import { Group } from "../interfaces/group.interface.js";
import { Message } from "../interfaces/message.interface.js";
import { GameHelpType, GameState } from "../interfaces/game.interface.js";
import { GameService } from "../services/game.service.js";
import * as waUtil from "../utils/whatsapp.util.js";
import { buildText, errorMessage } from "../utils/general.util.js";
import { AutomationService } from "../services/automation.service.js";
import { CasinoService } from "../services/casino.service.js";
import { GroupController } from "../controllers/group.controller.js";
import { randomDelay } from "../utils/general.util.js";

export const gameMsgs = {
    showdomilhao: {
        guide: `💎 *GUIA: SHOW DO MILHÃO* 💎\n\n` +
            `Como jogar: Digite *{$p}showdomilhao*.\n` +
            `Responder: Digite o número da alternativa (1, 2, 3, 4) ou a letra (A, B, C, D).\n\n` +
            `*💡 AJUDAS DISPONÍVEIS:* \n` +
            `- *PULOS*: Pula a pergunta atual sem perder nada (3 usos).\n` +
            `- *CARTAS*: Sorteia cartas que removem até 3 alternativas erradas (1 uso).\n` +
            `- *UNIVERSITÁRIOS*: Pede a opinião de 3 universitários (1 uso).\n` +
            `- *PLACAS*: O Alex AI analisa a questão e dá a resposta mais provável (1 uso).\n\n` +
            `*🛑 PARAR:* \n` +
            `Digite *parar*, *sair* ou *desistir* para encerrar e garantir o prêmio atual.\n\n` +
            `*⏱️ TEMPO:* \n` +
            `Você tem 45 segundos por pergunta!`,
        msgs: {
            starting_pv: "💎 *Show do Milhão (Modo Privado)* 💎\n\nPrepare-se! As perguntas começam agora. Você tem 45 segundos para cada uma.\n\n💡 *AJUDAS DISPONÍVEIS:* \n- Digite *PULOS* (Você tem 3)\n- Digite *CARTAS* (1 vez)\n- Digite *UNIVERSITARIOS* (1 vez)\n- Digite *PLACAS* (Ajuda do Alex AI - 1 vez)\n\nDigite o número da opção (1-4) ou a letra (A-D). Boa sorte!",
            starting_group: "💎 *Show do Milhão (Modo Grupo)* 💎\n\nTodos podem participar! Quem acertar primeiro leva os pontos.\n\n💡 *AJUDAS DISPONÍVEIS:* \nQualquer um pode usar:\n- *PULOS* (3 no total)\n- *CARTAS*\n- *UNIVERSITARIOS*\n- *PLACAS*\n\n⏱️ 45 segundos por rodada!",
            question_format: "❓ *PERGUNTA {$1}* ({$2})\nValendo: *{$3}*\n\n{$4}\n\n1. {$5}\n2. {$6}\n3. {$7}\n4. {$8}\n\n⏱️ 45 segundos!",
            correct: "✅ *RESPOSTA CORRETA!* @{$1} ganhou XP e Pontos.\n\nPróxima pergunta em instantes...",
            wrong: "❌ *RESPOSTA ERRADA!* @{$1} perdeu XP e Pontos.",
            eliminated: "💀 *ELIMINADO!* @{$1} zerou seus recursos e saiu do jogo.",
            game_over: "🏁 *FIM DE JOGO!*\nO prêmio acumulado foi de *{$1}*.\n\nAté a próxima!",
            stopped: "✋ *JOGO PARADO!*\nVocê parou e levou *{$1}*.",
            help_used: "🎫 *AJUDA UTILIZADA: {$1}*\n{$2}"
        }
    },
    casino: {
        guide: "🎰 *CASSINO SINFOROSO* 🎰\n\n" +
            "Como jogar: *{$p}casino [valor]*\n\n" +
            "💰 *PREMIAÇÕES:* \n" +
            "✨ 3 Símbolos Iguais: *JACKPOT! (10x)*\n" +
            "✅ 2 Símbolos Iguais: *VITÓRIA (2x)*\n" +
            "❌ Diferentes: *VOCÊ PERDEU!*\n\n" +
            "⚠️ Cooldown de 30s por usuário!",
        msgs: {
            no_bet: "🎰 *ERRO:* Por favor, especifique um valor para apostar.\nEx: *{$p}casino 100*",
            invalid_bet: "🎰 *ERRO:* Valor de aposta inválido. Use um número maior que 0.",
            no_score: "😔 *VOCÊ NÃO TEM PONTOS!* \nParticipe mais do grupo enviando mensagens e comandos para ganhar pontos.",
            low_score: "📉 *PONTOS INSUFICIENTES!* \nVocê tem apenas *{$1}* pontos. Sua aposta foi de *{$2}*.",
            cooldown: "⏱️ *ESPERE UM POUCO!* \nO Oráculo diz para você descansar. Tente novamente em *{$1}* segundos.",
            spinning: "🎰 *GIRANDO A ROLETA...* 🎰\n\n[ 🔄 | 🔄 | 🔄 ]",
            spinning_1: "🎰 *GIRANDO A ROLETA...* 🎰\n\n[ {$1} | 🔄 | 🔄 ]",
            spinning_2: "🎰 *GIRANDO A ROLETA...* 🎰\n\n[ {$1} | {$2} | 🔄 ]",
            win: "🎊 *VITÓRIA!* 🎊\n\n[ {$1} | {$2} | {$3} ]\n\n💸 Você ganhou *{$4}* pontos! (Multiplicador: {$5}x)\nSeu novo saldo: *{$6}*",
            loss: "💀 *DERROTA!* 💀\n\n[ {$1} | {$2} | {$3} ]\n\n💸 Você perdeu *{$4}* pontos.\nSeu saldo atual: *{$5}*"
        }
    }
}


export async function showdomilhaoCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    const chatId = message.chat_id;
    const isGroup = message.isGroupMsg;
    const gameService = GameService.getInstance();

    // Comando 'parar', 'sair' ou 'desistir'
    const stopCommands = ['parar', 'sair', 'desistir'];
    if (stopCommands.includes(message.args[0]?.toLowerCase())) {
        try {
            // Limpa o timer de expiração
            AutomationService.getInstance().clearGameTimeout(chatId);

            const reward = gameService.stopGame(chatId);
            const prizeFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reward);
            await waUtil.replyText(client, chatId, buildText(gameMsgs.showdomilhao.msgs.stopped, prizeFormatted), message.wa_message, { expiration: message.expiration });
        } catch (error) {
            throw new Error(errorMessage(error));
        }
        return;
    }

    // Comando 'ajuda' (ex: !showdomilhao cartas)
    const helps = ['pulos', 'cartas', 'universitarios', 'placas'];
    if (helps.includes(message.args[0]?.toLowerCase())) {
        try {
            const helpType = message.args[0].toLowerCase() as GameHelpType; // validado por helps.includes acima
            const response = await gameService.useHelp(chatId, helpType);
            await waUtil.replyText(client, chatId, buildText(gameMsgs.showdomilhao.msgs.help_used, helpType.toUpperCase(), response.content), message.wa_message, { expiration: message.expiration });

            // Se foi pulo, uma nova pergunta já foi gerada e enviada via nextQuestion
            if (helpType === 'pulos') {
                const game = gameService.getActiveGame(chatId);
                if (game) await sendQuestion(client, game, message);
            }
        } catch (error) {
            throw new Error(errorMessage(error));
        }
        return;
    }

    // Comando 'guia'
    if (message.args[0]?.toLowerCase() === 'guia') {
        const guideMsg = buildText(gameMsgs.showdomilhao.guide, botInfo.prefix);
        await waUtil.replyText(client, chatId, guideMsg, message.wa_message, { expiration: message.expiration });
        return;
    }

    // Iniciar jogo
    if (gameService.getActiveGame(chatId)) {
        throw new Error("Já existe um jogo em andamento neste chat.");
    }

    const mode = isGroup ? 'group' : 'private';
    const participants = isGroup ? [] : [message.sender]; // No grupo, qualquer um que responder entra na lista se necessário, ou deixamos aberto.

    const game = await gameService.startGame(chatId, mode, participants);

    const startMsg = isGroup ? gameMsgs.showdomilhao.msgs.starting_group : gameMsgs.showdomilhao.msgs.starting_pv;
    await waUtil.sendText(client, chatId, startMsg, { expiration: message.expiration });

    await sendQuestion(client, game, message);
}

export async function casinoCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    const bet = parseInt(message.args[0]);
    const groupController = new GroupController();
    const casinoService = CasinoService.getInstance();

    // Comando 'guia'
    if (message.args[0]?.toLowerCase() === 'guia') {
        const guideMsg = buildText(gameMsgs.casino.guide, botInfo.prefix);
        await waUtil.replyText(client, message.chat_id, guideMsg, message.wa_message, { expiration: message.expiration });
        return;
    }

    // Validações básicas
    if (isNaN(bet) || bet <= 0) {
        if (!message.args[0]) throw new Error(buildText(gameMsgs.casino.msgs.no_bet, botInfo.prefix));
        throw new Error(gameMsgs.casino.msgs.invalid_bet);
    }

    // Cooldown Anti-Spam
    const status = casinoService.checkCooldown(message.sender);
    if (!status.canRun) {
        throw new Error(buildText(gameMsgs.casino.msgs.cooldown, status.remaining!.toString()));
    }

    // Busca participante
    const participant = await groupController.getParticipant(message.chat_id, message.sender);
    if (!participant) throw new Error("Usuário não registrado no sistema.");

    if (participant.score <= 0) {
        throw new Error(gameMsgs.casino.msgs.no_score);
    }

    if (participant.score < bet) {
        throw new Error(buildText(gameMsgs.casino.msgs.low_score, participant.score.toString(), bet.toString()));
    }

    // Inicia animação
    const initialMsg = await waUtil.replyText(client, message.chat_id, gameMsgs.casino.msgs.spinning, message.wa_message, { expiration: message.expiration });
    const msgKey = initialMsg?.key;

    if (!msgKey) throw new Error("Erro ao iniciar a roleta.");

    // Sorteia resultado
    const result = casinoService.rollSlots();

    // Animação Frame 1 (1.5s delay)
    await randomDelay(1500, 1500);
    await client.sendMessage(message.chat_id, {
        text: buildText(gameMsgs.casino.msgs.spinning_1, result.slots[0]),
        edit: msgKey
    });

    // Animação Frame 2 (1.5s delay)
    await randomDelay(1500, 1500);
    await client.sendMessage(message.chat_id, {
        text: buildText(gameMsgs.casino.msgs.spinning_2, result.slots[0], result.slots[1]),
        edit: msgKey
    });

    // Resultado Final (1.5s delay)
    await randomDelay(1500, 1500);

    let finalMsg = "";
    let newScore = participant.score;

    if (result.isWin) {
        const winAmount = bet * result.multiplier;
        newScore += winAmount;
        await groupController.addParticipantScore(message.chat_id, message.sender, winAmount);
        finalMsg = buildText(gameMsgs.casino.msgs.win, ...result.slots, winAmount.toString(), result.multiplier.toString(), newScore.toString());
    } else {
        newScore -= bet;
        await groupController.addParticipantScore(message.chat_id, message.sender, -bet);
        finalMsg = buildText(gameMsgs.casino.msgs.loss, ...result.slots, bet.toString(), newScore.toString());
    }

    await client.sendMessage(message.chat_id, {
        text: finalMsg,
        edit: msgKey
    });
}

export async function sendQuestion(client: WASocket, game: GameState, message: Message) {
    const q = game.currentQuestion;
    if (!q) return;

    const prizeTable = [0, 500, 1000, 2000, 3000, 5000, 10000, 20000, 30000, 40000, 50000, 100000, 200000, 300000, 400000, 500000, 1000000];
    const currentPrizeValue = prizeTable[game.currentQuestionIndex] || 0;
    const prizeFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentPrizeValue);
    const questionMsg = buildText(
        gameMsgs.showdomilhao.msgs.question_format,
        game.currentQuestionIndex,
        q.level,
        prizeFormatted,
        q.question,
        q.options[0],
        q.options[1],
        q.options[2],
        q.options[3]
    );

    // No modo grupo, usamos replyWithMentions ou apenas sendText
    await waUtil.sendText(client, game.chatId, questionMsg, { expiration: message.expiration });

    // Agenda expiração da pergunta (45s)
    AutomationService.getInstance().scheduleGameExpiration(client, game.chatId, 45000);
}
