import {WASocket, BaileysEvent, BaileysEventMap} from 'baileys'
import NodeCache from 'node-cache'

type QueuedEvent = { event: BaileysEvent, data: unknown }
/** Formatos usados na deduplicação (os mesmos campos lidos antes via any). */
type ParticipantsUpdateData = { id: string, participants: string[] }
type GroupsUpsertData = { id: string }[]

export async function executeEventQueue(client: WASocket, eventsCache: NodeCache){
    const eventsQueue = eventsCache.get("events") as QueuedEvent[]

    for (let ev of eventsQueue) {
        client.ev.emit(ev.event, ev.data as BaileysEventMap[typeof ev.event])
    }
    
    eventsCache.set("events", [])
}

export async function queueEvent(eventsCache: NodeCache, eventName: BaileysEvent, eventData: unknown){
    let queueArray = eventsCache.get("events") as QueuedEvent[]

    // Mantém só o evento mais recente por chave. Antes, splice() dentro de forEach() pulava o
    // item seguinte ao removido, deixando duplicatas consecutivas na fila.
    if (eventName == 'group-participants.update'){
        const update = eventData as ParticipantsUpdateData
        queueArray = queueArray.filter((queue) => !(queue.event == 'group-participants.update' && (queue.data as ParticipantsUpdateData).participants[0] == update.participants[0] && (queue.data as ParticipantsUpdateData).id == update.id))
    }

    if (eventName == 'groups.upsert'){
        const groups = eventData as GroupsUpsertData
        queueArray = queueArray.filter((queue) => !(queue.event == 'groups.upsert' && (queue.data as GroupsUpsertData)[0].id == groups[0].id))
    }

    queueArray.push({event: eventName, data: eventData})
    eventsCache.set("events", queueArray)
}
