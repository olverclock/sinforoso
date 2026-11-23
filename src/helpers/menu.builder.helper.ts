import { Bot } from "../interfaces/bot.interface.js"

// ——————— [ DESIGN CONSTANTS ] ——————— //
const LINE_H = "━";
const CORNER_TL = "╭";
const CORNER_BL = "╰";
const SIDE = "┃";
const BULLET = "➣";
const DECO = "✦";

const header = (title: string) => `${CORNER_TL}${LINE_H.repeat(2)} ${DECO} *${title}* ${DECO}`;
const footer = (text: string) => `${CORNER_BL}${LINE_H.repeat(2)} ${DECO} _*${text}*_ ${DECO}`;
const section = (title: string) => `\n${SIDE} ${DECO} ${title}`;
const item = (cmd: string, desc: string) => `${SIDE} ${BULLET} *${cmd}* \n${SIDE}   ▫️ _${desc}_`;
const itemSimple = (cmd: string, desc: string) => `${SIDE} ${BULLET} *${cmd}* ▫️ _${desc}_`;

// MENU PRINCIPAL
export const mainMenu = (botInfo: Bot) => {
    let { name, prefix } = botInfo;
    return `${header(`🤖 ${name?.trim()}`)}
${SIDE}
${section(`🔎 MENU PRINCIPAL`)}
${itemSimple(`${prefix}menu 0`, "❓ Informação")}
${itemSimple(`${prefix}menu 1`, "🖼️ Figurinhas")}
${itemSimple(`${prefix}menu 2`, "⚒️ Utilidades")}
${itemSimple(`${prefix}menu 3`, "📥 Downloads")}
${itemSimple(`${prefix}menu 4`, "🧩 Variado")}
${SIDE}
${footer("Feito por: olver")}`;
}

// MENU PRINCIPAL (GRUPO)
export const mainMenuGroup = (botInfo: Bot) => {
    let { name, prefix } = botInfo;
    return `${header(`🤖 ${name?.trim()}`)}
${SIDE}
${section(`🔎 MENU PRINCIPAL`)}
${itemSimple(`${prefix}menu 0`, "❓ Informação")}
${itemSimple(`${prefix}menu 1`, "🖼️ Figurinhas")}
${itemSimple(`${prefix}menu 2`, "⚒️ Utilidades")}
${itemSimple(`${prefix}menu 3`, "📥 Downloads")}
${itemSimple(`${prefix}menu 4`, "🧩 Variado")}
${itemSimple(`${prefix}menu 5`, "👨‍👩‍👧‍👦 Grupo")}
${SIDE}
${footer("Feito por: olver")}`;
}

// MENU - STICKER
export const stickerMenu = (botInfo: Bot) => {
    let { name, prefix } = botInfo;
    return `${header(`🤖 ${name?.trim()}`)}
${SIDE}
${SIDE} Guia ❔: *${prefix}comando* guia
${SIDE}
${section(`🖼️ FIGURINHAS`)}
${item(`${prefix}s`, "Imagem/vídeo para sticker")}
${item(`${prefix}s 1`, "Imagem para sticker (circular)")}
${item(`${prefix}s 2`, "Imagem para sticker (sem corte)")}
${item(`${prefix}snome`, "pack, autor - Renomeia sticker")}
${item(`${prefix}simg`, "Sticker para imagem")}
${item(`${prefix}ssf`, "Imagem para sticker (sem fundo)")}
${item(`${prefix}emojimix`, "💩+😀 - Emoji para sticker")}
${SIDE}
${footer("Feito por: olver")}`;
}

// MENU - INFO
export const infoMenu = (botInfo: Bot) => {
    let { name, prefix } = botInfo;
    return `${header(`🤖 ${name?.trim()}`)}
${SIDE}
${SIDE} Guia ❔: *${prefix}comando* guia
${SIDE}
${section(`❓ INFO/SUPORTE`)}
${item(`${prefix}info`, "Informações do bot")}
${item(`${prefix}reportar`, "texto - Reporte um problema")}
${item(`${prefix}meusdados`, "Exibe seus dados de uso")}
${SIDE}
${footer("Feito por: olver")}`;
}

