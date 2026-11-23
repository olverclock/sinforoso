import * as downloadFunctions from './download.functions.commands.js'

const downloadCommands = {
    play: {
        guide: `Ex: *{$p}play* Evidências Chitãozinho e Xororó - Procura a música no YouTube e envia o áudio.\n\nEx: *{$p}play* https://youtu.be/... - Também aceita o link do vídeo.\n\n*Limite*: vídeos de até 6 minutos.\n`,
        msgs: {
            wait: "[AGUARDE] 🎧 Sua música está sendo baixada e processada.\n\n"+
            "*Título*: {$1}\n"+
            "*Duração*: {$2}",
            error_limit: "O vídeo deve ter no máximo *6 minutos*",
            error_live: "Esse vídeo não pode ser convertido em áudio, lives não são aceitas.",
            error_not_found: "Nenhum áudio foi encontrado"
        },
        function: downloadFunctions.playCommand
    },
    yt: {
        guide: `Ex: *{$p}yt* gol do Brasil - Procura no YouTube e envia o vídeo.\n\nEx: *{$p}yt* https://youtu.be/... - Também aceita o link do vídeo.\n\n*Qualidade*: a melhor que couber no limite (até 1080p e 50 MB), sem recomprimir.\n*Limite*: vídeos de até 6 minutos; transmissões ao vivo não são baixadas.\n`,
        msgs: {
            wait: "[AGUARDE] 🎥 Seu video está sendo baixado e processado.\n\n"+
            "*Título*: {$1}\n"+
            "*Duração*: {$2}",
            error_limit: "O video deve ter no máximo *6 minutos*",
            error_live: "Houve um erro de download, o bot não aceita download de lives.",
            error_not_found: "Nenhum vídeo foi encontrado"
        },
        function: downloadFunctions.ytCommand
    },
    fb: {
        guide: `Ex: *{$p}fb* https://www.facebook.com/watch?v=... - Baixa e envia o vídeo do Facebook.\n\n*Limite*: vídeos públicos de até 6 minutos.\n`,
        msgs: {
            wait: "[AGUARDE] 🎬 Sua mídia está sendo baixada e processada.\n\n"+
            "*Título*: {$1}\n"+
            "*Duração*: {$2}",
            error_limit: "O video deve ter no máximo *6 minutos*"
        },
        function: downloadFunctions.fbCommand
    },
    ig: {
        guide: `Ex: *{$p}ig* https://www.instagram.com/reel/... - Baixa e envia o vídeo ou o reel do Instagram.\n\n*Obs*: Funciona com posts, reels e carrosséis *públicos* que tenham vídeo. Posts só com fotos exigem login no Instagram e não são baixados.\n`,
        msgs: {
            wait: "[AGUARDE] 🎬 Sua mídia está sendo baixada e processada.\n\n"+
            "*Autor*: {$1} (@{$2})\n"+
            "*Descrição*: {$3}\n"+
            "*Likes*: {$4}",
        },
        function: downloadFunctions.igCommand
    },
    x: {
        guide: `Ex: *{$p}x* https://x.com/usuario/status/... - Baixa e envia o vídeo ou a imagem do post do X (Twitter).\n`,
        msgs: {
            wait: "[AGUARDE] 🎬 Sua mídia está sendo baixada e processada.\n\n"+
            "*Postagem*: {$1}",
            error_not_found: 'Não foi encontrada nenhuma mídia, verifique o link'
        },
        function: downloadFunctions.xCommand
    },
    tk: {
        guide: `Ex: *{$p}tk* https://www.tiktok.com/@usuario/video/... - Baixa e envia o vídeo do TikTok.\n`,
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