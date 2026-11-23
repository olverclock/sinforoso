/*
 * Guias e mensagens do motor de documentos (!pdf, !ocr, !topdf, !pdfdocx).
 * Todo o processamento é LOCAL, no servidor do bot: nenhum documento é enviado a terceiros.
 */

const privacy = `*Privacidade*: tudo é processado no próprio servidor do bot; nada é enviado para sites externos. Os arquivos são apagados ao terminar.\n`

export const documentTexts = {
    pdf: {
        guide: `📄 *Ferramentas de PDF* — responda um PDF (ou envie o PDF com o comando na legenda):\n\n` +
            `Ex: *{$p}pdf info* - Páginas, tamanho e se tem senha.\n` +
            `Ex: *{$p}pdf texto* - Extrai o texto do PDF.\n` +
            `Ex: *{$p}pdf separar* 10 a 50 - Cria um PDF novo só com as páginas 10 a 50 (também: *10-50*).\n` +
            `Ex: *{$p}pdf extrair* 1-3,5 - Mantém só essas páginas.\n` +
            `Ex: *{$p}pdf remover* 2,4 - Tira essas páginas.\n` +
            `Ex: *{$p}pdf dividir* - Um PDF por página (ou *{$p}pdf dividir 10* em partes de 10).\n` +
            `Ex: *{$p}pdf girar* 90 - Gira todas as páginas (90, 180 ou 270). Também: *{$p}pdf girar 90 1-2*.\n` +
            `Ex: *{$p}pdf comprimir* - Reduz o tamanho (*alta*, *media* ou *baixa* qualidade; padrão: media).\n` +
            `Ex: *{$p}pdf imagens* - Páginas em JPG (ou *{$p}pdf imagens 1-3 png*).\n` +
            `Ex: *{$p}pdf pesquisavel* - OCR: transforma PDF escaneado em PDF pesquisável.\n` +
            `Ex: *{$p}pdf ocr* - Igual ao *{$p}ocrpdf*: qualquer arquivo em PDF pesquisável.\n` +
            `Ex: *{$p}pdf proteger* senha - Coloca senha (AES-256).\n` +
            `Ex: *{$p}pdf desproteger* senha - Tira a senha (precisa saber a senha).\n\n` +
            `*Vários arquivos:*\n` +
            `Ex: *{$p}pdf juntar* - Depois envie os PDFs, um por mensagem, e finalize com *{$p}pdf pronto*.\n` +
            `Ex: *{$p}pdf fotos* - Depois envie as imagens e finalize com *{$p}pdf pronto*: vira um PDF.\n` +
            `Ex: *{$p}pdf cancelar* - Cancela a coleta.\n\n` +
            `*Limites*: 25 MB por arquivo, 200 páginas (30 no OCR). *Obs*: use *proteger/desproteger* no privado para não expor a senha.\n` + privacy,
        msgs: {
            wait: "⏳ Processando seu documento...",
            queued: "⏳ Seu documento entrou na fila (posição {$1}). Já te envio.",
            info: "📄 *Informações do PDF*\n\n- *Páginas*: {$1}\n- *Tamanho*: {$2}\n- *Protegido por senha*: {$3}\n- *Título*: {$4}\n- *Autor*: {$5}\n- *Página*: {$6}",
            text_title: "📝 *Texto do PDF*\n\n",
            text_empty: "Este PDF não tem texto digital (é escaneado). Use *{$p}ocr* respondendo o PDF.",
            compressed: "🗜️ PDF comprimido: *{$1}* → *{$2}* ({$3}% menor).",
            compressed_none: "Este PDF já está otimizado; não deu para reduzir mais sem perder qualidade.",
            done: "✅ Pronto!",
            extracted: "✅ Pronto! PDF novo com as páginas *{$1}*.",
            split_done: "✅ PDF dividido em {$1} arquivo(s).",
            session_merge: "📥 *Juntar PDFs*: envie os PDFs agora, um por mensagem, na ordem desejada. Quando terminar, envie *{$p}pdf pronto*. (Expira em 10 minutos.)",
            session_images: "📥 *Imagens → PDF*: envie as imagens agora, na ordem desejada. Quando terminar, envie *{$p}pdf pronto*. (Expira em 10 minutos.)",
            session_added: "📎 Arquivo {$1} recebido.",
            session_cancelled: "✅ Coleta cancelada.",
            session_none: "Nenhuma coleta aberta. Use *{$p}pdf juntar* ou *{$p}pdf fotos*.",
            session_few: "Envie pelo menos {$1} arquivo(s) antes de *pronto*.",
            session_wrong_type: "Esse arquivo não é {$1}; ignorei. Continue enviando ou use *{$p}pdf pronto*.",
            error_need_pdf: "Responda um *PDF* (ou envie o PDF com o comando na legenda).",
            error_option: "Opção desconhecida. Veja as opções com *{$p}pdf guia*.",
            error_need_pages: "Informe as páginas. Ex: *{$p}pdf separar 10 a 50* ou *{$p}pdf extrair 1-3,5*",
            error_need_password: "Informe a senha. Ex: *{$p}pdf proteger minhaSenha*",
        },
    },
    ocr: {
        guide: `Ex: Responda uma *imagem* com *{$p}ocr* - Lê o texto da foto (português e inglês).\n\n` +
            `Ex: Responda um *PDF* com *{$p}ocr* - Extrai o texto; se for escaneado, usa OCR página por página.\n\n` +
            `*Dica*: foto bem iluminada, reta e nítida dá resultado muito melhor. O OCR reconhece texto impresso; letra de mão costuma falhar.\n` + privacy,
        msgs: {
            reply: "🔤 *Texto reconhecido*{$1}\n\n{$2}",
            ocr_note: " (OCR)",
            empty: "Não encontrei texto legível. Tente uma foto mais nítida, reta e bem iluminada.",
            error_need_file: "Responda uma *imagem* ou um *PDF* com *{$p}ocr*.",
            sent_as_file: "📝 O texto ficou longo; enviei como arquivo .txt.",
        },
    },
    ocrpdf: {
        guide: `Ex: Responda um *PDF escaneado, imagem, DOCX, DOC, ODT, RTF ou TXT* com *{$p}ocrpdf* - Gera um *PDF pesquisável* (dá para buscar e copiar o texto).\n\n` +
            `Também funciona com o comando na legenda do arquivo.\n\n` +
            `Páginas que já têm texto digital ficam como estão (sem perder qualidade); só as páginas escaneadas passam pelo OCR (português e inglês).\n` +
            `O PDF gerado mantém o nome do arquivo original.\n` +
            `*Limites*: 25 MB, 200 páginas, até 30 páginas escaneadas.\n` + privacy,
        msgs: {
            done: "✅ PDF pesquisável pronto! OCR em *{$1}* de *{$2}* página(s).",
            done_no_ocr: "✅ Pronto! As {$1} página(s) já tinham texto digital: o PDF já é pesquisável, nenhuma precisou de OCR.",
            error_need_file: "Responda um *PDF, imagem, DOCX, DOC, ODT, RTF ou TXT* com *{$p}ocrpdf* (ou envie o arquivo com o comando na legenda).",
        },
    },
    topdf: {
        guide: `Ex: Responda um *DOCX, DOC, ODT, RTF, XLSX ou TXT* com *{$p}topdf* - Converte para PDF.\n\n` +
            `Ex: Responda uma *imagem* com *{$p}topdf* - Imagem em PDF (para várias imagens: *{$p}pdf fotos*).\n\n` +
            `Ex: *{$p}topdf* seu texto aqui - Transforma o texto digitado em PDF.\n\n` +
            `*Limite*: 25 MB.\n` + privacy,
        msgs: {
            error_need_file: "Responda um documento (DOCX, DOC, ODT, RTF, XLSX, TXT) ou uma imagem, ou digite um texto depois do comando.",
            already_pdf: "Esse arquivo já é PDF. Veja as ferramentas com *{$p}pdf guia*.",
        },
    },
    pdfdocx: {
        guide: `Ex: Responda um *PDF* com *{$p}pdfdocx* - Gera um DOCX com o *texto editável* do PDF (escaneado passa por OCR).\n\n` +
            `*Atenção*: o DOCX traz o texto para editar; *não* reproduz o layout original (colunas, tabelas e imagens).\n` + privacy,
        msgs: {
            done: "✅ DOCX com o texto editável{$1}. O layout original não é reproduzido.",
            ocr_note: " (texto reconhecido por OCR — revise)",
        },
    },
    upload: {
        guide: `Ex: Responda qualquer arquivo (documento, foto, vídeo ou áudio) com *{$p}upload* - Gera um link para baixar, pelo storage.to.\n\n` +
            `Ex: *{$p}upload 7* - O link vale 7 dias (de 1 a 7; padrão: 3).\n` +
            `Ex: *{$p}upload 7 minhaSenha* - Link com senha (4 a 100 caracteres).\n\n` +
            `*Atenção*: o arquivo é enviado para o *storage.to* (empresa do Reino Unido) e qualquer pessoa com o link consegue baixar até expirar. Não envie documentos sigilosos sem senha, e use senha no privado para não expô-la no grupo.\n` +
            `*Limites*: 100 MB por arquivo no bot; 50 arquivos por dia sem conta no storage.to. Não aceita .exe, .scr, .com, .pif, .apk e .ipa.\n`,
        msgs: {
            wait: "⏫ Enviando para o storage.to...",
            reply: "📤 *Arquivo compartilhado!*\n\n📄 *{$1}*{$2}\n🔗 {$3}\n⏳ *Expira em*: {$4}{$5}",
            password_note: "\n🔒 Protegido por senha.",
            error_need_file: "Responda um arquivo (documento, foto, vídeo ou áudio) com *{$p}upload*.",
            error_size: "O arquivo passa do limite de {$1} MB para envio pelo bot.",
            error_days: "Os dias de validade vão de 1 a 7. Ex: *{$p}upload 7*",
            error_password: "A senha precisa ter de 4 a 100 caracteres, sem espaços.",
        },
    },
}
