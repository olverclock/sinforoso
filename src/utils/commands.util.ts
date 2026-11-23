import { CategoryCommand } from "../interfaces/command.interface.js"
import { Message } from "../interfaces/message.interface.js"
import botTexts from "../helpers/bot.texts.helper.js"
import { removePrefix } from "./whatsapp.util.js"
import { buildText } from "./general.util.js"

const COMMAND_CATEGORIES = ['info', 'utility', 'download', 'sticker', 'misc', 'group', 'admin', 'game', 'engagement']

// Ordem usada por getCommands (mantida igual à implementação anterior).
const COMMANDS_ORDER: CategoryCommand[] = ['utility', 'misc', 'info', 'group', 'admin', 'sticker', 'download', 'game', 'engagement']

/**
 * Registro das listas de comandos. É preenchido na inicialização por
 * helpers/command.invoker.helper.ts (registerCommands), para que utils/ não
 * dependa de commands/ (regra ARCH-011).
 */
export type CommandsRegistry = {
    [category in CategoryCommand]: { [command: string]: { guide: string } }
}

let commandsRegistry: CommandsRegistry | undefined

export function registerCommands(commands: CommandsRegistry) {
    commandsRegistry = commands
}

function getRegistry(): CommandsRegistry {
    if (!commandsRegistry) {
        throw new Error("Registro de comandos não inicializado: registerCommands() deve ser chamado na inicialização (command.invoker.helper).")
    }
    return commandsRegistry
}

export function commandExist(prefix: string, command: string, category?: CategoryCommand) {
    if (!category) {
        return getCommands(prefix).includes(command)
    } else {
        return getCommandsByCategory(prefix, category).includes(command)
    }
}

export function getCommands(prefix: string) {
    const registry = getRegistry()
    const commands = COMMANDS_ORDER
        .flatMap(category => Object.keys(registry[category]))
        .map(command => prefix + command)

    return commands
}

export function getCommandsByCategory(prefix: string, category: CategoryCommand) {
    return Object.keys(getRegistry()[category]).map(command => prefix + command)
}

export function getCommandCategory(prefix: string, command: string) {
    let foundCategory: CategoryCommand | null = null
    const categories = COMMAND_CATEGORIES as CategoryCommand[]

    for (let category of categories) {
        if (getCommandsByCategory(prefix, category).includes(command)) {
            foundCategory = category as CategoryCommand
        }
    }

    return foundCategory
}

export function getCommandGuide(prefix: string, command: string) {
    const commandCategory = getCommandCategory(prefix, command)
    const { guide_header_text, no_guide_found } = botTexts
    let guide_text: string

    if (commandCategory) {
        const commands = getRegistry()[commandCategory]
        guide_text = guide_header_text + commands[removePrefix(prefix, command)].guide
    } else {
        guide_text = no_guide_found
    }

    return buildText(guide_text)
}

export function messageErrorCommandUsage(prefix: string, message: Message) {
    return buildText(botTexts.error_command_usage, message.command, getCommandGuide(prefix, message.command))
}
