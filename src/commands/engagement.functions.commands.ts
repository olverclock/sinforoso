import { WASocket } from "baileys";
import { Bot } from "../interfaces/bot.interface.js";
import { Group } from "../interfaces/group.interface.js";
import { Message } from "../interfaces/message.interface.js";
import { GroupController } from "../controllers/group.controller.js";
import * as waUtil from "../utils/whatsapp.util.js";
import { buildText, randomDelay, showConsoleError, errorMessage } from "../utils/general.util.js";
import botTexts from "../helpers/bot.texts.helper.js";
import { AutomationService } from "../services/automation.service.js";
import { ORACULO_ANSWERS } from "../data/oraculo_answers.js";
import { UserService } from "../services/user.service.js";
import { FortniteService } from "../services/fortnite.service.js";
import { BitcoinService } from "../services/bitcoin.service.js";
import { FreeStuffService } from "../services/freestuff.service.js";
import { CardGameService } from "../services/cardgame.service.js";
import { cardGameMsgs } from "../helpers/cardgame.texts.helper.js";
import { BolaoService } from "../services/bolao.service.js";
import moment from "moment";


const bolaoService = new BolaoService();

export const engagementMsgs = {
    perfil: {
        guide: `Ex: *{$p}perfil* - Veja seu perfil de jogador.\n` +
            `Ex: *{$p}perfil @contato* - Veja o perfil de outro membro.\n`,
        msgs: {
            profile_card: `👤 *PERFIL DE USUÁRIO* 👤\n\n` +
                `🏅 *Rank:* {$1}\n` +
                `🆙 *Nível:* {$2}\n` +
                `✨ *XP:* {$3}\n` +
                `💰 *Pontos:* {$4}\n\n` +
                `📊 *Estatísticas:* \n` +
                `💬 Mensagens: {$5}\n` +
                `⌨️ Comandos: {$6}\n` +
                `⚠️ Avisos: {$7}/3`
        }
    },
    topxp: {
        guide: `Ex: *{$p}topxp* - Mostra o ranking de XP do grupo (os 10 que mais participam).\n\n*Obs*: Cada mensagem enviada no grupo vale XP; suba de nível conversando. Só funciona em *grupos*.\n`,
        msgs: {
            ranking_title: "🏆 *RANKING DE XP - TOP 10* 🏆\n\n"
        }
    },
    noticias: {
        guide: `Ex: *{$p}noticias* - Mostra as principais notícias do Brasil agora (g1, com o Google Notícias de reserva).\n`,
    },
    oraculo: {
        guide: `🔮 *ORÁCULO MÍSTICO* 🔮\n\n` +
            `Como usar: Digite *{$p}oraculo [pergunta]*\n\n` +
            `O oraculo responderá suas dúvidas mais profundas. A pergunta deve ser clara e conter letras!`,
        msgs: {
            no_question: "🔮 *Hummm bem-bom, o cara não faz pergunta não!* \n\nPor favor, faça uma pergunta real ao oráculo.",
            invalid_question: "🔮 *Sinto uma perturbação na força...* \n\nSua pergunta parece confusa ou contém apenas números/símbolos. O oráculo exige uma pergunta com palavras!",
            reply: "🔮 *O Oráculo diz:* \n\n{$1}"
        }
    },
    fortnite: {
        guide: `🎮 *FORTNITE STATUS* 🎮\n\n` +
            `*Comandos:* \n` +
            `- *{$p}fortnite [nick]* - Busca estatísticas de qualquer jogador.\n` +
            `- *{$p}fortnite nick [seu_nick]* - Registra o seu nickname para consultas rápidas.\n` +
            `- *{$p}fortnite* - Busca as SUAS estatísticas (após registrar).\n\n` +
            `Ex: *{$p}fortnite Ninja*\n` +
            `Ex: *{$p}fortnite nick AluxX_AI*`,
        msgs: {
            no_nick_arg: "🎮 *ERRO:* Por favor, especifique o nickname que deseja registrar.\nEx: *{$p}fortnite nick Ninja*",
            nick_saved: "✅ *SUCESSO!* Seu nickname Fortnite foi registrado como: *{$1}*",
            no_registered_nick: "❌ *VOCÊ NÃO TEM NICK REGISTRADO!*\nUse *{$p}fortnite nick [nome]* para registrar ou consulte um amigo usando *{$p}fortnite [nome]*.",
            searching: "🔍 *PROCESSANDO DADOS DO FORTNITE...* \nBuscando estatísticas de *{$1}*...",
            stats_card: "🎮 *FORTNITE BR STATUS: {$1}* 🎮\n" +
                "━━━━━━━━━━━━━━━━━━━━\n" +
                "⭐ *PROGRESSO* \n" +
                "├─ Nível do Passe: *{$2}*\n" +
                "├─ Total de Partidas: *{$3}*\n" +
                "└─ Total de Vitórias: *{$4}* (🏆 *{$5}%*)\n\n" +
                "⚔️ *COMBATE (GLOBAL)* \n" +
                "├─ Eliminações: *{$6}*\n" +
                "└─ K/D Ratio: *☠️ {$7}*\n\n" +
                "🏗️ *POR CATEGORIA (WINS)* \n" +
                "├─ 👤 Solo: *{$8}*\n" +
                "├─ 👥 Duo: *{$9}*\n" +
                "└─ 👨‍👩‍👧‍👦 Squad: *{$10}*\n" +
                "━━━━━━━━━━━━━━━━━━━━\n" +
                "📊 *PERFIL COMPLETO:* \n" +
                "{$11}"
        }
    },
    bitcoin: {
        guide: `💰 *BITCOIN PRICE GUIDE* 💰\n\n` +
            `*Comandos:* \n` +
            `- *{$p}bitcoin* - Exibe a cotação atual do Bitcoin em BRL, USD e EUR.\n` +
            `- *{$p}bitcoin guia* - Mostra este guia.\n\n` +
            `Fonte: _Blockchain.info (Real-time)_`,
        msgs: {
            loading: "⏳ *ACESSANDO BLOCKCHAIN...* \nBuscando cotações em tempo real...",
            price_card: "₿ *COTAÇÃO BITCOIN (BTC)* ₿\n" +
                "━━━━━━━━━━━━━━━━━━━━\n" +
                "🇧🇷 BRL: *R$ {$1}*\n" +
                "🇺🇸 USD: *$ {$2}*\n" +
                "🇪🇺 EUR: *€ {$3}*\n" +
                "━━━━━━━━━━━━━━━━━━━━\n" +
                "🕙 *Atualizado em:* \n" +
                "{$4}"
        }
    },
    bolao: {
        guide: `🏆 *SISTEMA DE BOLÃO* 🏆\n\n` +
            `*Comandos:* \n` +
            `- *{$p}bolao [evento]* - Inicia um novo bolão no grupo.\n` +
            `- *{$p}apostar [palpite]* - Registra seu palpite no bolão ativo.\n` +
            `- *{$p}encerrarbolao [resultado]* - Finaliza o bolão e premia os vencedores (Admin).\n\n` +
            `Ex: *{$p}bolao Quem ganha o jogo?*\n` +
            `Ex: *{$p}apostar Flamengo*\n`,
        msgs: {
            created: "🏆 *BOLÃO INICIADO!* 🏆\n\n*Assunto:* {$1}\n\nFaça sua aposta com *{$p}apostar [palpite]*",
            bet_placed: "✅ *APOSTA REGISTRADA!* \n@{$1}, seu palpite foi: *{$2}*",
            resolved: "🏆 *BOLÃO ENCERRADO!* 🏆\n\n*Resultado:* {$1}\n\n🎉 *Vencedores:* \n{$2}\n\nCada vencedor recebeu *{$3} XP*!",
            no_winners: "🏆 *BOLÃO ENCERRADO!* 🏆\n\n*Resultado:* {$1}\n\nNinguém acertou o palpite desta vez! ❌",
            no_bet: "❌ *ERRO:* Você precisa digitar qual é o seu palpite!\nEx: *{$p}apostar Flamengo*"
        }
    },
    free: {
        guide: `🎮 *GUIA DE JOGOS GRÁTIS (!FREE)* 🎮\n\n` +
            `Receba alertas de jogos gratuitos e nunca perca um brinde! 🎁\n\n` +
            `*Comandos Disponíveis:* \n` +
            `- *{$p}free* - Lista os melhores jogos grátis do momento.\n` +
            `- *{$p}free sub* - Ativa alertas automáticos na sua DM.\n` +
            `- *{$p}free mode* completo - Alertas completos (título, valor, tradução e link).\n` +
            `- *{$p}free mode* resumo - Alertas resumidos (título, plataforma e link). Também vale *1* ou *2*.\n` +
            `- *{$p}free unsub* - Cancela o recebimento de alertas.\n\n` +
            `*Sobre o Sistema:* \n` +
            `✅ Descrições traduzidas profissionalmente.\n` +
            `✅ Filtramos apenas ofertas reais e permanentes.\n` +
            `✅ Monitoramento em tempo real 24/7.`,
        msgs: {
            loading: "⏳ *ESTAGIÁRIO BUSCANDO JOGOS GRÁTIS...* \nVasculhando a internet em busca de brindes...",
            no_games: "😔 *NENHUM JOGO GRÁTIS ENCONTRADO:* No momento não há brindes permanentes ativos. Tente o comando *{$p}free* mais tarde!",
            sub_success: "🔔 *INSCRITO COM SUCESSO!* \nAgora eu vou te avisar no privado sempre que um novo jogo grátis aparecer. Aproveite!",
            unsub_success: "🔕 *INSCRIÇÃO CANCELADA:* \nVocê não receberá mais alertas automáticos de jogos grátis.",
            already_sub: "☝️ *VOCÊ JÁ ESTÁ INSCRITO:* \nNão se preocupe, os alertas já estão ativos para você!",
            not_sub: "☝️ *VOCÊ NÃO ESTAVA INSCRITO:* \nSe mudar de ideia, use *{$p}free sub*!",
            current_giveaways: "🌟 *BRINDES ATIVOS ATUALMENTE:* 🌟\nMostrando os principais jogos permanentes:\n\n",
            mode_selection: "🎮 *CONFIGURAÇÃO DE ALERTAS* 🎮\n" +
                "Escolha como deseja receber seus jogos:\n\n" +
                "1️⃣ - *Completo* (Título, Valor, Tradução e Link)\n" +
                "2️⃣ - *Resumido* (Título, Plataforma e Link)\n\n" +
                "_Responda com o número ou use *{$p}free mode [completo/resumo]*_",
            mode_success: "⚙️ *MODO ATUALIZADO:* \nSeus alertas agora serão enviados no formato *{$1}*!"
        }
    }
}