// MENU - DOWNLOAD
export const downloadMenu = (botInfo: Bot) => {
    let { name, prefix } = botInfo;
    return `${header(`🤖 ${name?.trim()}`)}
${SIDE}
${SIDE} Guia ❔: *${prefix}comando* guia
${SIDE}
${section(`📥 DOWNLOADS`)}
${item(`${prefix}play`, "nome - Áudio do Youtube")}
${item(`${prefix}yt`, "nome - Vídeo do Youtube")}
${item(`${prefix}fb`, "link - Vídeo do Facebook")}
${item(`${prefix}ig`, "link - Videos/imagens do Instagram")}
${item(`${prefix}x`, "link - Videos/imagens do X")}
${item(`${prefix}tk`, "link - Vídeo do Tiktok")}
${item(`${prefix}img`, "tema - Imagens do Google")}
${SIDE}
${footer("Feito por: olver")}`;
}

// MENU - UTILIDADE
export const utilityMenu = (botInfo: Bot) => {
    let { name, prefix } = botInfo;
    return `${header(`🤖 ${name?.trim()}`)}
${SIDE}
${SIDE} Guia ❔: *${prefix}comando* guia
${SIDE}
${section(`⚒️ UTILITÁRIOS`)}
${SIDE}
${section(`🔎 CONSULTAS/TEXTO`)}
${item(`${prefix}brasileirao`, "Tabela do Brasileirão")}
${item(`${prefix}animes`, "Últimos lançamentos de animes")}
${item(`${prefix}mangas`, "Últimos lançamentos de mangás")}
${item(`${prefix}filmes`, "Tendências atuais de filmes")}
${item(`${prefix}series`, "Tendências atuais de séries")}
${item(`${prefix}encurtar`, "link - Encurtador de link")}
${item(`${prefix}letra`, "musica - Letra de música")}
${item(`${prefix}traduz`, "idioma texto - Tradutor de texto")}
${item(`${prefix}pesquisa`, "texto - Pesquisa do Google")}
${item(`${prefix}clima`, "cidade - Previsão do tempo")}
${item(`${prefix}noticias`, "Notícias atuais")}
${item(`${prefix}moeda`, "tipo valor - Conversor de moeda")}
${item(`${prefix}calc`, "expressao - Calculadora")}
${item(`${prefix}ddd`, "Informação do DDD")}
${item(`${prefix}tabela`, "Tabela de caracteres")}
${item(`${prefix}bitcoin`, "Cotação atual do Bitcoin (BRL/USD/EUR)")}
${item(`${prefix}free`, "Jogos grátis do momento e alertas")}
${SIDE}
${section(`🤖 AUTOMAÇÕES`)}
${item(`${prefix}jogosgratis`, "Posta jogos grátis (Epic, Steam, GOG...) no chat")}
${item(`${prefix}alertalive`, "Liga/desliga avisos de live")}
${item(`${prefix}addlive`, "link - Adiciona canal (Twitch, Kick, YouTube, TikTok)")}
${item(`${prefix}rmlive`, "link - Remove canal dos avisos")}
${item(`${prefix}lives`, "Canais monitorados e quem está ao vivo")}
${item(`${prefix}frases`, "Liga/desliga frases automáticas")}
${item(`${prefix}frasehora`, "HH:MM - Horário diário das frases")}
${item(`${prefix}fraseintervalo`, "tempo - Frases a cada X tempo")}
${item(`${prefix}fraseagora`, "Uma frase inspiradora agora")}
${item(`${prefix}scanlinks`, "Liga/desliga proteção de links (VirusTotal)")}
${item(`${prefix}scan`, "link - Verifica link ou arquivo no VirusTotal")}
${SIDE}
${section(`📄 DOCUMENTOS`)}
${item(`${prefix}pdf`, "opção - Separar páginas, juntar, comprimir, girar, senha...")}
${item(`${prefix}ocr`, "Lê o texto de imagem ou PDF escaneado")}
${item(`${prefix}ocrpdf`, "Qualquer arquivo em PDF pesquisável (OCR)")}
${item(`${prefix}topdf`, "DOCX, DOC, TXT, imagem ou texto em PDF")}
${item(`${prefix}pdfdocx`, "PDF em DOCX com texto editável")}
${item(`${prefix}upload`, "Gera link para baixar um arquivo (storage.to)")}
${SIDE}
${section(`⏰ LEMBRETES E ENQUETES`)}
${item(`${prefix}lembrete`, "18h30 texto - Lembrete (amanhã 9h, 10m, todo dia 8h...)")}
${item(`${prefix}lembretes`, "Seus lembretes e os agendamentos do grupo")}
${item(`${prefix}rmlembrete`, "número - Apaga um lembrete")}
${item(`${prefix}enquete`, "Pergunta | op1 | op2 - Enquete nativa do WhatsApp")}
${SIDE}
${section(`🇧🇷 CONSULTAS BRASIL`)}
${item(`${prefix}cep`, "CEP ou endereço - Endereço do CEP ou CEP do endereço")}
${item(`${prefix}cnpj`, "número - Dados públicos da empresa")}
${item(`${prefix}feriados`, "[ano] - Próximos feriados nacionais")}
${item(`${prefix}loteria`, "[jogo] [concurso] - Resultados da Caixa")}
${item(`${prefix}rastreio`, "código - Confere o código e link dos Correios")}
${SIDE}
${section(`🔊 AUDIO`)}
${item(`${prefix}ouvir`, "Áudio para texto")}
${item(`${prefix}audio`, "Extrai áudio de um video")}
${item(`${prefix}efeitoaudio`, "tipo - Adiciona efeito no áudio")}
${item(`${prefix}voz`, "pt texto - Texto para áudio")}
${SIDE}
${section(`🖼️ IMAGENS`)}
${item(`${prefix}upimg`, "Upload de imagem")}
${item(`${prefix}rbg`, "Removedor de fundo")}
${SIDE}
${section(`❔ RECONHECIMENTO`)}
${item(`${prefix}qualmusica`, "Reconhecimento de música")}
${item(`${prefix}qualanime`, "Reconhecimento de anime")}
${SIDE}
${footer("Feito por: olver")}`;
}

