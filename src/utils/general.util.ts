import { pino } from 'pino'
import moment from "moment-timezone"
import chalk from 'chalk'
import path from 'node:path'
import fs from 'fs-extra'
import botTexts from "../helpers/bot.texts.helper.js"
import { FileExtensions } from "../interfaces/library.interface.js"
import { tmpdir } from "node:os"
import crypto from 'node:crypto'
import readline from 'readline/promises'

/**
 * Fornecedor do prefixo atual do bot usado por buildText ({$p}). É registrado
 * na inicialização por services/bot.service.ts (setPrefixProvider), para que
 * utils/ não dependa de controllers/ (regra ARCH-011).
 */
let prefixProvider: (() => string) | undefined

export function setPrefixProvider(provider: () => string) {
  prefixProvider = provider
}

function getCurrentPrefix() {
  if (!prefixProvider) {
    throw new Error("Prefixo do bot não disponível: setPrefixProvider() deve ser chamado na inicialização (bot.service).")
  }
  return prefixProvider()
}

export const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'yyyy-mm-dd HH:MM:ss'
    }
  }
})

let rl: readline.Interface | null = null;

export async function askQuestion(question: string) {
  const getReadline = () => {
    if (rl) {
      rl?.close()
      rl = null
    }

    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    return rl
  }

  const rlInstance = getReadline()
  const answer = await rlInstance.question(question)

  return answer
}

export function messageErrorCommand(command: string, reason: string) {
  return buildText(botTexts.error_command, command, reason)
}

export function getCurrentBotVersion() {
  return JSON.parse(fs.readFileSync(path.resolve('package.json'), { encoding: 'utf-8' })).version
}

export function colorText(text: string, color?: string) {
  return !color ? chalk.green(text) : chalk.hex(color)(text)
}

export function buildText(text: string, ...params: unknown[]) {
  if (text.includes('{$p}')) {
    const prefix = getCurrentPrefix()
    text = text.replaceAll('{$p}', () => prefix)
  }

  // Função de substituição: o valor entra literalmente. Com string, replaceAll interpretaria
  // padrões como "$&", "$$" e "$`" vindos do texto do usuário (ex.: nome "Jo$&o" virava "Jo{$1}o").
  for (let i = 0; i < params.length; i++) {
    const value = String(params[i])
    text = text.replaceAll(`{$${i + 1}}`, () => value)
  }

  return text
}

export function timestampToDate(timestamp: number) {
  return moment(timestamp).format('DD/MM/YYYY HH:mm:ss')
}

export function formatSeconds(seconds: number) {
  return moment(seconds * 1000).format('mm:ss')
}

export function currentDate() {
  return moment(Date.now()).format('DD/MM/YYYY HH:mm:ss')
}

export function getResponseTime(timestamp: number) {
  let responseTime = ((moment.now() / 1000) - timestamp).toFixed(2)
  return responseTime
}

export function showCommandConsole(isGroup: boolean, categoryName: string, command: string, _hexColor: string, messageTimestamp: number, pushName: string, groupName?: string) {
  const responseTimeSeconds = getResponseTime(messageTimestamp)
  const meta = {
    category: categoryName,
    command: command,
    user: pushName || "DESCONHECIDO",
    group: isGroup ? (groupName || "DESCONHECIDO") : undefined,
    responseTime: `${responseTimeSeconds}s`
  }

  logger.info(meta, `COMANDO EXECUTADO: ${command}`)
}

