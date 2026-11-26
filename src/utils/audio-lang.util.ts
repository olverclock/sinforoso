/*
 * Idioma do áudio nos downloads do YouTube (faixas de dublagem automática). O padrão é SEMPRE o
 * áudio original; a dublagem só entra quando a pessoa pede um idioma no fim do comando:
 *   !yt link en · !play link espanhol · !sbx link 0:19-0:22 en · !bx link 1:20-1:45 ingles
 * O idioma só é lido quando há um link (numa busca por texto, "inglês" continua sendo parte da busca).
 */
import { parseTimeRange, TimeRange } from "./clip.util.js"

/** Códigos ISO 639-1 aceitos e nome em português. */
const LANGUAGE_NAMES: Record<string, string> = {
    pt: "português", en: "inglês", es: "espanhol", fr: "francês", de: "alemão", it: "italiano",
    ja: "japonês", ko: "coreano", zh: "chinês", hi: "hindi", ru: "russo", ar: "árabe",
    id: "indonésio", nl: "holandês", pl: "polonês", tr: "turco", uk: "ucraniano", vi: "vietnamita",
    th: "tailandês", bn: "bengali", ml: "malaiala", ta: "tâmil", te: "telugo", he: "hebraico",
}

/** Nomes por extenso (sem acento) → código. */
const ALIASES: Record<string, string> = {
    portugues: "pt", ingles: "en", english: "en", espanhol: "es", spanish: "es", frances: "fr", french: "fr",
    alemao: "de", german: "de", italiano: "it", japones: "ja", coreano: "ko", chines: "zh", russo: "ru",
    arabe: "ar", indonesio: "id", holandes: "nl", polones: "pl", turco: "tr", ucraniano: "uk", hebraico: "he",
}

/** "original" volta a escolher a faixa original de forma explícita. */
export const ORIGINAL = "original"

const norm = (word: string) => word.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim()

/** "en", "EN", "en-US", "pt-br", "inglês", "ingles" → código ("en"); "original" → "original"; outro → null. */
export function parseAudioLanguage(word: string): string | null {
    const w = norm(word).replace(/^(dub|audio|idioma|lang)[:=]/, "")
    if (w === ORIGINAL) return ORIGINAL
    const code = w.split(/[-_]/)[0]
    if (/^[a-z]{2}$/.test(code) && LANGUAGE_NAMES[code] && (w === code || /^[a-z]{2}[-_][a-z]{2,4}$/.test(w))) return code
    return ALIASES[w] ?? null
}

export function languageName(code: string): string {
    return LANGUAGE_NAMES[code] ?? code
}

const LINK = /https?:\/\/\S+/i

/** Separa um idioma no FIM do texto (só se houver um link no texto). */
export function splitAudioLanguage(text: string): { rest: string, lang: string | null } {
    const trimmed = text.trim()
    const words = trimmed.split(/\s+/)
    if (words.length < 2 || !LINK.test(trimmed)) return { rest: trimmed, lang: null }
    const lang = parseAudioLanguage(words[words.length - 1])
    if (!lang || LINK.test(words[words.length - 1])) return { rest: trimmed, lang: null }
    return { rest: words.slice(0, -1).join(" "), lang }
}

/**
 * Opções no fim do comando, em qualquer ordem: trecho (1:20-1:45) e idioma (en). Ex.:
 * "link 0:19-0:22 en" ou "link en 0:19-0:22". lang = null significa áudio original.
 */
export function parseDownloadOptions(text: string): { rest: string, range: TimeRange | null, lang: string | null } {
    let rest = text.trim(), range: TimeRange | null = null, lang: string | null = null
    for (let i = 0; i < 2; i++) {
        if (!range) {
            const r = parseTimeRange(rest)
            if (r.range) { range = r.range; rest = r.rest; continue }
        }
        if (!lang) {
            const l = splitAudioLanguage(rest)
            if (l.lang) { lang = l.lang; rest = l.rest; continue }
        }
        break
    }
    return { rest, range, lang: lang === ORIGINAL ? null : lang }
}
