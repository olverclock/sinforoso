#!/usr/bin/env node
/**
 * Relatório de complexidade (somente leitura) usando o compilador TypeScript do projeto.
 * - Ciclomática (McCabe): 1 + if, ?:, case, for/for-in/for-of/while/do, catch, &&, ||, ??
 * - Cognitiva (SonarSource, aproximada): +1 por if/else if/else/switch/laço/catch/?:/sequência de
 *   operadores lógicos/break-continue com rótulo; +nível de aninhamento para estruturas aninhadas.
 * Uso: node scripts/complexity-report.mjs [--json] [--top N] [--fail-cyclomatic N]
 */
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const top = Number(args[args.indexOf("--top") + 1]) || 25;
const failAt = args.includes("--fail-cyclomatic") ? Number(args[args.indexOf("--fail-cyclomatic") + 1]) : null;
const root = path.resolve("src");
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.ts$/.test(f) && !f.endsWith(".d.ts")) files.push(p); } })(root);

const isFn = (n) => ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isConstructorDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n);
const logical = new Set([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken]);

function fnName(n, sf) {
  if (n.name && ts.isIdentifier(n.name)) return n.name.text;
  if (ts.isConstructorDeclaration(n)) return "constructor";
  const p = n.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (p && ts.isPropertyAssignment(p)) return p.name.getText(sf);
  if (p && ts.isCallExpression(p)) return "<callback " + p.expression.getText(sf).slice(0, 30) + ">";
  return "<anon>";
}

function measure(fn, sf) {
  let cyc = 1, cog = 0;
  const visit = (n, nesting) => {
    if (n !== fn && isFn(n)) { visit2(n, nesting + 1); return; } // funções aninhadas: somam aninhamento (Sonar)
    switch (n.kind) {
      case ts.SyntaxKind.IfStatement: {
        cyc++;
        const isElseIf = n.parent && ts.isIfStatement(n.parent) && n.parent.elseStatement === n;
        cog += isElseIf ? 1 : 1 + nesting;
        visit(n.expression, nesting);
        visit(n.thenStatement, nesting + 1);
        if (n.elseStatement) {
          if (ts.isIfStatement(n.elseStatement)) visit(n.elseStatement, nesting);
          else { cog += 1; visit(n.elseStatement, nesting + 1); }
        }
        return;
      }
      case ts.SyntaxKind.ConditionalExpression: cyc++; cog += 1 + nesting; ts.forEachChild(n, c => visit(c, nesting + 1)); return;
      case ts.SyntaxKind.SwitchStatement: cog += 1 + nesting; ts.forEachChild(n, c => visit(c, nesting + 1)); return;
      case ts.SyntaxKind.CaseClause: cyc++; break;
      case ts.SyntaxKind.ForStatement: case ts.SyntaxKind.ForInStatement: case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement: case ts.SyntaxKind.DoStatement:
        cyc++; cog += 1 + nesting; ts.forEachChild(n, c => visit(c, nesting + 1)); return;
      case ts.SyntaxKind.CatchClause: cyc++; cog += 1 + nesting; ts.forEachChild(n, c => visit(c, nesting + 1)); return;
      case ts.SyntaxKind.BinaryExpression:
        if (logical.has(n.operatorToken.kind)) {
          cyc++;
          const parentSame = n.parent && ts.isBinaryExpression(n.parent) && n.parent.operatorToken.kind === n.operatorToken.kind;
          if (!parentSame) cog += 1;
        }
        break;
      case ts.SyntaxKind.BreakStatement: case ts.SyntaxKind.ContinueStatement: if (n.label) cog += 1; break;
    }
    ts.forEachChild(n, c => visit(c, nesting));
  };
  const visit2 = (inner, nesting) => { const body = inner.body; if (body) ts.forEachChild(inner, c => visit(c, nesting)); };
  if (fn.body) visit(fn.body, 0);
  const start = sf.getLineAndCharacterOfPosition(fn.getStart(sf)).line + 1;
  const end = sf.getLineAndCharacterOfPosition(fn.end).line + 1;
  return { cyc, cog, start, lines: end - start + 1, params: fn.parameters ? fn.parameters.length : 0 };
}

const rows = [];
for (const f of files) {
  const sf = ts.createSourceFile(f, fs.readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true);
  const walk = (n) => { if (isFn(n) && n.body) { const m = measure(n, sf); rows.push({ file: path.relative(process.cwd(), f).split(path.sep).join("/"), fn: fnName(n, sf), ...m }); } ts.forEachChild(n, walk); };
  walk(sf);
}
// Funções aninhadas também aparecem sozinhas; o relatório mostra todas.
const band = (c) => c <= 10 ? "1-10" : c <= 15 ? "11-15" : c <= 20 ? "16-20" : ">20";
const dist = rows.reduce((a, r) => (a[band(r.cyc)] = (a[band(r.cyc)] || 0) + 1, a), {});
if (args.includes("--json")) { console.log(JSON.stringify({ functions: rows.length, distribution: dist, rows }, null, 1)); }
else {
  console.log(`Funções analisadas: ${rows.length}`);
  console.log("Distribuição ciclomática:", JSON.stringify(dist));
  console.log(`Cognitiva > 15: ${rows.filter(r => r.cog > 15).length} · Funções > 60 linhas: ${rows.filter(r => r.lines > 60).length} · > 5 parâmetros: ${rows.filter(r => r.params > 5).length}`);
  console.log(`\nTop ${top} por complexidade ciclomática:`);
  for (const r of [...rows].sort((a, b) => b.cyc - a.cyc).slice(0, top)) console.log(`  CC=${String(r.cyc).padStart(3)} COG=${String(r.cog).padStart(3)} L=${String(r.lines).padStart(4)}  ${r.file}:${r.start} ${r.fn}`);
}
if (failAt !== null) {
  const bad = rows.filter(r => r.cyc > failAt);
  if (bad.length) {
    console.error(`
✖ ${bad.length} função(ões) acima do limite de complexidade ciclomática ${failAt}. Divida em funções menores:`);
    for (const r of bad) console.error(`  CC=${r.cyc}  ${r.file}:${r.start} ${r.fn}`);
    process.exitCode = 1;
  } else {
    console.log(`
✔ nenhuma função acima da complexidade ciclomática ${failAt}`);
  }
}
