import { start } from "./socket.js"
start()
const { db } = await import("./services/user.service.js")
export { db }
