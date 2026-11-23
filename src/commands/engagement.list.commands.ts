import { engagementMsgs, perfilCommand, topXpCommand, noticiasCommand, oraculoCommand, fortniteCommand, bitcoinCommand, freeCommand, rollCommand, invCommand, tradeCommand, leilaoCommand, lanceCommand, venderCommand, colecaoCommand, cartasCommand, cartaCommand, bolaoCommand, apostarCommand, encerrarbolaoCommand } from './engagement.functions.commands.js'
import { cardGameMsgs } from '../helpers/cardgame.texts.helper.js'

const engagementCommands = {
    perfil: {
        guide: engagementMsgs.perfil.guide,
        msgs: engagementMsgs.perfil.msgs,
        function: perfilCommand
    },
    topxp: {
        guide: engagementMsgs.topxp.guide,
        msgs: engagementMsgs.topxp.msgs,
        function: topXpCommand
    },
    noticias: {
        guide: engagementMsgs.noticias.guide,
        function: noticiasCommand
    },
    oraculo: {
        guide: engagementMsgs.oraculo.guide,
        msgs: engagementMsgs.oraculo.msgs,
        function: oraculoCommand
    },
    fortnite: {
        guide: engagementMsgs.fortnite.guide,
        msgs: engagementMsgs.fortnite.msgs,
        function: fortniteCommand
    },
    bitcoin: {
        guide: engagementMsgs.bitcoin.guide,
        msgs: engagementMsgs.bitcoin.msgs,
        function: bitcoinCommand
    },
    free: {
        guide: engagementMsgs.free.guide,
        msgs: engagementMsgs.free.msgs,
        function: freeCommand
    },
    roll: {
        guide: cardGameMsgs.roll.guide,
        msgs: cardGameMsgs.roll.msgs,
        function: rollCommand
    },
    inv: {
        guide: cardGameMsgs.inv.guide,
        msgs: cardGameMsgs.inv.msgs,
        function: invCommand
    },
    colecao: {
        guide: cardGameMsgs.colecao.guide,
        msgs: cardGameMsgs.colecao.msgs,
        function: colecaoCommand
    },
    cartas: {
        guide: cardGameMsgs.cartas.guide,
        msgs: cardGameMsgs.cartas.msgs,
        function: cartasCommand
    },
    carta: {
        guide: cardGameMsgs.carta.guide,
        msgs: cardGameMsgs.carta.msgs,
        function: cartaCommand
    },
    trade: {
        guide: cardGameMsgs.trade.guide,
        msgs: cardGameMsgs.trade.msgs,
        function: tradeCommand
    },
    leilao: {
        guide: cardGameMsgs.leilao.guide,
        msgs: cardGameMsgs.leilao.msgs,
        function: leilaoCommand
    },
    lance: {
        guide: `💰 *DAR UM LANCE* 💰\n\nUse *!lance [Valor]* durante um leilão ativo.`,
        function: lanceCommand
    },
    vender: {
        guide: cardGameMsgs.vender.guide,
        msgs: cardGameMsgs.vender.msgs,
        function: venderCommand
    },
    bolao: {
        guide: engagementMsgs.bolao.guide,
        msgs: engagementMsgs.bolao.msgs,
        function: bolaoCommand
    },
    apostar: {
        guide: engagementMsgs.bolao.guide,
        msgs: engagementMsgs.bolao.msgs,
        function: apostarCommand
    },
    encerrarbolao: {
        guide: `Finaliza o bolão e premia os vencedores.\nUso: *!encerrarbolao [resultado]*`,
        function: encerrarbolaoCommand
    }
}

export default engagementCommands
