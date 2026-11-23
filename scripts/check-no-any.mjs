#!/usr/bin/env node
/**
 * Gate de qualidade: falha se houver o tipo `any` explícito em src/ (análise pela AST do TypeScript,
 * então comentários e textos não contam). Use `unknown` + verificação de tipo no lugar.
 * Uso: npm run check:any
 */
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.ts$/.test(f)) files.push(p); } })(path.resolve("src"));

const found = [];
for (const file of files) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const visit = (n) => {
    if (n.kind === ts.SyntaxKind.AnyKeyword) {
      const { line, character } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
      found.push(`${path.relative(process.cwd(), file).split(path.sep).join("/")}:${line + 1}:${character + 1}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

if (found.length) {
  console.error(`✖ ${found.length} uso(s) de 'any' em src/:`);
  for (const f of found) console.error("  " + f);
  process.exit(1);
}
console.log(`✔ nenhum 'any' explícito em src/ (${files.length} arquivos)`);
