/*
 * Identidades do WhatsApp: a mesma pessoa pode aparecer com o número de telefone
 * ("5586...@s.whatsapp.net", PN) ou com o identificador anônimo novo ("1749...@lid", LID).
 * Os membros dos grupos são guardados como LID, mas o próprio bot (e mensagens enviadas pelo
 * WhatsApp do bot) chegam com o número de telefone. Sem ligar as duas formas, o bot achava que
 * nem ele nem quem escrevia do WhatsApp dele era administrador do grupo.
 *
 * As ligações são aprendidas de fontes oficiais do Baileys: os participantes do grupo (id, lid,
 * phoneNumber), as chaves das mensagens (participant/participantAlt) e a conta do bot (user.id/lid).
 */

const links = new Map<string, Set<string>>()

/** Tira o número do aparelho ("5586...:12@s.whatsapp.net" → "5586...@s.whatsapp.net"). */
export function baseJid(jid: string): string {
    return jid.replace(/:[0-9]+(?=@)/, '')
}

const isUserJid = (jid: string) => /@(s\.whatsapp\.net|lid)$/.test(jid)

/** Registra que os dois identificadores são a mesma pessoa. */
export function linkIds(a?: string | null, b?: string | null): void {
    if (!a || !b) return
    const x = baseJid(a), y = baseJid(b)
    if (x === y || !isUserJid(x) || !isUserJid(y)) return
    const group = new Set([x, y, ...(links.get(x) ?? []), ...(links.get(y) ?? [])])
    for (const id of group) links.set(id, group)
}

/** Todas as formas conhecidas do identificador (ele mesmo primeiro). */
export function idsOf(jid: string): string[] {
    const base = baseJid(jid)
    return [base, ...[...(links.get(base) ?? [])].filter(id => id !== base)]
}

export function sameUser(a: string, b: string): boolean {
    return idsOf(a).includes(baseJid(b))
}

/** A pessoa está na lista (ex.: lista negra cadastrada pelo número), em qualquer das formas. */
export function inList(list: string[], jid: string): boolean {
    const ids = idsOf(jid)
    return list.some(item => ids.includes(baseJid(item)))
}

/** Número de telefone ("5586...") da pessoa, se conhecido. LID sozinho não revela o número. */
export function phoneOf(jid: string): string | undefined {
    const pn = idsOf(jid).find(id => id.endsWith('@s.whatsapp.net'))
    return pn?.replace('@s.whatsapp.net', '')
}

/**
 * Anti-fake: o número começa com um prefixo liberado ou está na lista de números liberados?
 * Devolve null quando o número de telefone não é conhecido (só o LID): nesse caso ninguém deve ser
 * removido, porque não dá para saber o país.
 */
export function antifakeAllows(jid: string, prefixes: string[], numbers: string[]): boolean | null {
    const phone = phoneOf(jid)
    if (!phone) return null
    return prefixes.some(prefix => phone.startsWith(prefix)) || numbers.some(n => n.replace(/\D/g, '') === phone)
}

/** Para os testes. */
export function clearIdentities() { links.clear() }
