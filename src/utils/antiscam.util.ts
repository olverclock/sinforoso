import { normalizeWord } from "./reminder.util.js"

/*
 * Filtro de golpes (!antigolpe): pontua sinais comuns dos golpes que circulam em grupos de WhatsApp
 * no Brasil. Um sinal sozinho (ex.: só "pix") não basta: é preciso somar pontos de categorias
 * diferentes, para não atrapalhar conversa normal. Funciona offline, sem enviar nada para fora.
 */

interface Signal { category: string, label: string, weight: number, pattern: RegExp, /** Máximo de vezes que conta (padrão 2). */ max?: number }

const SIGNALS: Signal[] = [
    // Dinheiro fácil, apostas e "plataformas pagando"
    { category: 'money', label: 'promessa de dinheiro fácil', weight: 2, pattern: /(?<![a-z0-9])(renda extra|r\$ ?\d[\d.,]* (por|ao) dia|dinheiro facil|lucro garantido|ganhe (ate )?r\$|ganhar dinheiro|lucre|rendimento garantido|dobr(ar|e) (o |seu )?dinheiro|retorno garantido|ganhos? diarios?)(?![a-z0-9])/g },
    { category: 'bet', label: 'aposta/jogo de azar', weight: 3, pattern: /(?<![a-z0-9])(tigrinho|fortune (tiger|ox|rabbit|mouse)|aviator|plataforma (nova )?pagando|bet\s?\d*|cassino|bug da plataforma|horario pagante|minutos pagantes)(?![a-z0-9])/g },
    { category: 'crypto', label: 'cripto/investimento milagroso', weight: 1, pattern: /(?<![a-z0-9])(bitcoin|usdt|cripto(moedas?)?|forex|trader|investimento|robo (de|do) trade|sinais vip)(?![a-z0-9])/g },
    // Tarefas pagas (golpe da curtida, avaliar produtos)
    { category: 'task', label: 'tarefa paga (curtir, avaliar)', weight: 4, pattern: /(?<![a-z0-9])((curtir|curtindo) videos?|curtidas? (no|do|em) (youtube|tiktok|instagram)|(avaliar|avaliando) produtos?|tarefas? (simples|online|pagas?)|trabalh(e|o|ar|ando) (de|em) casa|ganhe por (dia|tarefa|curtida)|meio periodo online)(?![a-z0-9])/g },
    // Prêmio, sorteio, brinde
    { category: 'prize', label: 'prêmio ou brinde', weight: 3, pattern: /(?<![a-z0-9])(voce (foi )?(ganhou|sorteado|premiado)|resgat(e|ar) (seu |o )?(premio|brinde|bonus)|premio (te )?aguarda|brindes? gratis|cupom de r\$|ganhou um)(?![a-z0-9])/g },
    // Pix e pagamento antecipado
    { category: 'pay', label: 'pedido de Pix/pagamento', weight: 1, pattern: /(?<![a-z0-9])(pix|chave pix|transferencia|deposit(e|o|a)|taxa de liberacao|pague (a |uma )?taxa|boleto)(?![a-z0-9])/g },
    // Dados, códigos e contas (phishing)
    { category: 'code', label: 'pede código recebido por SMS/WhatsApp', weight: 4, max: 1, pattern: /(?<![a-z0-9])(me (passa|manda|envia|fala) (o |esse |aquele )?codigo)(?![a-z0-9])/g },
    { category: 'code', label: 'código de verificação', weight: 2, max: 1, pattern: /(?<![a-z0-9])(codigo de (verificacao|seguranca|confirmacao|\d digitos)|codigo (que chegou|por sms))(?![a-z0-9])/g },
    { category: 'phish', label: 'pede dados, senha ou código', weight: 4, pattern: /(?<![a-z0-9])(confirm(e|ar) (seus|os) dados|atualiz(e|ar) (seus|os) dados|seu cpf|sua senha|conta (sera )?(bloqueada|suspensa)|regulariz(e|ar)|cnh (suspensa|bloqueada)|multa pendente|pendencia (no|em) seu cpf)(?![a-z0-9])/g },
    // Golpe do "número novo"
    { category: 'newnumber', label: 'golpe do número novo', weight: 4, max: 1, pattern: /(?<![a-z0-9])(troquei de numero|mudei de numero|(esse|este) (e|eh) (o )?meu (numero )?novo|meu novo numero|salva (esse|este) numero|numero antigo)(?![a-z0-9])/g },
    // Urgência
    { category: 'urgency', label: 'urgência', weight: 1, pattern: /(?<![a-z0-9])(urgente|so hoje|ultimas vagas|ultimas unidades|corre|vagas limitadas|nao perca|agora mesmo|imediatamente|expira (hoje|em))(?![a-z0-9])/g },
    // Chamada para outro grupo/contato desconhecido
    { category: 'invite', label: 'convite para grupo/contato externo', weight: 1, pattern: /(?<![a-z0-9])(chama (no|meu) (pv|privado|direct)|me chama|clique no link|acesse o link|link na bio|entre no grupo|grupo vip)(?![a-z0-9])/g },
]

/** Encurtadores e convites usados para esconder o destino. */
const SHORTENER = /\b(bit\.ly|tinyurl\.com|cutt\.ly|encurtador\.com\.br|t\.co|is\.gd|rb\.gy|shorturl\.at|t\.me|chat\.whatsapp\.com|wa\.me|linktr\.ee|tiny\.cc|s\.id)\//i
const LINK = /\b(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|xyz|top|site|online|club|vip|bet|io|app|link|info|br)(\/\S*)?\b/i
const MONEY = /r\$\s?\d/

export const SCAM_THRESHOLD = 5

export interface ScamVerdict { score: number, reasons: string[], isScam: boolean }

export function scamScore(text: string): ScamVerdict {
    const t = normalizeWord(text ?? '')
    if (t.length < 12) return { score: 0, reasons: [], isScam: false }
    let score = 0
    const reasons: string[] = []
    const categories = new Set<string>()
    for (const signal of SIGNALS) {
        // Cada sinal conta até 2 vezes ("você foi sorteado" + "resgate seu prêmio")
        const hits = Math.min(t.match(signal.pattern)?.length ?? 0, signal.max ?? 2)
        if (!hits) continue
        score += signal.weight * hits
        categories.add(signal.category)
        reasons.push(signal.label)
    }
    if (SHORTENER.test(text)) { score += 2; reasons.push('link encurtado ou convite') }
    else if (LINK.test(text)) score += 1
    if (MONEY.test(t) && categories.size) score += 1
    return { score, reasons, isScam: score >= SCAM_THRESHOLD }
}
