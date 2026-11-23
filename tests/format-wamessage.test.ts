/**
 * Teste de caracterização de formatWAMessage (utils/whatsapp.util.ts).
 *
 * O "golden" (tests/fixtures/format-wamessage.golden.json) foi gerado com a implementação
 * ANTERIOR à refatoração de complexidade. Qualquer mudança de comportamento faz o teste falhar.
 * Para regenerar conscientemente: UPDATE_GOLDEN=1 npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { formatWAMessage } from "../src/utils/whatsapp.util.js";

const ROOT = process.env.SINFOROSO_PROJECT_ROOT ?? process.cwd();
const GOLDEN = path.join(ROOT, "tests", "fixtures", "format-wamessage.golden.json");
const HOST = "5511900000000@s.whatsapp.net";
const GROUP = { id: "120363000000000000@g.us", name: "Grupo Teste" } as any;
const ADMINS = [{ id: "5511911111111@s.whatsapp.net", owner: true }, { id: "5511922222222@s.whatsapp.net", owner: false }] as any[];

const lookups = (groupAdmins: string[] = []) => ({
  getBotAdmins: async () => ADMINS,
  isParticipantAdmin: async (_g: string, u: string) => groupAdmins.includes(u),
});

const key = (over: Record<string, unknown> = {}) => ({ remoteJid: "5511933333333@s.whatsapp.net", id: "MSG1", fromMe: false, ...over });
const media = (extra: Record<string, unknown> = {}) => ({ mimetype: "image/jpeg", url: "https://mmg.whatsapp.net/x", fileLength: 1234, ...extra });

type Case = { name: string, m: any, group?: any, groupAdmins?: string[] };
const cases: Case[] = [
  { name: "texto simples com comando e args", m: { key: key(), messageTimestamp: 1700000000, pushName: "Ana", message: { conversation: "!Menu  2 extra" } } },
  { name: "comando em negrito e maiúsculas", m: { key: key(), messageTimestamp: 1700000000, pushName: "Ana", message: { conversation: "*!STICKER*" } } },
  { name: "texto vazio", m: { key: key(), messageTimestamp: 1700000000, message: { conversation: "" } } },
  { name: "extendedText com menções e expiração", m: { key: key(), messageTimestamp: 1700000001, pushName: "Bia", message: { extendedTextMessage: { text: "!ban @x", contextInfo: { mentionedJid: ["5511944444444@s.whatsapp.net"], expiration: 86400 } } } } },
  { name: "mensagem do próprio bot (fromMe)", m: { key: key({ fromMe: true }), messageTimestamp: 1700000002, message: { conversation: "oi" } } },
  { name: "remetente é dono do bot", m: { key: key({ remoteJid: "5511911111111@s.whatsapp.net" }), messageTimestamp: 1700000003, message: { conversation: "!admin" } } },
  { name: "remetente é admin (não dono)", m: { key: key({ remoteJid: "5511922222222@s.whatsapp.net" }), messageTimestamp: 1700000003, message: { conversation: "!admin" } } },
  { name: "jid com sufixo de dispositivo", m: { key: key({ remoteJid: "5511955555555:12@s.whatsapp.net" }), messageTimestamp: 1700000004, message: { conversation: "x" } } },
  { name: "broadcast de status", m: { key: key({ remoteJid: "status@broadcast", participant: "5511966666666@s.whatsapp.net" }), messageTimestamp: 1700000005, message: { conversation: "status" } } },
  { name: "grupo: participante admin do grupo", group: GROUP, groupAdmins: ["5511977777777@s.whatsapp.net"], m: { key: key({ remoteJid: GROUP.id, participant: "5511977777777@s.whatsapp.net" }), messageTimestamp: 1700000006, pushName: "Caio", message: { conversation: "!mt" } } },
  { name: "grupo: participante comum", group: GROUP, groupAdmins: ["5511977777777@s.whatsapp.net"], m: { key: key({ remoteJid: GROUP.id, participant: "5511988888888@s.whatsapp.net" }), messageTimestamp: 1700000006, message: { conversation: "!mt" } } },
  { name: "imagem com legenda e mídia completa", m: { key: key(), messageTimestamp: 1700000007, message: { imageMessage: { caption: "!s legenda", ...media() } } } },
  { name: "imagem sem url (descartada)", m: { key: key(), messageTimestamp: 1700000007, message: { imageMessage: { caption: "x", mimetype: "image/jpeg", fileLength: 1 } } } },
  { name: "vídeo com duração", m: { key: key(), messageTimestamp: 1700000008, message: { videoMessage: { caption: "", seconds: 7, ...media({ mimetype: "video/mp4" }) } } } },
  { name: "vídeo com seconds 0", m: { key: key(), messageTimestamp: 1700000008, message: { videoMessage: { seconds: 0, ...media({ mimetype: "video/mp4" }) } } } },
  { name: "áudio", m: { key: key(), messageTimestamp: 1700000009, message: { audioMessage: { seconds: 3, ...media({ mimetype: "audio/ogg" }) } } } },
  { name: "figurinha", m: { key: key(), messageTimestamp: 1700000010, message: { stickerMessage: media({ mimetype: "image/webp" }) } } },
  { name: "documento", m: { key: key(), messageTimestamp: 1700000011, message: { documentMessage: { caption: "doc", ...media({ mimetype: "application/pdf" }) } } } },
  { name: "tipo não permitido (reação)", m: { key: key(), messageTimestamp: 1700000012, message: { reactionMessage: { text: "👍" } } } },
  { name: "sem message", m: { key: key(), messageTimestamp: 1700000013 } },
  { name: "sem id (descartada)", m: { key: key({ id: undefined }), messageTimestamp: 1700000014, message: { conversation: "x" } } },
  { name: "sem timestamp (descartada)", m: { key: key(), message: { conversation: "x" } } },
  { name: "citação de texto", m: { key: key(), messageTimestamp: 1700000015, message: { extendedTextMessage: { text: "!s", contextInfo: { stanzaId: "Q1", participant: "5511999999999@s.whatsapp.net", quotedMessage: { conversation: "texto citado" } } } } } },
  { name: "citação do próprio bot", m: { key: key(), messageTimestamp: 1700000015, message: { extendedTextMessage: { text: "!s", contextInfo: { stanzaId: "Q2", participant: HOST, quotedMessage: { extendedTextMessage: { text: "resposta do bot" } } } } } } },
  { name: "citação de imagem com mídia", m: { key: key(), messageTimestamp: 1700000016, message: { extendedTextMessage: { text: "!s", contextInfo: { stanzaId: "Q3", participant: "5511999999999@s.whatsapp.net", quotedMessage: { imageMessage: { caption: "legenda citada", ...media() } } } } } } },
  { name: "citação de vídeo com seconds", m: { key: key(), messageTimestamp: 1700000016, message: { extendedTextMessage: { text: "!s", contextInfo: { stanzaId: "Q4", participant: "5511999999999@s.whatsapp.net", quotedMessage: { videoMessage: { seconds: 5, ...media({ mimetype: "video/mp4" }) } } } } } } },
  { name: "citação de mídia sem url (descartada)", m: { key: key(), messageTimestamp: 1700000016, message: { extendedTextMessage: { text: "!s", contextInfo: { stanzaId: "Q5", participant: "5511999999999@s.whatsapp.net", quotedMessage: { imageMessage: { mimetype: "image/jpeg", fileLength: 1 } } } } } } },
  { name: "citação sem participante usa remoteJid", m: { key: key(), messageTimestamp: 1700000017, message: { extendedTextMessage: { text: "x", contextInfo: { stanzaId: "Q6", remoteJid: "5511912121212@s.whatsapp.net", quotedMessage: { conversation: "c" } } } } } },
  { name: "imagem citando texto", m: { key: key(), messageTimestamp: 1700000018, message: { imageMessage: { caption: "!s", ...media(), contextInfo: { stanzaId: "Q7", participant: "5511999999999@s.whatsapp.net", quotedMessage: { conversation: "c" } } } } } },
  { name: "comando com espaços no início", m: { key: key(), messageTimestamp: 1700000019, message: { conversation: "   !menu   x" } } },
  { name: "fromMe ausente na key", m: { key: { remoteJid: "5511933333333@s.whatsapp.net", id: "MSG2" }, messageTimestamp: 1700000020, message: { conversation: "oi" } } },
  { name: "sem remoteJid (descartada)", m: { key: { id: "MSG3", fromMe: false }, messageTimestamp: 1700000021, message: { conversation: "oi" } } },
  { name: "tipo não permitido com campos de mídia", m: { key: key(), messageTimestamp: 1700000022, message: { locationMessage: { degreesLatitude: 1, ...media() } } } },
  { name: "citação sem participant e sem remoteJid (descartada)", m: { key: key(), messageTimestamp: 1700000023, message: { extendedTextMessage: { text: "!s", contextInfo: { stanzaId: "Q8", quotedMessage: { conversation: "c" } } } } } },
  { name: "citação com tipo desconhecido (descartada)", m: { key: key(), messageTimestamp: 1700000024, message: { extendedTextMessage: { text: "!s", contextInfo: { stanzaId: "Q9", participant: "5511999999999@s.whatsapp.net", quotedMessage: { messageContextInfo: {} } } } } } },
];

/** Remove campos não determinísticos (o wa_message citado carrega timestamp atual). */
function snapshot(result: any) {
  if (!result) return result ?? null;
  const copy = JSON.parse(JSON.stringify(result));
  delete copy.wa_message;
  if (copy.quotedMessage) {
    const q = copy.quotedMessage.wa_message;
    copy.quotedMessage.wa_message = q ? { key: q.key, message: q.message } : q;
  }
  return copy;
}

const results: Record<string, unknown> = {};
for (const c of cases) {
  test(`formatWAMessage: ${c.name}`, async () => {
    const out = snapshot(await formatWAMessage(c.m, c.group ?? null, HOST, lookups(c.groupAdmins)));
    results[c.name] = out;
    if (process.env.UPDATE_GOLDEN) return;
    const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
    assert.ok(c.name in golden, `caso sem golden: ${c.name}`);
    assert.deepEqual(out, golden[c.name]);
  });
}

test("formatWAMessage: grava golden quando UPDATE_GOLDEN=1", { skip: !process.env.UPDATE_GOLDEN }, () => {
  fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
  fs.writeFileSync(GOLDEN, JSON.stringify(results, null, 2) + "\n");
});
