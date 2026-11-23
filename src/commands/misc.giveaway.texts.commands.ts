/*
 * Guia e mensagens do sistema de sorteios (!sorteio ...). Arquivo próprio, para que misc.list e
 * misc.giveaway.functions usem os textos sem ciclo de importação.
 */

export const giveawayGuide = `🎁 *SORTEIOS DO SINFOROSO*\n\n` +
    `*Sortear um número (como antes)*\n` +
    `Ex: *{$p}sorteio* 100 - Sorteia um número de 1 a 100.\n\n` +
    `*Criar (só administradores do grupo)*\n` +
    `Ex: *{$p}sorteio novo* Elden Ring (Steam) | 1h - Abre inscrições por 1 hora e sorteia 1 vencedor no fim.\n` +
    `Ex: *{$p}sorteio novo* Gift Card R$ 50 | amanhã 20h | 3 - Encerra amanhã às 20h e sorteia 3 vencedores.\n` +
    `Ex: *{$p}sorteio novo* PK7M2Q | 1h - Usa o *prêmio guardado* PK7M2Q (ou o nome dele): já vinculado, entrega automática.\n` +
    `Ex: *{$p}sorteio relampago* Chave Steam | 1 - Sorteio *na hora* entre os membros do grupo, com animação.\n` +
    `Ex: *{$p}sorteio caca* Hollow Knight | 30m - *Caça à chave*: 4 códigos (A–D), só 1 certo; quem acertar primeiro, no privado do bot, ganha.\n` +
    `Acrescente *| sem admins* no fim para os administradores não participarem.\n\n` +
    `*Prêmio guardado antes (recomendado, no privado do bot)*\n` +
    `Ex: *{$p}sorteio premio* Elden Ring (Steam) | XXXXX-XXXXX-XXXXX - Guarda o prêmio e devolve um *código* (ex.: *PK7M2Q*).\n` +
    `Depois, no grupo: *{$p}sorteio novo* PK7M2Q | 1h (ou o nome do prêmio) - O sorteio já nasce vinculado e o vencedor recebe a chave *sozinho*, no privado.\n` +
    `Ex: *{$p}sorteio premios* - Seus prêmios guardados · *{$p}sorteio apagar* PK7M2Q - Apaga um prêmio não usado.\n` +
    `Várias chaves = vários vencedores (separe por espaço ou uma por linha).\n\n` +
    `*Sem prêmio guardado*: o sorteio sai só com o nome e o bot avisa *você*, no privado, quem ganhou, para entregar manualmente. Também dá para cadastrar a chave depois: *{$p}sorteio chave* ID XXXXX-XXXXX.\n\n` +
    `*Participar*\n` +
    `Ex: *{$p}sorteio entrar* ID - Entra no sorteio (sem ID, entra no único aberto do grupo).\n` +
    `Ex: *{$p}sorteio sair* ID - Sai antes do encerramento.\n` +
    `Ex: *{$p}sorteio tentar* ID B - Tenta a opção B na caça à chave (*no privado do bot*).\n` +
    `Ex: *{$p}sorteio resgatar* ID - O vencedor recebe o prêmio de novo no privado.\n\n` +
    `*Consultar*\n` +
    `Ex: *{$p}sorteio ativos* · *{$p}sorteio status* ID (ou *resultado* ID) · *{$p}sorteio historico* · *{$p}sorteio verificar* ID\n` +
    `Ex: *{$p}sorteio guia* ou *{$p}sorteio ajuda* - Mostra este guia.\n\n` +
    `*Administrar*\n` +
    `Ex: *{$p}sorteio fechar* ID - Encerra agora e sorteia.\n` +
    `Ex: *{$p}sorteio cancelar* ID - Cancela (o prêmio continua guardado).\n` +
    `Ex: *{$p}sorteio animacao* - Liga/desliga as animações neste grupo (padrão: ligadas).\n\n` +
    `*Horários*: 30m · 1h · 2d (daqui a quanto tempo) · às 20h · 20:00 · amanhã 20h · 25/12 18h (Brasília).\n` +
    `*Justo e verificável*: o sorteio usa números aleatórios criptográficos. O código de verificação é publicado na abertura e conferido no fim com *{$p}sorteio verificar*.\n` +
    `*Atenção*: sorteios de *empresas para divulgar produtos ou serviços* são promoções comerciais e precisam de autorização da Secretaria de Prêmios e Apostas (Lei 5.768/1971).\n`

