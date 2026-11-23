import * as gameFunctions from './game.functions.commands.js'
import { gameMsgs } from './game.functions.commands.js'

const gameCommands = {
    showdomilhao: {
        guide: gameMsgs.showdomilhao.guide,
        msgs: gameMsgs.showdomilhao.msgs,
        function: gameFunctions.showdomilhaoCommand
    },
    casino: {
        guide: gameMsgs.casino.guide,
        msgs: gameMsgs.casino.msgs,
        function: gameFunctions.casinoCommand
    }
}

export default gameCommands
