import moment from "moment-timezone"

/*
 * Leitura de datas e horários em português para !lembrete e !agendar, do jeito que as pessoas
 * escrevem no WhatsApp (sempre no horário de Brasília):
 *   10m · 45min · 1h30m · 2d · 30 minutos · em 2h · daqui 1h30 · daqui a 3 horas → daqui a X tempo
 *   18h · 18:30 · 18h30 · às 9h                                         → hoje (ou amanhã, se já passou)
 *   amanhã 9h · depois de amanhã 10h · hoje 22h                          → dia relativo
 *   25/12 15h · 25/12/2026 15:00                                         → data
 *   segunda 9h · sexta-feira 18h                                         → próximo dia da semana
 *   todo dia 8h · todos os dias 8h · toda segunda 9h                     → repetição
 * "2h" sozinho é horário (02:00), como se escreve no Brasil; para duração use "em 2h" ou "2 horas".
 */

export const TZ = 'America/Sao_Paulo'
export type Repeat = null | { kind: 'daily' } | { kind: 'weekly', weekday: number }

export interface ParsedSchedule { when: number, repeat: Repeat, text: string }

const MAX_MINUTES = 366 * 1440

const WEEKDAYS: Record<string, number> = {
    domingo: 0, segunda: 1, 'segunda-feira': 1, terca: 2, 'terca-feira': 2, quarta: 3, 'quarta-feira': 3,
    quinta: 4, 'quinta-feira': 4, sexta: 5, 'sexta-feira': 5, sabado: 6,
}
const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

const UNIT_MINUTES: Record<string, number> = {
    m: 1, min: 1, mins: 1, minuto: 1, minutos: 1,
    h: 60, hr: 60, hrs: 60, hora: 60, horas: 60,
    d: 1440, dia: 1440, dias: 1440,
}

/** Minúsculas e sem acentos (\p{M} = marcas combinantes, como o acento de "amanhã"). */
export const normalizeWord = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** "18h", "18:30", "18h30", "9h" → [hora, minuto] ou null. */
export function parseClock(token: string | undefined): [number, number] | null {
    const m = normalizeWord(token ?? '').match(/^(\d{1,2})(?:h(\d{2})?|:(\d{2}))$/)
    if (!m) return null
    const h = Number(m[1]), min = Number(m[2] ?? m[3] ?? 0)
    return h <= 23 && min <= 59 ? [h, min] : null
}

/**
 * Duração compacta em minutos: "10m", "45min", "2d", "1h30m". Com allowHours (depois de "em" ou
 * "daqui") também "2h" e "1h30". Sem isso, "2h" é horário e não duração.
 */
export function parseDuration(token: string | undefined, allowHours = false): number | null {
    const t = normalizeWord(token ?? '')
    let minutes: number | null = null
    let m: RegExpMatchArray | null
    if ((m = t.match(/^(\d+)(?:m|min|mins)$/))) minutes = Number(m[1])
    else if ((m = t.match(/^(\d+)d$/))) minutes = Number(m[1]) * 1440
    else if ((m = t.match(/^(\d+)h(\d{1,2})(?:m|min)$/))) minutes = Number(m[1]) * 60 + Number(m[2])
    else if (allowHours && (m = t.match(/^(\d+)h(\d{1,2})?$/))) minutes = Number(m[1]) * 60 + Number(m[2] ?? 0)
    return minutes !== null && minutes > 0 && minutes <= MAX_MINUTES ? minutes : null
}

/** "10m", "30 minutos", "em 2h", "daqui a 3 horas" no começo → { minutos, palavras usadas }. */
function parseRelative(low: string[]): { minutes: number, used: number } | null {
    let i = 0
    const prefixed = ['em', 'daqui', 'dentro'].includes(low[0])
    if (prefixed) { i = 1; if (low[i] === 'a' || low[i] === 'de') i++ }
    if (/^\d+$/.test(low[i] ?? '') && UNIT_MINUTES[low[i + 1]]) {
        const minutes = Number(low[i]) * UNIT_MINUTES[low[i + 1]]
        if (minutes <= 0 || minutes > MAX_MINUTES) throw new Error("Tempo inválido (de 1 minuto a 1 ano).")
        return { minutes, used: i + 2 }
    }
    const compact = parseDuration(low[i], prefixed)
    return compact === null ? null : { minutes: compact, used: i + 1 }
}

function parseRepeat(low: string[], i: number): { repeat: Repeat, i: number } {
    if (low[i] === 'todo' && low[i + 1] === 'dia') return { repeat: { kind: 'daily' }, i: i + 2 }
    if (low[i] === 'todos' && low[i + 1] === 'os' && low[i + 2] === 'dias') return { repeat: { kind: 'daily' }, i: i + 3 }
    if (low[i] === 'toda' && WEEKDAYS[low[i + 1]] !== undefined) return { repeat: { kind: 'weekly', weekday: WEEKDAYS[low[i + 1]] }, i: i + 2 }
    return { repeat: null, i }
}

type DayKind = 'relative' | 'date' | 'date-no-year' | 'weekday'

