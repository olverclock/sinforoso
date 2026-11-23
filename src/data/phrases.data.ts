import { Phrase } from "../interfaces/chat-features.interface.js"
import { CLASSIC_PHRASES } from "./phrases/classic.data.js"
import { ORIGINAL_01 } from "./phrases/original-01.data.js"
import { ORIGINAL_02 } from "./phrases/original-02.data.js"
import { ORIGINAL_03 } from "./phrases/original-03.data.js"
import { ORIGINAL_04 } from "./phrases/original-04.data.js"
import { ORIGINAL_05 } from "./phrases/original-05.data.js"
import { ORIGINAL_06 } from "./phrases/original-06.data.js"
import { ORIGINAL_07 } from "./phrases/original-07.data.js"
import { ORIGINAL_08 } from "./phrases/original-08.data.js"
import { ORIGINAL_09 } from "./phrases/original-09.data.js"
import { ORIGINAL_10 } from "./phrases/original-10.data.js"
import { ORIGINAL_11 } from "./phrases/original-11.data.js"
import { ORIGINAL_12 } from "./phrases/original-12.data.js"
import { ORIGINAL_13 } from "./phrases/original-13.data.js"
import { ORIGINAL_14 } from "./phrases/original-14.data.js"
import { ORIGINAL_15 } from "./phrases/original-15.data.js"
import { ORIGINAL_16 } from "./phrases/original-16.data.js"
import { ORIGINAL_17 } from "./phrases/original-17.data.js"
import { ORIGINAL_18 } from "./phrases/original-18.data.js"
import { ORIGINAL_19 } from "./phrases/original-19.data.js"
import { ORIGINAL_20 } from "./phrases/original-20.data.js"
import { ORIGINAL_21 } from "./phrases/original-21.data.js"

/**
 * Banco das frases automáticas (!frases, !fraseagora): originais em português e citações de
 * autores em domínio público. Repetições (mesmo texto, ignorando maiúsculas e pontuação) são
 * removidas aqui, então cada frase aparece uma única vez.
 */
const ORIGINALS: string[][] = [ORIGINAL_01, ORIGINAL_02, ORIGINAL_03, ORIGINAL_04, ORIGINAL_05, ORIGINAL_06, ORIGINAL_07, ORIGINAL_08, ORIGINAL_09, ORIGINAL_10, ORIGINAL_11, ORIGINAL_12, ORIGINAL_13, ORIGINAL_14, ORIGINAL_15, ORIGINAL_16, ORIGINAL_17, ORIGINAL_18, ORIGINAL_19, ORIGINAL_20, ORIGINAL_21]

const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

function buildBank(): Phrase[] {
    const seen = new Set<string>()
    const bank: Phrase[] = []
    const add = (phrase: Phrase) => {
        const key = normalize(phrase.text)
        if (!key || seen.has(key)) return
        seen.add(key)
        bank.push(phrase)
    }
    for (const [text, author] of CLASSIC_PHRASES) add({ text, author })
    for (const part of ORIGINALS) for (const text of part) add({ text })
    return bank
}

export const PHRASES: Phrase[] = buildBank()
