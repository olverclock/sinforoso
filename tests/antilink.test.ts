/**
 * BUG-01 (P1) — ReDoS no anti-link (helpers/message.procedures.helper.ts → isDetectedByAntiLink).
 * A regex antiga tinha custo quadrático: uma mensagem de ~65 mil caracteres travava o event loop
 * por 2–2,6 s (medido), congelando o bot em todos os grupos.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { findLinks } from "../src/utils/general.util.js";
import { isDetectedByAntiLink } from "../src/helpers/message.procedures.helper.js";
import { GroupController } from "../src/controllers/group.controller.js";

/** Regex original, mantida aqui só como referência de comportamento. */
const legacy = (text: string) => text.match(new RegExp(/(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/[^\s]*)?/img));

const corpus = [
  "bom dia pessoal", "olha isso https://www.youtube.com/watch?v=abc123", "entra ai: chat.whatsapp.com/ABCdef123",
  "site.com.br e outro.net/pagina?x=1", "HTTP://EXEMPLO.COM:8080/a/b", "email joao@gmail.com", "versão 1.2.3",
  "fim de frase.Começo", "sub-dominio.exemplo.org", "www.google.com", "https://a.b.c.d.e.example.co.uk/path",
  "texto -abc.com com hifen", "xhttps://site.com colado", "nada aqui...", "3.14 e 2.71", "multi\nlinha\nlink.io",
  "wa.me/5511999999999", "link no fim site.dev", "IP 192.168.0.1", "porta site.com:99999",
  // protocolo que começa antes do fim do link anterior (equivale ao lastIndex da busca global)
  "x.comhttp://site.com", "a.cohttps://www.b.com", "z.orghttps://y.net/p",
];

test("findLinks: mesma detecção da regex original em mensagens comuns", () => {
  for (const text of corpus) {
    assert.deepEqual(findLinks(text), legacy(text), `divergência em: ${JSON.stringify(text)}`);
  }
});

test("findLinks: tempo linear em entradas adversariais de 65 mil caracteres", () => {
  const attacks = ["a".repeat(65000), "a-".repeat(32500) + "!", "a.".repeat(32500) + "1", "1".repeat(65000) + ".c"];
  for (const text of attacks) {
    const t = performance.now();
    findLinks(text);
    const ms = performance.now() - t;
    assert.ok(ms < 250, `levou ${ms.toFixed(0)} ms (limite 250 ms)`);
  }
});

test("findLinks: domínios com rótulos dentro do limite do DNS continuam detectados", () => {
  const label = "a".repeat(63);
  assert.deepEqual(findLinks(`${label}.com`), [`${label}.com`]);
  assert.ok(findLinks(`${"b".repeat(100)}.com`)?.length, "rótulo longo ainda é tratado como link (parte final)");
});

test("isDetectedByAntiLink: mensagem adversarial não trava o bot", async () => {
  mock.method(GroupController.prototype, "getAdminsIds", async () => ["bot@s.whatsapp.net"]);
  const group = { id: "g@g.us", antilink: { status: true, exceptions: [] } } as any;
  const botInfo = { host_number: "bot@s.whatsapp.net", name: "Bot", prefix: "!" } as any;
  const message = { body: "a-".repeat(32500) + "!", caption: "", isGroupAdmin: false, sender: "u@s.whatsapp.net" } as any;
  const t = performance.now();
  const detected = await isDetectedByAntiLink({} as any, botInfo, group, message);
  const ms = performance.now() - t;
  assert.equal(detected, false);
  assert.ok(ms < 250, `levou ${ms.toFixed(0)} ms (limite 250 ms)`);
  mock.restoreAll();
});

test("findLinks: teste diferencial contra a regex original (entradas aleatórias)", () => {
  // Alfabeto com os caracteres que mudam o comportamento da regex: rótulos, separadores, protocolo, porta e caminho.
  const tokens = ["a", "b", "Z", "1", "9", ".", ".", "-", ":", "/", " ", "\n", "co", "com", "br", "http://", "https://", "www.", "HTTPS://WWW.", ":80", "/x?y", "@", "!", ".."];
  let seed = 20261117;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 20000; i++) {
    let text = "";
    const len = 1 + Math.floor(rand() * 30);
    for (let j = 0; j < len; j++) text += tokens[Math.floor(rand() * tokens.length)];
    assert.deepEqual(findLinks(text), legacy(text), `divergência em: ${JSON.stringify(text)}`);
  }
});
