import fs from "node:fs"
import path from "node:path"
import sharp from "sharp"
import { DOC_LIMITS, DocumentToolError, runTool, toolPath, withWorkdir } from "./tools.util.js"
import { DetectedFile, parsePageRange } from "./validate.util.js"

/*
 * Operações do motor de documentos, todas locais (nenhum arquivo sai do servidor):
 * - estruturais com QPDF (juntar, extrair, remover, girar, proteger, desproteger, informações),
 *   que não recomprimem nem perdem qualidade;
 * - compressão com Ghostscript (-dSAFER), só quando o usuário pede;
 * - texto e imagens com Poppler (pdftotext, pdftoppm, pdfinfo);
 * - OCR com Tesseract (português + inglês) sobre páginas renderizadas pelo Poppler;
 * - DOCX/DOC/ODT/RTF/XLSX/TXT → PDF com LibreOffice headless (perfil isolado por trabalho).
 */

export type CompressProfile = 'alta' | 'media' | 'baixa'
const GS_PROFILES: Record<CompressProfile, string> = { alta: '/printer', media: '/ebook', baixa: '/screen' }

function write(dir: string, name: string, data: Buffer) {
    const file = path.join(dir, name)
    fs.writeFileSync(file, data, { flag: 'wx' }) // wx: nunca segue/sobrescreve link ou arquivo existente
    return file
}

function readOutput(file: string): Buffer {
    if (!fs.existsSync(file)) throw new DocumentToolError("A ferramenta não gerou o arquivo.")
    const size = fs.statSync(file).size
    if (!size) throw new DocumentToolError("O arquivo gerado ficou vazio.")
    if (size > DOC_LIMITS.maxOutputBytes) throw new DocumentToolError("O arquivo gerado ficou grande demais para enviar.")
    return fs.readFileSync(file)
}

// ———————————————— INFORMAÇÕES ————————————————
export interface PdfInfo { pages: number, encrypted: boolean, title?: string, author?: string, producer?: string, pageSize?: string, sizeBytes: number }

async function pageCount(dir: string, file: string, password?: string): Promise<number> {
    const args = [...(password ? [`--password=${password}`] : []), '--show-npages', toolPath(file)]
    const { stdout } = await runTool('qpdf', args, { cwd: dir })
    const pages = Number(stdout.toString().trim())
    if (!Number.isInteger(pages) || pages < 1) throw new DocumentToolError("PDF sem páginas ou corrompido.")
    return pages
}

async function isEncrypted(dir: string, file: string): Promise<boolean> {
    // qpdf --is-encrypted: 0 = criptografado, 2 = não criptografado
    const { code } = await runTool('qpdf', ['--is-encrypted', toolPath(file)], { cwd: dir, okCodes: [2] })
    return code === 0
}

/** Garante PDF válido, sem senha (ou com a senha informada) e dentro do limite de páginas. */
async function checkPdf(dir: string, file: string, opts: { password?: string, maxPages?: number } = {}) {
    if (!opts.password) {
        // qpdf --requires-password: 0 = precisa de senha; 2 = sem criptografia; 3 = só senha de proprietário (abre sem senha)
        const { code } = await runTool('qpdf', ['--requires-password', toolPath(file)], { cwd: dir, okCodes: [2, 3] })
        if (code === 0) throw new DocumentToolError("Este PDF está protegido por senha. Use *desproteger* com a senha.")
    }
    const pages = await pageCount(dir, file, opts.password)
    if (pages > (opts.maxPages ?? DOC_LIMITS.maxPages)) throw new DocumentToolError(`PDF com páginas demais (${pages}). Limite: ${opts.maxPages ?? DOC_LIMITS.maxPages}.`)
    return pages
}

export function parsePdfInfo(text: string) {
    const field = (name: string) => text.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1]?.trim()
    return { title: field('Title'), author: field('Author'), producer: field('Producer'), pageSize: field('Page size') }
}

export async function pdfInfo(pdf: Buffer): Promise<PdfInfo> {
    return withWorkdir(async dir => {
        const file = write(dir, 'in.pdf', pdf)
        const encrypted = await isEncrypted(dir, file)
        let pages = 0, meta = {}
        try {
            pages = await pageCount(dir, file)
            meta = parsePdfInfo((await runTool('pdfinfo', [toolPath(file)], { cwd: dir })).stdout.toString('utf8'))
        } catch (err) {
            if (!encrypted) throw err
        }
        return { pages, encrypted, sizeBytes: pdf.length, ...meta }
    })
}