// MENU - GRUPO
export const groupMenu = (botInfo: Bot) => {
    let { name, prefix } = botInfo;
    return `${header(`🤖 ${name?.trim()}`)}
${SIDE}
${SIDE} Guia ❔: *${prefix}comando* guia
${SIDE}
${section(`👨‍👩‍👧‍👦 GRUPO`)}
${SIDE}
${section(`🛠️ GERAL`)}
${item(`${prefix}grupo`, "Dados do grupo")}
${item(`${prefix}adms`, "Lista de administradores")}
${item(`${prefix}dono`, "Dono do grupo")}
${item(`${prefix}regras`, "Regras do grupo")}
${item(`${prefix}discord`, "Servidores do Discord do grupo")}
${SIDE}
${section(`🎁 AMIGO SECRETO`)}
${item(`${prefix}amigosecreto entrar`, "Entra no amigo secreto do grupo")}
${item(`${prefix}amigosecreto lista`, "Quem está participando")}
${item(`${prefix}amigosecreto meu`, "Reenvia no privado quem você tirou")}
${SIDE}
${footer("Feito por: olver")}`;
}

// MENU - GRUPO (ADMINISTRADOR)
export const groupAdminMenu = (botInfo: Bot) => {
    let { name, prefix } = botInfo;
    return `${header(`🤖 ${name?.trim()}`)}
${SIDE}
${SIDE} Guia ❔: *${prefix}comando* guia
${SIDE}
${section(`👨‍👩‍👧‍👦 GRUPO`)}
${SIDE}
${section(`🛠️ GERAL`)}
${item(`${prefix}grupo`, "Dados do grupo")}
${item(`${prefix}adms`, "Lista de administradores")}
${item(`${prefix}fotogrupo`, "Altera foto do grupo")}
${item(`${prefix}mt`, "texto - Marca membros/admins com uma mensagem")}
${item(`${prefix}mm`, "texto - Marca membros com uma mensagem")}
${item(`${prefix}marcar`, "texto - Marca todos (invisível; \"lista\" mostra os @; ou responda uma msg)")}
${item(`${prefix}dono`, "Dono do grupo")}
${item(`${prefix}agendar`, "18h texto - Agenda mensagem no grupo (repete: toda segunda 8h)")}
${SIDE}
${section(`🎮 DISCORD`)}
${item(`${prefix}discord`, "Mostra os convites do Discord do grupo")}
${item(`${prefix}discord add`, "Nome | link - Adiciona convite")}
${item(`${prefix}discord rm`, "Nome - Remove convite")}
${SIDE}
${section(`📜 REGRAS`)}
${item(`${prefix}regras`, "Mostra as regras do grupo")}
${item(`${prefix}setregras`, "texto - Define as regras")}
${item(`${prefix}rmregras`, "Apaga as regras")}
${item(`${prefix}regrasauto`, "Envia as regras para quem entrar")}
${SIDE}
${section(`🎁 AMIGO SECRETO`)}
${item(`${prefix}amigosecreto criar`, "[obs] - Cria (valor, data...)")}
${item(`${prefix}amigosecreto entrar`, "Entra / sair - Sai")}
${item(`${prefix}amigosecreto lista`, "Participantes")}
${item(`${prefix}amigosecreto sortear`, "Sorteia e avisa cada um no privado")}
${item(`${prefix}amigosecreto cancelar`, "Apaga o amigo secreto")}
${SIDE}
${section(`👤 MEMBROS`)}
${item(`${prefix}membro`, "@membro - Mostra os dados do membro")}
${item(`${prefix}topativos`, "Marca os 10 membros mais ativos")}
${item(`${prefix}inativos`, "numero - Marca os membros com menos de X mensagens")}
${SIDE}
${section(`⌨️ ADMINISTRATIVO`)}
${item(`${prefix}add`, "+55 219xxxxxxxx - Adiciona ao grupo")}
${item(`${prefix}ban`, "@membro - Bane do grupo")}
${item(`${prefix}aviso`, "@membro - Adiciona um aviso a um membro")}
${item(`${prefix}rmaviso`, "@membro - Remove 1 aviso de um membro")}
${item(`${prefix}zeraravisos`, "Zera avisos de todos os membros")}
${item(`${prefix}restrito`, "Abre/feche o grupo só para admin")}
${item(`${prefix}promover`, "@membro - Promove a admin")}
${item(`${prefix}rebaixar`, "@admin - Rebaixa a membro")}
${item(`${prefix}link`, "Link do grupo")}
${item(`${prefix}rlink`, "Redefine o link do grupo")}
${item(`${prefix}apg`, "Apaga mensagem")}
${SIDE}
${section(`🧰 RECURSOS`)}
${SIDE}
${section(`✉️ BEM VINDO`)}
${item(`${prefix}bemvindo`, "Ativa/desativa a mensagem de bem-vindo")}
${SIDE}
${section(`🤫 MUTAR GRUPO`)}
${item(`${prefix}mutar`, "Ativa/desativa comandos só para admins")}
${SIDE}
${section(`🏞️ STICKER AUTOMATICO`)}
${item(`${prefix}autosticker`, "Ativa/desativa criação automática de stickers")}
${SIDE}
${section(`🚫 ANTI-LINK`)}
${item(`${prefix}antilink`, "Ativa/desativa o anti-link")}
${item(`${prefix}addexlink`, "Adiciona links as exceções do anti-link")}
${item(`${prefix}rmexlink`, "Remove links das exceções do anti-link")}
${SIDE}
${section(`🚫 ANTI-FAKE`)}
${item(`${prefix}antifake`, "Ativa/desativa o anti-fake")}
${item(`${prefix}addexfake`, "Add prefixos/numeros as exceções do anti-fake")}
${item(`${prefix}rmexfake`, "Remove prefixos/numeros as exceções do anti-fake")}
${SIDE}
${section(`🚫 ANTI-FLOOD`)}
${item(`${prefix}antiflood`, "Ativa/desativa o anti-flood")}
${SIDE}
${section(`🤖 VERIFICAÇÃO DE NOVOS MEMBROS`)}
${item(`${prefix}verificacao`, "[minutos] - Continha anti-robô; remove quem não responder")}
${SIDE}
${section(`🚨 ANTI-GOLPE`)}
${item(`${prefix}antigolpe`, "Ativa/desativa o filtro de golpes (Pix, tigrinho, código...)")}
${SIDE}
${section(`🤖 RESPOSTA AUTOMÁTICA`)}
${item(`${prefix}autoresp`, "Ativa/desativa as respostas automáticas")}
${item(`${prefix}respostas`, "Exibe as respostas configuradas")}
${item(`${prefix}addresp`, "palavra resposta - Adiciona resposta")}
${item(`${prefix}rmresp`, "palavra - Remove resposta")}
${SIDE}
${section(`🔒 BLOQUEIO DE COMANDOS`)}
${item(`${prefix}bcmd`, "!cmd1 !cmd2 - Bloqueia os comandos")}
${item(`${prefix}dcmd`, "!cmd1 !cmd2 - Desbloqueia os comandos")}
${SIDE}
${section(`🗒️ LISTA NEGRA`)}
${item(`${prefix}listanegra`, "Exibe a lista negra")}
${item(`${prefix}addlista`, "+55 219xxxxxxxx - Adiciona a lista negra")}
${item(`${prefix}rmlista`, "+55 219xxxxxxxx - Remove da lista negra")}
${SIDE}
${section(`🚫 FILTRO DE PALAVRAS`)}
${item(`${prefix}addfiltros`, "palavra - Adiciona palavras ao filtro")}
${item(`${prefix}rmfiltros`, "palavra - Remove palavras do filtro")}
${SIDE}
${footer("Feito por: olver")}`;
}