export async function perfilCommand(client: WASocket, _botInfo: Bot, message: Message, group?: Group) {
    if (!message.isGroupMsg || !group) throw new Error("Este comando só pode ser usado em grupos.");

    const targetUser = message.mentioned[0] || message.sender;
    const groupController = new GroupController();
    const participant = await groupController.getParticipant(group.id, targetUser);

    const userService = UserService.getInstance();
    const globalUser = await userService.getUser(targetUser);

    if (!participant) throw new Error("Participante não encontrado.");

    const profileMsg = buildText(
        engagementMsgs.perfil.msgs.profile_card,
        participant.rank || 'Recruta',
        participant.level || 1,
        globalUser?.xp || participant.xp || 0, // Priorize global XP for display
        participant.score || 0,
        participant.msgs || 0,
        participant.commands || 0,
        participant.warnings || 0
    );

    await waUtil.replyWithMentions(client, message.chat_id, profileMsg, [targetUser], message.wa_message, { expiration: message.expiration });
}

export async function topXpCommand(client: WASocket, _botInfo: Bot, message: Message, group?: Group) {
    if (!message.isGroupMsg || !group) throw new Error("Este comando só pode ser usado em grupos.");

    const groupController = new GroupController();
    const participants = await groupController.getParticipants(group.id);
    const top10 = participants.sort((a, b) => (b.xp || 0) - (a.xp || 0)).slice(0, 10);

    let rankingMsg = engagementMsgs.topxp.msgs.ranking_title;
    top10.forEach((p, i) => {
        rankingMsg += `${i + 1}. Geral @${waUtil.removeWhatsappSuffix(p.user_id)} - 🏆 ${p.xp} XP (Nível ${p.level})\n`;
    });

    const mentions = top10.map(p => p.user_id);
    await waUtil.replyWithMentions(client, message.chat_id, rankingMsg, mentions, message.wa_message, { expiration: message.expiration });
}

