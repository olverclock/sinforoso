import { WASocket } from "baileys"
import { Bot } from "../interfaces/bot.interface.js"
import { Group } from "../interfaces/group.interface.js"
import { Message } from "../interfaces/message.interface.js"
import botTexts from "../helpers/bot.texts.helper.js"
import { buildText } from "../utils/general.util.js"
import * as waUtil from "../utils/whatsapp.util.js"
import { normalizeWord, parseDuration, parseSchedule } from "../utils/reminder.util.js"
import { sameUser } from "../utils/identity.util.js"
import * as gw from "../utils/giveaway.util.js"
import { GroupController } from "../controllers/group.controller.js"
import { ChatFeaturesService } from "../services/chat-features.service.js"
import { entriesDb, formatWhen, Giveaway, GiveawayError, GiveawayMode, GiveawayService, PrizePackage, remaining } from "../services/giveaway.service.js"
import { giveawayGuide, giveawayTexts as t } from "./misc.giveaway.texts.commands.js"

const service = new GiveawayService()
const features = new ChatFeaturesService()

async function reply(client: WASocket, message: Message, text: string) {
    await waUtil.replyText(client, message.chat_id, text, message.wa_message, { expiration: message.expiration })
}

function requireGroup(message: Message, group?: Group): Group {
    if (!message.isGroupMsg || !group) throw new GiveawayError(t.needGroup)
    return group
}

function requireGroupAdmin(message: Message, group?: Group): Group {
    const g = requireGroup(message, group)
    if (!message.isGroupAdmin) throw new GiveawayError(botTexts.permission.admin_group_only)
    return g
}

/** "1h" = daqui a 1 hora; "às 20h", "20:00", "amanhã 20h", "25/12 18h" = horário. */
export function parseCloseTime(text: string, now = Date.now()): number {
    const value = text.trim()
    const minutes = parseDuration(value, true)
    if (minutes !== null) return now + minutes * 60_000
    return parseSchedule(`${value} .`, now).when
}

/** "Prêmio | quando | número | sem admins" → partes. */
export function splitParts(text: string): { parts: string[], excludeAdmins: boolean } {
    const parts = text.split('|').map(p => p.trim()).filter(Boolean)
    const excludeAdmins = parts.length > 1 && /^sem\s+adm/i.test(normalizeWord(parts[parts.length - 1]))
    return { parts: excludeAdmins ? parts.slice(0, -1) : parts, excludeAdmins }
}

const MODE_NAMES: Record<GiveawayMode, string> = { inscricao: 'Inscrições', relampago: 'Relâmpago', caca: 'Caça à chave' }
const STATUS_NAMES: Record<Giveaway['status'], string> = { open: 'aberto', finished: 'encerrado', no_winner: 'encerrado sem vencedor', cancelled: 'cancelado' }

// ———————————————— Criação ————————————————
/** Prêmio guardado antes no privado (pelo código PXXXXX ou pelo nome) para vincular ao sorteio. */
async function resolvePrize(message: Message, codeOrName: string): Promise<{ title: string, pkg: PrizePackage | null, keys: number }> {
    const pkg = await service.findPackage(message.sender, codeOrName)
    if (!pkg) {
        const text = codeOrName.trim()
        // Parece um código de prêmio (PK7M2Q / pk7m2q): avisa em vez de criar um sorteio com esse nome
        const looksLikeCode = /^P[2-9A-HJKMNP-Z]{5}$/i.test(text) && (/\d/.test(text) || text === text.toUpperCase())
        if (looksLikeCode) throw new GiveawayError(buildText(t.packageNotFound, codeOrName.trim().toUpperCase()))
        return { title: codeOrName, pkg: null, keys: 0 }
    }
    return { title: pkg.title, pkg, keys: await service.packageKeys(pkg.id) }
}

/** Vincula o prêmio guardado (se houver), avisa o organizador no privado e devolve a linha do anúncio. */
async function linkAndTip(client: WASocket, message: Message, g: Giveaway, prize: { pkg: PrizePackage | null }): Promise<string> {
    if (!prize.pkg) {
        await waUtil.sendText(client, message.sender, buildText(t.createdAdminTip, g.id)).catch(() => undefined)
        return t.prizeManual
    }
    const linked = await service.linkPackage(prize.pkg.id, g.id, message.sender)
    const extra = linked < g.winners_count ? buildText(t.prizeFewer, g.winners_count - linked) : ''
    await waUtil.sendText(client, message.sender, buildText(t.packageLinkedTip, prize.pkg.id, g.id, linked, extra)).catch(() => undefined)
    return buildText(t.prizeLinked, linked)
}

