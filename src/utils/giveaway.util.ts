import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, randomInt } from "node:crypto"

/*
 * Peças puras do sistema de sorteios (sem banco nem WhatsApp), para poderem ser testadas e
 * conferidas por qualquer pessoa:
 *  - IDs curtos e legíveis;
 *  - sorteio VERIFICÁVEL (compromisso-revelação): a semente é sorteada na criação e só o hash dela
 *    é publicado; no fim a semente é revelada e qualquer um refaz a conta;
 *  - escolha sem viés (amostragem por rejeição, a mesma técnica do crypto.randomInt do Node);
 *  - códigos da caça à chave (um verdadeiro e três com exatamente 3 letras trocadas);
 *  - cofre: chaves dos prêmios criptografadas com AES-256-GCM (criptografia autenticada).
 */

export const ALGORITHM_VERSION = 'sinforoso-draw-v1'

// ———————————————— IDs ————————————————
/** Sem letras/números parecidos (0/O, 1/I/L): fácil de ler e digitar no celular. */
const ID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

export function newGiveawayId(length = 5): string {
    let id = ''
    for (let i = 0; i < length; i++) id += ID_ALPHABET[randomInt(ID_ALPHABET.length)]
    return id
}

// ———————————————— Sorteio verificável ————————————————
export const sha256Hex = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')

/** Semente secreta (32 bytes) e o compromisso público (SHA-256 da semente). */
export function newCommitment(): { seed: string, commitment: string } {
    const seed = randomBytes(32).toString('hex')
    return { seed, commitment: sha256Hex(Buffer.from(seed, 'hex')) }
}

/** Lista canônica: identificadores sem repetição, em ordem alfabética, um por linha. */
export function canonicalList(ids: string[]): string[] {
    return [...new Set(ids)].sort()
}

export const listHash = (ids: string[]) => sha256Hex(canonicalList(ids).join('\n'))

/**
 * Escolhe `count` participantes diferentes de forma determinística a partir da semente e da lista
 * congelada. Cada passo: HMAC-SHA256(semente, hashDaLista:contador) → número de 48 bits; valores
 * acima do maior múltiplo do tamanho restante são descartados (sem viés de módulo); o escolhido sai
 * da lista (Fisher–Yates parcial). Mesma semente + mesma lista = mesmo resultado, sempre.
 */
export function deterministicPick(seedHex: string, ids: string[], count: number): string[] {
    const pool = canonicalList(ids)
    const hash = listHash(pool)
    const key = Buffer.from(seedHex, 'hex')
    const winners: string[] = []
    const RANGE = 2 ** 48
    let counter = 0
    while (winners.length < count && pool.length) {
        const n = pool.length
        const limit = RANGE - (RANGE % n)
        let value: number
        do {
            const mac = createHmac('sha256', key).update(`${hash}:${counter++}`).digest()
            value = mac.readUIntBE(0, 6)
        } while (value >= limit)
        winners.push(pool.splice(value % n, 1)[0])
    }
    return winners
}

/** Confere um sorteio: a semente revelada bate com o compromisso e gera os mesmos vencedores. */
export function verifyDraw(seedHex: string, commitment: string, ids: string[], count: number, winners: string[]): boolean {
    return sha256Hex(Buffer.from(seedHex, 'hex')) === commitment
        && JSON.stringify(deterministicPick(seedHex, ids, count)) === JSON.stringify(winners)
}

// ———————————————— Caça à chave ————————————————
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ'
const CODE_DIGITS = '23456789'

/** Código de desafio sintético (não é a chave do prêmio): SFR-XXXX-XXXX, com letras e números. */
export function newChallengeCode(): string {
    const block = () => Array.from({ length: 4 }, (_, i) => i % 2 === 0 ? CODE_LETTERS[randomInt(CODE_LETTERS.length)] : (randomInt(2) ? CODE_LETTERS[randomInt(CODE_LETTERS.length)] : CODE_DIGITS[randomInt(CODE_DIGITS.length)])).join('')
    return `SFR-${block()}-${block()}`
}

/** Variante do código com exatamente 3 letras trocadas (mesma posição dos números e traços). */
export function mutateThreeLetters(code: string): string {
    const letterPositions = [...code].map((c, i) => (/[A-Z]/.test(c) && i > 3 ? i : -1)).filter(i => i >= 0)
    if (letterPositions.length < 3) throw new Error('O código precisa de pelo menos 3 letras para gerar variações.')
    const chosen = new Set<number>()
    while (chosen.size < 3) chosen.add(letterPositions[randomInt(letterPositions.length)])
    const chars = [...code]
    for (const i of chosen) {
        let next = chars[i]
        while (next === chars[i]) next = CODE_LETTERS[randomInt(CODE_LETTERS.length)]
        chars[i] = next
    }
    return chars.join('')
}

/** Quatro opções (A–D) embaralhadas: uma verdadeira e três variantes distintas. */
export function huntOptions(real: string): { options: string[], correctIndex: number } {
    const set = new Set<string>([real])
    while (set.size < 4) set.add(mutateThreeLetters(real))
    const options = [...set]
    for (let i = options.length - 1; i > 0; i--) {
        const j = randomInt(i + 1)
        ;[options[i], options[j]] = [options[j], options[i]]
    }
    return { options, correctIndex: options.indexOf(real) }
}

export const OPTION_LETTERS = ['A', 'B', 'C', 'D']

// ———————————————— Cofre (AES-256-GCM) ————————————————
export interface SealedSecret { iv: string, tag: string, data: string }

/** Chaves derivadas da chave mestra (HKDF): uma para criptografar, outra só para detectar repetidos. */
export function deriveKeys(master: Buffer): { enc: Buffer, fp: Buffer } {
    if (master.length !== 32) throw new Error('A chave do cofre precisa ter 32 bytes.')
    return {
        enc: Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'sinforoso-vault-enc', 32)),
        fp: Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'sinforoso-vault-fingerprint', 32)),
    }
}

/** Criptografa com AES-256-GCM e IV aleatório de 12 bytes por operação. `aad` amarra ao sorteio. */
export function sealSecret(plain: string, encKey: Buffer, aad: string): SealedSecret {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', encKey, iv)
    cipher.setAAD(Buffer.from(aad))
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }
}

/** Descriptografa; falha se o dado ou o sorteio associado (aad) tiver sido alterado. */
export function openSecret(sealed: SealedSecret, encKey: Buffer, aad: string): string {
    const decipher = createDecipheriv('aes-256-gcm', encKey, Buffer.from(sealed.iv, 'base64'))
    decipher.setAAD(Buffer.from(aad))
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]).toString('utf8')
}

/** Impressão digital da chave (HMAC): detecta a mesma chave cadastrada duas vezes sem guardá-la em claro. */
export function secretFingerprint(plain: string, fpKey: Buffer): string {
    return createHmac('sha256', fpKey).update(plain.trim().toUpperCase().replace(/\s+/g, '')).digest('hex')
}

/** Chave mascarada para mensagens de confirmação ao admin (nunca a chave inteira). */
export function maskSecret(plain: string): string {
    const clean = plain.trim()
    if (clean.length <= 6) return '•'.repeat(clean.length)
    return `${clean.slice(0, 3)}${'•'.repeat(Math.max(3, clean.length - 6))}${clean.slice(-3)}`
}
