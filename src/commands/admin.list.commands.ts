import * as adminFunctions from './admin.functions.commands.js'
import * as backupFunctions from './admin.backup.functions.commands.js'
import { backupTexts } from './admin.backup.texts.commands.js'

const adminCommands = {
    admin: {
        guide: `Ex: *{$p}admin* - Abre o menu de administração do bot.\n\n*Obs*: Na primeira vez, mande *{$p}admin* no privado do bot para se cadastrar como *dono*.\n`,
        function: adminFunctions.adminCommand
    },
    modoadmin: {
        guide: `Ex: *{$p}modoadmin* - Liga/desliga o modo admin: só administradores do bot podem usar comandos, em todos os chats.\n\n*Quem pode*: só *administradores do bot*.\n`,
        msgs: {
            reply_off: "✅ O *MODO ADMIN* foi desativado com sucesso e agora todos podem usar comandos.",
            reply_on: "✅ O *MODO ADMIN* foi ativado com sucesso e apenas administradores do bot podem usar comandos."
        },
        function: adminFunctions.modoadminCommand
    },
    grupos: {
        guide: `Ex: *{$p}grupos* - Lista os grupos em que o bot está, com as informações de cada um.\n\n*Quem pode*: só *administradores do bot*.\n`,
        msgs: {
            reply_title: "👥 *Grupos atuais ({$1})*\n\n" +
                "*ATENÇÃO*: Se quiser sair de *TODOS* os grupos digite !sairgrupos\n\n",
            reply_item: "- *ID*: {$1}\n" +
                "- *Nome*: {$2}\n" +
                "- *Participantes*: {$3}\n" +
                "- *Admins*: {$4}\n" +
                "- *Bot é admin?* {$5}\n" +
                `- *Link*: {$6}\n\n` +
                `- *Deseja sair desse grupo?* Use {$p}sair {$7}\n\n`,
            error: "O bot nesse momento não está em nenhum grupo."
        },
        function: adminFunctions.gruposCommand
    },
    sair: {
        guide: `Ex: Digite *{$p}sair 1* - Faz o bot sair do grupo selecionado.\n\n` +
            `*Obs*: Para ver o número dos grupos é necessário checar no comando *{$p}grupos*\n`,
        msgs: {
            reply: `🤖 *Sair do grupo* - {$1} (Opção n° {$2})\n\n` +
                '✅ Saí com sucesso do grupo selecionado.',
            error: `Não foi possível sair deste grupo, o grupo não foi encontrado ou o número é inválido. Cheque o comando correto em *{$p}grupos*`,
        },
        function: adminFunctions.sairCommand
    },
    sairgrupos: {
        guide: `Ex: *{$p}sairgrupos* - O bot sai de *todos* os grupos de uma vez.\n\n⚠️ *Atenção*: não dá para desfazer; para voltar a um grupo, o bot precisa ser adicionado de novo.\n\n*Quem pode*: só *administradores do bot*.\n`,
        msgs: {
            reply: `🤖 *Sair de todos os grupos*\n\n` +
                '✅ Saí com sucesso de todos os *{$1}* grupos.',
        },
        function: adminFunctions.sairgruposCommand
    },
    linkgrupo: {
        guide: `Ex: *{$p}linkgrupo* 1 - Exibe o link do grupo selecionado.\n\n` +
            `*Obs*: Para ver o número dos grupos é necessário checar no comando *{$p}grupos*\n`,
        msgs: {
            reply_group: '🤖 Entendido, eu enviei o link para você no privado.',
            reply_admin: `🤖 *Link do grupo* - {$1} (Opção n° {$2})\n\n` +
                '✅ Aqui está o link do grupo selecionado: {$3}',
            error_bot_not_admin: 'Não foi possível obter o link, o bot não é administrador deste grupo.',
            error_not_found: `Não foi possível obter o link do grupo, o grupo não foi encontrado ou o número é inválido. Cheque o comando correto em *{$p}grupos*`,
        },
        function: adminFunctions.linkgrupoCommand
    },
    admins: {
        guide: `Ex: *{$p}admins* - Lista os administradores do bot e quem é o dono.\n\n*Quem pode*: só *administradores do bot*.\n`,
        msgs: {
            reply_title: `⭐ *Admins do bot* ({$1})\n\n`,
            reply_item: '- *Nº*: {$1}\n' +
                '- *Nome*: {$2}\n' +
                '- *Contato*: {$3}\n' +
                `- *Tipo*: {$4}{$5}\n\n`,
            no_phone: 'sem número (ID interno do WhatsApp, não é telefone)',
            same_person: '\n- *Mesma pessoa que o Nº {$1}* (o WhatsApp usa dois IDs para a mesma conta)'
        },
        function: adminFunctions.adminsCommand
    },
    addadmin: {
        guide: `Ex: Responda alguém com *{$p}addadmin* - Promove o usuário respondido a admin do bot.\n` +
            `Ex: *{$p}addadmin* @membro - Promove o membro marcado a admin do bot.\n` +
            `Ex: *{$p}addadmin* +55219xxxx-xxxx - Promove o número digitado a admin do bot.\n`,
        msgs: {
            reply: `✅ O usuário +{$1} ({$2}) foi promovido a *ADMINISTRADOR* do bot.`,
            error_user_not_found: 'O usuário ainda não está registrado no bot, faça ele interagir com o bot primeiro.',
            error_already_admin: "Este usuário já é *ADMINISTRADOR* do bot.",
        },
        function: adminFunctions.addadminCommand
    },
    rmadmin: {
        guide: `Ex: Digite *{$p}rmadmin 1* - Rebaixa o administrador selecionado.\n\n` +
            `*Obs*: Para ver o número dos administradores, use o comando *{$p}admins*\n\n` +
            `Você também pode rebaixar adminstradores das seguinte formas: \n\n` +
            `Ex: *{$p}rmadmin* +55219xxxx-xxxx - Rebaixa o administrador pelo número digitado.\n` +
            `Ex: Responda com *{$p}rmadmin* - Rebaixa o administrador que for respondido.\n` +
            `Ex: *{$p}rmadmin* @membro - Rebaixa o administrador que for marcado.\n`,
        msgs: {
            reply: `✅ O usuário +{$1} ({$2}) foi rebaixado a *USUÁRIO* do bot.`,
            error_not_admin: "Este usuário não é *ADMINISTRADOR* do bot.",
            error_user_not_found: 'O usuário ainda não está registrado no bot, faça ele interagir com o bot primeiro.',
            error_demote_owner: "Você não pode rebaixar o *DONO* do bot."
        },
        function: adminFunctions.rmadminCommand
    },
    comandospv: {
        guide: `Ex: *{$p}comandospv* - Liga/desliga o uso de comandos no *privado* do bot por usuários comuns.\n\n*Obs*: Administradores do bot sempre podem usar comandos no privado.\n\n*Quem pode*: só *administradores do bot*.\n`,
        msgs: {
            reply_off: "✅ Os *COMANDOS EM MENSAGENS PRIVADAS* foram desativados com sucesso.",
            reply_on: "✅ Os *COMANDOS EM MENSAGENS PRIVADAS* foram ativados com sucesso."
        },
        function: adminFunctions.comandospvCommand
    },
    taxacomandos: {
        guide: `Ex: *{$p}taxacomandos* 5 - Ativa a taxa limite de comandos para 5 comandos a cada minuto por usuário, com 60 segundos de bloqueio.\n` +
            `Ex: *{$p}taxacomandos* 10 80 - Ativa a taxa limite de comandos para 10 comandos a cada minuto por usuário, com 80 segundos de bloqueio.\n\n` +
            `*Obs*: Digite *{$p}taxacomandos* novamente para desativar a taxa limite de comandos.\n`,
        msgs: {
            error_max_commands_invalid: "A quantidade máxima de comandos por minuto está inválida, precisa ser um número e ser maior que 3.",
            error_block_time_invalid: "O tempo de bloqueio de mensagens está inválido, precisa ser um número e maior que 10.",
            reply_on: "✅ A *TAXA DE COMANDOS POR MINUTO* foi ativada com sucesso.\n\n" +
                '*Configuração atual*: \n' +
                '- *Comandos por minuto*: {$1}\n' +
                '- *Tempo de bloqueio*: {$2}s\n',
            reply_off: "✅ A *TAXA DE COMANDOS POR MINUTO* foi desativada com sucesso.",
        },
        function: adminFunctions.taxacomandosCommand
    },
    autostickerpv: {
        guide: `Ex: *{$p}autostickerpv* - Liga/desliga a figurinha automática no *privado*: toda imagem ou vídeo enviado ao bot vira figurinha.\n\n*Quem pode*: só *administradores do bot*.\n`,
        msgs: {
            reply_off: "✅ O *AUTO-STICKER* em mensagens privadas foi desativado com sucesso",
            reply_on: "✅ O *AUTO-STICKER* em mensagens privadas foi ativado com sucesso",
        },
        function: adminFunctions.autostickerpvCommand
    },
    bcmdglobal: {
        guide: `Ex: *{$p}bcmdglobal* {$p}s {$p}sgif {$p}play - Bloqueia  os comandos {$p}s, {$p}sgif e {$p}play (você pode escolher os comandos a sua necessidade).\n\n` +
            `Ex: *{$p}bcmdglobal* sticker - Bloqueia todos os comandos da categoria STICKER.\n\n` +
            `Ex: *{$p}bcmdglobal* utilidade - Bloqueia todos os comandos da categoria UTILIDADE.\n\n` +
            `Ex: *{$p}bcmdglobal* download - Bloqueia todos os comandos da categoria DOWNLOAD.\n\n` +
            `Ex: *{$p}bcmdglobal* variado - Bloqueia todos os comandos da categoria VARIADO.\n\n` +
            `*Obs*: Você não pode bloquear comandos de administrador.\n`,
        msgs: {
            reply_title: "🔒 *Bloquear comandos - Global*\n\n",
            reply_item_already_blocked: "Comando *{$1}* já está bloqueado.\n",
            reply_item_blocked: "Comando *{$1}* bloqueado com sucesso.\n",
            reply_item_error: "Comando *{$1}* não pode ser bloqueado.\n",
            reply_item_not_exist: "Comando *{$1}* não existe.\n",
        },
        function: adminFunctions.bcmdglobalCommand
    },
    dcmdglobal: {
        guide: `Ex: *{$p}dcmdglobal* {$p}s {$p}sgif {$p}play - Desbloqueia  os comandos {$p}s, {$p}sgif e {$p}play.\n\n` +
            `Ex: *{$p}dcmdglobal* todos - Desbloqueia todos os comandos.\n\n` +
            `Ex: *{$p}dcmdglobal* sticker - Desbloqueia todos os comandos da categoria STICKER.\n\n` +
            `Ex: *{$p}dcmdglobal* utilidade - Desbloqueia todos os comandos da categoria UTILIDADE.\n\n` +
            `Ex: *{$p}dcmdglobal* download - Desbloqueia todos os comandos da categoria DOWNLOAD.\n\n` +
            `Ex: *{$p}dcmdglobal* variado - Desbloqueia todos os comandos da categoria VARIADO.\n\n` +
            `*Obs*: Verifique os comandos que estão bloqueados com {$p}infocompleta.\n`,
        msgs: {
            reply_title: "🔓 *Desbloquear Comandos - Global* \n\n",
            reply_item_unblocked: "Comando *{$1}* foi desbloqueado.\n",
            reply_item_not_blocked: "Comando *{$1}* já esta desbloqueado ou nunca foi bloqueado.\n"
        },
        function: adminFunctions.dcmdglobalCommand
    },
    entrargrupo: {
        guide: `Ex: *{$p}entrargrupo* https://chat.whatsapp.com/... - O bot entra no grupo pelo link de convite.\n\n*Quem pode*: só *administradores do bot*.\n`,
        msgs: {
            error_link_invalid: "Isso não é um link de grupo válido.",
            error_group: "Houve um erro ao entrar nesse grupo, verifique se o link está correto.",
            reply_pending: "⏳ Fiz um pedido para entrar no grupo, porém é necessário um administrador aceitar a entrada.",
            reply: "✅ Entrei no grupo pelo link fornecido."
        },
        function: adminFunctions.entrargrupoCommand
    },
    bcgrupos: {
        guide: `Ex: *{$p}bcgrupos* Manutenção hoje às 22h - Envia a mensagem para *todos* os grupos em que o bot está.\n\n*Obs*: As mensagens saem com um intervalo entre os grupos, para evitar bloqueio.\n\n*Quem pode*: só *administradores do bot*.\n`,
        msgs: {
            message: `🤖*{$1} - Mensagem para os grupos*\n\n` +
                "{$2}",
            wait: "⏳ Em andamento , estou enviando sua mensagem para {$1} grupos.\n\n" +
                "*Tempo estimado*: {$1} segundos",
            reply: "✅ Anúncio feito com sucesso."
        },
        function: adminFunctions.bcgruposCommand
    },
    fotobot: {
        guide: `Ex: Responda uma *imagem* com *{$p}fotobot* (ou envie a imagem com o comando na legenda) - Troca a foto de perfil do bot.\n\n*Quem pode*: só *administradores do bot*.\n`,
        msgs: {
            reply: "✅ A foto do bot foi alterada com sucesso.",
            error_message: "Houve um erro ao obter os dados da mensagem."
        },
        function: adminFunctions.fotobotCommand
    },
    nomebot: {
        guide: `Ex: *{$p}nomebot* Sinforoso - Muda o nome do bot que aparece nos menus e nas mensagens.\n\n*Quem pode*: só *administradores do bot*.\n`,
        msgs: {
            reply: "✅ O nome do bot foi alterado com sucesso.",
        },
        function: adminFunctions.nomebotCommand
    },
    prefixo: {
        guide: `Ex: *{$p}prefixo* .  - Muda o prefixo dos *COMANDOS* para *.* e atualiza os menus e comandos com o novo prefixo.\n\n` +
            `Suporta os seguintes prefixos: *!*  *#*  *.*  ***\n`,
        msgs: {
            reply: "✅ O prefixo dos comandos foi alterado com sucesso.",
            error_not_supported: "Esse símbolo não é suportado como prefixo, são suportados somente: ! # . *"
        },
        function: adminFunctions.prefixoCommand
    },
    listablock: {
        guide: `Ex: *{$p}listablock* - Lista os contatos bloqueados pelo bot.\n\n*Obs*: Bloqueie e desbloqueie com *{$p}bloquear* e *{$p}desbloquear*.\n\n*Quem pode*: só *administradores do bot*.\n`,
        msgs: {
            reply_title: "🚷 *Usuários bloqueados* \n\n" +
                "*Total*: {$1}\n\n",
            reply_item: "- *ID*: {$1}\n" +
                "- *Contato*: +{$2}\n\n",
            error: "O bot não tem usuários bloqueados.",
        },
        function: adminFunctions.listablockCommand
    },
    bloquear: {
        guide: `Ex: *{$p}bloquear* @membro - Para o bot bloquear o membro mencionado.\n\n` +
            `Ex: *{$p}bloquear* +55 (xx) xxxxx-xxxx - Para o bot bloquear o número digitado.\n\n` +
            `Ex: Responder alguém com *{$p}bloquear* - Para o bot bloquear o membro que você respondeu.\n`,
        msgs: {
            error_block_admin_bot: "O usuário +{$1} é *admin* do bot, não foi possivel bloquear.",
            error_already_blocked: "O usuário +{$1} já está *bloqueado*.",
            error_block: "Houve um erro ao bloquear este usuário, verifique se o número inserido existe e está correto.",
            reply: "✅ O usuário +{$1} foi *bloqueado* com sucesso"
        },
        function: adminFunctions.bloquearCommand
    },
    desbloquear: {
        guide: `Ex: Digite *{$p}desbloquear 1* - Desbloqueia o usuário selecionado da lista negra.\n\n` +
            `*Obs*: Para ver o ID dos usuários é necessário checar no comando *{$p}listablock*\n\n` +
            `Você também pode desbloquear usuários das seguintes formas: \n\n` +
            `Ex: *{$p}desbloquear* @membro - Para o bot desbloquear o membro mencionado.\n\n` +
            `Ex: *{$p}desbloquear* +55 (xx) xxxxx-xxxx - Para o bot desbloquear o número digitado.\n\n` +
            `Ex: Responder alguém com *{$p}desbloquear* - Para o bot desbloquear o usuário que você respondeu.\n`,
        msgs: {
            error_already_unblocked: "O usuário +{$1} já está *desbloqueado* ou nunca foi bloqueado.",
            error_unblock: "Houve um erro ao desbloquear este usuário, verifique se o número está correto e que ele realmente está bloqueado.",
            reply: "✅ O usuário +{$1} foi *desbloqueado* com sucesso."
        },
        function: adminFunctions.desbloquearCommand
    },
    recado: {
        guide: `Ex: *{$p}recado* Bot online 24h - Muda o recado (\"sobre\") do perfil do bot no WhatsApp.\n\n*Quem pode*: só *administradores do bot*.\n`,
        msgs: {
            reply: '📝 *Recado/Status*:\n\n' +
                "Seu recado/status foi alterado com sucesso para: {$1}"
        },
        function: adminFunctions.recadoCommand
    },
    usuario: {
        guide: `Ex: *{$p}usuario* @usuario - Mostra os dados gerais do usuário mencionado.\n\n` +
            `Ex: Responder com *{$p}usuario* - Mostra os dados gerais do usuário respondido.\n\n` +
            `Ex: *{$p}usuario* 55219xxxxxxxx - Mostra os dados gerais do usuário com esse número.\n`,
        msgs: {
            error_user_not_found: "Este usuário ainda não está registrado, faça ele interagir com o bot primeiro.",
            reply: "👤 *Dados do usuário*\n\n" +
                "*Nome*: {$1}\n" +
                "*Tipo de usuário*: {$2}\n" +
                "*Número*: +{$3}\n" +
                "*Total de comandos usados*: {$4} comandos"
        },
        function: adminFunctions.usuarioCommand
    },
    desligar: {
        guide: `Ex: *{$p}desligar* - Desconecta o bot do WhatsApp.\n\n*Obs*: Para ligar de novo, reinicie o bot no servidor (no Docker: *docker compose restart*).\n\n*Quem pode*: só *administradores do bot*.\n`,
        msgs: {
            reply: "✅ Entendido, o bot será desligado."
        },
        function: adminFunctions.desligarCommand
    },
    backup: {
        guide: backupTexts.backup.guide,
        msgs: backupTexts.backup.msgs,
        function: backupFunctions.backupCommand
    },
    ping: {
        guide: `Ex: *{$p}ping* - Mostra as informações do servidor do bot e o tempo de resposta.\n\n*Quem pode*: só *administradores do bot*.\n`,
        msgs: {
            reply: "🖥️ *Informação geral*\n\n" +
                "*OS*: {$1}\n" +
                "*CPU*: {$2}\n" +
                "*RAM*: {$3}GB/{$4}GB\n" +
                "*Resposta*: {$5}s\n" +
                "*Usuários cadastrados*: {$6}\n" +
                "*Grupos cadastrados*: {$7}\n" +
                "*Online desde*: {$8}"
        },
        function: adminFunctions.pingCommand
    },
    limparsessao: {
        guide: `Ex: *{$p}limparsessao* - Apaga a sessão do WhatsApp e desconecta o bot. Use quando precisar conectar de novo do zero.\n\n⚠️ *Atenção*: depois disso, será preciso escanear o QR Code (ou parear por código) novamente.\n\n*Quem pode*: só *administradores do bot*.\n`,
        msgs: {
            reply: "🔓 *SESSÃO LIMPA!* O bot será desconectado. Reinicie manualmente para gerar um novo QR Code."
        },
        function: adminFunctions.limparsessaoCommand
    }
}

export default adminCommands
