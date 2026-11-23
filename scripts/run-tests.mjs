#!/usr/bin/env node
/**
 * Executa os testes automatizados (node:test + tsx) num diretório de trabalho TEMPORÁRIO.
 *
 * Os serviços abrem bancos NeDB em caminhos relativos ("storage/...") assim que são importados.
 * Rodar os testes na raiz do projeto tocaria os dados reais do bot, então o processo de teste
 * roda com cwd = pasta temporária (com storage/ vazio e uma cópia do package.json).
 *
 * Uso:
 *   npm test                  -> todos os testes
 *   npm run test:coverage     -> todos os testes + relatório de cobertura de src/
 *   node scripts/run-tests.mjs tests/arquivo.test.ts   -> só os arquivos indicados
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const tsxLoader = pathToFileURL(require.resolve("tsx/esm")).href;

const args = process.argv.slice(2);
const coverage = args.includes("--coverage");
const explicit = args.filter((a) => !a.startsWith("--"));
const testsDir = path.join(ROOT, "tests");
const files = explicit.length
  ? explicit.map((f) => path.resolve(ROOT, f))
  : fs.readdirSync(testsDir).filter((f) => f.endsWith(".test.ts")).sort().map((f) => path.join(testsDir, f));

const work = fs.mkdtempSync(path.join(os.tmpdir(), "sinforoso-tests-"));
fs.mkdirSync(path.join(work, "storage"), { recursive: true });
fs.copyFileSync(path.join(ROOT, "package.json"), path.join(work, "package.json"));

const nodeArgs = ["--enable-source-maps", "--import", tsxLoader, "--test", "--test-concurrency=1", "--test-reporter=spec"];
if (coverage) {
  nodeArgs.push(
    // Um único processo: o Node 24 falha ao MESCLAR cobertura de vários processos que carregam os
    // mesmos módulos ("Cannot read properties of undefined (reading 'startOffset')").
    "--test-isolation=none",
    "--experimental-test-coverage",
    `--test-coverage-include=${path.join(ROOT, "src", "**").split(path.sep).join("/")}`,
    `--test-coverage-exclude=${path.join(ROOT, "src", "data", "**").split(path.sep).join("/")}`,
  );
}
nodeArgs.push(...files);

const result = spawnSync(process.execPath, nodeArgs, {
  cwd: work,
  stdio: "inherit",
  env: { ...process.env, SINFOROSO_PROJECT_ROOT: ROOT, FORCE_COLOR: "0" },
});
fs.rmSync(work, { recursive: true, force: true });
process.exit(result.status ?? 1);
