/*
 * Guias e mensagens dos comandos de automação (jogos grátis, lives, frases e verificação de links).
 * Ficam num arquivo próprio para que utility.list e utility.automation.functions possam usar os
 * textos sem formar um ciclo de importação.
 */

const adminNote = `*Obs*: No grupo, só *administradores* podem ativar/configurar. No privado, você mesmo configura.\n`

export const automationTexts = {
    jogosgratis: {
        guide: `Ex: *{$p}jogosgratis* - Liga/desliga o aviso automático de *jogos grátis para resgatar* neste chat (com imagem, título e link).\n\n` +
            `Ex: *{$p}jogosgratis agora* - Mostra agora os jogos grátis disponíveis.\n\n` +
            `*Lojas*: Epic Games, Steam, GOG, Ubisoft e EA app. Só jogos completos e grátis para manter.\n` +
            `*Brasil*: cada oferta da Epic e da Steam é conferida na própria loja para o Brasil; as que a loja não libera aqui ("indisponível na sua região") não são divulgadas e aparecem só como aviso no *agora*. Ofertas que dizem ser restritas a outros países também ficam de fora.\n` +
            `*Fonte*: GamerPower. Verificado a cada 30 minutos.\n` + adminNote,
        msgs: {
            reply_on: "✅ Aviso de *JOGOS GRÁTIS* ativado. Vou postar aqui cada jogo novo assim que aparecer.",
            reply_off: "✅ Aviso de *JOGOS GRÁTIS* desativado.",
            reply_current_title: "🎮 *Jogos grátis disponíveis agora* ({$1}):",
            reply_none: "😕 Nenhum jogo grátis das lojas Epic, Steam, GOG, Ubisoft ou EA no momento.",
        },
    },
    alertalive: {
        guide: `Ex: *{$p}alertalive* - Liga/desliga os avisos de *live ao vivo* neste chat.\n\n` +
            `Adicione os canais com *{$p}addlive*. Sem limite de canais. Verificado a cada 3 minutos.\n` + adminNote,
        msgs: {
            reply_on: "✅ Avisos de *LIVE* ativados. Canais: {$1}. Adicione mais com *{$p}addlive*.",
            reply_off: "✅ Avisos de *LIVE* desativados.",
        },
    },
    addlive: {
        guide: `Ex: *{$p}addlive* https://www.twitch.tv/gaules - Adiciona pelo link.\n\n` +
            `Ex: *{$p}addlive* twitch gaules\n` +
            `Ex: *{$p}addlive* kick nome_do_canal\n` +
            `Ex: *{$p}addlive* youtube @canal\n` +
            `Ex: *{$p}addlive* tiktok @usuario\n\n` +
            `*Plataformas*: Twitch, Kick, YouTube e TikTok. Sem limite de canais.\n` + adminNote,
        msgs: {
            reply_added: "✅ Canal *{$1}* ({$2}) adicionado. {$3}",
            reply_is_live: "🔴 Ele está *ao vivo agora*: {$1}",
            reply_offline: "Vou avisar quando entrar ao vivo.",
            reply_already: "Esse canal já está na lista.",
            reply_auto_on: "\n\nℹ️ Os avisos estavam desligados e foram *ativados*.",
            error_invalid: "Não reconheci o canal. Use o link do canal ou: *{$p}addlive* plataforma nome (twitch, kick, youtube ou tiktok).",
        },
    },
    rmlive: {
        guide: `Ex: *{$p}rmlive* twitch gaules - Remove o canal dos avisos.\n\n` +
            `Ex: *{$p}rmlive* https://kick.com/canal\n` + adminNote,
        msgs: {
            reply_removed: "✅ Canal *{$1}* ({$2}) removido.",
            reply_not_found: "Esse canal não está na lista. Veja os canais com *{$p}lives*.",
        },
    },
    lives: {
        guide: `Ex: *{$p}lives* - Mostra os canais de live monitorados neste chat e quem está ao vivo agora.\n\n*Obs*: Adicione canais com *{$p}addlive* e ligue os avisos com *{$p}alertalive*.\n`,
        msgs: {
            reply_title: "📡 *Avisos de live* — {$1}\n\n",
            reply_item: "{$1} *{$2}* ({$3})\n",
            reply_empty: "Nenhum canal adicionado. Use *{$p}addlive*.",
        },
    },
    frases: {
        guide: `Ex: *{$p}frases* - Liga/desliga as *frases automáticas* (positivas, inspiradoras e reflexivas) neste chat.\n\n` +
            `Configure com *{$p}frasehora* (horário diário) ou *{$p}fraseintervalo* (de tanto em tanto tempo).\n` +
            `Banco com mais de 5.000 frases, sem repetir até passar por todas.\n` + adminNote,
        msgs: {
            reply_on: "✅ *Frases automáticas* ativadas: {$1}.",
            reply_off: "✅ *Frases automáticas* desativadas.",
        },
    },
    frasehora: {
        guide: `Ex: *{$p}frasehora* 08:00 - Envia uma frase todo dia às 08:00 (horário de Brasília).\n\n` +
            `Ex: *{$p}frasehora* 21:30\n` + adminNote,
        msgs: {
            reply: "✅ Frases configuradas para *todo dia às {$1}*.{$2}",
            error_invalid: "Horário inválido. Use HH:MM, por exemplo *{$p}frasehora* 08:30.",
        },
    },
    fraseintervalo: {
        guide: `Ex: *{$p}fraseintervalo* 2h - Envia uma frase a cada 2 horas.\n\n` +
            `Ex: *{$p}fraseintervalo* 30m\n` +
            `Ex: *{$p}fraseintervalo* 1d\n` +
            `Ex: *{$p}fraseintervalo* 1h30\n\n` +
            `*Limites*: de 30 minutos a 7 dias.\n` + adminNote,
        msgs: {
            reply: "✅ Frases configuradas para *a cada {$1}*.{$2}",
            error_invalid: "Intervalo inválido. Use de 30m a 7d, por exemplo *{$p}fraseintervalo* 2h.",
        },
    },
    fraseagora: {
        guide: `Ex: *{$p}fraseagora* - Envia agora uma frase positiva, inspiradora ou reflexiva.\n\n*Obs*: Para receber frases automaticamente, use *{$p}frases*.\n`,
        msgs: {
            reply: "💭 *Frase do momento*\n\n{$1}",
        },
    },
    scanlinks: {
        guide: `Ex: *{$p}scanlinks* - Liga/desliga a *proteção automática de links e arquivos* neste chat, pelo VirusTotal.\n\n` +
            `Cada link enviado é verificado; se for perigoso, o bot avisa (e, no grupo, apaga a mensagem quando é administrador). ` +
            `Documentos e APKs são verificados *só pela impressão digital (SHA-256)*: o arquivo nunca sai do servidor.\n\n` +
            `*Obs*: Precisa de chave grátis do VirusTotal (VIRUSTOTAL_API_KEY) no servidor. Limite gratuito: 4 verificações por minuto e 500 por dia.\n` + adminNote,
        msgs: {
            reply_on: "✅ *Proteção de links e arquivos* ativada (VirusTotal).",
            reply_off: "✅ *Proteção de links e arquivos* desativada.",
            alert_link: "🚨 *LINK PERIGOSO DETECTADO!*\n\n{$1}\n\n⚠️ *{$2}* antivírus marcaram como malicioso e *{$3}* como suspeito. *Não abra.*\n🔎 Relatório: {$4}",
            alert_file: "🚨 *ARQUIVO PERIGOSO DETECTADO!*\n\n📄 {$1}\n\n⚠️ *{$2}* antivírus marcaram como malicioso e *{$3}* como suspeito. *Não abra.*\n🔎 Relatório: {$4}",
            deleted: "\n\n🗑️ A mensagem foi apagada.",
        },
    },
    scan: {
        guide: `Ex: *{$p}scan* https://site.com - Verifica um link no VirusTotal.\n\n` +
            `Ex: Responda uma mensagem com link ou um documento com *{$p}scan* - Verifica o link ou o arquivo.\n\n` +
            `*Obs*: Arquivos são verificados só pela impressão digital (SHA-256); o arquivo não é enviado. Se o VirusTotal nunca viu o arquivo, o resultado é "desconhecido".\n`,
        msgs: {
            wait: "🔎 Verificando no VirusTotal...",
            result: "🛡️ *Resultado do VirusTotal*\n\n{$1}\n\n{$2}\n\n📊 Malicioso: *{$3}* · Suspeito: *{$4}* · Seguro: *{$5}* · Sem detecção: *{$6}*\n🔎 {$7}",
            verdict_malicious: "🚨 *PERIGOSO*: não abra.",
            verdict_suspicious: "⚠️ *SUSPEITO*: tenha cuidado.",
            verdict_clean: "✅ Nenhum antivírus encontrou problema.",
            verdict_unknown: "❔ *Desconhecido*: o VirusTotal ainda não tem análise deste item.",
            error_nothing: "Envie um link (*{$p}scan* https://...) ou responda uma mensagem com link ou documento.",
            error_file_size: "O arquivo passa do limite de verificação (64 MB).",
        },
    },
}