// ———————————————— ESTRUTURAIS (QPDF) ————————————————
export async function mergePdfs(pdfs: Buffer[]): Promise<Buffer> {
    if (pdfs.length < 2) throw new DocumentToolError("Envie pelo menos 2 PDFs para juntar.")
    return withWorkdir(async dir => {
        const files = pdfs.map((pdf, i) => write(dir, `in${i}.pdf`, pdf))
        let total = 0
        for (const file of files) total += await checkPdf(dir, file)
        if (total > DOC_LIMITS.maxPages) throw new DocumentToolError(`O resultado teria ${total} páginas. Limite: ${DOC_LIMITS.maxPages}.`)
        const out = path.join(dir, 'out.pdf')
        await runTool('qpdf', ['--empty', '--pages', ...files.map(toolPath), '--', toolPath(out)], { cwd: dir })
        return readOutput(out)
    })
}

/** Mantém só as páginas do intervalo ("1-3,5"). */
export async function extractPages(pdf: Buffer, range: string): Promise<Buffer> {
    return withWorkdir(async dir => {
        const file = write(dir, 'in.pdf', pdf)
        const pages = await checkPdf(dir, file)
        const out = path.join(dir, 'out.pdf')
        await runTool('qpdf', ['--empty', '--pages', toolPath(file), parsePageRange(range, pages), '--', toolPath(out)], { cwd: dir })
        return readOutput(out)
    })
}

/** Remove as páginas do intervalo. */
export async function removePages(pdf: Buffer, range: string): Promise<Buffer> {
    return withWorkdir(async dir => {
        const file = write(dir, 'in.pdf', pdf)
        const pages = await checkPdf(dir, file)
        const remove = new Set<number>()
        for (const part of parsePageRange(range, pages).split(',')) {
            const [a, b] = part.split('-').map(Number)
            for (let p = a; p <= (b ?? a); p++) remove.add(p)
        }
        const keep = Array.from({ length: pages }, (_, i) => i + 1).filter(p => !remove.has(p))
        if (!keep.length) throw new DocumentToolError("Não dá para remover todas as páginas.")
        const out = path.join(dir, 'out.pdf')
        await runTool('qpdf', ['--empty', '--pages', toolPath(file), keep.join(','), '--', toolPath(out)], { cwd: dir })
        return readOutput(out)
    })
}

/** Divide em vários PDFs: um por página ou em partes de N páginas. */
export async function splitPdf(pdf: Buffer, pagesPerPart = 1): Promise<Buffer[]> {
    return withWorkdir(async dir => {
        const file = write(dir, 'in.pdf', pdf)
        const pages = await checkPdf(dir, file)
        const size = Math.max(1, Math.floor(pagesPerPart))
        if (Math.ceil(pages / size) > 50) throw new DocumentToolError("Isso geraria mais de 50 arquivos. Use partes maiores (ex.: *dividir 10*).")
        const parts: Buffer[] = []
        for (let start = 1; start <= pages; start += size) {
            const end = Math.min(pages, start + size - 1)
            const out = path.join(dir, `part${start}.pdf`)
            await runTool('qpdf', ['--empty', '--pages', toolPath(file), start === end ? `${start}` : `${start}-${end}`, '--', toolPath(out)], { cwd: dir })
            parts.push(readOutput(out))
        }
        return parts
    })
}

/** Gira páginas em 90, 180 ou 270 graus (todas, ou o intervalo informado). */
export async function rotatePdf(pdf: Buffer, degrees: number, range?: string): Promise<Buffer> {
    if (![90, 180, 270].includes(degrees)) throw new DocumentToolError("Use 90, 180 ou 270 graus.")
    return withWorkdir(async dir => {
        const file = write(dir, 'in.pdf', pdf)
        const pages = await checkPdf(dir, file)
        const target = range ? parsePageRange(range, pages) : `1-${pages}`
        const out = path.join(dir, 'out.pdf')
        await runTool('qpdf', [`--rotate=+${degrees}:${target}`, toolPath(file), toolPath(out)], { cwd: dir })
        return readOutput(out)
    })
}

