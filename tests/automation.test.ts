/**
 * BUG-02 (P1) — startFreeGamesMonitor criava um novo setInterval a cada reconexão, preso ao socket
 *   antigo (fechado). O primeiro envio falhava, o laço era abortado e as ofertas já tinham sido
 *   marcadas como notificadas: notificações perdidas + vazamento de sockets antigos.
 * BUG-03 (P1) — callbacks de timer chamavam sendText sem tratamento de erro. Em Node 24 uma
 *   rejeição não tratada encerra o processo (bot removido do grupo, conexão caída etc.).
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { AutomationService } from "../src/services/automation.service.js";
import { FreeStuffService } from "../src/services/freestuff.service.js";
import { GameService } from "../src/services/game.service.js";

const failingClient = () => ({
  presenceSubscribe: async () => { throw new Error("socket fechado") },
  sendPresenceUpdate: async () => { throw new Error("socket fechado") },
  sendMessage: async () => { throw new Error("socket fechado") },
}) as any;

/** Captura rejeições não tratadas durante `fn` (sem o listener, o Node encerraria o processo). */
async function captureUnhandled(fn: () => Promise<void>) {
  const seen: unknown[] = [];
  const onRejection = (reason: unknown) => seen.push(reason);
  process.on("unhandledRejection", onRejection);
  try { await fn(); await new Promise(r => setTimeout(r, 50)); } finally { process.off("unhandledRejection", onRejection); }
  return seen;
}

test("startFreeGamesMonitor: reconexões não criam monitores duplicados e usam o socket atual", async () => {
  const free = FreeStuffService.getInstance();
  mock.method(free, "getGiveaways", async () => []);
  const intervals: unknown[] = [];
  const realSetInterval = globalThis.setInterval;
  mock.method(globalThis, "setInterval", (fn: any, ms: number) => { const h = realSetInterval(fn, ms); h.unref(); intervals.push(h); return h; });

  const service = AutomationService.getInstance();
  const clientA = { id: "A" } as any, clientB = { id: "B" } as any;
  await service.startFreeGamesMonitor(clientA);
  await service.startFreeGamesMonitor(clientB);

  assert.equal(intervals.length, 1, "deve existir um único monitor");
  assert.equal((service as any).freeGamesClient, clientB, "o monitor deve usar o socket mais recente");
  intervals.forEach(h => clearInterval(h as any));
  mock.restoreAll();
});

test("scheduleGameExpiration: falha de envio no timeout não derruba o processo", async () => {
  const game = GameService.getInstance();
  mock.method(game, "getActiveGame", () => ({ status: "waiting_answer", lastTime: Date.now() - 60_000 }));
  mock.method(game, "expireGame", () => undefined);
  mock.method(console, "log", () => undefined);
  mock.method(console, "error", () => undefined);

  const unhandled = await captureUnhandled(async () => {
    AutomationService.getInstance().scheduleGameExpiration(failingClient(), "g@g.us", 10);
    await new Promise(r => setTimeout(r, 700));
  });
  assert.deepEqual(unhandled, [], "nenhuma rejeição pode escapar do timer");
  mock.restoreAll();
});