export function uppercaseFirst(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function removeBold(text: string) {
  return text.replace(/\*/gm, "").trim()
}

export function removeFormatting(text: string) {
  return text.replace(/(_)|(\*)|(~)|(```)/g, "").trim()
}

/*
 * Detecção de links do anti-link.
 *
 * A regex original (LINK_PATTERN) tinha custo quadrático: aplicada com a flag "g" a uma mensagem longa
 * sem link (ex.: 65 mil letras), ela recomeçava em cada posição e varria até o fim, travando o
 * event loop por segundos (ReDoS). findLinks devolve EXATAMENTE o mesmo resultado de
 * `text.match(LINK_PATTERN com flags "img")`, mas em tempo linear:
 *  1. percorre o texto uma vez, por "segmentos de rótulos" ([a-z0-9]+ separados por "." ou "-");
 *  2. um segmento só pode conter link se tiver um ponto seguido de 2 letras (o TLD) — senão nenhuma
 *     posição dentro dele casa, e ele é pulado inteiro;
 *  3. nos candidatos, a regex original é executada ancorada (flag "y") numa única posição, então o
 *     texto casado é idêntico ao da implementação antiga.
 */
const LINK_PATTERN_SOURCE = /(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/[^\s]*)?/.source
const LINK_PROTOCOLS = ["http://www.", "https://www.", "http://", "https://"]
const isAlnum = (c: string) => /[a-z0-9]/i.test(c)
const isLetter = (c: string) => /[a-z]/i.test(c)

/** Fim do segmento de rótulos iniciado em `start` e se ele contém um ponto válido para TLD. */
function scanLabelSegment(text: string, start: number) {
  let i = start
  let hasTldDot = false
  while (i < text.length) {
    while (i < text.length && isAlnum(text[i])) i++
    const sep = text[i]
    if ((sep !== "." && sep !== "-") || !isAlnum(text[i + 1] ?? "")) break
    if (sep === "." && isLetter(text[i + 1]) && isLetter(text[i + 2] ?? "")) hasTldDot = true
    i++
  }
  return { end: i, hasTldDot }
}

/** Posições de início a tentar para um segmento: protocolos que terminam nele (a partir de `from`) e o próprio segmento. */
function candidateStarts(text: string, segmentStart: number, from: number) {
  const starts = new Set<number>()
  for (const protocol of LINK_PROTOCOLS) {
    const protocolStart = segmentStart - protocol.length
    if (protocolStart >= from && text.slice(protocolStart, segmentStart).toLowerCase() === protocol) starts.add(protocolStart)
  }
  starts.add(segmentStart)
  return [...starts].sort((a, b) => a - b)
}

export function findLinks(text: string): string[] | null {
  const sticky = new RegExp(LINK_PATTERN_SOURCE, "imy")
  const found: string[] = []
  let pos = 0
  let lastMatchEnd = 0 // equivale ao lastIndex da busca global original

  while (pos < text.length) {
    if (!isAlnum(text[pos])) { pos++; continue }
    const segment = scanLabelSegment(text, pos)
    if (!segment.hasTldDot) { pos = segment.end; continue }

    let match: RegExpExecArray | null = null
    for (const start of candidateStarts(text, pos, lastMatchEnd)) {
      sticky.lastIndex = start
      match = sticky.exec(text)
      if (match) break
    }

    if (!match) { pos = segment.end; continue }
    found.push(match[0])
    pos = lastMatchEnd = match.index + match[0].length
  }

  return found.length ? found : null
}

export function randomDelay(ms_min: number, ms_max: number) {
  return new Promise<void>((resolve, _reject) => {
    let randomDelayMs = Math.floor(Math.random() * (ms_max - ms_min + 1)) + ms_min
    setTimeout(async () => {
      resolve()
    }, randomDelayMs)
  })
}

/**
 * Tempos-limite das requisições HTTP (axios), em ms. No Node, o axios (via follow-redirects) conta
 * o tempo até chegarem os cabeçalhos da resposta e, depois disso, o tempo SEM dados no socket:
 * um download grande que continua recebendo dados não é interrompido.
 * - api: APIs JSON · scraping: páginas HTML/RSS · media: download/upload de imagem, áudio e vídeo.
 */
export const HTTP_TIMEOUT = { api: 20_000, scraping: 30_000, media: 60_000 } as const

/*
 * Leitura tipada de erros capturados. Com `strict`, a variável de um `catch` é `unknown`;
 * estes helpers substituem o antigo `catch (err: any)` sem mudar o comportamento para objetos Error.
 */
type ErrorLike = { message?: unknown, stack?: unknown, code?: unknown, response?: { status?: unknown } }
const asErrorLike = (err: unknown): ErrorLike | undefined => (typeof err === 'object' && err !== null) ? err as ErrorLike : undefined

/** Mensagem do erro (err.message); para valores que não são objeto, a representação em texto. */
export function errorMessage(err: unknown): string {
  const message = asErrorLike(err)?.message
  if (message !== undefined) return String(message)
  return (typeof err === 'object' && err !== null) ? '' : String(err)
}

/** Status HTTP de um erro de cliente HTTP (ex.: axios: err.response.status). */
export function errorStatus(err: unknown): number | undefined {
  const status = asErrorLike(err)?.response?.status
  return typeof status === 'number' ? status : undefined
}

/** Código do erro (ex.: 'ECONNABORTED'). */
export function errorCode(err: unknown): string | undefined {
  const code = asErrorLike(err)?.code
  return code === undefined ? undefined : String(code)
}

export function showConsoleError(err: unknown, error_type: string) {
  logger.error({ type: error_type, error: asErrorLike(err)?.message ?? String(err), stack: asErrorLike(err)?.stack }, `ERRO DETECTADO: ${error_type}`)
}

export function showConsoleLibraryError(err: unknown, error_type: string) {
  logger.error({ type: error_type, error: asErrorLike(err)?.message ?? String(err), stack: asErrorLike(err)?.stack }, `ERRO DE BIBLIOTECA: ${error_type}`)
}

export function getRandomFilename(ext: FileExtensions) {
  return `${Math.floor(Math.random() * 10000)}.${ext}`
}

/**
 * Apaga arquivos temporários antigos (fotos, vídeos e áudios de conversões). Normalmente cada
 * função apaga os seus, mas um erro no meio do caminho ou um reinício do bot pode deixar sobras.
 * Devolve quantos arquivos foram removidos.
 */
export function cleanupOldTempFiles(maxAgeMs = 60 * 60 * 1000, dirs = [path.join(tmpdir(), 'sinforoso')], now = Date.now()): number {
  let removed = 0
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name)
      try {
        const stat = fs.statSync(file)
        if (now - stat.mtimeMs <= maxAgeMs) continue
        if (stat.isFile()) {
          fs.removeSync(file)
          removed++
        } else if (stat.isDirectory() && /^job-/.test(name)) {
          // Pastas de trabalho do motor de documentos que sobraram de um erro ou reinício
          fs.removeSync(file)
          removed++
        }
      } catch { /* arquivo em uso ou já removido: tenta de novo na próxima rodada */ }
    }
  }
  return removed
}

export function getTempPath(ext: FileExtensions) {
  if (!fs.existsSync(path.join(tmpdir(), 'sinforoso'))) {
    fs.mkdirSync(path.join(tmpdir(), 'sinforoso'))
  }

  return path.join(tmpdir(), 'sinforoso', `${crypto.randomBytes(20).toString('hex')}.${ext}`)
}

export function deepMerge<T>(defaultObj: T, overrideObj: unknown): T {
  const result = { ...defaultObj } as Record<string, unknown>
  const override = (typeof overrideObj === 'object' && overrideObj !== null) ? overrideObj as Record<string, unknown> : undefined

  for (const key in defaultObj) {
    if (override && Object.prototype.hasOwnProperty.call(override, key)) {
      const defaultValue: unknown = defaultObj[key]
      if (typeof defaultValue === 'object' && defaultValue !== null && !Array.isArray(defaultValue)) {
        result[key] = deepMerge(defaultValue, override[key]);
      } else {
        result[key] = override[key];
      }
    }
  }

  return result as T
}


