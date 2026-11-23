// utils -> helpers de texto e builtin node: permitido
import path from "node:path"
import botTexts from "../helpers/bot.texts.helper.js"
export const t = () => path.join(botTexts.hello)