export async function noticiasCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const newsMsg = await AutomationService.getInstance().fetchNews();
    await waUtil.replyText(client, message.chat_id, newsMsg, message.wa_message, { expiration: message.expiration });
}

export async function oraculoCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    const question = message.args.join(" ").trim();

    // Comando 'guia'
    if (message.args[0]?.toLowerCase() === 'guia') {
        const guideMsg = buildText(engagementMsgs.oraculo.guide, botInfo.prefix);
        await waUtil.replyText(client, message.chat_id, guideMsg, message.wa_message, { expiration: message.expiration });
        return;
    }

    // Validação: Sem pergunta
    if (!question) {
        throw new Error(engagementMsgs.oraculo.msgs.no_question);
    }

    // Validação: Apenas números ou caracteres especiais (sem letras)
    // Regex que verifica se NÃO possui caracteres alfabéticos (mínimo 2 letras para ser uma palavra/pergunta)
    const hasEnoughLetters = /[a-zA-Zá-úÁ-Ú]{2,}/.test(question);
    if (!hasEnoughLetters) {
        throw new Error(engagementMsgs.oraculo.msgs.invalid_question);
    }

    // Sorteia resposta
    const randomIndex = Math.floor(Math.random() * ORACULO_ANSWERS.length);
    const answer = ORACULO_ANSWERS[randomIndex];

    const replyMsg = buildText(engagementMsgs.oraculo.msgs.reply, answer);
    await waUtil.replyText(client, message.chat_id, replyMsg, message.wa_message, { expiration: message.expiration });
}

