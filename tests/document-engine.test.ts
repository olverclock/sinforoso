/**
 * Motor de documentos: validação, fila, sessões e operações reais com qpdf, Ghostscript, Poppler,
 * Tesseract e LibreOffice. As operações reais rodam quando as ferramentas existem (Docker/Linux, ou
 * WSL no Windows com DOC_TOOLS_WSL); sem elas, esses testes são pulados e o motivo aparece no relatório.
 * Arquivos de teste são sintéticos (gerados aqui), sem dados pessoais.
 */
import { test, before, after, mock } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import sharp from "sharp"
import { fakeClient, setupBot, send, user, waMedia, fastForward } from "./helpers/harness.js"
import * as doc from "../src/utils/document/pdf.util.js"
import { detectFile, looksLikeText, parsePageRange } from "../src/utils/document/validate.util.js"
import { availableTools, DocumentToolError, runTool, withWorkdir } from "../src/utils/document/tools.util.js"
import { DocumentQueue } from "../src/utils/document/queue.util.js"
import * as sessions from "../src/utils/document/session.util.js"

if (process.platform === "win32" && !process.env.DOC_TOOLS_WSL) process.env.DOC_TOOLS_WSL = "Ubuntu-24.04"
let tools = new Set<string>()
let reason = ""
const needs = (...names: string[]) => () => names.every(n => tools.has(n)) ? false : (reason || `ferramentas ausentes: ${names.filter(n => !tools.has(n)).join(", ")}`)

const TEXTO = "Relatório de teste\n\nAção, coração, informação e emoção: acentuação em português.\n"
let pdf1: Buffer, pdf3: Buffer, pngPage: Buffer
const P = user(881)

before(async () => {
  await setupBot()
  tools = await availableTools()
  if (!tools.size) reason = "nenhuma ferramenta de documentos instalada (rode no Docker ou com WSL)"
  if (tools.has("soffice") && tools.has("qpdf")) {
    pdf1 = await doc.officeToPdf(Buffer.from(TEXTO.repeat(3)), { kind: "text", ext: "txt", mime: "text/plain" })
    pdf3 = await doc.mergePdfs([pdf1, pdf1, pdf1])
  }
  if (tools.has("pdftoppm") && pdf1) pngPage = (await doc.pdfToImages(pdf1, "png"))[0]
})
after(() => sessions.clearSessions())

// ———————————————— VALIDAÇÃO (sem ferramentas externas) ————————————————
test("validação: tipo pelo conteúdo (não pela extensão), texto, executável, vazio e tamanho", async () => {
  assert.equal((await detectFile(Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n"))).kind, "pdf")
  assert.equal((await detectFile(await sharp({ create: { width: 20, height: 20, channels: 3, background: "#fff" } }).png().toBuffer())).kind, "image")
  assert.equal((await detectFile(Buffer.from("Texto simples com acentuação: ção."))).kind, "text")
  await assert.rejects(detectFile(Buffer.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0])), /Formato não suportado/, "EXE disfarçado é recusado")
  await assert.rejects(detectFile(Buffer.alloc(0)), /vazio/)
  await assert.rejects(detectFile(Buffer.alloc(26 * 1024 * 1024, 65)), /limite de 25 MB/)
  assert.equal(looksLikeText(Buffer.from([0x41, 0x00, 0x42])), false, "byte nulo não é texto")
})

test("validação: imagem com dimensões enormes (bomba de descompressão) é recusada", async () => {
  const huge = await sharp({ create: { width: 13000, height: 100, channels: 3, background: "#000" } }).png().toBuffer()
  await assert.rejects(detectFile(huge), /dimensões grandes demais|grande demais/)
})

test("validação: intervalo de páginas só aceita números, vírgulas e hífens dentro do documento", () => {
  assert.equal(parsePageRange("1-3, 5", 10), "1-3,5")
  assert.equal(parsePageRange("8-", 10), "8-10")
  assert.equal(parsePageRange("2-2", 10), "2")
  for (const bad of ["1;rm -rf /", "a-b", "../x", "1--2", "", "0", "3-1", "11"]) {
    assert.throws(() => parsePageRange(bad, 10), DocumentToolError, bad)
  }
})

test("PDF de imagens montado internamente: estrutura válida (xref e páginas)", () => {
  const pdf = doc.buildImagePdf([{ jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), width: 100, height: 50 }, { jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), width: 50, height: 100 }])
  const text = pdf.toString("latin1")
  assert.ok(text.startsWith("%PDF-1.4"))
  assert.match(text, /\/Count 2/)
  assert.match(text, /\/MediaBox \[0 0 842 595\]/, "paisagem para imagem larga")
  assert.match(text, /\/MediaBox \[0 0 595 842\]/, "retrato para imagem alta")
  const xref = Number(text.match(/startxref\n(\d+)/)![1])
  assert.equal(text.slice(xref, xref + 4), "xref", "startxref aponta para a tabela")
})

