import config from "./config.js"
import { onMessage } from "./events/message-received.event.js"
export const start = () => [config, onMessage]