export const giveawayTexts = {
    created: "🎁 *SORTEIO ABERTO!*\n\n🎮 *Prêmio:* {$1}\n🏆 *Vencedores:* {$2}\n📅 *Encerramento:* {$3} (em {$4}){$5}\n\n🎟️ Para participar, envie:\n*{$p}sorteio entrar {$6}*\n\n✅ Participação gratuita.\n🔐 Verificação: {$7}\n🔖 ID: *{$6}*\n\nBoa sorte, galera! 🍀",
    createdAdminTip: "ℹ️ Sorteio *{$1}* criado *sem prêmio guardado*: quando acabar, o bot te avisa aqui quem ganhou, para você entregar. Prefere entrega automática? Cadastre a chave aqui no privado: *{$p}sorteio chave {$1} SUA-CHAVE*.",
    noAdmins: "\n🚫 Administradores não participam.",
    huntCreated: "🔐 *DESAFIO SINFOROSO — CAÇA À CHAVE!*\n\n🎮 *Prêmio:* {$1}\n\nUma das quatro opções é o código verdadeiro:\n\n*A* — {$2}\n*B* — {$3}\n*C* — {$4}\n*D* — {$5}\n\n🔥 Mande a sua resposta *no privado do bot*:\n*{$p}sorteio tentar {$6} LETRA*\n🎯 Tentativas por pessoa: {$7}\n⏳ Encerramento: {$8} (em {$9})\n🏁 Vence o primeiro acerto que *chegar ao bot*.{$10}\n🔖 ID: *{$6}*",
    relampagoIntro: "🎮 *ATENÇÃO, GALERA!*\n\nO Sinforoso vai sortear agora:\n\n🏆 *Prêmio:* {$1}\n👥 *Participantes:* {$2}\n🔐 Verificação: {$3}\n\n🎬 Preparando o grande resultado...",
    joined: "🎟️ *INSCRIÇÃO CONFIRMADA!*\n\nVocê está no sorteio *{$1}*.\n🎮 *Prêmio:* {$2}\n👥 *Participantes:* {$3}\n⏳ *Encerra:* {$4}\n\nBoa sorte! 🍀",
    alreadyJoined: "Você já está inscrito neste sorteio! 🎟️ ({$1} participantes)",
    left: "✅ Você saiu do sorteio *{$1}*. Participantes: {$2}.",
    notJoined: "Você não estava inscrito neste sorteio.",
    huntWrong: "❌ Não foi dessa vez. Tentativas restantes: *{$1}*.",
    huntCorrect: "🎉 *VOCÊ ACERTOU!* A opção certa era essa. O resultado foi anunciado no grupo e o prêmio vem aqui no privado.",
    keysAdded: "🔐 *Prêmio guardado no cofre* (sorteio {$1})\n\n{$2}\n\n📦 Prêmios cadastrados: {$3} de {$4} vencedor(es).{$5}",
    keysDuplicate: "\n⚠️ {$1} chave(s) ignorada(s): já estavam cadastradas em outro sorteio.",
    keysNeedGiveaway: "Não achei o sorteio *{$1}*.\n\n✅ *Quer guardar a chave antes de criar o sorteio?* Use aqui no privado:\n*{$p}sorteio premio* Nome do Prêmio | SUA-CHAVE\nVocê recebe um *código do prêmio* (ex.: *PK7M2Q*). Depois, no grupo: *{$p}sorteio novo* PK7M2Q | 1h — o sorteio já nasce vinculado e o vencedor recebe sozinho.\n\n🔖 *Já criou o sorteio?* Use o ID dele (aparece na mensagem do grupo e no seu privado):\n*{$p}sorteio chave* ID SUA-CHAVE",
    prizeLinked: "\n\n🔐 *Prêmio já guardado* ({$1} chave(s)): o vencedor recebe *automaticamente* no privado.",
    prizeManual: "\n\n📦 *Entrega*: o organizador envia o prêmio ao vencedor.",
    prizeFewer: "\n⚠️ Há mais vencedores que chaves: {$1} vencedor(es) receberão pelo organizador (ou cadastre mais chaves com *{$p}sorteio chave*).",
    packageStored: "🔐 *Prêmio guardado no cofre*\n\n🎮 {$1}\n{$2}\n\n📦 Chaves: {$3}\n🏷️ *Código do prêmio: {$4}*{$5}\n\nAgora, no *grupo*, crie o sorteio com o código (ou o nome):\n*{$p}sorteio novo* {$4} | 1h\n*{$p}sorteio relampago* {$4}\n*{$p}sorteio caca* {$4} | 30m",
    packageLinkedTip: "🔗 Prêmio *{$1}* vinculado ao sorteio *{$2}* ({$3} chave(s)). O vencedor recebe sozinho no privado; você não precisa fazer nada.{$4}",
    packageNotFound: "Não achei o prêmio *{$1}* entre os *seus* prêmios guardados. Veja a lista com *{$p}sorteio premios* (no privado do bot).",
    packagesPrivateOnly: "🔐 Os prêmios guardados são vistos e gerenciados só no *privado* do bot.",
    packagesTitle: "🔐 *Seus prêmios guardados* ({$1})\n\n",
    packagesItem: "🏷️ *{$1}* — {$2} · {$3} chave(s)\n",
    packagesFooter: "\nUse no grupo: *{$p}sorteio novo* CÓDIGO | 1h",
    packagesEmpty: "Você não tem prêmios guardados. Guarde um aqui no privado:\n*{$p}sorteio premio* Nome do Prêmio | SUA-CHAVE",
    packageDeleted: "🗑️ Prêmio *{$1}* ({$2}) apagado do cofre.",
    keysPrivateOnly: "🔐 Por segurança, cadastre a chave só no *privado* do bot. Se você mandou a chave aqui, ela já pode ter sido vista: considere usar outra.",
    huntPrivateOnly: "🔐 Mande a sua tentativa no *privado* do bot, para não revelar a resposta para o grupo.",
    activeTitle: "🎁 *Sorteios abertos* ({$1})\n\n",
    activeItem: "🔖 *{$1}* — {$2}\n{$3} · ⏳ {$4}\n\n",
    activeEmpty: "Nenhum sorteio aberto neste grupo agora.",
    historyTitle: "📜 *Últimos sorteios*\n\n",
    historyItem: "🔖 *{$1}* — {$2} · {$3}\n",
    historyEmpty: "Nenhum sorteio encerrado ainda neste grupo.",
    status: "🎁 *Sorteio {$1}*\n\n🎮 *Prêmio:* {$2}\n📌 *Tipo:* {$3}\n📍 *Situação:* {$4}\n👥 *Participantes:* {$5}\n🏆 *Vencedores:* {$6}\n📅 *Encerramento:* {$7}{$8}",
    cancelled: "🗑️ Sorteio *{$1}* cancelado. Os prêmios cadastrados continuam guardados.",
    verify: "🔐 *Verificação do sorteio {$1}*\n\n📌 Algoritmo: {$2}\n🔒 Compromisso (publicado na abertura):\n{$3}\n🔑 Semente revelada:\n{$4}\n🧾 Hash da lista de participantes ({$5}):\n{$6}\n✅ Conferência: {$7}\n\n_Como conferir: SHA-256 da semente = compromisso; o vencedor sai de HMAC-SHA256(semente, hash da lista:contador) com amostragem por rejeição sobre a lista em ordem alfabética._",
    verifyPending: "🔒 *Sorteio {$1}* ainda aberto.\n\nCompromisso publicado: {$2}\n\nA semente só é revelada no encerramento, para ninguém conseguir prever o resultado.",
    claimNotWinner: "Você não é vencedor deste sorteio.",
    claimSent: "📩 Prêmio reenviado aqui no privado.",
    claimWaitingKey: "O organizador ainda não cadastrou o prêmio. Assim que cadastrar, ele chega aqui automaticamente.",
    animationsOn: "✅ Animações dos sorteios *ligadas* neste grupo.",
    animationsOff: "✅ Animações dos sorteios *desligadas* neste grupo (só texto).",
    needId: "Informe o ID do sorteio. Veja os abertos com *{$p}sorteio ativos*.",
    needGroup: "Use este comando dentro do *grupo* do sorteio.",
    errorFormat: "Formato: *{$p}sorteio {$1}* Prêmio | {$2}",
    errorOption: "Opção desconhecida. Veja tudo com *{$p}sorteio ajuda*.",
}