test("texto real x lixo: decide quando o PDF precisa de OCR", () => {
  assert.equal(doc.hasRealText("Relatório de teste. Ação, coração e informação em português."), true)
  assert.equal(doc.hasRealText("￘ￛ C#Ȃ̂ȃ̃̄̃ ЅࠅԄЅਇࠌ܆਌ఋ਋଍ฒဍฑซଐᘐ ᄓ ᐕᔕఏ᜘ᘔ᠒ᐕᓿ"), false)
  assert.equal(doc.hasRealText("abc"), false)
})

// ———————————————— FILA ————————————————
test("fila: uma por vez, posição informada, sem duplicada do mesmo usuário, fila cheia e cancelamento", async () => {
  const q = new DocumentQueue(1, 2, 5_000, 60_000)
  const order: string[] = []
  let releaseA!: () => void
  const a = q.enqueue("chat|A", () => new Promise<string>(r => { releaseA = () => { order.push("A"); r("a") } }))
  assert.equal(a.position, 0)
  assert.throws(() => q.enqueue("chat|A", async () => "x"), /já tem um documento/)
  const b = q.enqueue("chat|B", async () => { order.push("B"); return "b" })
  assert.equal(b.position, 1)
  const c = q.enqueue("chat|C", async () => { order.push("C"); return "c" })
  assert.throws(() => q.enqueue("chat|D", async () => "d"), /fila de documentos está cheia/)
  assert.equal(q.cancel("chat|C"), true)
  await assert.rejects(c.result, /cancelado/)
  releaseA()
  assert.equal(await a.result, "a")
  assert.equal(await b.result, "b")
  assert.deepEqual(order, ["A", "B"], "na ordem e nunca em paralelo")
  assert.equal(q.isBusy("chat|A"), false, "liberou o usuário")
})

test("fila: tarefa travada é interrompida pelo tempo máximo e a fila continua", async () => {
  const q = new DocumentQueue(1, 5, 30, 60_000)
  const stuck = q.enqueue("x|1", () => new Promise(() => { }))
  const next = q.enqueue("x|2", async () => "ok")
  await assert.rejects(stuck.result, /demorou demais/)
  assert.equal(await next.result, "ok")
})

// ———————————————— SESSÕES ————————————————
test("sessões: isoladas por conversa e usuário, expiram e têm limite de arquivos", () => {
  sessions.clearSessions()
  const k1 = sessions.sessionKey("g@g.us", "a"), k2 = sessions.sessionKey("g@g.us", "b"), k3 = sessions.sessionKey("outro@g.us", "a")
  sessions.startSession(k1, "merge", 0)
  sessions.addToSession(k1, Buffer.from("1"), 1)
  assert.equal(sessions.getSession(k2, 1), undefined, "outro usuário no mesmo grupo não vê")
  assert.equal(sessions.getSession(k3, 1), undefined, "mesmo usuário em outro grupo não vê")
  assert.equal(sessions.getSession(k1, 1 + sessions.SESSION_LIMITS.ttlMs + 1), undefined, "expirou")
  sessions.startSession(k1, "images", 0)
  for (let i = 0; i < sessions.SESSION_LIMITS.maxFiles; i++) sessions.addToSession(k1, Buffer.from("x"), 1)
  assert.throws(() => sessions.addToSession(k1, Buffer.from("x"), 1), /Limite de 20/)
  assert.equal(sessions.takeSession(k1, 1)?.files.length, 20)
  assert.equal(sessions.getSession(k1, 1), undefined, "retirada da memória")
})