async function createRegistration(client: WASocket, message: Message, group: Group, args: string) {
    const { parts, excludeAdmins } = splitParts(args)
    if (parts.length < 2) throw new GiveawayError(buildText(t.errorFormat, 'novo', 'quando | vencedores (ex.: 1h | 1)'))
    const prize = await resolvePrize(message, parts[0])
    const winners = parts[2] ? Number(parts[2]) : Math.max(1, prize.keys)
    const g = await service.create({ groupId: group.id, groupName: group.name, creator: message.sender, mode: 'inscricao', title: prize.title, winners, closesAt: parseCloseTime(parts[1]), excludeAdmins, expiration: message.expiration })
    const prizeLine = await linkAndTip(client, message, g, prize)
    await waUtil.sendText(client, group.id, buildText(t.created, g.title, g.winners_count, formatWhen(g.closes_at), remaining(g.closes_at), excludeAdmins ? t.noAdmins : '', g.id, g.commitment.slice(0, 16)) + prizeLine, { expiration: message.expiration })
}

async function createHunt(client: WASocket, message: Message, group: Group, args: string) {
    const { parts, excludeAdmins } = splitParts(args)
    if (parts.length < 2) throw new GiveawayError(buildText(t.errorFormat, 'caca', 'quando | tentativas (ex.: 30m | 1)'))
    const prize = await resolvePrize(message, parts[0])
    const g = await service.create({ groupId: group.id, groupName: group.name, creator: message.sender, mode: 'caca', title: prize.title, winners: 1, closesAt: parseCloseTime(parts[1]), maxAttempts: parts[2] ? Number(parts[2]) : 1, excludeAdmins, expiration: message.expiration })
    const prizeLine = await linkAndTip(client, message, g, prize)
    const [a, b, c, d] = g.hunt!.options
    await waUtil.sendText(client, group.id, buildText(t.huntCreated, g.title, a, b, c, d, g.id, g.hunt!.max_attempts, formatWhen(g.closes_at), remaining(g.closes_at), excludeAdmins ? t.noAdmins : '') + prizeLine, { expiration: message.expiration })
}

async function createFlash(client: WASocket, botInfo: Bot, message: Message, group: Group, args: string) {
    const { parts, excludeAdmins } = splitParts(args)
    if (!parts.length) throw new GiveawayError(buildText(t.errorFormat, 'relampago', 'vencedores (ex.: 1)'))
    const prize = await resolvePrize(message, parts[0])
    const winners = parts[1] ? Number(parts[1]) : Math.max(1, prize.keys)
    const controller = new GroupController()
    const members = (await controller.getParticipants(group.id))
        .filter(p => !sameUser(p.user_id, botInfo.host_number) && !(excludeAdmins && p.admin))
        .map(p => p.user_id)
    const g = await service.create({ groupId: group.id, groupName: group.name, creator: message.sender, mode: 'relampago', title: prize.title, winners, closesAt: Date.now(), excludeAdmins, expiration: message.expiration })
    // O prêmio é vinculado ANTES do sorteio: os vencedores já recebem a chave logo depois do anúncio
    const prizeLine = await linkAndTip(client, message, g, prize)
    await waUtil.sendText(client, group.id, buildText(t.relampagoIntro, g.title, members.length, g.commitment.slice(0, 16)) + prizeLine, { expiration: message.expiration })
    const result = await service.close(g.id, message.sender, members)
    await service.announceResult(client, result)
    if (result.status === 'finished') await service.deliver(client, result.id)
}

