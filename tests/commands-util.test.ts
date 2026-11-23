/**
 * Testes unitários de utils/commands.util.ts e do buildText (prefixo injetado).
 */
import { test } from "node:test";
import infoCommands from "../src/commands/info.list.commands.js";
import utilityCommands from "../src/commands/utility.list.commands.js";
import downloadCommands from "../src/commands/download.list.commands.js";
import stickerCommands from "../src/commands/sticker.list.commands.js";
import miscCommands from "../src/commands/misc.list.commands.js";
import groupCommands from "../src/commands/group.list.commands.js";
import adminCommands from "../src/commands/admin.list.commands.js";
import gameCommands from "../src/commands/game.list.commands.js";
import engagementCommands from "../src/commands/engagement.list.commands.js";
import { BotService } from "../src/services/bot.service.js";
import assert from "node:assert/strict";
import { registerCommands, commandExist, getCommands, getCommandCategory, getCommandGuide, getCommandsByCategory, messageErrorCommandUsage } from "../src/utils/commands.util.js";
import { buildText, setPrefixProvider } from "../src/utils/general.util.js";

const empty = {};

// Estes testes trocam o registro de comandos e o prefixo; cada um devolve os reais ao terminar
// (na cobertura, todos os arquivos de teste rodam no mesmo processo).
function restoreReal() {
  registerCommands({ info: infoCommands, utility: utilityCommands, download: downloadCommands, sticker: stickerCommands, misc: miscCommands, group: groupCommands, admin: adminCommands, game: gameCommands, engagement: engagementCommands });
  setPrefixProvider(() => new BotService().getBot().prefix);
}
const isolated = (fn: () => void | Promise<void>) => async () => { try { await fn(); } finally { restoreReal(); } };
const registry = {
  info: { menu: { guide: "guia do menu {$p}menu" } }, utility: { clima: { guide: "guia clima" } },
  download: {}, sticker: { s: { guide: "guia sticker" } }, misc: empty, group: { mt: { guide: "guia mt" } },
  admin: {}, game: {}, engagement: {},
};

test("buildText: substitui parâmetros e o prefixo atual", isolated(() => {
  setPrefixProvider(() => "#");
  assert.equal(buildText("Use {$p}menu {$1} e {$2}", "a", 2), "Use #menu a e 2");
  assert.equal(buildText("sem prefixo {$1}{$1}", "x"), "sem prefixo xx");
  assert.equal(buildText("{$3} não informado"), "{$3} não informado");
}));

test("commands.util: registro, categorias e existência", isolated(() => {
  registerCommands(registry);
  assert.deepEqual(getCommands("!").sort(), ["!clima", "!menu", "!mt", "!s"]);
  assert.deepEqual(getCommandsByCategory("!", "group"), ["!mt"]);
  assert.equal(getCommandCategory("!", "!menu"), "info");
  assert.equal(getCommandCategory("!", "!nada"), null);
  assert.equal(commandExist("!", "!s"), true);
  assert.equal(commandExist("!", "!s", "info"), false);
  assert.equal(commandExist("!", "!inexistente"), false);
  assert.equal(commandExist("!", "!constructor"), false, "propriedades do protótipo não são comandos");
}));

test("commands.util: guia do comando e mensagem de uso incorreto", isolated(() => {
  setPrefixProvider(() => "!");
  registerCommands(registry);
  assert.match(getCommandGuide("!", "!menu"), /guia do menu !menu$/);
  assert.match(getCommandGuide("!", "!nada"), /guia|Não foi encontrado/i);
  const usage = messageErrorCommandUsage("!", { command: "!mt" } as any);
  assert.match(usage, /!mt/);
  assert.match(usage, /guia mt/);
}));

test("commands.util: erro explícito se o registro não foi inicializado", async () => {
  // Instância nova do módulo (query na URL), sem registerCommands().
  const fresh = await import("../src/utils/commands.util.js?sem-registro" as string);
  assert.throws(() => fresh.getCommands("!"), /Registro de comandos não inicializado/);
});

test("buildText: texto do usuário com $&, $$ e $` entra literalmente (BUG-05)", isolated(() => {
  setPrefixProvider(() => "!");
  assert.equal(buildText("Olá {$1}!", "Jo$&o"), "Olá Jo$&o!");
  assert.equal(buildText("Prêmio: {$1}", "US$$ 10"), "Prêmio: US$$ 10");
  assert.equal(buildText("Nome: {$1}", "a$`b"), "Nome: a$`b");
  assert.equal(buildText("{$p}{$1}", "$1"), "!$1");
}));
