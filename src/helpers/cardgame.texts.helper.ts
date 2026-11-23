export const cardGameMsgs = {
    roll: {
        guide: `🃏 *GUIA DO SINFOROSO CARDS* 🃏\n\n` +
            `*Comandos Disponíveis:*\n` +
            `- *{$p}roll* - Sorteia um personagem para conquistar.\n` +
            `- *{$p}inv* - Veja sua coleção de personagens.\n` +
            `- *{$p}roll confirmar* - Depois dos 7 rolls grátis do dia, gasta *50 XP* para um roll extra.\n\n` +
            `*Como Jogar:*\n` +
            `1. Use *{$p}roll* para aparecer um personagem.\n` +
            `2. Digite o código exibido para "casar" com ele!\n` +
            `3. O primeiro a digitar conquista a carta.\n\n` +
            `_Personagens de Anime, Mangá e Games!_`,
        msgs: {
            loading: "🎴 *INVOCANDO PERSONAGEM...* \nBuscando nas dimensões...",
            no_xp: "❌ *XP INSUFICIENTE!* \nVocê já usou seus 7 rolls gratuitos hoje e não tem *50 XP* para um roll extra.",
            daily_limit: "⚠️ *LIMITE DIÁRIO ATINGIDO!* \nVocê já usou seus 7 rolls gratuitos hoje. Deseja gastar *50 XP* para rodar mais? (Digite !roll confirmar para gastar)",
            card_appeared: "✨ *UM PERSONAGEM APARECEU!* ✨\n\n" +
                "🎴 *{$1}*\n" +
                "📺 *De:* {$2} ({$3})\n" +
                "⭐ *Raridade:* {$4}\n\n" +
                "💍 Digite o código *{$5}* para casar!\n" +
                "_{$6}_",
            claim_success: "💍 *CASAMENTO REALIZADO!* 💍\n\n" +
                "{$1} casou com *{$2}*!\n" +
                "(Serial #{$3})",
            claim_timeout: "😔 *O personagem fugiu...* \nNinguém digitou o código a tempo."
        }
    },
    inv: {
        guide: `🎒 *INVENTÁRIO* 🎒\n\n` +
            `Use *{$p}inv* para ver seus personagens.`,
        msgs: {
            empty: "😔 *SUA COLEÇÃO ESTÁ VAZIA!* \nUse *{$p}roll* para conquistar personagens.",
            header: "🎒 *SUA COLEÇÃO* 🎒\n" +
                "✨ *XP Atual:* {$1}\n" +
                "📇 *Total de Cartas:* {$2}\n\n"
        }
    },
    trade: {
        guide: `🤝 *SISTEMA DE TROCAS* 🤝\n\n` +
            `Use *{$p}trade @user [Serial da Carta]* para propor uma troca.\n` +
            `O outro usuário deve digitar *!trade aceitar* ou *!trade recusar*.\n\n` +
            `Ex: *{$p}trade @amigo #12*`,
        msgs: {
            proposal: "🤝 *PROPOSTA DE TROCA!* 🤝\n\n" +
                "{$1} quer te dar a carta *{$2}*! \n" +
                "Você aceita? Digite *!trade aceitar* ou *!trade recusar*.\n" +
                "(_A proposta expira em 60 segundos_)",
            success: "✅ *TROCA CONCLUÍDA!* \n\n*{$1}* agora pertence a {$2}!",
            denied: "❌ *TROCA RECUSADA:* A proposta foi cancelada.",
            timeout: "⌛ *TROCA EXPIRADA:* O tempo limite acabou.",
            not_yours: "❌ *ERRO:* Você não possui essa carta!",
            no_proposal: "❌ *ERRO:* Você não tem propostas de troca pendentes.",
            self_trade: "🤔 *UAI?* Trocar consigo mesmo não vale!"
        }
    },
    leilao: {
        guide: `⚖️ *LEILÃO SINFOROSO* ⚖️\n\n` +
            `Use *{$p}leilao [Serial da Carta] [Lance Mínimo]*.\n` +
            `O leilão dura 2 minutos. Outros dão lances com *!lance [Valor]*.\n\n` +
            `Ex: *{$p}leilao #12 100*`,
        msgs: {
            started: "⚖️ *LEILÃO INICIADO!* ⚖️\n\n" +
                "📦 *Item:* {$1}\n" +
                "👤 *Vendedor:* {$2}\n" +
                "💰 *Lance Inicial:* {$3} XP\n\n" +
                "Digite *!lance [valor]* para participar!",
            new_bid: "💰 *NOVO LANCE!* \n\n*{$1}* deu um lance de *{$2} XP*! \nAlguém dá mais?",
            success: "🏆 *LEILÃO ENCERRADO!* 🏆\n\n" +
                "A carta *{$1}* foi vendida para *{$2}* por *{$3} XP*!",
            no_bids: "😔 *LEILÃO SEM LANCES:* A carta retornou ao dono.",
            low_bid: "❌ *LANCE INVÁLIDO:* O lance deve ser maior que o atual!",
            no_xp: "❌ *XP INSUFICIENTE:* Você não tem XP para dar esse lance!",
            active_auction: "❌ *ERRO:* Já existe um leilão ativo neste chat."
        }
    },
    vender: {
        guide: `💰 *VENDA DIRETA* 💰\n\n` +
            `Use *{$p}vender [Serial]* para converter cartas em XP.\n` +
            `Ganhos: 20% do valor da raridade.\n\n` +
            `Ex: *{$p}vender #12*`,
        msgs: {
            success: "💰 *CARTA VENDIDA!* \n\nVocê vendeu *{$1}* e recebeu *{$2} XP*!",
            invalid: "❌ *ERRO:* Informe o Serial da carta (ex: #12)."
        }
    },
    colecao: {
        guide: `🗂️ *COLEÇÃO POR RARIDADE* 🗂️\n\n` +
            `Use *{$p}colecao* para ver suas cartas agrupadas por estrelas.\n` +
            `Mostra o nome e o serial (#) de cada uma.`,
        msgs: {
            header: "🗂️ *COLEÇÃO DE {$1}* 🗂️\n\n"
        }
    },
    cartas: {
        guide: `🖼️ *GALERIA DE MINIATURAS* 🖼️\n\n` +
            `Use *{$p}cartas [página]* para ver as imagens da sua coleção.\n` +
            `Exibimos 5 cartas por vez para não sobrecarregar.\n\n` +
            `Ex: *{$p}cartas 2*`,
        msgs: {
            header: "🖼️ *GALERIA - PÁGINA {$1}* 🖼️\n\n"
        }
    },
    carta: {
        guide: `🔍 *INSPETOR DE CARTA* 🔍\n\n` +
            `*Comandos:* \n` +
            `- *{$p}carta* - Lista todas as suas cartas (Texto).\n` +
            `- *{$p}carta [Serial]* - Mostra a imagem e detalhes de uma carta específica.\n\n` +
            `Ex: *{$p}carta #12*`,
        msgs: {
            detail_header: "🔍 *DETALHES DA CARTA* 🔍\n\n",
            info: "*Nome:* {$1}\n" +
                "📺 *Origem:* {$2} ({$3})\n" +
                "⭐ *Raridade:* {$4}\n" +
                "🔢 *Serial:* #{$5}\n" +
                "📅 *Capturada em:* {$6}\n" +
                "📂 *ID:* `{$7}`",
            not_found: "❌ *CARTA NÃO ENCONTRADA:* Verifique o número do Serial (ex: #12)."
        }
    }
};
