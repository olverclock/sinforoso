import DataStore from "@seald-io/nedb";
import { AuthenticationCreds, AuthenticationState, initAuthCreds, WAProto, SignalDataTypeMap, BufferJSON } from "baileys"

export const db = new DataStore<{ key: string, data: string }>({ filename: './storage/session.db', autoload: true })

/**
 * Índice único no campo "key". Sem ele, cada leitura/gravação percorre a sessão inteira (milhares
 * de chaves): logo depois do pareamento o Baileys grava 812 pre-keys e desiste após 30 s
 * ("Pre-key upload timeout"), e aí as mensagens dos outros não chegam ao bot. Com o índice, a
 * mesma gravação ficou ~10× mais rápida. Registros duplicados (de versões antigas) são limpos antes,
 * mantendo o mais recente de cada chave.
 */
export async function indexByKey(store: DataStore<{ key: string, data: string }>): Promise<void> {
    try {
        await store.ensureIndexAsync({ fieldName: 'key', unique: true })
    } catch {
        const docs = await store.findAsync({}) as unknown as { _id: string, key: string }[]
        const counts = new Map<string, number>()
        for (const doc of docs) counts.set(doc.key, (counts.get(doc.key) ?? 0) + 1)
        for (const [key, count] of counts) {
            if (count < 2) continue
            // Fica o registro que o bot já usava: o mesmo que findOne (leitura) e update (gravação) acham
            const kept = await store.findOneAsync({ key }) as unknown as { _id: string }
            await store.removeAsync({ key, _id: { $ne: kept._id } }, { multi: true })
        }
        await store.ensureIndexAsync({ fieldName: 'key', unique: true })
    }
}

let indexReady: Promise<void> | undefined
export function ensureSessionIndex(): Promise<void> {
    indexReady ??= indexByKey(db)
    return indexReady
}

export async function useNeDBAuthState(): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> {
    await ensureSessionIndex()

    const write = async (data: unknown, key: string) => {
        await db.updateAsync({ key }, { $set: { data: JSON.stringify(data, BufferJSON.replacer) } }, { upsert: true })
    }

    const read = async (key: string) => {
        const result = await db.findOneAsync({ key })
        return result ? JSON.parse(result.data, BufferJSON.reviver) : null
    }

    const remove = async (key: string) => {
        await db.removeAsync({ key }, { multi: false })
    }

    const creds: AuthenticationCreds = await read("creds") || initAuthCreds()

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data: { [_: string]: SignalDataTypeMap[typeof type] } = {}
                    await Promise.all(
                        ids.map(async id => {
                            let value = await read(`${type}-${id}`)

                            // Igual à implementação oficial do Baileys (use-multi-file-auth-state): fromObject
                            // converte o objeto salvo em JSON de volta para a mensagem protobuf correta
                            if (type === "app-state-sync-key" && value) {
                                value = WAProto.Message.AppStateSyncKeyData.fromObject(value)
                            }

                            data[id] = value
                        })
                    )

                    return data
                },
                set: async (data) => {
                    const tasks: Promise<void>[] = [];
                    for (const [category, entries] of Object.entries(data)) {
                        for (const [id, value] of Object.entries(entries ?? {})) {
                            const key = `${category}-${id}`
                            tasks.push(value ? write(value, key) : remove(key))
                        }
                    }
                    await Promise.all(tasks)
                }
            }
        },
        saveCreds: async () => {
            await write(creds, "creds")
        }
    }
}

export async function cleanCreds() {
    await db.removeAsync({}, { multi: true })
}
