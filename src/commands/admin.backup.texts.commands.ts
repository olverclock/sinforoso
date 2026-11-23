/* Guia e mensagens do !backup (arquivo próprio para não formar ciclo com admin.list). */

export const backupTexts = {
    backup: {
        guide: `Ex: *{$p}backup* - Faz um backup agora da pasta de dados (bancos, sessão e configurações).\n\n` +
            `Ex: *{$p}backup lista* - Mostra os backups guardados.\n\n` +
            `Ex: *{$p}backup enviar* - Envia o backup mais recente para você (*só no privado*).\n\n` +
            `*Google Drive* (só no privado):\n` +
            `Ex: *{$p}backup drive* - Conecta o seu Google Drive (você digita um código em google.com/device).\n` +
            `Ex: *{$p}backup drive status* - Situação dos envios.\n` +
            `Ex: *{$p}backup drive agora* - Envia agora os backups que faltam.\n` +
            `Ex: *{$p}backup drive desconectar* - Desconecta e revoga o acesso.\n` +
            `Com o Drive conectado, cada backup sobe para a pasta "Sinforoso Backups". Sem internet às 4h, o backup é feito no servidor e sobe *assim que a internet voltar*; sem energia, é feito e enviado *ao ligar*. O bot só acessa os arquivos que ele mesmo criou no seu Drive.\n\n` +
            `*Automático*: todo dia às 4h (horário de Brasília). Se o bot estava desligado ou sem energia nesse horário, o backup é feito assim que ele ligar. ` +
            `Ficam os 7 mais recentes na pasta *backups* (configurável por BACKUP_HOUR, BACKUP_KEEP e BACKUP_DIR no .env).\n` +
            `*Restaurar*: pare o bot, extraia com "tar -xzf arquivo.tar.gz" e substitua a pasta storage.\n`,
        msgs: {
            wait: "💾 Fazendo backup...",
            reply_created: "✅ *Backup criado*\n\n📦 {$1}\n📏 {$2}\n📁 Pasta: {$3}\n🗂️ Guardados: {$4} (os mais antigos são apagados)",
            reply_list_title: "💾 *Backups guardados* ({$1})\n📁 {$2}\n\n",
            reply_list_item: "• {$1} · {$2}\n",
            reply_list_empty: "Nenhum backup ainda. Faça um agora com *{$p}backup*.",
            reply_next: "\n⏰ Automático: todo dia às {$1}h (Brasília).",
            send_caption: "💾 Backup {$1}\n\n⚠️ *Guarde em local seguro*: o arquivo contém a sessão do WhatsApp do bot. Com ele, alguém poderia usar o número do bot.",
            error_private: "Por segurança, o envio do backup só funciona no *privado* do bot (o arquivo contém a sessão do WhatsApp).",
            error_too_big: "O backup tem {$1}, grande demais para enviar pelo WhatsApp por aqui. Copie da pasta {$2} no servidor.",
            error_option: "Opção inválida. Use *{$p}backup*, *{$p}backup lista*, *{$p}backup enviar* ou *{$p}backup drive*.",
            drive_private: "Por segurança, a conexão com o Google Drive só é feita no *privado* do bot.",
            drive_not_configured: "O Google Drive ainda não está configurado no servidor: falta GDRIVE_CLIENT_ID e GDRIVE_CLIENT_SECRET no .env. O passo a passo (grátis, uns 5 minutos) está em docs/DOCKER.md, seção *Backup no Google Drive*.",
            drive_code: "🔐 *Conectar Google Drive*\n\n1. Abra: {$1}\n2. Digite o código: *{$2}*\n3. Entre na conta Google onde quer guardar os backups e permita o acesso.\n\n⏳ O código vale {$3} minutos. Eu aviso aqui quando conectar.\n\nℹ️ O bot só terá acesso aos arquivos que ele mesmo criar no seu Drive.",
            drive_linked: "✅ *Google Drive conectado!* Enviando os backups para a pasta \"{$1}\"...",
            drive_denied: "❌ O acesso ao Google Drive foi negado. Para tentar de novo: *{$p}backup drive*",
            drive_expired: "⌛ O código venceu antes da autorização. Gere outro com *{$p}backup drive*",
            drive_error: "❌ Não foi possível conectar o Google Drive: {$1}",
            drive_status: "☁️ *Google Drive*\n\n- *Conectado*: {$1}\n- *Backups enviados*: {$2}\n- *Último envio*: {$3}\n- *Pasta*: {$4}{$5}",
            drive_status_error: "\n\n⚠️ {$1}",
            drive_sync_done: "☁️ {$1} backup(s) enviado(s) ao Google Drive.",
            drive_sync_none: "☁️ Nada a enviar: os backups já estão no Google Drive (ou ainda não há backup local).",
            drive_not_linked: "O Google Drive não está conectado. Conecte com *{$p}backup drive*",
            drive_unlinked: "✅ Google Drive desconectado e acesso revogado. Os arquivos que já estão no Drive continuam lá.",
        },
    },
}