export async function fortniteCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    const args = message.args;
    const userService = UserService.getInstance();
    const fortniteService = FortniteService.getInstance();

    // Comando 'guia'
    if (args[0]?.toLowerCase() === 'guia') {
        const guideMsg = buildText(engagementMsgs.fortnite.guide, botInfo.prefix);
        await waUtil.replyText(client, message.chat_id, guideMsg, message.wa_message, { expiration: message.expiration });
        return;
    }

    // Subcomando 'nick' (registro)
    if (args[0]?.toLowerCase() === 'nick') {
        const nickToSave = args.slice(1).join(" ").trim();
        if (!nickToSave) {
            throw new Error(buildText(engagementMsgs.fortnite.msgs.no_nick_arg, botInfo.prefix));
        }

        await userService.setFortniteNick(message.sender, nickToSave);
        await waUtil.replyText(client, message.chat_id, buildText(engagementMsgs.fortnite.msgs.nick_saved, nickToSave), message.wa_message, { expiration: message.expiration });
        return;
    }

    // Lógica de busca
    let nickToSearch: string | undefined = args.join(" ").trim();

    // Se não passou argumento, tenta buscar o nick registrado do usuário
    if (!nickToSearch) {
        const user = await userService.getUser(message.sender);
        if (!user?.fortnite_nick) {
            throw new Error(buildText(engagementMsgs.fortnite.msgs.no_registered_nick, botInfo.prefix));
        }
        nickToSearch = user.fortnite_nick;
    }

    // Feedback de busca
    await waUtil.replyText(client, message.chat_id, buildText(engagementMsgs.fortnite.msgs.searching, nickToSearch), message.wa_message, { expiration: message.expiration });

    try {
        const stats = await fortniteService.getStats(nickToSearch);
        const trackerUrl = `https://fortnitetracker.com/profile/pc/${encodeURIComponent(nickToSearch)}`;

        const statsMsg = buildText(
            engagementMsgs.fortnite.msgs.stats_card,
            stats.nick,
            stats.level,
            stats.overall.matches,
            stats.overall.wins,
            stats.overall.winRate.toFixed(1),
            stats.overall.kills,
            stats.overall.kd.toFixed(2),
            stats.solo.wins,
            stats.duo.wins,
            stats.squad.wins,
            trackerUrl
        );

        await waUtil.replyText(client, message.chat_id, statsMsg, message.wa_message, { expiration: message.expiration });
    } catch (error) {
        throw new Error(errorMessage(error));
    }
}

export async function bitcoinCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    const args = message.args;
    const bitcoinService = BitcoinService.getInstance();

    // Comando 'guia'
    if (args[0]?.toLowerCase() === 'guia') {
        const guideMsg = buildText(engagementMsgs.bitcoin.guide, botInfo.prefix);
        await waUtil.replyText(client, message.chat_id, guideMsg, message.wa_message, { expiration: message.expiration });
        return;
    }

    // Feedback de busca
    await waUtil.replyText(client, message.chat_id, engagementMsgs.bitcoin.msgs.loading, message.wa_message, { expiration: message.expiration });

    try {
        const prices = await bitcoinService.getPrices();

        const priceMsg = buildText(
            engagementMsgs.bitcoin.msgs.price_card,
            prices.brl.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
            prices.usd.toLocaleString('en-US', { minimumFractionDigits: 2 }),
            prices.eur.toLocaleString('de-DE', { minimumFractionDigits: 2 }),
            prices.last_update
        );

        await waUtil.replyText(client, message.chat_id, priceMsg, message.wa_message, { expiration: message.expiration });
    } catch (error) {
        throw new Error(errorMessage(error));
    }
}

