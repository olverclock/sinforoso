/**
 * BUG-04 (P3, latente) — queueEvent removia itens com splice() dentro de forEach(), o que pula o
 * elemento seguinte: duplicatas consecutivas da mesma chave não eram todas removidas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import NodeCache from "node-cache";
import { queueEvent } from "../src/helpers/events.queue.helper.js";

const part = (id: string, p: string, action = "add") => ({ id, participants: [p], action });

test("queueEvent: mantém só o evento mais recente por (grupo, participante)", async () => {
  const cache = new NodeCache();
  cache.set("events", [
    { event: "group-participants.update", data: part("g1", "u1", "add") },
    { event: "group-participants.update", data: part("g1", "u1", "remove") },
    { event: "group-participants.update", data: part("g1", "u2") },
  ]);
  await queueEvent(cache, "group-participants.update", part("g1", "u1", "promote"));
  const q = cache.get("events") as any[];
  assert.deepEqual(q.map(e => `${e.data.participants[0]}:${e.data.action}`), ["u2:add", "u1:promote"]);
});

test("queueEvent: groups.upsert deduplica pelo id do grupo e preserva outros eventos", async () => {
  const cache = new NodeCache();
  cache.set("events", [
    { event: "groups.upsert", data: [{ id: "g1", v: 1 }] },
    { event: "groups.upsert", data: [{ id: "g1", v: 2 }] },
    { event: "groups.update", data: [{ id: "g1" }] },
  ]);
  await queueEvent(cache, "groups.upsert", [{ id: "g1", v: 3 }]);
  const q = cache.get("events") as any[];
  assert.deepEqual(q.map(e => `${e.event}:${e.data[0].v ?? "-"}`), ["groups.update:-", "groups.upsert:3"]);
});

test("queueEvent: outros eventos apenas entram no fim da fila", async () => {
  const cache = new NodeCache();
  cache.set("events", [{ event: "groups.update", data: [{ id: "g1" }] }]);
  await queueEvent(cache, "groups.update", [{ id: "g1" }]);
  assert.equal((cache.get("events") as any[]).length, 2);
});
