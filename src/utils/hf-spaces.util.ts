import { Client } from "@gradio/client"
import sharp from "sharp"
import { HTTP_TIMEOUT, showConsoleLibraryError } from "./general.util.js"

/*
 * Serviços gratuitos hospedados em Hugging Face Spaces (Gradio), chamados com o cliente oficial
 * @gradio/client. Não exigem chave. Opcionalmente, um token GRATUITO do Hugging Face (HF_TOKEN no
 * ambiente, criado em https://huggingface.co/settings/tokens) aumenta a cota de GPU dos Spaces.
 *
 * Cada função tenta os Spaces em ordem; se um estiver fora do ar, dormindo ou sem cota, usa o próximo.
 */

type SpaceCall = { space: string, endpoint: string, payload: (file: Blob) => Record<string, unknown> | unknown[] }

/** Transcrição de áudio (Whisper Large v3). */
const TRANSCRIPTION_SPACES: SpaceCall[] = [
    { space: "hf-audio/whisper-large-v3", endpoint: "/transcribe", payload: (file) => [file, "transcribe"] },
    { space: "openai/whisper", endpoint: "/predict", payload: (file) => [file, "transcribe"] },
]

/**
 * Remoção de fundo. O primeiro (rembg com o modelo ISNet) roda em CPU: é mais lento, mas não tem a
 * cota de GPU (ZeroGPU) dos demais, que se esgota rápido em uso anônimo.
 */
const BACKGROUND_SPACES: SpaceCall[] = [
    { space: "KenjieDec/RemBG", endpoint: "/inference", payload: (file) => ({ file, model: "isnet-general-use", x: 0, y: 0 }) },
    { space: "not-lain/background-removal", endpoint: "/png", payload: (file) => ({ f: file }) },
    { space: "ZhengPeng7/BiRefNet_demo", endpoint: "/image", payload: (file) => ({ images: file, resolution: "1024x1024", weights_file: "General" }) },
]

const SPACE_TIMEOUT_MS = 120_000

function hfToken(): `hf_${string}` | undefined {
    const token = process.env.HF_TOKEN?.trim()
    return token?.startsWith("hf_") ? token as `hf_${string}` : undefined
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label}: tempo esgotado (${ms / 1000}s)`)), ms)
        promise.then(value => { clearTimeout(timer); resolve(value) }, err => { clearTimeout(timer); reject(err) })
    })
}

async function callSpaces(calls: SpaceCall[], file: Blob, label: string): Promise<unknown[]> {
    let lastError: unknown
    for (const call of calls) {
        try {
            const client = await withTimeout(Client.connect(call.space, { token: hfToken() }), SPACE_TIMEOUT_MS, call.space)
            const result = await withTimeout(client.predict(call.endpoint, call.payload(file)), SPACE_TIMEOUT_MS, call.space)
            return result.data as unknown[]
        } catch (err) {
            lastError = err
            showConsoleLibraryError(err, `${label} (${call.space})`)
        }
    }
    throw lastError ?? new Error(`${label}: nenhum serviço disponível`)
}

/** Métodos expostos em um objeto para poderem ser substituídos nos testes. */
export const hfSpaces = {
    /** Transcreve o áudio (qualquer formato que o ffmpeg do Space aceite) e devolve o texto. */
    async transcribe(audio: Buffer, mimetype = "audio/ogg"): Promise<string> {
        const data = await callSpaces(TRANSCRIPTION_SPACES, new Blob([new Uint8Array(audio)], { type: mimetype }), "transcribe")
        return String(data?.[0] ?? "").trim()
    },

    /** Remove o fundo da imagem e devolve um PNG com transparência (os Spaces podem devolver WebP). */
    async removeBackground(image: Buffer, mimetype = "image/png"): Promise<Buffer> {
        const data = await callSpaces(BACKGROUND_SPACES, new Blob([new Uint8Array(image)], { type: mimetype }), "removeBackground")
        const first = data?.[0] as { url?: string } | { url?: string }[] | undefined
        const url = Array.isArray(first) ? first[first.length - 1]?.url : first?.url
        if (!url) throw new Error("removeBackground: o serviço não devolveu a imagem")
        const response = await withTimeout(fetch(url), HTTP_TIMEOUT.media, "download da imagem sem fundo")
        if (!response.ok) throw new Error(`removeBackground: HTTP ${response.status} ao baixar o resultado`)
        return sharp(Buffer.from(await response.arrayBuffer())).png().toBuffer()
    },
}