// MENU - VARIADO
export const miscMenu = (botInfo: Bot) => {
    let { name, prefix } = botInfo;
    return `${header(`🤖 ${name?.trim()}`)}
${SIDE}
${SIDE} Guia ❔: *${prefix}comando* guia
${SIDE}
${section(`🕹️ JOGOS`)}
${item(`${prefix}ppt`, "opção - Joga pedra, papel e tesoura")}
${item(`${prefix}caracoroa`, "Joga cara ou coroa")}
${item(`${prefix}roletarussa`, "Joga roleta russa")}
${item(`${prefix}showdomilhao`, "Joga o clássico Show do Milhão")}
${item(`${prefix}casino`, "valor - Tente a sorte no Cassino")}
${SIDE}
${section(`🎲 SORTEIO`)}
${item(`${prefix}sorteio`, "numero - Sorteia um número até esse valor.")}
${item(`${prefix}sorteio premio`, "Nome | CHAVE - Guarda o prêmio e devolve o código para o sorteio")}
${item(`${prefix}sorteio premios`, "Seus prêmios guardados")}
${SIDE}
${section(`🧩 ENTRETENIMENTO`)}
${item(`${prefix}mascote`, "Onipotente e onipresente Sinforoso Jr")}
${item(`${prefix}frase`, "Frase dúvidosa do Sinforoso Jr")}
${item(`${prefix}chance`, "texto - Chance de algo acontecer")}
${item(`${prefix}oraculo`, "pergunta - Tire suas dúvidas com o Oráculo")}
${item(`${prefix}curiosidade`, "Fato aleatório interessante")}
${item(`${prefix}piada`, "Envia uma piada aleatória")}
${item(`${prefix}horoscopo`, "[signo] - Previsão do dia")}
${item(`${prefix}fortnite`, "[nick] - Estatísticas de BR")}
${item(`${prefix}roll`, "Sorteia um personagem para colecionar")}
${item(`${prefix}inv`, "Resumo da sua coleção de personagens")}
${item(`${prefix}colecao`, "Exibe cartas separadas por raridade")}
${item(`${prefix}cartas`, "[pág] - Galeria de miniaturas (5/pág)")}
${item(`${prefix}carta`, "[#] - Detalhes e imagem de uma carta")}
${item(`${prefix}trade`, "@user [#] - Propõe uma troca segura")}
${item(`${prefix}leilao`, "[#] [lote] - Leilão valendo XP")}
${item(`${prefix}vender`, "[#] - Vende carta por 20% do XP")}
${SIDE}
${footer("Feito por: olver")}`;
}

