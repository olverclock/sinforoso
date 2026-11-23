import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

/*
 * Execução SEGURA das ferramentas nativas do motor de documentos (qpdf, gs, pdftoppm, pdftotext,
 * pdfinfo, tesseract, soffice), instaladas pelo apt no Docker (Debian).
 *
 * - spawn com lista de argumentos, sem shell: nada digitado pelo usuário vira comando;
 * - os arquivos têm nomes gerados internamente, dentro de uma pasta temporária exclusiva do trabalho;
 * - tempo máximo por execução (o processo é encerrado) e limite de saída (stdout/stderr);
 * - código de saída verificado; mensagens internas não são repassadas ao usuário.
 *
 * Desenvolvimento no Windows: com DOC_TOOLS_WSL=<distro> as ferramentas rodam dentro do WSL
 * (os caminhos C:\... viram /mnt/c/...). Em produção (Linux/Docker) roda direto.
 */

export type DocTool = 'qpdf' | 'gs' | 'pdftoppm' | 'pdftotext' | 'pdfinfo' | 'tesseract' | 'soffice'

export const DOC_LIMITS = {
    /** Tamanho máximo do arquivo de entrada. */
    maxInputBytes: Number(process.env.DOC_MAX_INPUT_MB ?? 25) * 1024 * 1024,
    /** Tamanho máximo do arquivo gerado (envio pelo WhatsApp). */
    maxOutputBytes: Number(process.env.DOC_MAX_OUTPUT_MB ?? 64) * 1024 * 1024,
    maxPages: Number(process.env.DOC_MAX_PAGES ?? 200),
    maxOcrPages: Number(process.env.DOC_MAX_OCR_PAGES ?? 30),
    /** Lado máximo de imagem aceito (px), contra "bombas" de descompressão. */
    maxImageSide: 12000,
    maxImagePixels: 60_000_000,
    timeoutMs: Number(process.env.DOC_TIMEOUT_S ?? 180) * 1000,
    maxStdoutBytes: 20 * 1024 * 1024,
}

export class DocumentToolError extends Error {
    constructor(message: string, readonly detail?: string) { super(message) }
}

function wslDistro(): string | undefined {
    return process.platform === 'win32' ? process.env.DOC_TOOLS_WSL?.trim() || undefined : undefined
}

/** C:\pasta\arq → /mnt/c/pasta/arq quando as ferramentas rodam no WSL. */
export function toolPath(file: string): string {
    if (!wslDistro()) return file
    const resolved = path.resolve(file)
    return `/mnt/${resolved[0].toLowerCase()}${resolved.slice(2).replace(/\\/g, '/')}`
}

/** Pasta temporária exclusiva de um trabalho; sempre removida pelo chamador (withWorkdir). */
export async function withWorkdir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const base = path.join(os.tmpdir(), 'sinforoso', 'docs')
    fs.mkdirSync(base, { recursive: true })
    const dir = fs.mkdtempSync(path.join(base, 'job-'))
    try {
        return await fn(dir)
    } finally {
        // Limpeza com novas tentativas; se ainda falhar (arquivo preso), a varredura de hora em hora remove
        try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* fica para a varredura */ }
    }
}

export interface RunResult { stdout: Buffer, stderr: string, code: number }

/** Executa uma ferramenta. Rejeita em código de saída diferente de 0 (exceto os aceitos), tempo esgotado ou saída grande demais. */
export function runTool(tool: DocTool, args: string[], opts: { timeoutMs?: number, okCodes?: number[], cwd?: string, env?: Record<string, string> } = {}): Promise<RunResult> {
    const distro = wslDistro()
    const command = distro ? 'wsl.exe' : tool
    const fullArgs = distro ? ['-d', distro, '--', tool, ...args] : args
    const timeoutMs = opts.timeoutMs ?? DOC_LIMITS.timeoutMs
    return new Promise((resolve, reject) => {
        const child = spawn(command, fullArgs, {
            cwd: opts.cwd, shell: false, windowsHide: true,
            // Grupo de processos próprio no Linux: no tempo esgotado, encerra também os subprocessos
            detached: process.platform !== 'win32',
            env: { ...process.env, OMP_THREAD_LIMIT: process.env.OMP_THREAD_LIMIT ?? '2', ...opts.env },
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        const out: Buffer[] = []
        let outBytes = 0, stderr = '', finished = false
        const kill = () => {
            try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL') } catch { /* já terminou */ }
        }
        const fail = (err: Error) => { if (finished) return; finished = true; clearTimeout(timer); kill(); reject(err) }
        const timer = setTimeout(() => fail(new DocumentToolError(`O processamento passou do tempo limite (${Math.round(timeoutMs / 1000)}s).`, `${tool} timeout`)), timeoutMs)
        child.stdout.on('data', (chunk: Buffer) => {
            outBytes += chunk.length
            if (outBytes > DOC_LIMITS.maxStdoutBytes) return fail(new DocumentToolError("O resultado ficou grande demais.", `${tool} stdout limit`))
            out.push(chunk)
        })
        child.stderr.on('data', (chunk: Buffer) => { if (stderr.length < 64_000) stderr += chunk.toString('utf8') })
        child.on('error', (err: NodeJS.ErrnoException) => fail(err.code === 'ENOENT'
            ? new DocumentToolError(`Ferramenta ${tool} não instalada no servidor.`, err.message)
            : new DocumentToolError("Falha ao executar a ferramenta de documentos.", err.message)))
        child.on('close', (code) => {
            if (finished) return
            finished = true
            clearTimeout(timer)
            const exit = code ?? -1
            if (exit !== 0 && !(opts.okCodes ?? []).includes(exit)) {
                return reject(new DocumentToolError("Não foi possível processar o arquivo (arquivo inválido, corrompido ou protegido).", `${tool} saiu com ${exit}: ${stderr.slice(0, 500)}`))
            }
            resolve({ stdout: Buffer.concat(out), stderr, code: exit })
        })
    })
}

/** Ferramentas disponíveis (para mensagens claras e para pular testes quando faltar algo). */
export async function availableTools(): Promise<Set<DocTool>> {
    const checks: [DocTool, string[]][] = [['qpdf', ['--version']], ['gs', ['--version']], ['pdftoppm', ['-v']], ['pdftotext', ['-v']], ['pdfinfo', ['-v']], ['tesseract', ['--version']], ['soffice', ['--version']]]
    const found = new Set<DocTool>()
    await Promise.all(checks.map(async ([tool, args]) => {
        try { await runTool(tool, args, { timeoutMs: 60_000, okCodes: [1, 99] }); found.add(tool) } catch { /* ausente */ }
    }))
    return found
}
