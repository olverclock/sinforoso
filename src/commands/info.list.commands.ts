import * as infoFunctions from "./info.functions.commands.js"

const infoCommands = {
    menu: {
        guide: `Ex: *{$p}menu* - Abre o menu principal, com as categorias de comandos.\n\nEx: *{$p}menu 2* - Abre direto uma categoria: 0 Informação, 1 Figurinhas, 2 Utilidades, 3 Downloads, 4 Variado e, no grupo, 5 Grupo.\n\n*Obs*: No grupo, o *menu 5* mostra os comandos do grupo (a lista completa aparece para administradores).\n`,
        msgs: {
            reply: "Olá, *{$1}*\n"+
            "Tipo de Usuário: *{$2}*\n"+
            "Comandos feitos: *{$3}*\n"+
            '────────────────────────\n',
            error_user_not_found: "Usuário não foi encontrado no banco de dados.",
            error_invalid_option: "A opção selecionada não existe no menu.",
        },
        function: infoFunctions.menuCommand
    },
    reportar: {
        guide: `Ex: *{$p}reportar* O comando !play não está funcionando - Envia a sua mensagem (problema, sugestão ou denúncia) para os administradores do bot.\n\n*Dica*: explique com detalhes o que aconteceu e em qual comando.\n`,
        msgs: {
            reply: `✅ Obrigado, seu problema foi reportado com sucesso e será analisado pelo dono.`,
            error: 'Não foi possível enviar a mensagem para o dono, pois ele ainda não está cadastrado.',
            reply_admin: "‼️ *Reportar*\n\n"+
            "*Usuário*: {$1}\n"+
            "*Contato*: http://wa.me/{$2}\n"+
            "*Problema*: {$3}\n"
        },
        function: infoFunctions.reportarCommand
    },
    meusdados: {
        guide: `Ex: *{$p}meusdados* - Mostra os seus dados no bot: tipo de usuário, quantos comandos você já usou e outras estatísticas.\n`,
        msgs: {
            reply: "📊 *Seus dados de uso*\n\n"+
            "*Tipo de usuário*: {$1}\n"+
            "*Nome*: {$2}\n"+
            "*Comandos usados*: {$3} comandos\n",
            error_not_found: 'Usuário não foi encontrado.'
        },
        function: infoFunctions.meusdadosCommand
    },
    info: {
        guide: `Ex: *{$p}info* - Mostra as informações do bot (nome, versão, prefixo e dono) e as configurações atuais.\n`,
        msgs: {
            reply_title:"*Nome do bot*: {$1}\n"+
            "*Online desde*: {$2}\n"+
            "*Versão*: {$3}\n"+
            "*GitHub*: https://github.com/olverclock/sinforoso\n"+
            "*Comandos executados*: *{$4}*\n"+
            "*Contato do administradores*:\n{$5}\n",
            reply_title_resources: '🤖 *Recursos do bot*\n\n',
            reply_item_adminmode_on: "*Modo ADMIN*: ✅\n",
            reply_item_adminmode_off: "*Modo ADMIN*: ❌\n",
            reply_item_autosticker_on: "*Auto-Sticker PV*: ✅\n",
            reply_item_autosticker_off: "*Auto-Sticker PV*: ❌\n",
            reply_item_commandspv_on: "*Comandos PV*: ✅\n",
            reply_item_commandspv_off: "*Comandos PV*: ❌\n",
            reply_item_commandsrate_on: "*Taxa de comandos*: ✅\n"+
            "- *{$1}* cmds/minuto\n"+
            "- Bloqueio: *{$2}s*\n",
            reply_item_commandsrate_off: "*Taxa de comandos*: ❌\n",
            reply_item_blockcmds_on: "*Bloqueio de comandos*: ✅\n"+
            "- Bloqueados: *{$1}*\n",
            reply_item_blockcmds_off: "*Bloqueio de comandos*: ❌\n",
            reply_item_blocked_count: "*Usuários bloqueados*: *{$1}*\n",
        },
        function: infoFunctions.infoCommand
    }
}

export default infoCommands