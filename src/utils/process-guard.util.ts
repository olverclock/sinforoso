/*
 * Proteção contra uma queda conhecida do Baileys 7.0.0-rc14: quando chega uma mensagem de um JID
 * ignorado (status, transmissão, canal) no instante em que a conexão fecha, o Baileys tenta enviar a
 * confirmação (sendMessageAck) dentro de um evento sem tratamento de erro. O "Connection Closed"
 * (Boom 428) vira uma rejeição não tratada e o Node derruba o processo inteiro.
 * A correção oficial (PR #2568, confirmações "dispara e esquece") foi fechada sem entrar no Baileys.
 *
 * Aqui só ESSE erro é absorvido: a conexão já está fechando e o evento connection.update reconecta
 * normalmente. Qualquer outra rejeição não tratada continua derrubando o processo, como o Node faz
 * por padrão (o Docker reinicia), para não esconder erros reais.
 */
import { DisconnectReason } from "baileys"

interface BoomLike { isBoom?: boolean, message?: string, output?: { statusCode?: number } }

/** Erro de envio com a conexão já fechada (Boom 428 "Connection Closed" do Baileys). */
export function isClosedConnectionError(reason: unknown): boolean {
    const err = reason as BoomLike | null
    return !!err && typeof err === "object" && err.isBoom === true &&
        err.output?.statusCode === DisconnectReason.connectionClosed && err.message === "Connection Closed"
}

const GUARDED = Symbol.for("sinforoso.processGuard")

export function installProcessGuards(proc: NodeJS.EventEmitter & { [GUARDED]?: boolean } = process) {
    if (proc[GUARDED]) return
    proc[GUARDED] = true
    proc.on("unhandledRejection", (reason: unknown) => {
        if (isClosedConnectionError(reason)) {
            console.log("\x1b[33m[CONEXÃO]\x1b[0m Envio com a conexão já fechada (erro conhecido do Baileys) ignorado; a reconexão segue normalmente.")
            return
        }
        throw reason // demais erros: mesmo comportamento padrão do Node (encerra e o Docker reinicia)
    })
}