/** Senha: 4 a 64 caracteres imprimíveis, sem espaço (evita ambiguidades). */
export function validatePassword(password: string) {
    if (!/^[\x21-\x7E]{4,64}$/.test(password)) throw new DocumentToolError("Senha inválida: use de 4 a 64 caracteres, sem espaços nem acentos.")
}

/** Protege com senha (AES-256). */
export async function protectPdf(pdf: Buffer, password: string): Promise<Buffer> {
    validatePassword(password)
    return withWorkdir(async dir => {
        const file = write(dir, 'in.pdf', pdf)
        await checkPdf(dir, file)
        const out = path.join(dir, 'out.pdf')
        await runTool('qpdf', ['--encrypt', password, password, '256', '--', toolPath(file), toolPath(out)], { cwd: dir })
        return readOutput(out)
    })
}

/** Remove a proteção, desde que a senha correta seja informada. */
export async function unlockPdf(pdf: Buffer, password: string): Promise<Buffer> {
    validatePassword(password)
    return withWorkdir(async dir => {
        const file = write(dir, 'in.pdf', pdf)
        try {
            await checkPdf(dir, file, { password })
        } catch {
            throw new DocumentToolError("Senha incorreta ou PDF corrompido.")
        }
        const out = path.join(dir, 'out.pdf')
        await runTool('qpdf', [`--password=${password}`, '--decrypt', toolPath(file), toolPath(out)], { cwd: dir })
        return readOutput(out)
    })
}

// ———————————————— COMPRESSÃO (GHOSTSCRIPT) ————————————————
export async function compressPdf(pdf: Buffer, profile: CompressProfile = 'media'): Promise<{ pdf: Buffer, before: number, after: number }> {
    return withWorkdir(async dir => {
        const file = write(dir, 'in.pdf', pdf)
        await checkPdf(dir, file)
        const out = path.join(dir, 'out.pdf')
        await runTool('gs', ['-dSAFER', '-dBATCH', '-dNOPAUSE', '-dQUIET', '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.6',
            `-dPDFSETTINGS=${GS_PROFILES[profile]}`, '-dDetectDuplicateImages=true', `-sOutputFile=${toolPath(out)}`, toolPath(file)], { cwd: dir })
        const result = readOutput(out)
        // Se a compressão não ajudou, devolve o original (nunca piora o arquivo)
        return result.length < pdf.length ? { pdf: result, before: pdf.length, after: result.length } : { pdf, before: pdf.length, after: pdf.length }
    })
}

// ———————————————— TEXTO E IMAGENS (POPPLER) ————————————————
export async function pdfText(pdf: Buffer): Promise<string> {
    return withWorkdir(async dir => {
        const file = write(dir, 'in.pdf', pdf)
        await checkPdf(dir, file)
        const { stdout } = await runTool('pdftotext', ['-layout', '-enc', 'UTF-8', toolPath(file), '-'], { cwd: dir })
        return stdout.toString('utf8').replace(/\f/g, '\n').replace(/[ \t]+\n/g, '\n').trim()
    })
}

/** Renderiza páginas em PNG ou JPEG (resolução limitada). */
export async function pdfToImages(pdf: Buffer, format: 'png' | 'jpg' = 'jpg', range?: string, dpi = 150): Promise<Buffer[]> {
    return withWorkdir(async dir => {
        const file = write(dir, 'in.pdf', pdf)
        const pages = await checkPdf(dir, file)
        const selected = range ? parsePageRange(range, pages) : `1-${Math.min(pages, 20)}`
        const images: Buffer[] = []
        for (const part of selected.split(',')) {
            const [first, last] = part.split('-').map(Number)
            if (images.length + ((last ?? first) - first + 1) > 20) throw new DocumentToolError("No máximo 20 páginas por vez.")
            const prefix = path.join(dir, `p${first}`)
            await runTool('pdftoppm', [format === 'png' ? '-png' : '-jpeg', '-r', String(Math.min(Math.max(dpi, 72), 300)), '-f', String(first), '-l', String(last ?? first), toolPath(file), toolPath(prefix)], { cwd: dir })
            const generated = fs.readdirSync(dir).filter(name => name.startsWith(`p${first}-`)).sort((a, b) => Number(a.match(/-(\d+)\./)?.[1]) - Number(b.match(/-(\d+)\./)?.[1]))
            for (const name of generated) images.push(readOutput(path.join(dir, name)))
        }
        return images
    })
}