// ———————————————— Prêmios guardados antes ————————————————
async function storePrize(client: WASocket, message: Message, text: string) {
    if (message.isGroupMsg) {
        await waUtil.deleteMessage(client, message.wa_message, false)?.catch(() => undefined)
        throw new GiveawayError(t.keysPrivateOnly)
    }
    const [name, ...rest] = text.split('|')
    const keys = rest.join(' ').split(/\s+/).filter(Boolean)
    const result = await service.storePackage(message.sender, (name ?? '').trim(), keys)
    const lines = result.masked.map(m => `✅ ${m}`).join('\n')
    await reply(client, message, buildText(t.packageStored, result.pkg.title, lines, result.added, result.pkg.id, result.duplicates ? buildText(t.keysDuplicate, result.duplicates) : ''))
}

async function listPrizes(client: WASocket, message: Message) {
    if (message.isGroupMsg) throw new GiveawayError(t.packagesPrivateOnly)
    const list = await service.myPackages(message.sender)
    if (!list.length) return reply(client, message, buildText(t.packagesEmpty))
    let text = buildText(t.packagesTitle, list.length)
    for (const p of list) text += buildText(t.packagesItem, p.id, p.title, p.keys)
    await reply(client, message, text + buildText(t.packagesFooter))
}

async function deletePrize(client: WASocket, message: Message, id?: string) {
    if (message.isGroupMsg) throw new GiveawayError(t.packagesPrivateOnly)
    if (!id) throw new GiveawayError(buildText(t.packagesEmpty))
    const pkg = await service.deletePackage(message.sender, id)
    await reply(client, message, buildText(t.packageDeleted, pkg.id, pkg.title))
}

// ———————————————— Participação ————————————————
async function resolveId(group: Group | undefined, id: string | undefined): Promise<string> {
    if (id) return id
    if (group) {
        const open = (await service.active(group.id)).filter(g => g.mode === 'inscricao')
        if (open.length === 1) return open[0].id
    }
    throw new GiveawayError(buildText(t.needId))
}

async function join(client: WASocket, message: Message, group: Group | undefined, id?: string) {
    const g0 = requireGroup(message, group)
    const result = await service.join(await resolveId(g0, id), g0.id, message.sender)
    if (!result.added) return reply(client, message, buildText(t.alreadyJoined, result.total))
    await reply(client, message, buildText(t.joined, result.g.id, result.g.title, result.total, formatWhen(result.g.closes_at)))
}

async function leave(client: WASocket, message: Message, group: Group | undefined, id?: string) {
    const g0 = requireGroup(message, group)
    const resolved = await resolveId(g0, id)
    const result = await service.leave(resolved, g0.id, message.sender)
    await reply(client, message, result.removed ? buildText(t.left, resolved.toUpperCase(), result.total) : t.notJoined)
}

async function attempt(client: WASocket, message: Message, id?: string, letter?: string) {
    if (message.isGroupMsg) throw new GiveawayError(t.huntPrivateOnly)
    if (!id || !letter) throw new GiveawayError(buildText(t.needId))
    const result = await service.attemptHunt(id, message.sender, letter)
    if (result.result === 'wrong') return reply(client, message, buildText(t.huntWrong, result.remaining))
    await reply(client, message, t.huntCorrect)
    await service.announceResult(client, result.g)
    await service.deliver(client, result.g.id)
}

async function addKeys(client: WASocket, message: Message, id?: string, keys: string[] = []) {
    if (message.isGroupMsg) {
        // Tenta apagar a mensagem com a chave antes que mais gente veja
        await waUtil.deleteMessage(client, message.wa_message, false)?.catch(() => undefined)
        throw new GiveawayError(t.keysPrivateOnly)
    }
    if (!id) throw new GiveawayError(buildText(t.keysNeedGiveaway, '?'))
    // O ID só existe depois que o sorteio é criado: explica a ordem em vez de só "não encontrado"
    if (!(await service.get(id))) throw new GiveawayError(buildText(t.keysNeedGiveaway, id.toUpperCase()))
    const result = await service.addKeys(id, message.sender, keys)
    const g = await service.require(id)
    const lines = result.masked.map(m => `✅ ${m}`).join('\n') || '—'
    await reply(client, message, buildText(t.keysAdded, g.id, lines, result.total, g.winners_count, result.duplicates ? buildText(t.keysDuplicate, result.duplicates) : ''))
    if (g.status === 'finished') await service.deliver(client, g.id)
}

