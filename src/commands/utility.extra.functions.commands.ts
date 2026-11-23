import { WASocket } from "baileys"
import moment from "moment-timezone"
import { Bot } from "../interfaces/bot.interface.js"
import { Group } from "../interfaces/group.interface.js"
import { Message } from "../interfaces/message.interface.js"
import { buildText } from "../utils/general.util.js"
import { messageErrorCommandUsage } from "../utils/commands.util.js"
import * as waUtil from "../utils/whatsapp.util.js"
import { describeWhen, parseSchedule, TZ } from "../utils/reminder.util.js"
import * as br from "../utils/brasil.util.js"
import * as track from "../utils/tracking.util.js"
import { ReminderService } from "../services/reminder.service.js"
import { extraTexts as t } from "./utility.extra.texts.commands.js"

const reminders = new ReminderService()

async function reply(client: WASocket, message: Message, text: string): Promise<void> {
    await waUtil.replyText(client, message.chat_id, text, message.wa_message, { expiration: message.expiration })
}

/** Texto do comando sem o nome do comando (mantém maiúsculas, acentos e quebras de linha). */
function argsText(message: Message): string {
    return message.text_command.trim()
}

// ———————————————— LEMBRETES ————————————————
export async function lembreteCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    const parsed = parseSchedule(argsText(message))
    await reminders.add({ chat_id: message.chat_id, creator: message.sender, kind: 'personal', text: parsed.text, when: parsed.when, repeat: parsed.repeat, expiration: message.expiration })
    await reply(client, message, buildText(t.lembrete.msgs.reply, describeWhen(parsed.when, parsed.repeat), parsed.text))
}

export async function lembretesCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const list = await reminders.list(message.chat_id, message.sender)
    if (!list.length) return reply(client, message, buildText(t.lembretes.msgs.reply_empty))
    let text = buildText(t.lembretes.msgs.reply_title, list.length)
    list.forEach((r, i) => {
        const template = r.kind === 'group' ? t.lembretes.msgs.reply_item_group : t.lembretes.msgs.reply_item_personal
        const preview = r.text.length > 120 ? `${r.text.slice(0, 120)}…` : r.text
        text += buildText(template, i + 1, describeWhen(r.when, r.repeat), preview)
    })
    await reply(client, message, text + buildText(t.lembretes.msgs.reply_footer))
}

export async function rmlembreteCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    const position = Number(message.args[0])
    if (!Number.isInteger(position) || position < 1) throw new Error(buildText(t.rmlembrete.msgs.error_number))
    const removed = await reminders.removeAt(message.chat_id, message.sender, position, message.isGroupAdmin)
    await reply(client, message, buildText(t.rmlembrete.msgs.reply, removed.text.length > 120 ? `${removed.text.slice(0, 120)}…` : removed.text))
}

// ———————————————— ENQUETE ————————————————
export const POLL_MAX_OPTIONS = 12

/** "multi Pergunta | a | b" → { question, options, multiple }. */
export function parsePoll(text: string): { question: string, options: string[], multiple: boolean } {
    let body = text.trim()
    const multiple = /^(multi|multipla|múltipla|varias|várias)\s+/i.test(body)
    if (multiple) body = body.replace(/^\S+\s+/, '')
    const parts = body.split('|').map(p => p.trim()).filter(Boolean)
    const [question, ...options] = parts
    if (!question || options.length < 2 || options.length > POLL_MAX_OPTIONS) throw new Error(buildText(t.enquete.msgs.error_format))
    if (question.length > 255 || options.some(o => o.length > 100)) throw new Error(t.enquete.msgs.error_length)
    if (new Set(options.map(o => o.toLowerCase())).size !== options.length) throw new Error(t.enquete.msgs.error_duplicate)
    return { question, options, multiple }
}

export async function enqueteCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    const poll = parsePoll(argsText(message))
    await waUtil.sendPoll(client, message.chat_id, poll.question, poll.options, poll.multiple ? 0 : 1, { expiration: message.expiration })
}

// ———————————————— CEP ————————————————
function describeCep(info: br.CepInfo): string {
    const lines = [
        info.street && `🛣️ ${info.street}${info.complement ? ` _(${info.complement})_` : ''}`,
        info.district && `🏘️ ${info.district}`,
        `🏙️ ${info.city} - ${info.uf}`,
        info.ddd && `📞 DDD ${info.ddd}`,
        info.ibge && `🔢 IBGE ${info.ibge}`,
    ].filter(Boolean)
    const mapQuery = encodeURIComponent([info.street, info.district, info.city, info.uf, br.formatCep(info.cep)].filter(Boolean).join(', '))
    return `${lines.join('\n')}\n\n🗺️ https://www.google.com/maps/search/?api=1&query=${mapQuery}\n_Fonte: ${info.source}_`
}