// ———————————————— OCR (TESSERACT) ————————————————
/**
 * O PDF tem texto de verdade? Pelo menos 30 letras e 70% dos caracteres visíveis sendo letras,
 * números ou pontuação do alfabeto latino (PDFs escaneados às vezes trazem "lixo" sem significado).
 */
export function hasRealText(text: string): boolean {
    const visible = text.replace(/\s/g, '')
    if (visible.length < 30) return false
    const latin = visible.match(/[A-Za-zÀ-ÿ0-9.,;:!?()'"%$@#&*+\-\/\[\]]/g)?.length ?? 0
    const letters = visible.match(/[A-Za-zÀ-ÿ]/g)?.length ?? 0
    return letters >= 30 && latin / visible.length >= 0.7
}
export const OCR_LANGS = 'por+eng'

/** Prepara a imagem para o OCR: corrige a rotação EXIF, converte para tons de cinza e normaliza o contraste. */
async function prepareForOcr(image: Buffer): Promise<Buffer> {
    return sharp(image, { limitInputPixels: DOC_LIMITS.maxImagePixels }).rotate().grayscale().normalize().png().toBuffer()
}

export async function ocrImage(image: Buffer): Promise<string> {
    return withWorkdir(async dir => {
        const file = write(dir, 'in.png', await prepareForOcr(image))
        const { stdout } = await runTool('tesseract', [toolPath(file), 'stdout', '-l', OCR_LANGS, '--psm', '3'], { cwd: dir })
        return stdout.toString('utf8').trim()
    })
}

/** PDF escaneado → texto (renderiza cada página a 300 dpi e aplica OCR). PDFs com texto usam o texto real. */
export async function ocrPdfText(pdf: Buffer): Promise<{ text: string, usedOcr: boolean }> {
    const digital = await pdfText(pdf)
    if (hasRealText(digital)) return { text: digital, usedOcr: false }
    return withWorkdir(async dir => {
        const file = write(dir, 'in.pdf', pdf)
        const pages = await checkPdf(dir, file, { maxPages: DOC_LIMITS.maxOcrPages })
        const texts: string[] = []
        for (let page = 1; page <= pages; page++) {
            const prefix = path.join(dir, `pg${page}`)
            await runTool('pdftoppm', ['-png', '-gray', '-r', '300', '-f', String(page), '-l', String(page), '-singlefile', toolPath(file), toolPath(prefix)], { cwd: dir })
            const { stdout } = await runTool('tesseract', [toolPath(`${prefix}.png`), 'stdout', '-l', OCR_LANGS, '--psm', '3'], { cwd: dir })
            texts.push(stdout.toString('utf8').trim())
            fs.rmSync(`${prefix}.png`, { force: true })
        }
        return { text: texts.join('\n\n').trim(), usedOcr: true }
    })
}

/** PDF escaneado ou imagens → PDF pesquisável (texto invisível sobre a imagem, gerado pelo Tesseract). */
export async function searchablePdf(input: { pdf?: Buffer, images?: Buffer[] }): Promise<Buffer> {
    return withWorkdir(async dir => {
        const pageImages: string[] = []
        if (input.pdf) {
            const file = write(dir, 'in.pdf', input.pdf)
            const pages = await checkPdf(dir, file, { maxPages: DOC_LIMITS.maxOcrPages })
            await runTool('pdftoppm', ['-png', '-r', '300', toolPath(file), toolPath(path.join(dir, 'pg'))], { cwd: dir })
            for (let p = 1; p <= pages; p++) {
                const name = fs.readdirSync(dir).find(n => new RegExp(`^pg-0*${p}\\.png$`).test(n))
                if (name) pageImages.push(path.join(dir, name))
            }
        }
        for (const [i, image] of (input.images ?? []).entries()) pageImages.push(write(dir, `img${i}.png`, await sharp(image).rotate().png().toBuffer()))
        if (!pageImages.length) throw new DocumentToolError("Nada para processar.")
        const parts: string[] = []
        for (const [i, image] of pageImages.entries()) {
            const base = path.join(dir, `ocr${i}`)
            await runTool('tesseract', [toolPath(image), toolPath(base), '-l', OCR_LANGS, 'pdf'], { cwd: dir })
            parts.push(`${base}.pdf`)
        }
        if (parts.length === 1) return readOutput(parts[0])
        const out = path.join(dir, 'out.pdf')
        await runTool('qpdf', ['--empty', '--pages', ...parts.map(toolPath), '--', toolPath(out)], { cwd: dir })
        return readOutput(out)
    })
}

/** Página com texto digital de verdade (não só números de página ou lixo de digitalização). */
export function pageHasText(text: string): boolean {
    return (text.match(/[A-Za-zÀ-ÿ]/g)?.length ?? 0) >= 15
}

/**
 * Qualquer PDF → PDF pesquisável, página por página: páginas que já têm texto digital ficam
 * exatamente como estão (sem perder qualidade); só as páginas escaneadas (imagem) passam pelo OCR
 * (Tesseract, português + inglês, 300 dpi) e ganham o texto invisível por cima da imagem.
 */
export async function ocrToSearchablePdf(pdf: Buffer): Promise<{ pdf: Buffer, pages: number, ocrPages: number }> {
    return withWorkdir(async dir => {
        const file = write(dir, 'in.pdf', pdf)
        const pages = await checkPdf(dir, file)
        const scanned: number[] = []
        for (let page = 1; page <= pages; page++) {
            const { stdout } = await runTool('pdftotext', ['-f', String(page), '-l', String(page), '-enc', 'UTF-8', toolPath(file), '-'], { cwd: dir })
            if (!pageHasText(stdout.toString('utf8'))) scanned.push(page)
        }
        if (!scanned.length) return { pdf, pages, ocrPages: 0 }
        if (scanned.length > DOC_LIMITS.maxOcrPages) throw new DocumentToolError(`O PDF tem ${scanned.length} páginas escaneadas; o limite de OCR é ${DOC_LIMITS.maxOcrPages}. Separe em partes com *pdf extrair*.`)
        const ocrFiles = new Map<number, string>()
        for (const page of scanned) {
            const prefix = path.join(dir, `pg${page}`)
            await runTool('pdftoppm', ['-png', '-r', '300', '-f', String(page), '-l', String(page), '-singlefile', toolPath(file), toolPath(prefix)], { cwd: dir })
            const base = path.join(dir, `ocr${page}`)
            await runTool('tesseract', [toolPath(`${prefix}.png`), toolPath(base), '-l', OCR_LANGS, '--dpi', '300', 'pdf'], { cwd: dir })
            fs.rmSync(`${prefix}.png`, { force: true })
            ocrFiles.set(page, `${base}.pdf`)
        }
        // Remonta na ordem original: página digital do PDF de entrada ou página nova com OCR
        const pageArgs: string[] = []
        for (let page = 1; page <= pages; page++) {
            const ocr = ocrFiles.get(page)
            pageArgs.push(...(ocr ? [toolPath(ocr), '1'] : [toolPath(file), String(page)]))
        }
        const out = path.join(dir, 'out.pdf')
        await runTool('qpdf', ['--empty', '--pages', ...pageArgs, '--', toolPath(out)], { cwd: dir })
        return { pdf: readOutput(out), pages, ocrPages: scanned.length }
    })
}

// ———————————————— CONVERSÕES (LIBREOFFICE) ————————————————
async function soffice(dir: string, input: string, target: string, filter?: string): Promise<string> {
    const profile = path.join(dir, 'lo-profile')
    const outDir = path.join(dir, 'lo-out')
    fs.mkdirSync(outDir)
    await runTool('soffice', [`-env:UserInstallation=file://${toolPath(profile)}`, '--headless', '--norestore', '--nologo', '--nodefault', '--nolockcheck',
        ...(filter ? [`--infilter=${filter}`] : []), '--convert-to', target, '--outdir', toolPath(outDir), toolPath(input)], { cwd: dir, timeoutMs: Math.max(DOC_LIMITS.timeoutMs, 240_000) })
    const produced = fs.readdirSync(outDir)[0]
    if (!produced) throw new DocumentToolError("A conversão não gerou arquivo.")
    return path.join(outDir, produced)
}

/** DOCX, DOC, ODT, RTF, XLSX, PPTX ou TXT → PDF. */
export async function officeToPdf(file: Buffer, detected: DetectedFile): Promise<Buffer> {
    if (detected.kind !== 'office' && detected.kind !== 'text') throw new DocumentToolError("Esse tipo de arquivo não é um documento de escritório.")
    return withWorkdir(async dir => {
        const input = write(dir, `in.${detected.ext}`, file)
        const filter = detected.kind === 'text' ? 'Text (encoded):UTF8,LF,,,' : undefined
        return readOutput(await soffice(dir, input, 'pdf', filter))
    })
}

/**
 * Imagens → um PDF (uma imagem por página, na ordem enviada). O PDF é montado aqui mesmo: cada JPEG
 * é embutido sem recompressão (DCTDecode, como o img2pdf), em página A4 retrato ou paisagem.
 */
export async function imagesToPdf(images: Buffer[]): Promise<Buffer> {
    if (!images.length) throw new DocumentToolError("Envie pelo menos uma imagem.")
    if (images.length > 30) throw new DocumentToolError("No máximo 30 imagens por PDF.")
    const pages: { jpeg: Buffer, width: number, height: number }[] = []
    for (const image of images) {
        const { data, info } = await sharp(image, { limitInputPixels: DOC_LIMITS.maxImagePixels })
            .rotate().flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true })
        pages.push({ jpeg: data, width: info.width, height: info.height })
    }
    const pdf = buildImagePdf(pages)
    if (pdf.length > DOC_LIMITS.maxOutputBytes) throw new DocumentToolError("O arquivo gerado ficou grande demais para enviar.")
    return pdf
}