// MENU - VARIADO (GRUPO)
export const miscGroupMenu = (botInfo: Bot) => {
    let { name, prefix } = botInfo;
    return `${header(`🤖 ${name?.trim()}`)}
${SIDE}
${SIDE} Guia ❔: *${prefix}comando* guia
${SIDE}
${section(`🕹️ JOGOS`)}
${item(`${prefix}ppt`, "opcão - Joga pedra, papel e tesoura")}
${item(`${prefix}caracoroa`, "Joga cara ou coroa")}
${item(`${prefix}roletarussa`, "Joga roleta russa")}
${item(`${prefix}showdomilhao`, "Joga o clássico Show do Milhão em equipe")}
${item(`${prefix}casino`, "valor - Tente a sorte no Cassino")}
${SIDE}
${section(`🎲 SORTEIO`)}
${item(`${prefix}sorteio`, "numero - Sorteia um número até esse valor.")}
${item(`${prefix}sorteiomembro`, "[qtd] [prêmio] - Sorteia membro(s) do grupo.")}
${item(`${prefix}sorteio novo`, "Prêmio ou código | 1h - Sorteio com inscrições e entrega no privado (admin)")}
${item(`${prefix}sorteio relampago`, "Prêmio - Sorteio na hora com animação (admin)")}
${item(`${prefix}sorteio caca`, "Prêmio | 30m - Caça à chave: 4 códigos, só 1 certo (admin)")}
${item(`${prefix}sorteio entrar`, "Entra no sorteio aberto do grupo")}
${item(`${prefix}sorteio ajuda`, "Todos os comandos dos sorteios")}
${SIDE}
${section(`🧩 ENTRETENIMENTO`)}
${item(`${prefix}mascote`, "Onipotente e onipresente Sinforoso Jr")}
${item(`${prefix}frase`, "Frase dúvidosa do Sinforoso Jr")}
${item(`${prefix}viadometro`, "Nível de viadagem")}
${item(`${prefix}detector`, "Detector de mentira")}
${item(`${prefix}casal`, "Escolhe um casal")}
${item(`${prefix}gadometro`, "Nível de gado")}
${item(`${prefix}chance`, "texto - Chance de algo acontecer")}
${item(`${prefix}bafometro`, "Nível de álcool")}
${item(`${prefix}top5`, "tema - Ranking de top 5")}
${item(`${prefix}par`, "@pessoa1 @pessoa2 - Nível de compatibilidade")}
${item(`${prefix}oraculo`, "pergunta - Tire suas dúvidas com o Oráculo")}
${item(`${prefix}curiosidade`, "Fato aleatório interessante")}
${item(`${prefix}piada`, "Envia uma piada aleatória")}
${item(`${prefix}horoscopo`, "[signo] - Previsão do dia")}
${item(`${prefix}bolao`, "[evento] - Inicia um bolão")}
${item(`${prefix}fortnite`, "[nick] - Estatísticas de BR")}
${item(`${prefix}roll`, "Sorteia um personagem para colecionar")}
${item(`${prefix}inv`, "Veja sua coleção de personagens")}
${item(`${prefix}trade`, "@user [#] - Propõe uma troca")}
${item(`${prefix}leilao`, "[#] [lance] - Inicia um leilão")}
${item(`${prefix}vender`, "[#] - Vende carta por XP")}
${SIDE}
${footer("Feito por: olver")}`;
}