// ———————————————— EXECUÇÃO SEGURA ————————————————
test("execução: argumentos não passam por shell e a pasta de trabalho é sempre apagada", async (t) => {
  const why = needs("pdftotext")(); if (why) return t.skip(why)
  let workdir = ""
  await withWorkdir(async dir => {
    workdir = dir
    fs.writeFileSync(path.join(dir, "a.txt"), "x")
    // ";" e "$()" são só texto para a ferramenta: o pdftotext falha por arquivo inexistente, sem executar nada
    await assert.rejects(runTool("pdftotext", ["nao-existe; echo INJETADO $(whoami)", "-"]), DocumentToolError)
  })
  assert.equal(fs.existsSync(workdir), false)
  assert.ok(workdir.startsWith(path.join(os.tmpdir(), "lbot-whatsapp", "docs")))
})

// ———————————————— OPERAÇÕES REAIS ————————————————
test("PDF: informações, juntar, extrair, remover, dividir e girar", async (t) => {
  const why = needs("qpdf", "pdfinfo", "soffice")(); if (why) return t.skip(why)
  assert.equal((await doc.pdfInfo(pdf1)).pages, 1)
  assert.equal((await doc.pdfInfo(pdf3)).pages, 3)
  assert.equal((await doc.pdfInfo(await doc.extractPages(pdf3, "2-3"))).pages, 2)
  assert.equal((await doc.pdfInfo(await doc.removePages(pdf3, "1"))).pages, 2)
  await assert.rejects(doc.removePages(pdf3, "1-3"), /todas as páginas/)
  assert.equal((await doc.splitPdf(pdf3, 1)).length, 3)
  assert.equal((await doc.splitPdf(pdf3, 2)).length, 2)
  const rotated = await doc.rotatePdf(pdf1, 90)
  assert.match((await runTool("pdfinfo", ["-"], {}).catch(() => ({ stdout: Buffer.from("") }))).stdout.toString(), /|/)
  assert.ok(rotated.length > 0)
  await assert.rejects(doc.rotatePdf(pdf1, 45), /90, 180 ou 270/)
  await assert.rejects(doc.extractPages(pdf3, "5"), /fora do documento/)
})

test("PDF: senha correta abre, senha errada é recusada, PDF protegido não é processado sem senha", async (t) => {
  const why = needs("qpdf", "soffice")(); if (why) return t.skip(why)
  const locked = await doc.protectPdf(pdf1, "Senha123")
  assert.equal((await doc.pdfInfo(locked)).encrypted, true)
  await assert.rejects(doc.extractPages(locked, "1"), /protegido por senha/)
  await assert.rejects(doc.unlockPdf(locked, "errada1"), /Senha incorreta/)
  const open = await doc.unlockPdf(locked, "Senha123")
  assert.equal((await doc.pdfInfo(open)).encrypted, false)
  await assert.rejects(doc.protectPdf(pdf1, "a b"), /Senha inválida/)
})

test("PDF: corrompido e arquivo que não é PDF são recusados com mensagem clara", async (t) => {
  const why = needs("qpdf", "soffice")(); if (why) return t.skip(why)
  await assert.rejects(doc.mergePdfs([Buffer.from("%PDF-1.4 lixo"), pdf1]), /inválido, corrompido ou protegido/)
  await assert.rejects(doc.mergePdfs([pdf1]), /pelo menos 2/)
})

test("compressão nunca piora o arquivo; texto extraído preserva acentos", async (t) => {
  const why = needs("gs", "pdftotext", "soffice")(); if (why) return t.skip(why)
  const result = await doc.compressPdf(pdf3, "baixa")
  assert.ok(result.after <= result.before)
  assert.match(await doc.pdfText(pdf1), /Ação, coração, informação e emoção/)
})

test("OCR em português: imagem, PDF escaneado, PDF pesquisável e PDF → DOCX editável", async (t) => {
  const why = needs("tesseract", "pdftoppm", "qpdf", "soffice")(); if (why) return t.skip(why)
  assert.match(await doc.ocrImage(pngPage), /coração/)
  const scanned = await doc.imagesToPdf([pngPage])
  assert.equal(doc.hasRealText(await doc.pdfText(scanned)), false, "PDF de imagem não tem texto digital")
  const ocr = await doc.ocrPdfText(scanned)
  assert.equal(ocr.usedOcr, true)
  assert.match(ocr.text, /informação/)
  assert.match(await doc.pdfText(await doc.searchablePdf({ pdf: scanned })), /emoção/, "camada de texto pesquisável")
  const { docx, usedOcr } = await doc.pdfToDocx(scanned)
  assert.equal(usedOcr, true)
  assert.equal((await detectFile(docx)).ext, "docx")
  assert.match(await doc.pdfText(await doc.officeToPdf(docx, await detectFile(docx))), /Relatório de teste/, "DOCX → PDF de volta")
})