export async function freeCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    const args = message.args;
    const userService = UserService.getInstance();
    const freeService = FreeStuffService.getInstance();
    const userId = message.sender;

    // Subcomando 'guia'
    if (args[0]?.toLowerCase() === 'guia') {
        const guideMsg = buildText(engagementMsgs.free.guide, botInfo.prefix);
        await waUtil.replyText(client, message.chat_id, guideMsg, message.wa_message, { expiration: message.expiration });
        return;
    }

    // Subcomando 'sub' (Inscrever)
    if (args[0]?.toLowerCase() === 'sub') {
        const user = await userService.getUser(userId);
        if (user?.free_games_sub) {
            await waUtil.replyText(client, message.chat_id, engagementMsgs.free.msgs.already_sub, message.wa_message, { expiration: message.expiration });
            return;
        }
        await userService.setFreeGamesSub(userId, true);
        await waUtil.replyText(client, message.chat_id, engagementMsgs.free.msgs.sub_success, message.wa_message, { expiration: message.expiration });

        // Pergunta o modo logo em seguida
        const modeMsg = buildText(engagementMsgs.free.msgs.mode_selection, botInfo.prefix);
        await waUtil.replyText(client, message.chat_id, modeMsg, message.wa_message, { expiration: message.expiration });

        // Envia os jogos atuais (resumido por padrão inicial)
        try {
            const giveaways = await freeService.getGiveaways();
            const relevant = freeService.filterRelevant(giveaways).slice(0, 3);
            if (relevant.length > 0) {
                for (const g of relevant) {
                    const formatted = await freeService.formatGiveaway(g, "resumido");
                    await waUtil.sendText(client, userId, formatted);
                    await randomDelay(1000, 2000);
                }
            }
        } catch (e) { }
        return;
    }

    // Subcomando 'mode' (Trocar formato)
    if (args[0]?.toLowerCase() === 'mode') {
        const type = args[1]?.toLowerCase();
        if (type === '1' || type === 'completo') {
            await userService.setFreeGamesMode(userId, "completo");
            const reply = buildText(engagementMsgs.free.msgs.mode_success, "COMPLETO");
            await waUtil.replyText(client, message.chat_id, reply, message.wa_message, { expiration: message.expiration });
        } else if (type === '2' || type === 'resumo' || type === 'resumido') {
            await userService.setFreeGamesMode(userId, "resumido");
            const reply = buildText(engagementMsgs.free.msgs.mode_success, "RESUMIDO");
            await waUtil.replyText(client, message.chat_id, reply, message.wa_message, { expiration: message.expiration });
        } else {
            const modeMsg = buildText(engagementMsgs.free.msgs.mode_selection, botInfo.prefix);
            await waUtil.replyText(client, message.chat_id, modeMsg, message.wa_message, { expiration: message.expiration });
        }
        return;
    }

    // Subcomando 'unsub' (Cancelar)
    if (args[0]?.toLowerCase() === 'unsub') {
        const user = await userService.getUser(userId);
        if (!user?.free_games_sub) {
            await waUtil.replyText(client, message.chat_id, engagementMsgs.free.msgs.not_sub, message.wa_message, { expiration: message.expiration });
            return;
        }
        await userService.setFreeGamesSub(userId, false);
        await waUtil.replyText(client, message.chat_id, engagementMsgs.free.msgs.unsub_success, message.wa_message, { expiration: message.expiration });
        return;
    }

    // Default: Consulta manual
    await waUtil.replyText(client, message.chat_id, engagementMsgs.free.msgs.loading, message.wa_message, { expiration: message.expiration });

    try {
        const giveaways = await freeService.getGiveaways();
        const relevant = freeService.filterRelevant(giveaways).slice(0, 5);

        if (relevant.length === 0) {
            const noGamesMsg = buildText(engagementMsgs.free.msgs.no_games, botInfo.prefix);
            await waUtil.replyText(client, message.chat_id, noGamesMsg, message.wa_message, { expiration: message.expiration });
            return;
        }

        let header = engagementMsgs.free.msgs.current_giveaways;
        await waUtil.replyText(client, message.chat_id, header, message.wa_message, { expiration: message.expiration });

        const user = await userService.getUser(userId);
        const mode = user?.free_games_mode || "completo";

        for (const g of relevant) {
            const formatted = await freeService.formatGiveaway(g, mode);
            await waUtil.replyText(client, message.chat_id, formatted, message.wa_message);
            await randomDelay(1000, 2000);
        }

    } catch (error) {
        throw new Error(errorMessage(error));
    }
}


export async function rollCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    const args = message.args;
    const cardService = CardGameService.getInstance();
    const userService = UserService.getInstance();
    const userId = message.sender;

    // Subcomando 'guia'
    if (args[0]?.toLowerCase() === 'guia') {
        const guideMsg = buildText(cardGameMsgs.roll.guide, botInfo.prefix);
        await waUtil.replyText(client, message.chat_id, guideMsg, message.wa_message, { expiration: message.expiration });
        return;
    }

    try {
        const user = await userService.getUser(userId);
        const rollsInfo = await userService.getRollsInfo(userId);

        // Dono tem uso infinito
        const isOwner = user?.owner || false;
        const rollCost = 50;

        if (!isOwner && rollsInfo.count >= 7) {
            if (args[0] === 'confirmar') {
                const canSpend = await userService.spendXp(userId, rollCost);
                if (!canSpend) {
                    await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.roll.msgs.no_xp), message.wa_message, { expiration: message.expiration });
                    return;
                }
            } else {
                const limitMsg = buildText(cardGameMsgs.roll.msgs.daily_limit, botInfo.prefix);
                await waUtil.replyText(client, message.chat_id, limitMsg, message.wa_message, { expiration: message.expiration });
                return;
            }
        }

        // Feedback de busca
        await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.roll.msgs.loading), message.wa_message, { expiration: message.expiration });

        // Fetch random character
        const character = await cardService.fetchRandomCharacter();

        // Process image via Sharp
        const imageBuffer = await cardService.processImage(character.image_url);

        // Create game session
        const session = cardService.createSession(message.chat_id, character);

        // Increment roll count
        await userService.useRoll(userId);

        // Rarity stars
        const rarityStars = "⭐".repeat(character.rarity);
        const remainingStr = isOwner ? "♾️ Rolls Ilimitados" : `${7 - rollsInfo.count - 1} Rolls gratuitos restantes`;

        // Format message
        const cardMsg = buildText(
            cardGameMsgs.roll.msgs.card_appeared,
            character.name,
            character.source_title,
            character.source,
            rarityStars,
            session.claim_code,
            remainingStr
        );

        // Send image with caption
        await waUtil.replyFileFromBuffer(client, message.chat_id, 'imageMessage', imageBuffer, cardMsg, message.wa_message, { expiration: message.expiration });

    } catch (error) {
        throw new Error(errorMessage(error));
    }
}

