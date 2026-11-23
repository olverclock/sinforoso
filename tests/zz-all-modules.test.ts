/**
 * Carrega todos os módulos de src/ para que o relatório de cobertura use o projeto inteiro como
 * denominador (o Node só reporta arquivos carregados). Também verifica que nenhum módulo quebra
 * ao ser importado.
 *
 * Fica de fora apenas src/app.ts: importá-lo executa init(), que conecta ao WhatsApp.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.env.SINFOROSO_PROJECT_ROOT ?? process.cwd();
const SRC = path.join(ROOT, "src");
const EXCLUDED = new Set(["app.ts", "modules.d.ts"]);

const files: string[] = [];
(function walk(dir: string) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (f !== "media") walk(p); }
    else if (f.endsWith(".ts") && !f.endsWith(".d.ts") && !EXCLUDED.has(path.relative(SRC, p)) && (!process.env.MODULE_FILTER || new RegExp(process.env.MODULE_FILTER).test(p.split(path.sep).join("/")))) files.push(p);
  }
})(SRC);

test("todos os módulos de src/ (exceto app.ts) carregam sem erro", async () => {
  assert.ok(process.env.MODULE_FILTER ? files.length > 0 : files.length > 60, `poucos módulos encontrados: ${files.length}`);
  for (const file of files) {
    await assert.doesNotReject(import(pathToFileURL(file).href), `falhou ao importar ${path.relative(SRC, file)}`);
  }
});
