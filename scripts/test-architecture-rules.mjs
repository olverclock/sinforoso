#!/usr/bin/env node
/**
 * Testes das regras arquiteturais (.dependency-cruiser.cjs) contra fixtures
 * controlados em arch-fixtures/. Não toca em src/.
 *
 * Cada cenário executa o dependency-cruiser com a configuração REAL do projeto
 * e compara as regras violadas com o resultado esperado.
 *
 * Uso: npm run test:architecture
 * Saída: exit code 0 se todos os cenários passarem, 1 caso contrário.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = path.join(ROOT, ".dependency-cruiser.cjs");
const FIXTURES = path.join(ROOT, "arch-fixtures");
const DEPCRUISE = path.join(ROOT, "node_modules", "dependency-cruiser", "bin", "dependency-cruiser.mjs");

/**
 * Executa o dependency-cruiser em `cwd` e devolve { exitCode, rules[] }.
 * O reporter "json" sempre sai com 0; o exit code é verificado numa segunda
 * execução com o reporter "err" — o mesmo usado por `npm run validate-architecture`.
 */
function cruise(cwd, { baseline } = {}) {
  const run = (outputType) => {
    const args = [DEPCRUISE, "src", "--config", CONFIG, "--output-type", outputType];
    if (baseline) args.push("--ignore-known", baseline);
    const res = spawnSync(process.execPath, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (res.error) throw res.error;
    return res;
  };
  const r = run("json");
  const exitCode = run("err").status;
  let result;
  try {
    result = JSON.parse(r.stdout);
  } catch {
    throw new Error(`Saída inválida do dependency-cruiser em ${cwd}:\n${r.stdout}\n${r.stderr}`);
  }
  const rules = result.summary.violations
    .filter((v) => v.rule.severity !== "ignore")
    .map((v) => `${v.rule.name} ${v.from} -> ${v.to}`)
    .sort();
  return { exitCode, rules };
}

function writeBaseline(cwd, file) {
  const r = spawnSync(
    process.execPath,
    [DEPCRUISE, "src", "--config", CONFIG, "--output-type", "baseline", "--output-to", file],
    { cwd, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`Falha ao gerar baseline: ${r.stderr}`);
}

/** Copia um fixture para um diretório temporário (para cenários que o modificam). */
function tempCopy(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `arch-${name}-`));
  fs.cpSync(path.join(FIXTURES, name), dir, { recursive: true });
  return dir;
}

function write(dir, rel, content) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const results = [];
function expect(id, title, actual, expectedRules, { failing }) {
  const exp = [...expectedRules].sort();
  const sameRules = JSON.stringify(actual.rules) === JSON.stringify(exp);
  const exitOk = failing ? actual.exitCode !== 0 : actual.exitCode === 0;
  const ok = sameRules && exitOk;
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id} — ${title}`);
  if (!ok) {
    console.log(`      exit code: ${actual.exitCode} (esperado ${failing ? "!= 0" : "0"})`);
    console.log(`      esperado: ${JSON.stringify(exp, null, 2)}`);
    console.log(`      obtido:   ${JSON.stringify(actual.rules, null, 2)}`);
  }
}

const fx = (name) => path.join(FIXTURES, name);

// A — dependências permitidas passam
expect("A", "fluxo helpers -> commands -> controllers -> services -> utils -> interfaces é permitido",
  cruise(fx("a-allowed")), [], { failing: false });

// B — dependências proibidas falham com a regra certa
expect("B", "dependências proibidas são identificadas (ARCH-001, ARCH-003, ARCH-009, ARCH-011)",
  cruise(fx("b-forbidden")),
  [
    "ARCH-001 src/interfaces/bad.interface.ts -> src/utils/whatsapp.util.ts",
    "ARCH-003 src/services/group.service.ts -> src/controllers/group.controller.ts",
    "ARCH-009 src/commands/admin.functions.commands.ts -> src/commands/sticker.functions.commands.ts",
    "ARCH-011 src/utils/whatsapp.util.ts -> src/services/group.service.ts",
  ],
  { failing: true });

// C — ciclo conhecido é detectado (o dependency-cruiser reporta cada ciclo uma vez)
expect("C", "ciclo utils/a.util <-> utils/b.util é detectado (ARCH-012)",
  cruise(fx("c-cycle")),
  [
    "ARCH-012 src/utils/a.util.ts -> src/utils/b.util.ts",
  ],
  { failing: true });

// D — relações válidas parecidas com violações não são rejeitadas
expect("D", "sem falso-positivo: helpers folha, import type, roteador, socket->events, import() dinâmico, node:*",
  cruise(fx("d-false-positive")), [], { failing: false });

// E — exceção aprovada ARCH-012-EX é respeitada
expect("E", "exceção ARCH-012-EX: ciclo group.list <-> group.functions é permitido",
  cruise(fx("e-approved-exception")), [], { failing: false });

// E2 — exceção do baseline: violação conhecida não bloqueia, uma nova bloqueia
{
  const dir = tempCopy("f-g-new-violation");
  try {
    write(dir, "src/utils/commands.util.ts",
      'import { infoCommands } from "../commands/info.list.commands.js"\nexport const all = [infoCommands]\n');
    const baseline = path.join(dir, "known-violations.json");
    writeBaseline(dir, baseline);
    expect("E2", "violação registrada no baseline não bloqueia",
      cruise(dir, { baseline }), [], { failing: false });
    write(dir, "src/helpers/bot.texts.helper.ts",
      'import { t } from "../utils/general.util.js"\nexport default { hello: "oi", t }\n');
    expect("E3", "com baseline ativo, somente a violação NOVA é reportada",
      cruise(dir, { baseline }),
      [
        "ARCH-007a src/helpers/bot.texts.helper.ts -> src/utils/general.util.ts",
        "ARCH-012 src/helpers/bot.texts.helper.ts -> src/utils/general.util.ts",
      ],
      { failing: true });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// F / G — introduzir violação falha; remover restaura a aprovação
{
  const dir = tempCopy("f-g-new-violation");
  try {
    expect("F0", "fixture limpo passa antes da mutação", cruise(dir), [], { failing: false });
    const bad = "src/controllers/info.controller.ts";
    write(dir, bad, 'import { infoCommands } from "../commands/info.list.commands.js"\nexport const c = infoCommands\n');
    expect("F", "violação nova controlada (controller -> commands) faz a verificação falhar",
      cruise(dir),
      ["ARCH-004 src/controllers/info.controller.ts -> src/commands/info.list.commands.ts"],
      { failing: true });
    fs.rmSync(path.join(dir, bad));
    expect("G", "remover a violação restaura a aprovação", cruise(dir), [], { failing: false });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} cenários passaram.`);
process.exit(failed ? 1 : 0);