async function claim(client: WASocket, message: Message, id?: string) {
    if (!id) throw new GiveawayError(buildText(t.needId))
    const g = await service.require(id)
    const winner = g.winners.find(w => sameUser(w.user, message.sender))
    if (!winner) throw new GiveawayError(t.claimNotWinner)
    if (winner.prize === null) return reply(client, message, t.claimWaitingKey)
    await service.deliver(client, g.id, Date.now(), message.sender)
    if (message.isGroupMsg) await reply(client, message, t.claimSent)
}

// ———————————————— Consultas ————————————————
async function status(client: WASocket, message: Message, id?: string) {
    if (!id) throw new GiveawayError(buildText(t.needId))
    const g = await service.require(id)
    const count = g.status === 'open' ? (g.mode === 'caca' ? '-' : String(await service.entriesCount(g.id))) : String(g.entries_count ?? 0)
    const winners = g.winners.length ? g.winners.map(w => `@${waUtil.removeWhatsappSuffix(w.user)}`).join(', ') : (g.status === 'open' ? `${g.winners_count} (a sortear)` : 'nenhum')
    const extra = g.status === 'open' ? `\n⏳ *Tempo restante:* ${remaining(g.closes_at)}` : ''
    await waUtil.replyWithMentions(client, message.chat_id, buildText(t.status, g.id, g.title, MODE_NAMES[g.mode], STATUS_NAMES[g.status], count, winners, formatWhen(g.closes_at), extra), g.winners.map(w => w.user), message.wa_message, { expiration: message.expiration })
}

async function active(client: WASocket, message: Message, group?: Group) {
    const g0 = requireGroup(message, group)
    const list = await service.active(g0.id)
    if (!list.length) return reply(client, message, t.activeEmpty)
    let text = buildText(t.activeTitle, list.length)
    for (const g of list) text += buildText(t.activeItem, g.id, g.title, MODE_NAMES[g.mode], g.mode === 'relampago' ? 'agora' : remaining(g.closes_at))
    await reply(client, message, text.trim())
}

async function history(client: WASocket, message: Message, group?: Group) {
    const g0 = requireGroup(message, group)
    const list = await service.history(g0.id)
    if (!list.length) return reply(client, message, t.historyEmpty)
    let text = t.historyTitle
    for (const g of list) text += buildText(t.historyItem, g.id, g.title, STATUS_NAMES[g.status])
    await reply(client, message, text.trim())
}

async function verify(client: WASocket, message: Message, id?: string) {
    if (!id) throw new GiveawayError(buildText(t.needId))
    const g = await service.require(id)
    if (g.status === 'open') return reply(client, message, buildText(t.verifyPending, g.id, g.commitment))
    if (!g.seed || g.mode === 'caca') return reply(client, message, buildText(t.verify, g.id, gw.ALGORITHM_VERSION, g.commitment, g.seed ?? '-', g.entries_count ?? 0, g.entries_hash ?? '-', g.mode === 'caca' ? 'caça à chave: vence o primeiro acerto (não usa sorteio)' : '-'))
    const ids = (await entriesDb.findAsync({ giveaway_id: g.id }) as { user: string }[]).map(e => e.user)
    const ok = gw.listHash(ids) === g.entries_hash && gw.verifyDraw(g.seed, g.commitment, ids, g.winners_count, g.winners.map(w => w.user))
    await reply(client, message, buildText(t.verify, g.id, gw.ALGORITHM_VERSION, g.commitment, g.seed, g.entries_count ?? 0, g.entries_hash ?? '-', ok ? '✅ resultado confere' : '⚠️ não confere'))
}

// ———————————————— Administração ————————————————
async function closeNow(client: WASocket, message: Message, group: Group | undefined, id?: string) {
    const g0 = requireGroupAdmin(message, group)
    if (!id) throw new GiveawayError(buildText(t.needId))
    await service.require(id, g0.id)
    const result = await service.close(id, message.sender)
    await service.announceResult(client, result)
    if (result.status === 'finished') await service.deliver(client, result.id)
}

async function cancel(client: WASocket, message: Message, group: Group | undefined, id?: string) {
    const g0 = requireGroupAdmin(message, group)
    if (!id) throw new GiveawayError(buildText(t.needId))
    const g = await service.cancel(id, message.sender, g0.id)
    await reply(client, message, buildText(t.cancelled, g.id))
}

