import * as downloadFunctions from './download.functions.commands.js'

const downloadCommands = {
    bx: {
        guide: `Ex: *{$p}bx* https://... - Baixa o vídeo de *qualquer site*: YouTube, Instagram, TikTok, X, Facebook, Kwai, Vimeo, Reddit, Pinterest, Threads e muitos outros.\n\n` +
            `Ex: *{$p}bx* https://... 1:20-1:45 - Envia só esse trecho.\n\n` +
            `Ex: *{$p}bx* gol do Brasil - Sem link, procura no YouTube.\n\n` +
            `*Trecho*: coloque o tempo no fim, ex.: *1:20-1:45*, *1:20 a 1:45*, *80-105* ou *1m20s-1m45s* (até 6 minutos).\n` +
            `*Limite*: até 50 MB por vídeo. Só conteúdo público.\n`,
        msgs: {
            wait: "[AGUARDE] 🎬 Baixando o vídeo de *{$1}*...",
            error_no_video: "Não achei vídeo nesse link. Confira se o link é público e se o post tem vídeo.",
            error_login: "Esse site só libera o vídeo para quem está logado. O bot baixa apenas conteúdo público.",
        },
        function: downloadFunctions.bxCommand
    },
    play: {
        guide: `Ex: *{$p}play* Evidências Chitãozinho e Xororó - Procura a música no YouTube e envia o áudio.\n\nEx: *{$p}play* https://youtu.be/... - Também aceita o link do vídeo.\n\nEx: *{$p}play* https://youtu.be/... 1:20-1:45 - Envia só esse trecho do áudio.\n\n` +
            `*Trecho*: coloque o tempo no fim, ex.: *1:20-1:45*, *1:20 a 1:45*, *80-105* ou *1m20s-1m45s* (até 6 minutos).\n` +
            `*Limite*: vídeos de até 6 minutos; com trecho, vídeos de até 3 horas.\n`,
        msgs: {
            wait: "[AGUARDE] 🎧 Sua música está sendo baixada e processada.\n\n"+
            "*Título*: {$1}\n"+
            "*Duração*: {$2}",
            error_limit: "O vídeo deve ter no máximo *6 minutos*. Para vídeos maiores, peça um trecho no fim do comando, ex.: *10:00-12:30*",
            error_live: "Esse vídeo não pode ser convertido em áudio, lives não são aceitas.",
            error_not_found: "Nenhum áudio foi encontrado",
            error_unavailable: "Esse vídeo não está disponível para download (privado, removido, bloqueado no Brasil ou com restrição de idade). Tente outro link ou outra busca."
        },
        function: downloadFunctions.playCommand
    },
    yt: {
        guide: `Ex: *{$p}yt* gol do Brasil - Procura no YouTube e envia o vídeo.\n\nEx: *{$p}yt* https://youtu.be/... - Também aceita o link do vídeo.\n\nEx: *{$p}yt* https://youtu.be/... 10:00-12:30 - Envia só esse trecho (em vídeos longos, baixa só o trecho).\n\n` +
            `*Trecho*: coloque o tempo no fim, ex.: *1:20-1:45*, *1:20 a 1:45*, *80-105* ou *1m20s-1m45s* (até 6 minutos).\n` +
            `*Qualidade*: a melhor que couber no limite (até 1080p e 50 MB), sem recomprimir.\n*Limite*: vídeos de até 6 minutos; com trecho, vídeos de até 3 horas. Transmissões ao vivo não são baixadas.\n`,
        msgs: {
            wait: "[AGUARDE] 🎥 Seu video está sendo baixado e processado.\n\n"+
            "*Título*: {$1}\n"+
            "*Duração*: {$2}",
            error_limit: "O vídeo deve ter no máximo *6 minutos*. Para vídeos maiores, peça um trecho no fim do comando, ex.: *10:00-12:30*",
            error_live: "Houve um erro de download, o bot não aceita download de lives.",
            error_not_found: "Nenhum vídeo foi encontrado",
            error_unavailable: "Esse vídeo não está disponível para download (privado, removido, bloqueado no Brasil ou com restrição de idade). Tente outro link ou outra busca."
        },
        function: downloadFunctions.ytCommand
    },
    fb: {
        guide: `Ex: *{$p}fb* https://www.facebook.com/watch?v=... - Baixa e envia o vídeo do Facebook.\n\nEx: *{$p}fb* https://www.facebook.com/watch?v=... 0:30-1:10 - Envia só esse trecho.\n\n` +
            `*Trecho*: coloque o tempo no fim, ex.: *1:20-1:45*, *1:20 a 1:45*, *80-105* ou *1m20s-1m45s* (até 6 minutos).\n` +
            `*Limite*: vídeos públicos de até 6 minutos; com trecho, de até 30 minutos.\n`,
        msgs: {
            wait: "[AGUARDE] 🎬 Sua mídia está sendo baixada e processada.\n\n"+
            "*Título*: {$1}\n"+
            "*Duração*: {$2}",
            error_limit: "O vídeo deve ter no máximo *6 minutos*. Para vídeos maiores, peça um trecho no fim do comando, ex.: *10:00-12:30*"
        },
        function: downloadFunctions.fbCommand
    },
    ig: {
        guide: `Ex: *{$p}ig* https://www.instagram.com/reel/... - Baixa e envia o vídeo ou o reel do Instagram.\n\nEx: *{$p}ig* https://www.instagram.com/reel/... 0:05-0:20 - Envia só esse trecho do vídeo.\n\n` + `*Trecho*: coloque o tempo no fim, ex.: *1:20-1:45*, *1:20 a 1:45*, *80-105* ou *1m20s-1m45s* (até 6 minutos).\n` + `\n*Obs*: Funciona com posts, reels e carrosséis *públicos* que tenham vídeo. Posts só com fotos exigem login no Instagram e não são baixados.\n`,
        msgs: {
            wait: "[AGUARDE] 🎬 Sua mídia está sendo baixada e processada.\n\n"+
            "*Autor*: {$1} (@{$2})\n"+
            "*Descrição*: {$3}\n"+
            "*Likes*: {$4}",
        },
        function: downloadFunctions.igCommand
    },
    x: {
        guide: `Ex: *{$p}x* https://x.com/usuario/status/... - Baixa e envia o vídeo ou a imagem do post do X (Twitter).\n\nEx: *{$p}x* https://x.com/usuario/status/... 0:10-0:40 - Envia só esse trecho do vídeo.\n\n` +
            `*Trecho*: coloque o tempo no fim, ex.: *1:20-1:45*, *1:20 a 1:45*, *80-105* ou *1m20s-1m45s* (até 6 minutos).\n`,
        msgs: {
            wait: "[AGUARDE] 🎬 Sua mídia está sendo baixada e processada.\n\n"+
            "*Postagem*: {$1}",
            error_not_found: 'Não foi encontrada nenhuma mídia, verifique o link'
        },
        function: downloadFunctions.xCommand
    },
    tk: {
        guide: `Ex: *{$p}tk* https://www.tiktok.com/@usuario/video/... - Baixa e envia o vídeo do TikTok.\n\nEx: *{$p}tk* https://www.tiktok.com/@usuario/video/... 0:03-0:15 - Envia só esse trecho.\n\n` +
            `*Trecho*: coloque o tempo no fim, ex.: *1:20-1:45*, *1:20 a 1:45*, *80-105* ou *1m20s-1m45s* (até 6 minutos).\n`,
        msgs: {
            wait: "[AGUARDE] 🎬 Sua mídia está sendo baixada e processada.\n\n"+
            "*Perfil*: @{$1}\n"+
            "*Descrição*: {$2}",
            error_not_found: 'Não foi encontrada nenhuma mídia, verifique o link'
        },
        function: downloadFunctions.tkCommand
    },
    img: {
        guide: `Ex: *{$p}img* gatos fofos - Procura e envia uma imagem sobre o tema.\n\n*Obs*: A busca usa o filtro de conteúdo seguro.\n`,
        msgs: {
            error: 'Não foi possível obter nenhuma imagem, tente novamente com outra pesquisa.',
        },
        function: downloadFunctions.imgCommand
    }
}

export default downloadCommands

/** Recorte por tempo nos downloads (!yt, !play, !fb, !ig, !x, !tk). */
export const CLIP_MAX_SOURCE_SECONDS = 30 * 60
export const clipTexts = {
    note: "\n✂️ *Trecho:* {$1} → {$2}",
    range_too_long: "O trecho pode ter no máximo *6 minutos*.",
    source_too_long: "Para recortar, o vídeo do YouTube pode ter até *3 horas*.",
    source_too_long_other: "Para recortar, o vídeo pode ter até *30 minutos*.",
    start_after_end: "O trecho começa depois do fim do vídeo (duração: {$1}).",
}
