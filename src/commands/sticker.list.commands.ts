import * as stickerFunctions from './sticker.functions.commands.js'

const stickerCommands = {
    sbx: {
        guide: `Ex: *{$p}sbx* https://... - Faz uma *figurinha com som* do vídeo de qualquer site (YouTube, Instagram, TikTok, X, Facebook, Kwai e muitos outros), com os primeiros 5 segundos.\n\n` +
            `Ex: *{$p}sbx* https://... 0:12-0:17 - Usa exatamente esse trecho (até 9 segundos).\n\n` +
            `Ex: *{$p}sbx* https://... 1:05-1:10 mudo - Sem som.\n\n` +
            `Ex: *{$p}sbx* https://... 1 - Figurinha circular · *2* - Sem cortar.\n\n` +
            `Ex: *{$p}sbx* https://... 0:19-0:22 en - Usa a *dublagem automática* do YouTube nesse idioma (o padrão é sempre o áudio *original*).\n\n` +
            `*Som*: o som e a animação usam os mesmos 5 segundos (sempre sincronizados). Quem ainda não recebeu o recurso no WhatsApp vê a figurinha normal.\n`,
        msgs: {
            wait: "[AGUARDE] 🎞️ Fazendo a figurinha do vídeo de *{$1}* ({$2} → {$3})...",
            error_no_video: "Não achei vídeo nesse link. Confira se o link é público e se o post tem vídeo.",
            error_login: "Esse site só libera o vídeo para quem está logado. O bot usa apenas conteúdo público.",
            error_language: "Esse vídeo não tem áudio em *{$1}*. Idiomas disponíveis: {$2}.",
            error_no_dubs: "Esse vídeo não tem dublagem em *{$1}*: ele só tem o áudio original.",
        },
        function: stickerFunctions.sbxCommand
    },
    s: {
        guide: `Ex: Envie/responda uma *IMAGEM/VIDEO* com *{$p}s* - Transforma em sticker.\n`+
        `Ex: Envie/responda uma *IMAGEM* com *{$p}s 1* - Transforma em sticker circular.\n`+
        `Ex: Envie/responda uma *IMAGEM* com *{$p}s 2* - Transforma em sticker sem perder a proporção.\n`+
        `Ex: Envie/responda um *VIDEO* com *{$p}s mudo* - Sticker animado *sem som*.\n\n`+
        `Ex: Envie/responda um *VIDEO* com *{$p}s* 0:10-0:15 - Usa só esse trecho do vídeo (até 9 segundos; funciona com vídeos longos).\n\n`+
        `*Som*: vídeo com áudio vira *sticker com som*: o som e a animação usam os mesmos primeiros 5 segundos (do vídeo ou do trecho), sempre sincronizados. Quem ainda não recebeu o recurso vê o sticker normal.\n`,
        msgs: {
            error_limit: 'O video/gif deve ter no máximo 9 segundos. Para usar um trecho de um vídeo maior, informe o tempo: *{$p}s* 0:10-0:15',
            error_range_limit: 'O trecho da figurinha pode ter no máximo 9 segundos (com som, ela usa os primeiros 5 s do trecho).',
            error_message: "Houve um erro ao obter os dados da mensagem.",
            author_text: 'Solicitado por: {$1}'
        },
        function: stickerFunctions.sCommand
    },
    simg: {
        guide: `Ex: Responda um sticker com *{$p}simg* - Transforma o sticker em imagem.\n\n`+
        `*Obs*: Este comando funciona apenas com *STICKERS NÃO ANIMADOS*.\n`,
        msgs: {
            error_sticker: `Este comando pode ser usado apenas respondendo stickers.`
        },
        function: stickerFunctions.simgCommand
    },
    ssf: {
        guide: `Ex: Envie/responda uma *imagem* com *{$p}ssf* - Retira o fundo da imagem e transforma em sticker.\n\n`+
        `*Obs*: Este comando funciona apenas com *IMAGENS*.\n`,
        msgs: {
            wait: `[AGUARDE] 📸 O fundo da imagem está sendo removido e o sticker será enviado em breve.`,
            error_image: `Este comando é válido apenas para imagens.`,
            error_message: "Houve um erro ao obter os dados da mensagem.",
            author_text: 'Solicitado por: {$1}'
        },
        function: stickerFunctions.ssfCommand
    },
    emojimix: {
        guide: `Ex: *{$p}emojimix* 💩+😀 - Junta os dois emojis e transforma em sticker.\n\n`+
        `*Obs*: Nem todos os emojis são compátiveis, então vá tentando fazer combinações.\n`,
        msgs: {
            error_emoji: "O emoji {$1} não é compatível para essa união",
            error_emojis: "Os emoji {$1} e {$2} não são compatíveis para a união",
            error_not_found: "Não foi encontrada uma união válida para esses emojis",
            author_text: 'Solicitado por: {$1}'
        },
        function: stickerFunctions.emojimixCommand
    },
    snome: {
        guide: `Ex: Responda uma *figurinha* com *{$p}snome* Meu Pack, Fulano - Troca o nome do pacote para *Meu Pack* e o autor para *Fulano*.\n\n*Obs*: Separe o pacote e o autor com vírgula.\n`,
        msgs: {
            error_message: "Houve um erro ao obter os dados da mensagem."
        },
        function: stickerFunctions.snomeCommand
    }
}

export default stickerCommands