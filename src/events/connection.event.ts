import { DisconnectReason, ConnectionState, WASocket } from 'baileys'
import { Boom } from '@hapi/boom'
import { BotController } from '../controllers/bot.controller.js'
import { buildText, showConsoleError, colorText, askQuestion } from '../utils/general.util.js'
import botTexts from '../helpers/bot.texts.helper.js'
import { UserController } from '../controllers/user.controller.js'
import { getHostNumber } from '../utils/whatsapp.util.js'
import qrcode from 'qrcode-terminal'
import { cleanCreds } from '../helpers/session.auth.helper.js'
import type { CloseAction } from '../helpers/socket.events.helper.js'

export async function connectionQr(qr: string) {
    if (qr) {
        await new Promise<void>(resolve => {
            qrcode.generate(qr, { small: true }, (qrcode) => {
                console.log(qrcode)
                resolve()
            })
        })
    }
}

export async function connectionPairingCode(client: WASocket) {
    const answerNumber = await askQuestion(botTexts.input_phone_number)
    const code = await client.requestPairingCode(answerNumber.replace(/\W+/g, ""))
    console.log(colorText(buildText(botTexts.show_pairing_code, code)))
}

export async function connectionOpen(client: WASocket) {
    try {
        const botController = new BotController()
        botController.startBot(getHostNumber(client))
        console.log(colorText(botTexts.bot_data))
        await checkOwnerRegister()
    } catch (err) {
        showConsoleError(err, "CONNECTION")
        client.end(new Error("fatal_error"))
    }
}

/**
 * O que fazer depois que a conexão fechou:
 * - reconnect: queda temporária (rede, reinício pedido pelo WhatsApp etc.), tenta de novo;
 * - relogin: a sessão acabou (deslogado ou inválida), as credenciais foram apagadas e é preciso parear de novo;
 * - stop: desligamento pedido por comando, não reconecta;
 * - fatal: falha grave no código, o processo deve encerrar para ser reiniciado limpo.
 */

export async function connectionClose(connectionState: Partial<ConnectionState>): Promise<CloseAction> {
    const { lastDisconnect } = connectionState
    try {
        const errorCode = (new Boom(lastDisconnect?.error)).output.statusCode

        if (lastDisconnect?.error?.message == "admin_command") {
            showConsoleError(new Error(botTexts.disconnected.command), 'CONNECTION')
            return 'stop'
        }
        if (lastDisconnect?.error?.message == "fatal_error") {
            showConsoleError(new Error(botTexts.disconnected.fatal_error), 'CONNECTION')
            return 'fatal'
        }
        if (errorCode == DisconnectReason.loggedOut) {
            await cleanCreds()
            showConsoleError(new Error(botTexts.disconnected.logout), 'CONNECTION')
            return 'relogin'
        }
        if (errorCode == 405) {
            await cleanCreds()
            return 'relogin'
        }
        if (errorCode == DisconnectReason.restartRequired) {
            console.log(colorText(botTexts.disconnected.restart, "#de9a07"))
        } else if ([408, 428, 503, 515, 440].includes(errorCode) || lastDisconnect?.error?.message?.includes('408')) {
            // Eventos de rede comuns (conexão perdida, stream suspenso etc.)
            console.log(colorText(`[SOCKET] Evento de rede comum (${errorCode}). Tentando reconectar automaticamente...`, "#de9a07"))
        } else {
            showConsoleError(new Error(buildText(botTexts.disconnected.bad_connection, errorCode.toString(), lastDisconnect?.error?.message)), 'CONNECTION')
        }
        return 'reconnect'
    } catch (err) {
        // Antes, um erro aqui (ex.: falha ao apagar credenciais) deixava o bot vivo e desconectado para sempre
        showConsoleError(err, 'CONNECTION')
        return 'reconnect'
    }
}

async function checkOwnerRegister() {
    const owner = await new UserController().getOwner()

    if (!owner) {
        console.log(colorText(botTexts.owner_not_found, "#d63e3e"))
    } else {
        console.log(colorText(botTexts.owner_registered))
    }
}