function addressLine(info: br.CepInfo): string {
    return [info.street, info.complement && `(${info.complement})`, info.district && `- ${info.district}`].filter(Boolean).join(' ')
}

async function cepByAddress(client: WASocket, message: Message, text: string) {
    const query = br.parseAddress(text)
    const matches = await br.searchCepByAddress(query)
    const searched = [query.street, query.number, query.district, `${query.city}/${query.uf}`].filter(v => v !== undefined && v !== '').join(', ')
    let out = buildText(t.cep.msgs.reply_address_title, searched)
    if (!matches.length) return reply(client, message, out + t.cep.msgs.reply_address_none)
    const best = matches[0]
    // Resultado único, ou o primeiro claramente na faixa do número / bairro informado
    const confident = matches.length === 1 || best.exactNumber || (best.score > (matches[1]?.score ?? 0) && best.score >= 4)
    if (confident) {
        out += buildText(t.cep.msgs.reply_address_exact, br.formatCep(best.info.cep), describeCep(best.info))
        const others = matches.slice(1).filter(m => m.score === best.score)
        if (others.length) {
            out += buildText(t.cep.msgs.reply_address_options, others.length)
            for (const m of others.slice(0, 5)) out += buildText(t.cep.msgs.reply_address_item, br.formatCep(m.info.cep), addressLine(m.info))
        }
        return reply(client, message, out.trim())
    }
    out += buildText(t.cep.msgs.reply_address_options, matches.length)
    for (const m of matches.slice(0, 10)) out += buildText(t.cep.msgs.reply_address_item, br.formatCep(m.info.cep), addressLine(m.info))
    if (matches.length > 10) out += buildText(t.cep.msgs.reply_address_more, matches.length - 10)
    if (query.number === undefined) out += t.cep.msgs.reply_address_hint
    await reply(client, message, out.trim())
}

export async function cepCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    const text = argsText(message)
    // Só números (com ou sem traço/ponto) = CEP; qualquer letra = endereço
    if (!/\p{L}/u.test(text)) {
        const info = await br.lookupCep(text)
        if (!info) return reply(client, message, buildText(t.cep.msgs.reply_not_found, text))
        return reply(client, message, buildText(t.cep.msgs.reply, br.formatCep(info.cep), describeCep(info)))
    }
    await cepByAddress(client, message, text)
}

// ———————————————— CNPJ ————————————————
const yesNo = (v?: boolean | null) => v === true ? 'Sim' : v === false ? 'Não' : '-'
const brDate = (iso?: string) => iso ? moment(iso, 'YYYY-MM-DD').format('DD/MM/YYYY') : '-'

/** Endereço e contato públicos da empresa. */
function cnpjContact(d: br.CnpjInfo): string[] {
    const address = [d.logradouro, d.numero, d.complemento].filter(Boolean).join(', ')
    const place = [d.bairro, d.municipio && d.uf ? `${d.municipio}/${d.uf}` : d.municipio, d.cep && br.formatCep(br.onlyDigits(d.cep))].filter(Boolean).join(' - ')
    const phone = d.ddd_telefone_1 ? `(${d.ddd_telefone_1.slice(0, 2)}) ${d.ddd_telefone_1.slice(2)}` : ''
    return [address && `📍 ${address}`, place && `🏙️ ${place}`, phone && `📞 ${phone}`, d.email ? `✉️ ${d.email.toLowerCase()}` : ''].filter(Boolean)
}

/** Até 8 sócios/administradores do quadro societário (QSA). */
function cnpjPartners(d: br.CnpjInfo): string {
    const qsa = d.qsa ?? []
    if (!qsa.length) return ''
    const list = qsa.slice(0, 8).map(s => `• ${s.nome_socio} _(${s.qualificacao_socio})_`).join('\n')
    const more = qsa.length > 8 ? `\n_...e mais ${qsa.length - 8}_` : ''
    return `\n👥 *Sócios/administradores*\n${list}${more}`
}

