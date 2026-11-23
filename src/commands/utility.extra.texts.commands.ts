/*
 * Guias e mensagens dos comandos de lembretes, enquetes e consultas brasileiras (CEP, CNPJ,
 * feriados, loterias e rastreio). Arquivo próprio, como utility.automation.texts, para que
 * utility.list e utility.extra.functions usem os textos sem ciclo de importação.
 */

const whenExamples = `*Formatos de horário* (Brasília):\n` +
    `• 10m · 45min · 30 minutos · em 2h · daqui 1h30\n` +
    `• 18h · 18:30 · 18h30 (hoje; se já passou, amanhã)\n` +
    `• amanhã 9h · depois de amanhã 10h · sexta 18h\n` +
    `• 25/12 15h · 25/12/2027 08:00\n` +
    `• todo dia 8h · toda segunda 9h (repete)\n` +
    `*Obs*: "2h" sozinho é horário (02:00). Para duração use "em 2h" ou "2 horas".\n`

export const extraTexts = {
    lembrete: {
        guide: `Ex: *{$p}lembrete* 18h30 tomar remédio\n` +
            `Ex: *{$p}lembrete* amanhã 9h ligar para o médico\n` +
            `Ex: *{$p}lembrete* em 20 minutos tirar o bolo do forno\n` +
            `Ex: *{$p}lembrete* todo dia 8h beber água\n\n` +
            whenExamples +
            `\nNo grupo o lembrete sai no grupo, marcando você; no privado, sai no privado.\n` +
            `Se o bot estiver desligado ou sem internet no horário, o lembrete sai assim que ele voltar.\n` +
            `Veja os seus com *{$p}lembretes* e apague com *{$p}rmlembrete* número.\n`,
        msgs: {
            reply: "⏰ Lembrete criado para *{$1}*:\n\n{$2}",
        },
    },
    lembretes: {
        guide: `Ex: *{$p}lembretes* - Lista os seus lembretes neste chat e, no grupo, as mensagens agendadas.\n\n*Obs*: Cada item tem um número; apague com *{$p}rmlembrete* número. Crie com *{$p}lembrete*.\n`,
        msgs: {
            reply_title: "⏰ *Lembretes e agendamentos* ({$1})\n\n",
            reply_item_personal: "*{$1}.* {$2}\n   📝 {$3}\n\n",
            reply_item_group: "*{$1}.* 📢 {$2} _(mensagem do grupo)_\n   📝 {$3}\n\n",
            reply_footer: "Para apagar: *{$p}rmlembrete* número",
            reply_empty: "Nenhum lembrete neste chat. Crie com *{$p}lembrete* 18h texto.",
        },
    },
    rmlembrete: {
        guide: `Ex: *{$p}rmlembrete* 2 - Apaga o lembrete número 2 da lista de *{$p}lembretes*.\n\n` +
            `*Obs*: Mensagens agendadas do grupo só podem ser apagadas por administradores do grupo.\n`,
        msgs: {
            reply: "🗑️ Apagado: _{$1}_",
            error_number: "Informe o número da lista. Veja com *{$p}lembretes*.",
        },
    },
    enquete: {
        guide: `Ex: *{$p}enquete* Qual dia do churrasco? | Sábado | Domingo\n\n` +
            `Ex: *{$p}enquete* multi O que levar? | Carne | Bebida | Gelo - permite marcar *várias* opções.\n\n` +
            `Cria uma *enquete nativa do WhatsApp* (votação com toque, contagem automática).\n` +
            `*Limites*: de 2 a 12 opções, separadas por *|*.\n`,
        msgs: {
            error_format: "Use: *{$p}enquete* Pergunta | opção 1 | opção 2 (de 2 a 12 opções, separadas por |).",
            error_duplicate: "Há opções repetidas. Cada opção precisa ser diferente.",
            error_length: "Pergunta ou opção longa demais (pergunta até 255 e opções até 100 caracteres).",
        },
    },
    cep: {
        guide: `Ex: *{$p}cep* 01310-100 - Mostra o endereço do CEP.\n\n` +
            `Ex: *{$p}cep* Av. São Sebastião, 2840, Parnaíba, PI - *Descobre o CEP pelo endereço*.\n` +
            `Ex: *{$p}cep* Rua Augusta, 1500, Consolação, São Paulo, SP\n\n` +
            `*Endereço*: rua, número, bairro, cidade e UF, separados por vírgula (número e bairro ajudam a achar o CEP exato; com ou sem acento).\n` +
            `Ruas grandes têm um CEP para cada faixa de números: com o número, o bot escolhe a faixa certa.\n` +
            `*Fonte*: ViaCEP (base dos Correios), com BrasilAPI de reserva.\n`,
        msgs: {
            reply: "📮 *CEP {$1}*\n\n{$2}",
            reply_not_found: "❌ CEP *{$1}* não encontrado.",
            reply_address_title: "📮 *CEP pelo endereço*\n🔎 _{$1}_\n\n",
            reply_address_exact: "✅ *CEP provável: {$1}*\n{$2}\n\n",
            reply_address_options: "📋 *Possíveis CEPs* ({$1}):\n\n",
            reply_address_item: "• *{$1}* - {$2}\n",
            reply_address_more: "\n_...e mais {$1}. Informe número e bairro para filtrar._",
            reply_address_hint: "\nℹ️ Informe o *número* da casa para o bot escolher a faixa certa.",
            reply_address_none: "❌ Nenhum CEP encontrado para esse endereço.\n\nConfira o nome da rua e da cidade. Cidades pequenas costumam ter *um CEP único* para a cidade toda.\n🔗 Busca oficial: https://buscacepinter.correios.com.br/app/endereco/index.php",
        },
    },
    cnpj: {
        guide: `Ex: *{$p}cnpj* 00.000.000/0001-91 - Dados públicos da empresa (Receita Federal).\n\n` +
            `Mostra razão social, situação, atividade, endereço, contato público e sócios.\n` +
            `*Fonte*: BrasilAPI (dados abertos da Receita), com minhareceita.org de reserva.\n`,
        msgs: {
            reply_not_found: "❌ CNPJ *{$1}* não encontrado na base da Receita Federal.",
        },
    },
    feriados: {
        guide: `Ex: *{$p}feriados* - Próximos feriados nacionais.\n\n` +
            `Ex: *{$p}feriados* 2027 - Todos os feriados nacionais de 2027.\n\n` +
            `*Obs*: Feriados estaduais e municipais variam por cidade e não estão incluídos.\n*Fonte*: BrasilAPI.\n`,
        msgs: {
            reply_next_title: "📅 *Próximos feriados nacionais*\n\n",
            reply_year_title: "📅 *Feriados nacionais de {$1}*\n\n",
            reply_item: "{$1} *{$2}* ({$3}) - {$4}\n",
            reply_today: "🎉 *Hoje é feriado: {$1}!*\n\n",
            reply_footer: "\n_Feriados estaduais e municipais não incluídos._",
        },
    },
    loteria: {
        guide: `Ex: *{$p}loteria* - Último resultado da Mega-Sena.\n\n` +
            `Ex: *{$p}loteria* lotofacil\n` +
            `Ex: *{$p}loteria* quina 6500 - Resultado de um concurso específico.\n\n` +
            `*Jogos*: mega, lotofacil, quina, lotomania, timemania, duplasena, diadesorte, supersete, maismilionaria.\n` +
            `*Fonte*: portal oficial de loterias da Caixa.\n`,
        msgs: {},
    },
    rastreio: {
        guide: `Ex: *{$p}rastreio* AA123456785BR - Mostra a situação atual e o histórico da encomenda dos Correios.\n\n` +
            `Antes de consultar, o bot confere o formato e o *dígito verificador* (código com erro de digitação não gasta consulta).\n` +
            `O resultado fica guardado por 30 minutos: consultar o mesmo código de novo é instantâneo.\n` +
            `*Limite*: 10 consultas novas por pessoa por dia (o servidor tem 1.000 consultas grátis por mês).\n` +
            `*Obs*: Sem a chave da API de rastreio no servidor, o bot só confere o código e manda o link oficial dos Correios.\n`,
        msgs: {
            reply_valid: "📦 *Rastreio {$1}*\n\n✅ Código válido{$2}\n\n🔗 Acompanhe no site oficial dos Correios (cole o código):\n{$3}",
            reply_invalid_digit: "⚠️ O código *{$1}* tem o formato certo, mas o *dígito verificador não confere*: provavelmente há um erro de digitação. Confira com quem enviou.",
            reply_invalid: "❌ *{$1}* não parece um código de rastreio. O formato é 2 letras, 9 números e 2 letras (ex.: AA123456785BR).",
            no_events: "Ainda não há movimentação para este objeto. Pode levar até 24 horas depois da postagem para aparecer.",
            api_error: "📦 *Rastreio {$1}*\n\n⚠️ {$2}\n\n🔗 Acompanhe no site oficial dos Correios (cole o código):\n{$3}",
            api_down: "O serviço de rastreio não respondeu. Tente de novo em instantes.",
            limit: "⏳ Você já fez {$1} consultas de rastreio novas hoje (limite diário para não acabar a cota do mês).\n\n🔗 Acompanhe no site oficial: {$2}",
        },
    },
}
