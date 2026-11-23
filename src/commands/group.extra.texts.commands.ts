/*
 * Guias e mensagens dos comandos de grupo novos: mensagens agendadas, regras, verificação de novos
 * membros, filtro de golpes e amigo secreto.
 */

const adminOnly = `*Obs*: Só *administradores do grupo* podem usar.\n`

export const groupExtraTexts = {
    agendar: {
        guide: `Ex: *{$p}agendar* 18h Reunião começando! - Envia a mensagem no grupo às 18h.\n` +
            `Ex: *{$p}agendar* sexta 20h Hoje tem live!\n` +
            `Ex: *{$p}agendar* toda segunda 8h Bom dia, equipe! Lembrem do relatório.\n\n` +
            `*Horários*: 10m · em 2h · 18h30 · amanhã 9h · 25/12 15h · todo dia 8h · toda sexta 18h (Brasília).\n` +
            `Veja os agendamentos com *{$p}lembretes* e apague com *{$p}rmlembrete* número.\n` +
            `Se o bot estiver desligado no horário, a mensagem sai assim que ele voltar.\n` + adminOnly,
        msgs: {
            reply: "📢 Mensagem agendada para *{$1}*:\n\n{$2}",
        },
    },
    regras: {
        guide: `Ex: *{$p}regras* - Mostra as regras do grupo.\n\n` +
            `Admins definem com *{$p}setregras*. Sem regras definidas, mostra a descrição do grupo.\n`,
        msgs: {
            reply: "📜 *Regras do grupo {$1}*\n\n{$2}",
            reply_empty: "Este grupo ainda não tem regras. Um administrador pode definir com *{$p}setregras* texto.",
        },
    },
    setregras: {
        guide: `Ex: *{$p}setregras* 1. Respeito sempre\n2. Sem spam\n3. Sem links de outros grupos\n\n` +
            `Ex: Responda uma mensagem com as regras usando *{$p}setregras*.\n\n` +
            `Use *{$p}regrasauto* para enviar as regras para quem entrar no grupo.\n` + adminOnly,
        msgs: {
            reply: "✅ Regras salvas ({$1} caracteres). Veja com *{$p}regras*.",
            error_empty: "Escreva as regras depois do comando ou responda a mensagem que contém as regras.",
            error_length: "Regras longas demais (máximo 4.000 caracteres).",
        },
    },
    rmregras: {
        guide: `Ex: *{$p}rmregras* - Apaga as regras salvas (e desliga o envio automático).\n` + adminOnly,
        msgs: {
            reply: "🗑️ Regras apagadas.",
        },
    },
    regrasauto: {
        guide: `Ex: *{$p}regrasauto* - Liga/desliga o envio das regras para *cada novo membro*, marcando a pessoa.\n` + adminOnly,
        msgs: {
            reply_on: "✅ Envio automático das regras *ativado*: quem entrar recebe as regras.",
            reply_off: "✅ Envio automático das regras *desativado*.",
            error_no_rules: "Defina as regras primeiro com *{$p}setregras* texto.",
            welcome: "👋 @{$1}, bem-vindo(a)! Leia as regras do grupo:\n\n📜 {$2}",
        },
    },
    verificacao: {
        guide: `Ex: *{$p}verificacao* - Liga/desliga a *verificação de novos membros* (anti-robô).\n\n` +
            `Ex: *{$p}verificacao* 10 - Liga com prazo de 10 minutos (de 1 a 60; padrão 5).\n\n` +
            `Quem entra recebe uma continha simples (ex.: 3 + 4) e precisa responder *no grupo* dentro do prazo. ` +
            `Quem não responde, ou erra 3 vezes, é removido. Administradores não passam pela verificação.\n` +
            `*Obs*: Para remover, o bot precisa ser administrador do grupo. A verificação continua mesmo se o bot reiniciar.\n` + adminOnly,
        msgs: {
            reply_on: "✅ *Verificação de novos membros* ativada: prazo de *{$1} minuto(s)*.{$2}",
            reply_off: "✅ *Verificação de novos membros* desativada.",
            warn_not_admin: "\n\n⚠️ O bot *não é administrador*: vai pedir a verificação, mas não conseguirá remover quem não responder.",
            error_minutes: "Prazo inválido: use de 1 a 60 minutos.",
            challenge: "🤖 @{$1}, bem-vindo(a)! Para confirmar que você não é um robô, responda aqui no grupo:\n\n*Quanto é {$2}?*\n\n⏳ Você tem *{$3} minuto(s)*.",
            passed: "✅ @{$1} verificado(a)! Seja bem-vindo(a).",
            wrong: "❌ @{$1}, resposta errada. Tente de novo ({$2} tentativa(s) restante(s)).",
            failed: "🚫 @{$1} errou a verificação 3 vezes.",
        },
    },
    antigolpe: {
        guide: `Ex: *{$p}antigolpe* - Liga/desliga o *filtro de golpes*.\n\n` +
            `O bot reconhece golpes comuns: dinheiro fácil, "plataforma pagando"/tigrinho, tarefas pagas (curtir vídeos, avaliar produtos), ` +
            `prêmios falsos, pedido de código do WhatsApp, "troquei de número" pedindo Pix, CNH/CPF "bloqueado" com link e links encurtados. ` +
            `Precisa somar vários sinais para agir, para não atrapalhar conversa normal.\n` +
            `Quando detecta, avisa o grupo e, se o bot for administrador, *apaga a mensagem*. Mensagens de administradores não são verificadas.\n` +
            `*Obs*: Funciona sem internet e sem enviar mensagens para fora.\n` + adminOnly,
        msgs: {
            reply_on: "✅ *Filtro de golpes* ativado.{$1}",
            reply_off: "✅ *Filtro de golpes* desativado.",
            warn_not_admin: "\n\n⚠️ O bot *não é administrador*: vai avisar, mas não conseguirá apagar as mensagens.",
            alert: "🚨 *POSSÍVEL GOLPE!* Mensagem de @{$1}\n\n⚠️ Sinais: {$2}\n\nNão faça Pix, não passe códigos e não clique em links de desconhecidos.",
            deleted: "\n\n🗑️ A mensagem foi apagada.",
        },
    },
    marcar: {
        guide: `Ex: *{$p}marcar* Reunião hoje às 20h! - Marca *todos* do grupo sem encher a mensagem de @ (todos recebem a notificação).\n\n` +
            `Ex: *{$p}marcar lista* Reunião hoje - Marca todos *mostrando a lista* de @.\n\n` +
            `Ex: Responda uma mensagem com *{$p}marcar* - Marca todos *naquela mensagem* (ótimo para avisos já enviados).\n\n` +
            `Também funciona como *{$p}tagall*. O bot não marca a si mesmo.\n` + adminOnly,
        msgs: {
            reply_hidden: "📢 {$1}",
            reply_hidden_empty: "📢 *Atenção, pessoal!*",
            reply_list: "📢 {$1}\n\n{$2}",
            reply_quoted: "📢 Marcando todos ({$1}) nesta mensagem ☝️",
        },
    },
    discord: {
        guide: `Ex: *{$p}discord* - Mostra os servidores do Discord deste grupo.\n\n` +
            `Ex: *{$p}discord add* Nome da Comunidade | https://discord.gg/abc123 - Adiciona um convite (admin).\n` +
            `Ex: *{$p}discord rm* Nome da Comunidade - Remove (também aceita o número da lista) (admin).\n\n` +
            `Cada grupo tem os seus convites (até 10), cada um com o nome da comunidade ao lado.\n` +
            `*Links aceitos*: discord.gg/... e discord.com/invite/...\n`,
        msgs: {
            reply_title: "🎮 *Discord do grupo* ({$1})\n\n",
            reply_item: "*{$1}.* {$2}\n🔗 {$3}\n\n",
            reply_empty: "Este grupo ainda não tem convite do Discord. Um administrador pode adicionar com:\n*{$p}discord add* Nome | https://discord.gg/codigo",
            reply_added: "✅ Convite do Discord *{$1}* adicionado.\n🔗 {$2}",
            reply_updated: "✅ Convite do Discord *{$1}* atualizado.\n🔗 {$2}",
            reply_removed: "🗑️ Convite do Discord *{$1}* removido.",
            error_format: "Use: *{$p}discord add* Nome da Comunidade | https://discord.gg/codigo",
            error_link: "Link do Discord inválido. Use um convite como https://discord.gg/codigo ou https://discord.com/invite/codigo",
            error_limit: "Limite de 10 convites por grupo. Remova algum com *{$p}discord rm*.",
            error_not_found: "Não achei esse convite. Veja a lista com *{$p}discord*.",
            error_option: "Opção inválida. Use *{$p}discord*, *{$p}discord add* ou *{$p}discord rm*.",
        },
    },
    amigosecreto: {
        guide: `*Amigo secreto do grupo*\n\n` +
            `Ex: *{$p}amigosecreto criar* Valor R$ 50, troca dia 20/12 - Cria (admin).\n` +
            `Ex: *{$p}amigosecreto entrar* - Entra na lista.\n` +
            `Ex: *{$p}amigosecreto sair* - Sai da lista.\n` +
            `Ex: *{$p}amigosecreto lista* - Mostra quem está participando.\n` +
            `Ex: *{$p}amigosecreto sortear* - Sorteia e envia a cada um, *no privado*, quem ele tirou (admin).\n` +
            `Ex: *{$p}amigosecreto meu* - Reenvia no seu privado quem você tirou.\n` +
            `Ex: *{$p}amigosecreto cancelar* - Apaga o amigo secreto (admin).\n\n` +
            `Ninguém tira a si mesmo e ninguém fica sem presente. Mínimo de 3 pessoas.\n`,
        msgs: {
            reply_created: "🎁 *Amigo secreto criado!*{$1}\n\nEntre com *{$p}amigosecreto entrar*. Quando todos entrarem, um admin sorteia com *{$p}amigosecreto sortear*.",
            reply_joined: "✅ @{$1} entrou no amigo secreto. Participantes: *{$2}*.",
            reply_already: "Você já está na lista. Participantes: *{$1}*.",
            reply_left: "✅ Você saiu do amigo secreto. Participantes: *{$1}*.",
            reply_not_in: "Você não está na lista.",
            reply_list: "🎁 *Amigo secreto* ({$1}){$2}\n\n{$3}",
            reply_drawn: "🎉 *Sorteio feito!* Cada participante recebeu no privado quem tirou.{$1}",
            reply_dm_failed: "\n\n⚠️ Não consegui enviar para: {$1}. Essas pessoas podem usar *{$p}amigosecreto meu* (e mandar um \"oi\" no privado do bot antes, se precisar).",
            reply_dm_sent: "📩 Enviei no seu privado.",
            reply_not_drawn: "O sorteio ainda não foi feito.",
            reply_not_participant: "Você não participa deste amigo secreto.",
            reply_cancelled: "🗑️ Amigo secreto cancelado.",
            reply_nothing: "Não há amigo secreto neste grupo.",
            dm: "🎁 *Amigo secreto do grupo {$1}*\n\nVocê tirou: *{$2}* 🤫{$3}\n\n_Não conte para ninguém!_",
            error_option: "Opção inválida. Veja as opções com *{$p}amigosecreto guia*.",
        },
    },
}