export function formatCnpjInfo(d: br.CnpjInfo): string {
    const cnpj = br.onlyDigits(d.cnpj)
    return [
        `🏢 *${d.razao_social}*`,
        d.nome_fantasia && `🏷️ ${d.nome_fantasia}`,
        `🔢 ${br.formatCnpj(cnpj)}${d.descricao_identificador_matriz_filial ? ` (${d.descricao_identificador_matriz_filial.toLowerCase()})` : ''}`,
        `📌 Situação: *${d.descricao_situacao_cadastral ?? '-'}*`,
        `📅 Abertura: ${brDate(d.data_inicio_atividade)}`,
        d.cnae_fiscal_descricao && `💼 Atividade: ${d.cnae_fiscal_descricao}`,
        d.natureza_juridica && `⚖️ ${d.natureza_juridica}`,
        d.porte && `📏 Porte: ${d.porte}`,
        typeof d.capital_social === 'number' && `💰 Capital social: ${br.brl(d.capital_social)}`,
        `🧾 Simples: ${yesNo(d.opcao_pelo_simples)} · MEI: ${yesNo(d.opcao_pelo_mei)}`,
        ...cnpjContact(d),
        cnpjPartners(d),
        `\n_Fonte: dados abertos da Receita Federal_`,
    ].filter(Boolean).join('\n')
}

export async function cnpjCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    const input = argsText(message)
    const info = await br.lookupCnpj(input)
    if (!info) return reply(client, message, buildText(t.cnpj.msgs.reply_not_found, br.formatCnpj(br.onlyDigits(input))))
    await reply(client, message, formatCnpjInfo(info))
}

// ———————————————— FERIADOS ————————————————
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

function holidayLine(h: br.Holiday, nowMs: number): string {
    const date = moment.tz(h.date, 'YYYY-MM-DD', TZ)
    const days = date.diff(moment.tz(nowMs, TZ).startOf('day'), 'days')
    const when = days === 0 ? 'hoje' : days === 1 ? 'amanhã' : days > 1 ? `em ${days} dias` : 'já passou'
    return buildText(t.feriados.msgs.reply_item, days >= 0 && days <= 1 ? '🎉' : '📌', date.format('DD/MM'), WEEKDAYS[date.day()], `${h.name} · _${when}_`)
}

export async function feriadosCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const now = Date.now()
    const year = message.args[0] && /^\d{4}$/.test(message.args[0]) ? Number(message.args[0]) : null
    if (year) {
        const list = await br.fetchHolidays(year)
        let text = buildText(t.feriados.msgs.reply_year_title, year)
        for (const h of list) text += holidayLine(h, now)
        return reply(client, message, text + t.feriados.msgs.reply_footer)
    }
    const list = await br.upcomingHolidays(6, now)
    const today = moment.tz(now, TZ).format('YYYY-MM-DD')
    const todayHoliday = list.find(h => h.date === today)
    let text = todayHoliday ? buildText(t.feriados.msgs.reply_today, todayHoliday.name) : ''
    text += t.feriados.msgs.reply_next_title
    for (const h of list) text += holidayLine(h, now)
    await reply(client, message, text + t.feriados.msgs.reply_footer)
}

// ———————————————— LOTERIAS ————————————————
export function formatLottery(gameKey: string, r: br.LotteryResult): string {
    const name = br.LOTTERIES[gameKey]?.name ?? gameKey
    const lines = [`🍀 *${name}* · Concurso *${r.numero}* (${r.dataApuracao})`, '', `🔢 *${r.listaDezenas.join(' · ')}*`]
    if (r.listaDezenasSegundoSorteio?.length) lines.push(`🔢 2º sorteio: *${r.listaDezenasSegundoSorteio.join(' · ')}*`)
    if (r.trevosSorteados?.length) lines.push(`🍀 Trevos: *${r.trevosSorteados.join(' · ')}*`)
    if (r.nomeTimeCoracaoMesSorte?.trim()) lines.push(`${gameKey === 'diadesorte' ? '📅 Mês da sorte' : '⚽ Time do coração'}: *${r.nomeTimeCoracaoMesSorte.trim()}*`)
    lines.push('', '🏆 *Premiação*')
    for (const faixa of r.listaRateioPremio.slice(0, 7)) {
        const winners = faixa.numeroDeGanhadores
        lines.push(`• ${faixa.descricaoFaixa}: ${winners ? `${winners.toLocaleString('pt-BR')} ganhador${winners > 1 ? 'es' : ''} · ${br.brl(faixa.valorPremio)}` : 'ninguém acertou'}`)
    }
    lines.push('', r.acumulado ? '💰 *ACUMULOU!*' : '✅ Saiu o prêmio principal.')
    if (r.dataProximoConcurso) {
        const estimate = r.valorEstimadoProximoConcurso ? ` · estimativa ${br.brl(r.valorEstimadoProximoConcurso)}` : ''
        lines.push(`⏭️ Próximo sorteio: ${r.dataProximoConcurso}${estimate}`)
    }
    lines.push('', '_Fonte: Loterias Caixa. Confira sempre no app ou site oficial._')
    return lines.join('\n')
}

