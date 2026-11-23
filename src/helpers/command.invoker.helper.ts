import { WASocket } from "baileys";
import { Bot } from "../interfaces/bot.interface.js";
import { Message } from "../interfaces/message.interface.js";
import { messageErrorCommand, showCommandConsole, showConsoleError, errorMessage } from "../utils/general.util.js";
import { Group } from "../interfaces/group.interface.js";
import { Commands } from "../interfaces/command.interface.js";
import { autoSticker } from "../commands/sticker.functions.commands.js";
import * as waUtil from "../utils/whatsapp.util.js";
import botTexts from "../helpers/bot.texts.helper.js";
import infoCommands from "../commands/info.list.commands.js";
import utilityCommands from "../commands/utility.list.commands.js";
import stickerCommands from "../commands/sticker.list.commands.js";
import downloadCommands from "../commands/download.list.commands.js";
import miscCommands from "../commands/misc.list.commands.js";
import groupCommands from "../commands/group.list.commands.js";
import adminCommands from "../commands/admin.list.commands.js";
import gameCommands from "../commands/game.list.commands.js";
import engagementCommands from "../commands/engagement.list.commands.js";
import { getCommandCategory, getCommandGuide, registerCommands } from "../utils/commands.util.js";

// Registra as listas de comandos para utils/commands.util.ts (commandExist, getCommandGuide...),
// que não importa commands/ diretamente (ARCH-011).
registerCommands({
    info: infoCommands,
    utility: utilityCommands,
    download: downloadCommands,
    sticker: stickerCommands,
    misc: miscCommands,
    group: groupCommands,
    admin: adminCommands,
    game: gameCommands,
    engagement: engagementCommands,
});

const CATEGORY_MAP: Record<string, { commands: unknown, color: string, label: string }> = {
    info: { commands: infoCommands, color: "#8ac46e", label: "INFO" },
    utility: { commands: utilityCommands, color: "#de9a07", label: "UTILIDADE" },
    sticker: { commands: stickerCommands, color: "#ae45d1", label: "STICKER" },
    download: { commands: downloadCommands, color: "#2195cf", label: "DOWNLOAD" },
    misc: { commands: miscCommands, color: "#22e3dd", label: "VARIADO" },
    group: { commands: groupCommands, color: "#e0e031", label: "GRUPO" },
    admin: { commands: adminCommands, color: "#d1d1d1", label: "ADMINISTRAÇÃO" },
    game: { commands: gameCommands, color: "#ff00ff", label: "JOGO" },
    engagement: { commands: engagementCommands, color: "#ffa500", label: "ENGAJAMENTO" }
}

export async function commandInvoker(client: WASocket, botInfo: Bot, message: Message, group: Group | null) {
    const isGuide = (!message.args.length) ? false : message.args[0] === 'guia'
    const categoryName = getCommandCategory(botInfo.prefix, message.command)
    const commandName = waUtil.removePrefix(botInfo.prefix, message.command)

    try {
        if (isGuide) {
            return sendCommandGuide(client, botInfo.prefix, message)
        }

        const category = categoryName ? CATEGORY_MAP[categoryName] : null

        if (category) {
            const commands = category.commands as Commands

            // Verificações de permissão específicas de categoria
            if (categoryName === 'group' && (!message.isGroupMsg || !group)) {
                throw new Error(botTexts.permission.group)
            }
            if (categoryName === 'admin' && !message.isBotAdmin) {
                throw new Error(botTexts.permission.admin_bot_only)
            }

            if (Object.keys(commands).includes(commandName)) {
                await commands[commandName].function(client, botInfo, message, group || undefined)
                showCommandConsole(message.isGroupMsg, category.label, message.command, category.color, message.t, message.pushname, group?.name)
                return
            }
        }

        // Outros - Autosticker (Caso nenhum comando tenha sido disparado)
        if ((message.isGroupMsg && group?.autosticker) || (!message.isGroupMsg && botInfo.autosticker)) {
            await autoSticker(client, botInfo, message, group || undefined)
            showCommandConsole(message.isGroupMsg, "STICKER", "AUTO-STICKER", "#ae45d1", message.t, message.pushname, group?.name)
        }

    } catch (err) {
        showConsoleError(err, "COMMAND_INVOKER")
        await waUtil.replyText(client, message.chat_id, messageErrorCommand(message.command, errorMessage(err)), message.wa_message, { expiration: message.expiration })
    }
}

async function sendCommandGuide(client: WASocket, prefix: string, message: Message) {
    await waUtil.replyText(client, message.chat_id, getCommandGuide(prefix, message.command), message.wa_message, { expiration: message.expiration })
}