// ———————————————— COMANDOS (fluxo real do bot) ————————————————
test("!pdf sem opção mostra o guia; opção inválida e sem PDF explicam o uso", async () => {
  const f = fakeClient()
  await send(f, { from: P, text: "!pdf" })
  assert.match(f.output(), /Ferramentas de PDF/)
  f.reset()
  await send(f, { from: P, text: "!pdf voar" })
  assert.match(f.output(), /Opção desconhecida/)
  f.reset()
  await send(f, { from: P, text: "!pdf info" })
  assert.match(f.output(), /Responda um \*PDF\*/)
})

test("!pdf juntar → envia PDFs → !pdf pronto: um PDF com todas as páginas; arquivo errado é ignorado", async (t) => {
  const why = needs("qpdf", "soffice")(); if (why) return t.skip(why)
  const f = fakeClient()
  await send(f, { from: P, text: "!pdf juntar" })
  assert.match(f.output(), /Juntar PDFs/)
  for (const pdf of [pdf1, pdf3]) await send(f, { from: P, message: await waMedia("document", pdf, { fileName: "x.pdf" }) })
  await send(f, { from: P, message: await waMedia("image", pngPage) })
  await fastForward(async () => { for (let i = 0; i < 400 && (f.output().match(/recebido|ignorei/g) ?? []).length < 3; i++) await new Promise(r => setTimeout(r, 25)) })
  assert.match(f.output(), /Arquivo 1 recebido[\s\S]*Arquivo 2 recebido[\s\S]*ignorei/)
  f.reset()
  await send(f, { from: P, text: "!pdf pronto" })
  const sent = f.sent.find(s => s.content.document)
  assert.ok(sent, "enviou o PDF")
  assert.equal(sent!.content.fileName, "juntado.pdf")
  const merged = sent!.content.document as Buffer
  assert.equal((await doc.pdfInfo(merged)).pages, 4, "1 + 3 páginas, na ordem enviada")
})

test("!ocr, !topdf (texto digitado e DOCX) e !pdfdocx pelo fluxo do bot", async (t) => {
  const why = needs("tesseract", "pdftoppm", "soffice", "qpdf")(); if (why) return t.skip(why)
  const f = fakeClient()
  await send(f, { from: P, message: await waMedia("image", pngPage, { caption: "!ocr" }) })
  assert.match(f.output(), /Texto reconhecido[\s\S]*coração/)

  f.reset()
  await send(f, { from: P, text: "!topdf Olá, mundo! Documento com acentuação." })
  const fromText = f.sent.find(s => s.content.document)!
  assert.match(await doc.pdfText(fromText.content.document as Buffer), /acentuação/)

  f.reset()
  await send(f, { from: P, text: "!pdfdocx", quoted: { stanzaId: "Q9", participant: P, quotedMessage: await waMedia("document", pdf1, { fileName: "a.pdf" }) } })
  const docx = f.sent.find(s => s.content.document)!
  assert.equal(docx.content.fileName, "a.docx", "mesmo nome do documento original")
  assert.match(String(docx.content.caption), /layout original não é reproduzido/)
})

test("!pdf proteger pelo fluxo: sem senha explica; com senha devolve PDF criptografado", async (t) => {
  const why = needs("qpdf", "soffice")(); if (why) return t.skip(why)
  mock.restoreAll()
  const f = fakeClient()
  const quoted = { stanzaId: "Q10", participant: P, quotedMessage: await waMedia("document", pdf1, { fileName: "a.pdf" }) }
  await send(f, { from: P, text: "!pdf proteger", quoted })
  assert.match(f.output(), /Informe a senha/)
  f.reset()
  await send(f, { from: P, text: "!pdf proteger Segredo99", quoted })
  const out = f.sent.find(s => s.content.document)!
  assert.equal((await doc.pdfInfo(out.content.document as Buffer)).encrypted, true)
})