export async function loteriaCommand(client: WASocket, _botInfo: Bot, message: Message, _group?: Group) {
    const { game, contest } = br.parseLotteryArgs(message.args.filter(Boolean))
    const result = await br.fetchLottery(game, contest)
    await reply(client, message, formatLottery(game, result))
}

// ———————————————— RASTREIO ————————————————
export async function rastreioCommand(client: WASocket, botInfo: Bot, message: Message, _group?: Group) {
    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    const parsed = br.parseTrackingCode(message.args.join(''))
    if (!/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(parsed.code)) return reply(client, message, buildText(t.rastreio.msgs.reply_invalid, parsed.code))
    if (!parsed.valid) return reply(client, message, buildText(t.rastreio.msgs.reply_invalid_digit, parsed.code))
    const details = [parsed.country && `\n🌎 Origem: ${parsed.country}`, parsed.service && `\n📦 Tipo: ${parsed.service}`].filter(Boolean).join('')
    const linkOnly = () => reply(client, message, buildText(t.rastreio.msgs.reply_valid, parsed.code, details, br.CORREIOS_TRACKING_URL))
    // Sem chave da API: só confere o código e manda o link oficial (como antes)
    if (!track.trackingApiKey()) return linkOnly()

    let result = track.cachedTracking(parsed.code)
    if (!result) {
        if (!message.isBotAdmin && !track.takeQuota(message.sender)) {
            return reply(client, message, buildText(t.rastreio.msgs.limit, track.dailyLimit(), br.CORREIOS_TRACKING_URL))
        }
        try {
            result = await track.fetchTracking(parsed.code)
        } catch (err) {
            const reason = err instanceof track.TrackingError ? err.message : t.rastreio.msgs.api_down
            return reply(client, message, buildText(t.rastreio.msgs.api_error, parsed.code, reason, br.CORREIOS_TRACKING_URL))
        }
        if (result.events.length) track.storeTracking(result)
    }
    await reply(client, message, formatTracking(result, parsed.country))
}

/** Data dos Correios ("2026-11-17T10:30:00") → "17/11/2026 10:30". */
function trackDate(raw?: string): string {
    if (!raw) return ''
    const m = moment(raw, moment.ISO_8601, true)
    return m.isValid() ? m.format('DD/MM/YYYY HH:mm') : raw
}

const MAX_TRACK_EVENTS = 8

export function formatTracking(result: track.TrackResult, country?: string): string {
    const header = `📦 *Rastreio ${result.code}*${result.category ? `\n🏷️ ${result.category}` : ''}${country && country !== 'Brasil' ? `\n🌎 Origem: ${country}` : ''}`
    if (!result.events.length) {
        const why = result.message ?? t.rastreio.msgs.no_events
        return `${header}\n\nℹ️ ${why}\n\n🔗 ${br.CORREIOS_TRACKING_URL}`
    }
    const [last, ...previous] = result.events
    const lines = [header, '', `📍 *Situação atual:* ${last.description}`]
    if (last.detail) lines.push(`_${last.detail}_`)
    const lastPlace = [last.location && `📌 ${last.location}`, last.destination && `➡️ Para: ${last.destination}`].filter(Boolean).join('\n')
    if (lastPlace) lines.push(lastPlace)
    if (last.date) lines.push(`🕒 ${trackDate(last.date)}`)
    if (result.expected) lines.push(`📅 Previsão de entrega: ${trackDate(result.expected).split(' ')[0]}`)
    if (previous.length) {
        lines.push('', '🗂️ *Histórico*')
        for (const e of previous.slice(0, MAX_TRACK_EVENTS - 1)) {
            const where = [e.location, e.destination && `→ ${e.destination}`].filter(Boolean).join(' ')
            lines.push(`• ${trackDate(e.date) || '-'} — ${e.description}${where ? ` (${where})` : ''}`)
        }
        if (previous.length > MAX_TRACK_EVENTS - 1) lines.push(`_...e mais ${previous.length - (MAX_TRACK_EVENTS - 1)} evento(s) anteriores._`)
    }
    lines.push('', '_Fonte: Correios (via Site Rastreio). Atualiza a cada 30 min._')
    return lines.join('\n')
}