export async function invCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const cardService = CardGameService.getInstance();
    const userService = UserService.getInstance();
    const userId = message.sender;

    try {
        const collection = await cardService.getUserCollection(userId);

        if (collection.length === 0) {
            await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.inv.msgs.empty), message.wa_message, { expiration: message.expiration });
            return;
        }

        const user = await userService.getUser(userId);
        let response = buildText(cardGameMsgs.inv.msgs.header, user?.xp || 0, collection.length);
        let count = 0;
        for (const card of collection.slice(0, 10)) {
            count++;
            const char = await cardService.getCharacterById(card.character_id);
            if (char) {
                response += `${count}. *${char.name}* (${char.source_title}) - Serial #${card.serial_number}\n`;
            }
        }

        if (collection.length > 10) {
            response += `\n_...e mais ${collection.length - 10} personagens._`;
        }

        await waUtil.replyText(client, message.chat_id, response, message.wa_message, { expiration: message.expiration });
    } catch (error) {
        throw new Error(errorMessage(error));
    }
}

// Memory stores for trades and auctions
const pendingTrades = new Map<string, { from: string, to: string, cardId: string, timeout: NodeJS.Timeout }>();
const activeAuctions = new Map<string, { item: string, owner: string, cardId: string, highestBid: number, highestBidder: string, timeout: NodeJS.Timeout }>();

export async function tradeCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    const args = message.args;
    const cardService = CardGameService.getInstance();
    const userId = message.sender;

    if (args[0] === 'aceitar' || args[0] === 'recusar') {
        const trade = pendingTrades.get(message.chat_id);
        if (!trade || trade.to !== userId) {
            await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.trade.msgs.no_proposal), message.wa_message, { expiration: message.expiration });
            return;
        }

        clearTimeout(trade.timeout);
        pendingTrades.delete(message.chat_id);

        if (args[0] === 'aceitar') {
            const success = await cardService.transferCard(trade.cardId, trade.from, trade.to);
            if (success) {
                const char = await cardService.getCharacterById(parseInt(trade.cardId.split('_')[1]));
                await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.trade.msgs.success, char?.name || "Personagem", waUtil.removeWhatsappSuffix(trade.to)), message.wa_message, { expiration: message.expiration });
            }
        } else {
            await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.trade.msgs.denied), message.wa_message, { expiration: message.expiration });
        }
        return;
    }

    const targetUser = message.mentioned[0];
    const serialArg = args.find(a => a.startsWith('#'));

    if (!targetUser || !serialArg) {
        await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.trade.guide, botInfo.prefix), message.wa_message, { expiration: message.expiration });
        return;
    }

    if (targetUser === userId) {
        await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.trade.msgs.self_trade), message.wa_message, { expiration: message.expiration });
        return;
    }

    const serialNum = parseInt(serialArg.replace('#', ''));
    const collection = await cardService.getUserCollection(userId);
    const card = collection.find(c => c.serial_number === serialNum);

    if (!card) {
        await waUtil.replyText(client, message.chat_id, cardGameMsgs.trade.msgs.not_yours, message.wa_message, { expiration: message.expiration });
        return;
    }

    const char = await cardService.getCharacterById(card.character_id);
    const timeout = setTimeout(() => {
        pendingTrades.delete(message.chat_id);
        // Promessa solta dentro do timer: sem .catch uma falha de envio encerraria o processo (Node 24).
        waUtil.sendText(client, message.chat_id, cardGameMsgs.trade.msgs.timeout, { expiration: message.expiration })
            .catch((err) => showConsoleError(err, "CARD_TRADE_TIMEOUT"));
    }, 60000);

    pendingTrades.set(message.chat_id, { from: userId, to: targetUser, cardId: card.id, timeout });

    await waUtil.replyWithMentions(client, message.chat_id, buildText(cardGameMsgs.trade.msgs.proposal, waUtil.removeWhatsappSuffix(userId), char?.name || "Personagem"), [targetUser], message.wa_message, { expiration: message.expiration });
}

export async function leilaoCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    const args = message.args;
    const cardService = CardGameService.getInstance();
    const userId = message.sender;

    if (activeAuctions.has(message.chat_id)) {
        await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.leilao.msgs.active_auction), message.wa_message, { expiration: message.expiration });
        return;
    }

    const serialArg = args.find(a => a.startsWith('#'));
    const minBid = parseInt(args.find(a => !a.startsWith('#') && !isNaN(parseInt(a))) || "50");

    if (!serialArg) {
        await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.leilao.guide, botInfo.prefix), message.wa_message, { expiration: message.expiration });
        return;
    }

    const serialNum = parseInt(serialArg.replace('#', ''));
    const collection = await cardService.getUserCollection(userId);
    const card = collection.find(c => c.serial_number === serialNum);

    if (!card) {
        await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.trade.msgs.not_yours), message.wa_message, { expiration: message.expiration });
        return;
    }

    const char = await cardService.getCharacterById(card.character_id);
    const charName = char?.name || "Personagem";

    const timeout = setTimeout(async () => {
        const auction = activeAuctions.get(message.chat_id);
        activeAuctions.delete(message.chat_id);

        if (auction && auction.highestBidder) {
            await cardService.transferCard(auction.cardId, auction.owner, auction.highestBidder);
            const userService = UserService.getInstance();
            await userService.addXp(auction.owner, auction.highestBid);
            await waUtil.sendTextWithMentions(client, message.chat_id, buildText(cardGameMsgs.leilao.msgs.success, auction.item, waUtil.removeWhatsappSuffix(auction.highestBidder), auction.highestBid), [auction.highestBidder], { expiration: message.expiration });
        } else {
            await waUtil.sendText(client, message.chat_id, buildText(cardGameMsgs.leilao.msgs.no_bids), { expiration: message.expiration });
        }
    }, 120000); // 2 minutes

    activeAuctions.set(message.chat_id, { item: charName, owner: userId, cardId: card.id, highestBid: minBid - 1, highestBidder: "", timeout });

    await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.leilao.msgs.started, charName, waUtil.removeWhatsappSuffix(userId), minBid), message.wa_message, { expiration: message.expiration });
}