async function toggleAnimations(client: WASocket, message: Message, group?: Group) {
    const g0 = requireGroupAdmin(message, group)
    const updated = await features.update(g0.id, f => { f.giveaway.animations = !f.giveaway.animations })
    await reply(client, message, updated.giveaway.animations ? t.animationsOn : t.animationsOff)
}

// ———————————————— Roteador ————————————————
type Action = (client: WASocket, botInfo: Bot, message: Message, group: Group | undefined, args: string[]) => Promise<void>

const ACTIONS: Record<string, Action> = {
    ajuda: async (client, _b, message) => reply(client, message, buildText(giveawayGuide)),
    novo: async (client, _b, message, group, args) => createRegistration(client, message, requireGroupAdmin(message, group), args.join(' ')),
    relampago: async (client, botInfo, message, group, args) => createFlash(client, botInfo, message, requireGroupAdmin(message, group), args.join(' ')),
    caca: async (client, _b, message, group, args) => createHunt(client, message, requireGroupAdmin(message, group), args.join(' ')),
    entrar: async (client, _b, message, group, args) => join(client, message, group, args[0]),
    sair: async (client, _b, message, group, args) => leave(client, message, group, args[0]),
    tentar: async (client, _b, message, _g, args) => attempt(client, message, args[0], args[1]),
    chave: async (client, _b, message, _g, args) => addKeys(client, message, args[0], args.slice(1).join(' ').split(/\s+/)),
    // Sem "|" e com o ID de um sorteio existente: mantém o uso antigo (!sorteio premio ID CHAVE = cadastrar chave)
    premio: async (client, _b, message, _g, args) => !args.join(' ').includes('|') && args[0] && await service.get(args[0].toUpperCase())
        ? addKeys(client, message, args[0], args.slice(1).join(' ').split(/\s+/))
        : storePrize(client, message, args.join(' ')),
    premios: async (client, _b, message) => listPrizes(client, message),
    apagar: async (client, _b, message, _g, args) => deletePrize(client, message, args[0]),
    resgatar: async (client, _b, message, _g, args) => claim(client, message, args[0]),
    status: async (client, _b, message, _g, args) => status(client, message, args[0]),
    resultado: async (client, _b, message, _g, args) => status(client, message, args[0]),
    ativos: async (client, _b, message, group) => active(client, message, group),
    historico: async (client, _b, message, group) => history(client, message, group),
    verificar: async (client, _b, message, _g, args) => verify(client, message, args[0]),
    fechar: async (client, _b, message, group, args) => closeNow(client, message, group, args[0]),
    cancelar: async (client, _b, message, group, args) => cancel(client, message, group, args[0]),
    animacao: async (client, _b, message, group) => toggleAnimations(client, message, group),
}

const ALIASES: Record<string, string> = {
    ajuda: 'ajuda', help: 'ajuda', novo: 'novo', criar: 'novo', relampago: 'relampago', agora: 'relampago', caca: 'caca', cacachave: 'caca',
    entrar: 'entrar', participar: 'entrar', sair: 'sair', tentar: 'tentar', chave: 'chave', premio: 'premio', guardar: 'premio', premios: 'premios', meuspremios: 'premios', apagar: 'apagar', resgatar: 'resgatar',
    status: 'status', resultado: 'resultado', ativos: 'ativos', abertos: 'ativos', historico: 'historico', verificar: 'verificar',
    fechar: 'fechar', apurar: 'fechar', cancelar: 'cancelar', animacao: 'animacao', animacoes: 'animacao',
}

/** Subcomandos do sistema de sorteios (o !sorteio com número continua sorteando um número). */
export async function giveawayCommand(client: WASocket, botInfo: Bot, message: Message, group?: Group) {
    // Palavras separadas por espaço OU quebra de linha ("!sorteio chave\nID\nCHAVE" também vale)
    const words = message.text_command.trim().split(/\s+/).filter(Boolean)
    const [first, ...args] = words
    const action = ALIASES[normalizeWord(first ?? '')]
    if (!action) throw new GiveawayError(buildText(t.errorOption))
    await ACTIONS[action](client, botInfo, message, group, args)
}