// MENU - ADMIN
export const adminMenu = (botInfo: Bot) => {
    let { prefix, name } = botInfo;
    return `${header(`🤖 ${name?.trim()}`)}
${SIDE}
${SIDE} Guia ❔: *${prefix}comando* guia
${SIDE}
${section(`⚙️ ADMINISTRAÇÃO`)}
${SIDE}
${section(`🛠️ GERAL`)}
${item(`${prefix}info`, "Informação do bot")}
${item(`${prefix}ping`, "Informação do sistema")}
${item(`${prefix}bloquear`, "@usuario - Bloqueia o usuário")}
${item(`${prefix}desbloquear`, "@usuario - Desbloqueia o usuário")}
${item(`${prefix}listablock`, "Lista de usuários bloqueados")}
${item(`${prefix}bcgrupos`, "texto - Mensagem para todos os grupos")}
${item(`${prefix}desligar`, "Desliga o bot")}
${item(`${prefix}backup`, "[lista|enviar] - Backup dos dados (automático às 4h)")}
${item(`${prefix}backup drive`, "Conecta o Google Drive para guardar os backups")}
${SIDE}
${section(`🎨 CUSTOMIZAÇÃO`)}
${item(`${prefix}nomebot`, "nome - Altera nome do bot")}
${item(`${prefix}prefixo`, "simbolo - Altera o prefixo dos comandos")}
${item(`${prefix}fotobot`, "Altera foto do bot")}
${item(`${prefix}recado`, "texto - Altera o texto do recado/status")}
${SIDE}
${section(`👨‍👩‍👧‍👦 GRUPOS`)}
${item(`${prefix}grupos`, "Dados dos grupos atuais")}
${item(`${prefix}entrargrupo`, "link - Entra no grupo")}
${SIDE}
${section(`👤 USUÁRIOS`)}
${item(`${prefix}usuario`, "@usuario - Dados do usuário")}
${SIDE}
${section(`⭐ ADMINS`)}
${item(`${prefix}admins`, "Administradores do bot")}
${item(`${prefix}addadmin`, "Promove a admin do bot")}
${item(`${prefix}rmadmin`, "Rebaixa a usuário do bot")}
${SIDE}
${section(`🧰 RECURSOS`)}
${SIDE}
${section(`🏞️ AUTO-STICKER PRIVADO`)}
${item(`${prefix}autostickerpv`, "Ativa/desativa sticker automático privado")}
${SIDE}
${section(`🔒 BLOQUEIO DE COMANDOS`)}
${item(`${prefix}bcmdglobal`, "!cmd1 !cmd2 - Bloqueia comandos globalmente")}
${item(`${prefix}dcmdglobal`, "!cmd1 !cmd2 - Desbloqueia comandos globalmente")}
${SIDE}
${section(`⭐ MODO ADMIN`)}
${item(`${prefix}modoadmin`, "Ativa/desativa modo apenas admins")}
${SIDE}
${section(`⏳ TAXA DE COMANDOS`)}
${item(`${prefix}taxacomandos`, "numero - Ativa/desativa taxa de comandos")}
${SIDE}
${section(`📩 MENSAGENS PRIVADAS`)}
${item(`${prefix}comandospv`, "Ativa/desativa comandos em PV")}
${SIDE}
${footer("Feito por: olver")}`;
}
