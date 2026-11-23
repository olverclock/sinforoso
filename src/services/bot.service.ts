import { Bot } from "../interfaces/bot.interface.js"
import path from "node:path"
import fs from 'fs-extra'
import moment from "moment-timezone"
import { removePrefix } from "../utils/whatsapp.util.js"
import { deepMerge, setPrefixProvider } from "../utils/general.util.js"

/**
 * Cache do bot.json em memória (PERF-01). Cada leitura só confere a data de modificação e o tamanho
 * do arquivo (um stat, sem ler nem interpretar o JSON). Se alguém editar o arquivo por fora, a
 * mudança é detectada e o arquivo é lido de novo, como antes.
 */
type BotFileCache = { mtimeMs: number, size: number, data: Bot }
const botFileCache = new Map<string, BotFileCache>()

function cacheEntry(file: string, data: Bot) {
    const stat = fs.statSync(file)
    botFileCache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, data })
}

export class BotService {
    private pathJSON = path.resolve("storage/bot.json")

    private defaultBot : Bot = {
        started : 0,
        host_number: '',
        name: "Sinforoso",
        prefix: "!",
        executed_cmds: 0,
        db_migrated: true,
        autosticker: false,
        commands_pv: true,
        admin_mode: false, 
        block_cmds: [],    
        command_rate:{
            status: false,
            max_cmds_minute: 5,
            block_time: 60,
        }
    }

    constructor(){
        // Arquivo já lido antes: não precisa conferir a pasta de novo (getBot confere se mudou)
        if (botFileCache.has(this.pathJSON)) return
        const storageFolderExists = fs.pathExistsSync(path.resolve("storage"))
        const jsonFileExists = fs.existsSync(this.pathJSON)
        
        if (!storageFolderExists) fs.mkdirSync(path.resolve("storage"), {recursive: true})
        if (!jsonFileExists) this.initBot()
    }

    private initBot(){
        this.updateBot(this.defaultBot)
    }

    public migrateBot() {
        const oldBotData = this.getBot() as unknown // deepMerge aceita dados antigos de formato desconhecido
        const newBotData : Bot = deepMerge(this.defaultBot, oldBotData)
        this.deleteBotData()
        this.updateBot(newBotData)
    }

    private updateBot(bot : Bot){
        fs.writeFileSync(this.pathJSON, JSON.stringify(bot))
        cacheEntry(this.pathJSON, structuredClone(bot))
    }

    private deleteBotData(){
        fs.writeFileSync(this.pathJSON, JSON.stringify({}))
        botFileCache.delete(this.pathJSON)
    }

    public startBot(hostNumber : string){
        let bot = this.getBot()
        bot.started = moment.now()
        bot.host_number = hostNumber
        this.updateBot(bot)
    }

    public getBot(): Bot {
        let stat = fs.statSync(this.pathJSON, { throwIfNoEntry: false })
        if (!stat) {
            // Apagado por fora com o bot rodando: recria com os valores padrão (como o construtor fazia)
            fs.mkdirSync(path.dirname(this.pathJSON), { recursive: true })
            this.initBot()
            stat = fs.statSync(this.pathJSON)
        }
        const cached = botFileCache.get(this.pathJSON)
        if (!cached || cached.mtimeMs !== stat.mtimeMs || cached.size !== stat.size) {
            const data = JSON.parse(fs.readFileSync(this.pathJSON, {encoding: "utf-8"})) as Bot
            botFileCache.set(this.pathJSON, { mtimeMs: stat.mtimeMs, size: stat.size, data })
            return structuredClone(data)
        }
        // Cópia: quem chama pode alterar o objeto sem afetar o cache
        return structuredClone(cached.data)
    }

    public setNameBot(name: string){
        let bot = this.getBot()
        bot.name = name
        this.updateBot(bot)
    }

    public setDbMigrated(status: boolean) {
        let bot = this.getBot()
        bot.db_migrated = status
        this.updateBot(bot)
    }
    
    public setPrefix(prefix: string){
        let bot = this.getBot()
        bot.prefix = prefix
        this.updateBot(bot)
    }

    public incrementExecutedCommands(){
        let bot = this.getBot()
        bot.executed_cmds++
        this.updateBot(bot)
    }

    public setAutosticker(status: boolean){
        let bot = this.getBot()
        bot.autosticker = status
        this.updateBot(bot)
    }

    public setAdminMode(status: boolean){
        let bot = this.getBot()
        bot.admin_mode = status
        this.updateBot(bot)
    }

    public setCommandsPv(status: boolean){
        let bot = this.getBot()
        bot.commands_pv = status
        this.updateBot(bot)
    }

    public async setCommandRate(status: boolean, maxCommandsMinute: number, blockTime: number){
        let bot = this.getBot()
        bot.command_rate.status = status
        bot.command_rate.max_cmds_minute = maxCommandsMinute
        bot.command_rate.block_time = blockTime
        this.updateBot(bot)
    }

    public async setBlockedCommands(prefix: string, commands: string[], operation: 'add' | 'remove'){
        let botInfo = this.getBot()
        const commandsWithoutPrefix = commands.map(command => removePrefix(prefix, command))

        if (operation == 'add'){
            const blockCommands = commandsWithoutPrefix.filter(command => !botInfo.block_cmds.includes(command))
            botInfo.block_cmds.push(...blockCommands)
            this.updateBot(botInfo)
            return blockCommands.map(command => prefix+command)
        } else {
            const unblockCommands = commandsWithoutPrefix.filter(command => botInfo.block_cmds.includes(command))

            unblockCommands.forEach((command) => {
                botInfo.block_cmds.splice(botInfo.block_cmds.indexOf(command), 1)
            })

            this.updateBot(botInfo)
            return unblockCommands.map(command => prefix+command)
        }
    }
}

// Fornece o prefixo atual para buildText (utils/general.util.ts) sem que utils/
// dependa de controllers/ (ARCH-011). Equivale ao antigo `new BotController().getBot().prefix`.
setPrefixProvider(() => new BotService().getBot().prefix)