export function buildImagePdf(pages: { jpeg: Buffer, width: number, height: number }[]): Buffer {
    const chunks: Buffer[] = []
    const offsets: number[] = []
    let length = 0
    const NL = '\n'
    const push = (data: string | Buffer) => { const b = typeof data === 'string' ? Buffer.from(data, 'latin1') : data; chunks.push(b); length += b.length }
    const object = (id: number, body: (string | Buffer)[]) => { offsets[id] = length; push(`${id} 0 obj${NL}`); body.forEach(push); push(`${NL}endobj${NL}`) }

    push(`%PDF-1.4${NL}%âãÏÓ${NL}`)
    const pageIds = pages.map((_, i) => 3 + i * 3)
    object(1, ['<< /Type /Catalog /Pages 2 0 R >>'])
    object(2, [`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`])
    pages.forEach((page, i) => {
        const [pageId, imageId, contentId] = [3 + i * 3, 4 + i * 3, 5 + i * 3]
        // A4 (595 x 842 pt), girada quando a imagem é mais larga que alta; a imagem é centralizada e ajustada com margem
        const landscape = page.width > page.height
        const [pw, ph] = landscape ? [842, 595] : [595, 842]
        const scale = Math.min((pw - 36) / page.width, (ph - 36) / page.height)
        const [w, h] = [page.width * scale, page.height * scale]
        const [x, y] = [(pw - w) / 2, (ph - h) / 2]
        const content = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`
        object(pageId, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`])
        object(imageId, [`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>${NL}stream${NL}`, page.jpeg, `${NL}endstream`])
        object(contentId, [`<< /Length ${content.length} >>${NL}stream${NL}${content}${NL}endstream`])
    })
    const xref = length
    const count = 3 + pages.length * 3
    push(`xref${NL}0 ${count}${NL}0000000000 65535 f ${NL}`)
    for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n ${NL}`)
    push(`trailer${NL}<< /Size ${count} /Root 1 0 R >>${NL}startxref${NL}${xref}${NL}%%EOF${NL}`)
    return Buffer.concat(chunks)
}

/**
 * PDF → DOCX com TEXTO EDITÁVEL. PDFs digitais usam o texto real; escaneados passam por OCR.
 * Não preserva o layout original (colunas, tabelas e imagens): é um documento de texto para editar.
 */
export async function pdfToDocx(pdf: Buffer): Promise<{ docx: Buffer, usedOcr: boolean }> {
    const { text, usedOcr } = await ocrPdfText(pdf)
    if (!text.trim()) throw new DocumentToolError("Não encontrei texto no PDF.")
    return withWorkdir(async dir => {
        const input = write(dir, 'texto.txt', Buffer.from(text, 'utf8'))
        return { docx: readOutput(await soffice(dir, input, 'docx:MS Word 2007 XML', 'Text (encoded):UTF8,LF,,,')), usedOcr }
    })
}