function parseDay(low: string[], i: number, now: moment.Moment): { day: moment.Moment, kind: DayKind, i: number } | null {
    if (low[i] === 'hoje') return { day: now.clone(), kind: 'relative', i: i + 1 }
    if (low[i] === 'amanha') return { day: now.clone().add(1, 'day'), kind: 'relative', i: i + 1 }
    if (low[i] === 'depois' && low[i + 1] === 'de' && low[i + 2] === 'amanha') return { day: now.clone().add(2, 'day'), kind: 'relative', i: i + 3 }
    if (WEEKDAYS[low[i]] !== undefined) return { day: now.clone().add((WEEKDAYS[low[i]] - now.day() + 7) % 7, 'day'), kind: 'weekday', i: i + 1 }
    const m = (low[i] ?? '').match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/)
    if (!m) return null
    const d = Number(m[1]), month = Number(m[2])
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : now.year()
    const day = moment.tz({ year, month: month - 1, date: d }, TZ)
    if (!day.isValid() || day.date() !== d || day.month() !== month - 1) throw new Error("Data inválida.")
    return { day, kind: m[3] ? 'date' : 'date-no-year', i: i + 1 }
}

function at(day: moment.Moment, clock: [number, number] | null) {
    const [h, min] = clock ?? [9, 0]
    return day.clone().set({ hour: h, minute: min, second: 0, millisecond: 0 })
}

/** Calcula o momento final; "passou" vira o próximo dia/semana/ano quando faz sentido. */
function resolveWhen(now: moment.Moment, repeat: Repeat, parsedDay: { day: moment.Moment, kind: DayKind } | null, clock: [number, number] | null) {
    if (repeat?.kind === 'weekly') {
        const when = at(now.clone().add((repeat.weekday - now.day() + 7) % 7, 'day'), clock)
        return when.isAfter(now) ? when : when.add(7, 'day')
    }
    if (!parsedDay) {
        const when = at(now, clock)
        return when.isAfter(now) ? when : when.add(1, 'day')
    }
    const when = at(parsedDay.day, clock)
    if (when.isAfter(now)) return when
    if (parsedDay.kind === 'weekday') return when.add(7, 'day')
    if (parsedDay.kind === 'date-no-year') return when.add(1, 'year')
    return when
}

/**
 * Lê o começo do texto como data/hora e devolve o resto como mensagem.
 * Lança erro com explicação quando não entende ou quando o horário já passou.
 */
export function parseSchedule(input: string, nowMs = Date.now()): ParsedSchedule {
    const now = moment.tz(nowMs, TZ)
    const words = input.trim().split(/\s+/).filter(Boolean)
    const low = words.map(normalizeWord)

    const relative = parseRelative(low)
    if (relative) return finish(nowMs + relative.minutes * 60_000, null, words.slice(relative.used))

    const rep = parseRepeat(low, 0)
    let i = rep.i
    const parsedDay = rep.repeat ? null : parseDay(low, i, now)
    if (parsedDay) i = parsedDay.i
    if (['as', 'a'].includes(low[i]) && parseClock(low[i + 1])) i++
    const clock = parseClock(low[i])
    if (clock) i++

    if (!rep.repeat && !parsedDay && !clock) throw new Error("Não entendi quando. Exemplos: 18h30, amanhã 9h, 25/12 15h, 10m, em 2h, toda segunda 8h.")
    if (rep.repeat && !clock) throw new Error("Diga o horário da repetição. Ex.: todo dia 8h")

    const when = resolveWhen(now, rep.repeat, parsedDay, clock)
    if (!when.isAfter(now)) throw new Error("Esse horário já passou.")
    if (when.diff(now, 'minutes') > MAX_MINUTES) throw new Error("No máximo 1 ano à frente.")
    return finish(when.valueOf(), rep.repeat, words.slice(i))
}

function finish(when: number, repeat: Repeat, rest: string[]): ParsedSchedule {
    const text = rest.join(' ').trim()
    if (!text) throw new Error("Escreva o que devo lembrar depois do horário. Ex.: 18h tomar remédio")
    if (text.length > 1000) throw new Error("Texto longo demais (máximo 1.000 caracteres).")
    return { when, repeat, text }
}

/** Próxima ocorrência de um lembrete repetido, sempre depois de "agora" (pula as perdidas). */
export function nextOccurrence(when: number, repeat: Repeat, nowMs = Date.now()): number | null {
    if (!repeat) return null
    const step = repeat.kind === 'daily' ? 1 : 7
    const next = moment.tz(when, TZ)
    const now = moment.tz(nowMs, TZ)
    do next.add(step, 'day'); while (!next.isAfter(now))
    return next.valueOf()
}

export function describeWhen(when: number, repeat: Repeat): string {
    const m = moment.tz(when, TZ)
    if (repeat?.kind === 'daily') return `todo dia às ${m.format('HH:mm')}`
    if (repeat?.kind === 'weekly') return `toda ${WEEKDAY_NAMES[repeat.weekday]} às ${m.format('HH:mm')}`
    return `${WEEKDAY_NAMES[m.day()]}, ${m.format('DD/MM/YYYY [às] HH:mm')}`
}