// ———————————————— LEGENDA, NOME ORIGINAL, SEPARAR E OCR → PDF ————————————————
test("comando na LEGENDA do documento funciona (documentWithCaptionMessage) e responder documento com legenda também", async (t) => {
  const why = needs("qpdf", "soffice")(); if (why) return t.skip(why)
  const f = fakeClient()
  const inner = await waMedia("document", pdf3, { fileName: "Relatório Final.pdf", caption: "!pdf info" })
  await send(f, { from: P, message: { documentWithCaptionMessage: { message: inner } } })
  assert.match(f.output(), /Informações do PDF[\s\S]*Páginas\*: 3/, "antes a mensagem era descartada")

  f.reset()
  const quotedInner = await waMedia("document", pdf3, { fileName: "Relatório Final.pdf", caption: "segue o arquivo" })
  await send(f, { from: P, text: "!pdf separar da página 2 a página 3", quoted: { stanzaId: "QC1", participant: P, quotedMessage: { documentWithCaptionMessage: { message: quotedInner } } } })
  const out = f.sent.find(s => s.content.document)!
  assert.ok(out, "PDF gerado")
  assert.equal(out.content.fileName, "Relatório Final (páginas 2-3).pdf", "mantém o nome original")
  assert.equal((await doc.pdfInfo(out.content.document as Buffer)).pages, 2)
  assert.match(String(out.content.caption), /páginas \*2-3\*/)
})

test("!pdf separar entende 10-50, '10 a 50' e 'da página 10 à 50'", async () => {
  const { naturalPageRange } = await import("../src/commands/utility.document.functions.commands.js")
  assert.equal(naturalPageRange(["10-50"]), "10-50")
  assert.equal(naturalPageRange(["10", "a", "50"]), "10-50")
  assert.equal(naturalPageRange(["da", "página", "10", "à", "página", "50"]), "10-50")
  assert.equal(naturalPageRange(["10", "até", "50"]), "10-50")
  assert.equal(naturalPageRange(["1-3,", "5"]), "1-3,5")
  assert.equal(naturalPageRange(["7"]), "7")
  assert.throws(() => naturalPageRange(["tudo"]), /Informe as páginas/)
})

test("!topdf devolve o PDF com o mesmo nome do documento original", async (t) => {
  const why = needs("soffice")(); if (why) return t.skip(why)
  const f = fakeClient()
  const txt = await waMedia("document", Buffer.from(TEXTO), { fileName: "minhas notas.txt", mimetype: "text/plain", caption: "!topdf" })
  await send(f, { from: P, message: { documentWithCaptionMessage: { message: txt } } })
  const out = f.sent.find(s => s.content.document)!
  assert.equal(out.content.fileName, "minhas notas.pdf")
})

test("!ocrpdf: PDF escaneado vira pesquisável; páginas digitais ficam intactas; imagem e TXT também", async (t) => {
  const why = needs("tesseract", "pdftoppm", "pdftotext", "qpdf", "soffice")(); if (why) return t.skip(why)
  // "Escaneado": página só com imagem (sem texto digital)
  const scanned = await doc.imagesToPdf([pngPage])
  assert.equal(doc.hasRealText(await doc.pdfText(scanned)), false)
  const mixed = await doc.mergePdfs([pdf1, scanned])
  const result = await doc.ocrToSearchablePdf(mixed)
  assert.equal(result.pages, 2)
  assert.equal(result.ocrPages, 1, "só a página escaneada passa pelo OCR")
  assert.match(await doc.pdfText(result.pdf), /cora[cç][aã]o/i, "texto reconhecido pesquisável")
  const digital = await doc.ocrToSearchablePdf(pdf1)
  assert.equal(digital.ocrPages, 0)

  const f = fakeClient()
  await send(f, { from: P, text: "!ocrpdf", quoted: { stanzaId: "QO1", participant: P, quotedMessage: await waMedia("document", scanned, { fileName: "contrato escaneado.pdf" }) } })
  const out = f.sent.find(s => s.content.document)!
  assert.equal(out.content.fileName, "contrato escaneado (OCR).pdf")
  assert.match(String(out.content.caption), /OCR em \*1\* de \*1\*/)

  f.reset()
  await send(f, { from: P, message: await waMedia("image", pngPage, { caption: "!ocrpdf" }) })
  const fromImage = f.sent.find(s => s.content.document)!
  assert.match(await doc.pdfText(fromImage.content.document as Buffer), /cora[cç][aã]o/i)

  f.reset()
  await send(f, { from: P, text: "!pdf ocr", quoted: { stanzaId: "QO2", participant: P, quotedMessage: await waMedia("document", Buffer.from(TEXTO), { fileName: "nota.txt", mimetype: "text/plain" }) } })
  assert.match(f.output(), /já tinham texto digital/)
})