export async function lanceCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const value = parseInt(message.args[0]);
    const userId = message.sender;
    const auction = activeAuctions.get(message.chat_id);

    if (!auction) return;
    if (auction.owner === userId) return;

    if (isNaN(value) || value <= auction.highestBid) {
        await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.leilao.msgs.low_bid), message.wa_message, { expiration: message.expiration });
        return;
    }

    const userService = UserService.getInstance();
    const canAfford = await userService.spendXp(userId, value);
    if (!canAfford) {
        await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.leilao.msgs.no_xp), message.wa_message, { expiration: message.expiration });
        return;
    }

    // Devolve XP do último bidder se houver
    if (auction.highestBidder) {
        await userService.addXp(auction.highestBidder, auction.highestBid);
    }

    auction.highestBid = value;
    auction.highestBidder = userId;

    await waUtil.replyWithMentions(client, message.chat_id, buildText(cardGameMsgs.leilao.msgs.new_bid, waUtil.removeWhatsappSuffix(userId), value), [userId], message.wa_message, { expiration: message.expiration });
}

export async function venderCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const serialArg = message.args.find(a => a.startsWith('#'));
    if (!serialArg) {
        await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.vender.msgs.invalid), message.wa_message, { expiration: message.expiration });
        return;
    }

    const cardService = CardGameService.getInstance();
    const userService = UserService.getInstance();
    const userId = message.sender;

    const serialNum = parseInt(serialArg.replace('#', ''));
    const collection = await cardService.getUserCollection(userId);
    const card = collection.find(c => c.serial_number === serialNum);

    if (!card) {
        await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.trade.msgs.not_yours), message.wa_message, { expiration: message.expiration });
        return;
    }

    const char = await cardService.getCharacterById(card.character_id);
    const rarity = char?.rarity || 1;
    const xpValue = rarity * 10; // Simple conversion: 10, 20, 30, 40, 50 XP

    const success = await cardService.deleteCard(card.id, userId);
    if (success) {
        await userService.addXp(userId, xpValue);
        await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.vender.msgs.success, char?.name || "Personagem", xpValue), message.wa_message, { expiration: message.expiration });
    }
}

export async function colecaoCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const cardService = CardGameService.getInstance();
    const userId = message.sender;

    try {
        const collection = await cardService.getUserCollection(userId);
        if (collection.length === 0) {
            await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.inv.msgs.empty), message.wa_message, { expiration: message.expiration });
            return;
        }

        // Agrupar por raridade
        const grouped: { [rarity: number]: string[] } = {};
        for (const card of collection) {
            const char = await cardService.getCharacterById(card.character_id);
            if (!char) continue;
            if (!grouped[char.rarity]) grouped[char.rarity] = [];
            grouped[char.rarity].push(`*${char.name}* (#${card.serial_number})`);
        }

        let response = buildText(cardGameMsgs.colecao.msgs.header, waUtil.removeWhatsappSuffix(userId));

        // Mostrar de 5 estrelas para 1 estrela
        for (let r = 5; r >= 1; r--) {
            if (grouped[r] && grouped[r].length > 0) {
                response += `${"⭐".repeat(r)} *(${grouped[r].length})*\n`;
                response += grouped[r].join(" • ") + "\n\n";
            }
        }

        await waUtil.replyText(client, message.chat_id, response, message.wa_message, { expiration: message.expiration });
    } catch (error) {
        throw new Error(errorMessage(error));
    }
}

