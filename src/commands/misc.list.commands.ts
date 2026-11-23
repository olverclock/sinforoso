import * as miscFunctions from './misc.functions.commands.js'
import { giveawayGuide } from './misc.giveaway.texts.commands.js'

const miscCommands = {
    sorteio: {
        guide: giveawayGuide,
        msgs: {
            reply: `🎲 *Sorteio (Número)*: \n\n` +
                `O número sorteado foi *{$1}*`,
            error_invalid_value: 'O valor do número inserido é inválido, escolha um número maior que 1.'
        },
        function: miscFunctions.sorteioCommand
    },
    sorteiomembro: {
        guide: `Ex: *{$p}sorteiomembro* - Sorteia um membro aleatório do grupo.\n\n` +
            `Ex: *{$p}sorteiomembro* 3 - Sorteia 3 membros diferentes.\n\n` +
            `Ex: *{$p}sorteiomembro* 2 Ingresso do show - Sorteia 2 membros e mostra o prêmio.\n\n` +
            `*Obs*: Com número ou prêmio, o bot fica de fora e ninguém é sorteado duas vezes (máximo 50).\n`,
        msgs: {
            reply: `🎲 *Sorteio (Membro)*: \n\n` +
                `O membro sorteado foi @{$1}`,
            reply_many: `🎲 *Sorteio (Membros)*{$1}\n\n` +
                `🏆 Sorteado(s):\n{$2}`,
            reply_prize: `\n🎁 *Prêmio*: {$1}`,
            error_count: "Quantidade inválida: sorteie de 1 a 50 membros.",
            error_not_enough: "O grupo só tem {$1} membro(s) para sortear.",
        },
        function: miscFunctions.sorteiomembroCommand
    },
    mascote: {
        guide: `Ex: *{$p}mascote* - Mostra a imagem do inigualável e onipotente Sinforoso Jr.\n`,
        msgs: {
            reply: 'Sinforoso Jr.'
        },
        function: miscFunctions.mascoteCommand
    },
    /*
    simi: {
        guide: `Ex: *{$p}simi* frase  - Envia um texto para o SimSimi responder.\n`,
        msgs: {
            reply: `🐤 *SimSimi*: \n\n`+
            `{$1}: {$2}`,
        },
        function: miscFunctions.simiCommand
    },*/
    viadometro: {
        guide: `Ex: *{$p}viadometro* @membro - Mede o nível de viadagem do membro mencionado.\n\n` +
            `Ex: Responder com *{$p}viadometro* - Mede o nível de viadagem do membro respondido.\n`,
        msgs: {
            error_mention: "Apenas um membro deve ser marcado por vez.",
            error_message: "Houve um erro ao obter os dados da mensagem.",
            reply: "🏳️‍🌈 *Viadômetro*\n\n" +
                'Foi detectado um nível de viadagem de *{$1}%*'
        },
        function: miscFunctions.viadometroCommand
    },
    detector: {
        guide: `Ex: Responda a mensagem de alguém com *{$p}detector* - A \"máquina da verdade\" diz se é verdade ou mentira (brincadeira).\n\n*Obs*: só funciona em *grupos*.\n`,
        msgs: {
            wait: "⏳ Calibrando a máquina da verdade",
            error_message: "Houve um erro ao obter os dados da mensagem."
        },
        function: miscFunctions.detectorCommand
    },
    roletarussa: {
        guide: `Ex: *{$p}roletarussa* - Testa a sua sorte na roleta russa (só uma brincadeira: ninguém é removido).\n`,
        msgs: {
            reply_alive: '🔫 *Roleta russa*\n\n' +
                "😁 A arma não disparou, você sobreviveu a roleta russa.",
            reply_dead: '🔫 *Roleta russa*\n\n' +
                "💀 A arma disparou, você morreu.",
        },
        function: miscFunctions.roletarussaCommand
    },
    casal: {
        guide: `Ex: *{$p}casal* - Escolhe 2 membros aleatórios do grupo para formar um casal (brincadeira).\n\n*Obs*: só funciona em *grupos* com pelo menos 2 membros.\n`,
        msgs: {
            error: "Este comando precisa de no mínimo 2 membros no grupo.",
            reply: '👩‍❤️‍👨 *Casal*\n\n' +
                "💕 Está rolando um clima entre @{$1} e @{$2}"
        },
        function: miscFunctions.casalCommand
    },
    caracoroa: {
        guide: `Ex: *{$p}caracoroa* cara - Escolhe cara e joga a moeda.\n\n` +
            `Ex: *{$p}caracoroa* coroa - Escolhe coroa e joga a moeda.\n`,
        msgs: {
            wait: "🪙 Lançando a moeda ",
            reply_victory: "😁 *Vitória!*\n\n" +
                "O resultado caiu *{$1}*\n",
            reply_defeat: "😭 *Derrota!*\n\n" +
                "O resultado caiu *{$1}*\n"
        },
        function: miscFunctions.caracoroaCommand
    },
    ppt: {
        guide: `Ex: *{$p}ppt* pedra - Escolhe pedra, para jogar pedra, papel ou tesoura.\n\n` +
            `Ex: *{$p}ppt* papel - Escolhe papel, para jogar pedra, papel ou tesoura.\n\n` +
            `Ex: *{$p}ppt* tesoura - Escolhe tesoura, para jogar pedra, papel ou tesoura.\n`,
        msgs: {
            error: "[❗] Você deve escolher entre *pedra*, *papel*  ou *tesoura*",
            reply_victory: "😁 *Vitória!*\n\n" +
                "Você escolheu {$1} e o bot escolheu {$2}\n",
            reply_defeat: "😭 *Derrota!*\n\n" +
                "Você escolheu {$1} e o bot escolheu {$2}\n",
            reply_draw: "😐 *Empate!*\n\n" +
                "Você escolheu {$1} e o bot escolheu {$2}\n"
        },
        function: miscFunctions.pptCommand
    },
    gadometro: {
        guide: `Ex: *{$p}gadometro* @membro - Mede o nível de gadisse do membro mencionado.\n\n` +
            `Ex: Responder com *{$p}gadometro* - Mede o nível de gadisse do membro respondido.\n`,
        msgs: {
            error_mention: "Apenas um membro deve ser marcado por vez.",
            error_message: "Houve um erro ao obter os dados da mensagem.",
            reply: "🐃 *Gadômetro*\n\n" +
                'Foi detectado um nível de gado de *{$1}%*'
        },
        function: miscFunctions.gadometroCommand
    },
    bafometro: {
        guide: `Ex: *{$p}bafometro* @membro - Mede o nível de alcool do membro mencionado.\n\n` +
            `Ex: Responder com *{$p}bafometro* - Mede o nível de alcool do membro respondido.\n`,
        msgs: {
            reply: "🍺 *Bafômetro*\n\n" +
                'Foi detectado um nível de álcool de *{$1}%*',
            error_mention: "Apenas um membro deve ser marcado por vez.",
            error_message: "Houve um erro ao obter os dados da mensagem.",
        },
        function: miscFunctions.bafometroCommand
    },
    top5: {
        guide: `Ex: *{$p}top5* mais atrasados - Faz um ranking de 5 membros aleatórios com o tema escolhido (brincadeira).\n\n*Obs*: só funciona em *grupos* com pelo menos 5 membros.\n`,
        msgs: {
            error_members: "O grupo deve ter no mínimo 5 membros para usar este comando.",
            reply_title: "🏆 *TOP 5 {$1}*\n\n",
            reply_item: "{$1} {$2}° Lugar - @{$3}\n"
        },
        function: miscFunctions.top5Command
    },
    par: {
        guide: `Ex: *{$p}par* @membro1 @membro2 - Mede a compatibilidade entre os dois membros marcados (brincadeira).\n\n*Obs*: só funciona em *grupos*; marque exatamente 2 pessoas.\n`,
        msgs: {
            reply: "👩‍❤️‍👨 *Par*\n\n" +
                'A chance de compatibilidade entre @{$1} e @{$2} é de *{$3}%*'
        },
        function: miscFunctions.parCommand
    },
    chance: {
        guide: `Ex: *{$p}chance* ficar rico - Calcula a chance (de 0 a 100%) de algo acontecer (brincadeira).\n\nEx: Responda a mensagem de alguém com *{$p}chance* passar na prova - A resposta vai para essa pessoa.\n`,
        msgs: {
            reply: "📊 *Chance*\n\n" +
                'Você tem *{$1}%* de chance de *{$2}*',
        },
        function: miscFunctions.chanceCommand
    },
    frase: {
        guide: `Ex: *{$p}frase* - Envia uma frase engraçada e duvidosa do Sinforoso Jr, com imagem.\n\n*Obs*: Para frases positivas e inspiradoras, use *{$p}fraseagora*.\n`,
        msgs: {
            reply: "🙊 *Frases do Sinforoso.*\n\n" +
                '{$1}'
        },
        function: miscFunctions.fraseCommand
    },
    curiosidade: {
        guide: `Ex: *{$p}curiosidade* - Envia um fato aleatório e interessante.\n`,
        msgs: {
            reply: "💡 *VOCÊ SABIA?*\n\n{$1}"
        },
        function: miscFunctions.curiosidadeCommand
    },
    horoscopo: {
        guide: `Ex: *{$p}horoscopo* aries - Mostra a previsão do dia para o signo.\n\n*Signos*: aries, touro, gemeos, cancer, leao, virgem, libra, escorpiao, sagitario, capricornio, aquario e peixes (com ou sem acento).\n`,
        msgs: {
            reply: "✨ *HORÓSCOPO DO DIA: {$1}* ✨\n\n{$2}"
        },
        function: miscFunctions.horoscopoCommand
    },
    piada: {
        guide: `Ex: *{$p}piada* - Envia uma piada aleatória em português.\n`,
        msgs: {
            reply: "🤡 *LÁ VEM A PIADA...*\n\n{$1}"
        },
        function: miscFunctions.piadaCommand
    }
}

export default miscCommands