export async function cartasCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const cardService = CardGameService.getInstance();
    const userId = message.sender;
    const page = parseInt(message.args[0]) || 1;
    const perPage = 5;

    try {
        const collection = await cardService.getUserCollection(userId);
        if (collection.length === 0) {
            await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.inv.msgs.empty), message.wa_message, { expiration: message.expiration });
            return;
        }

        const totalPages = Math.ceil(collection.length / perPage);
        if (page > totalPages) {
            await waUtil.replyText(client, message.chat_id, `❌ Página inexistente. Total de páginas: ${totalPages}`, message.wa_message, { expiration: message.expiration });
            return;
        }

        const start = (page - 1) * perPage;
        const end = start + perPage;
        const pageCards = collection.slice(start, end);

        await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.cartas.msgs.header, page), message.wa_message, { expiration: message.expiration });

        for (const card of pageCards) {
            const char = await cardService.getCharacterById(card.character_id);
            if (!char) continue;

            const imageBuffer = await cardService.processImage(char.image_url);
            const caption = `🗴 *${char.name}* (#${card.serial_number})\n${"⭐".repeat(char.rarity)}`;

            await waUtil.replyFileFromBuffer(client, message.chat_id, 'imageMessage', imageBuffer, caption, message.wa_message, { expiration: message.expiration });
            await randomDelay(1000, 2000); // Evitar spam de arquivos
        }

        if (page < totalPages) {
            await waUtil.sendText(client, message.chat_id, `_Digite !cartas ${page + 1} para ver mais_`, { expiration: message.expiration });
        }
    } catch (error) {
        throw new Error(errorMessage(error));
    }
}

export async function cartaCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const cardService = CardGameService.getInstance();
    const userId = message.sender;
    const serialArg = message.args.find(a => a.startsWith('#'));

    try {
        const collection = await cardService.getUserCollection(userId);

        if (collection.length === 0) {
            await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.inv.msgs.empty), message.wa_message, { expiration: message.expiration });
            return;
        }

        // Se não passou serial, lista em texto
        if (!serialArg) {
            let response = "📋 *SUAS CARTAS (LISTA)* 📋\n\n";
            for (const card of collection) {
                const char = await cardService.getCharacterById(card.character_id);
                if (char) {
                    response += `• [#${card.serial_number}] *${char.name}*\n`;
                }
            }
            response += `\n_Para ver detalhes: !carta #serial_`;
            await waUtil.replyText(client, message.chat_id, response, message.wa_message, { expiration: message.expiration });
            return;
        }

        const serialNum = parseInt(serialArg.replace('#', ''));
        const card = collection.find(c => c.serial_number === serialNum);

        if (!card) {
            await waUtil.replyText(client, message.chat_id, buildText(cardGameMsgs.carta.msgs.not_found), message.wa_message, { expiration: message.expiration });
            return;
        }

        const char = await cardService.getCharacterById(card.character_id);
        if (!char) return;

        const imageBuffer = await cardService.processImage(char.image_url);
        const date = moment(card.claimed_at).format('DD/MM/YYYY HH:mm');
        const info = buildText(
            cardGameMsgs.carta.msgs.info,
            char.name,
            char.source_title,
            char.source,
            "⭐".repeat(char.rarity),
            card.serial_number,
            date,
            card.id
        );

        await waUtil.replyFileFromBuffer(client, message.chat_id, 'imageMessage', imageBuffer, info, message.wa_message, { expiration: message.expiration });

    } catch (error) {
        throw new Error(errorMessage(error));
    }
}

export async function bolaoCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    if (!message.isGroupMsg) throw new Error(botTexts.permission.group);
    if (!message.args.length) throw new Error(buildText(engagementMsgs.bolao.guide, botInfo.prefix));

    const eventName = message.text_command;
    await bolaoService.createPool(message.chat_id, eventName);

    const replyText = buildText(engagementMsgs.bolao.msgs.created, eventName);
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration });
}

export async function apostarCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    if (!message.isGroupMsg) throw new Error(botTexts.permission.group);
    if (!message.args.length) throw new Error(engagementMsgs.bolao.msgs.no_bet);

    const prediction = message.text_command;
    await bolaoService.placeBet(message.chat_id, message.sender, prediction);

    const replyText = buildText(engagementMsgs.bolao.msgs.bet_placed, waUtil.removeWhatsappSuffix(message.sender), prediction);
    await waUtil.replyWithMentions(client, message.chat_id, replyText, [message.sender], message.wa_message, { expiration: message.expiration });
}

export async function encerrarbolaoCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    if (!message.isGroupMsg) throw new Error(botTexts.permission.group);

    // Apenas admins do grupo ou o dono/admin do bot podem encerrar
    if (!message.isGroupAdmin && !message.isBotAdmin && !message.isBotOwner) {
        throw new Error(botTexts.permission.admin_group_only);
    }

    if (!message.args.length) throw new Error("Você precisa digitar o resultado vencedor!");

    const result = message.text_command;
    const { winners, xp_awarded } = await bolaoService.resolvePool(message.chat_id, result);

    if (winners.length > 0) {
        const winnerMentions = winners.map(w => `@${waUtil.removeWhatsappSuffix(w)}`).join("\n");
        const replyText = buildText(engagementMsgs.bolao.msgs.resolved, result, winnerMentions, xp_awarded);
        await waUtil.replyWithMentions(client, message.chat_id, replyText, winners, message.wa_message, { expiration: message.expiration });
    } else {
        const replyText = buildText(engagementMsgs.bolao.msgs.no_winners, result);
        await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration });
    }
}
