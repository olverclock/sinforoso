/**
 * Regras arquiteturais do Sinforoso WhatsApp (dependency-cruiser 18.7.2).
 *
 * Cada regra referencia um ID da matriz em docs/ARCHITECTURE_RULES.md.
 * Violações preexistentes ficam em .dependency-cruiser-known-violations.json
 * (baseline) e não bloqueiam; qualquer violação NOVA retorna exit code != 0.
 *
 * Caminhos são relativos ao diretório onde o comando é executado (raiz do
 * projeto, ou a pasta de um fixture em arch-fixtures/ durante os testes).
 */

/** Helpers de texto/dados: folhas sem dependências internas. */
const LEAF_HELPERS =
  "^src/helpers/(bot\\.texts|cardgame\\.texts|entertainment\\.data|session\\.auth)\\.helper\\.ts$";

/** Helpers que orquestram o fluxo (roteamento, processamento, sincronização). */
const ORCHESTRATION_HELPERS =
  "^src/helpers/(command\\.invoker|message\\.handler|message\\.procedures|groups\\.sync|events\\.queue|database\\.migrate)\\.helper\\.ts$";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "ARCH-001",
      comment:
        "interfaces/ contém somente tipos e só pode depender de outras interfaces.",
      severity: "error",
      from: { path: "^src/interfaces/" },
      to: { path: "^src/", pathNot: "^src/interfaces/" },
    },
    {
      name: "ARCH-002",
      comment: "data/ (dados estáticos) só pode depender de interfaces/.",
      severity: "error",
      from: { path: "^src/data/" },
      to: { path: "^src/", pathNot: "^src/(data|interfaces)/" },
    },
    {
      name: "ARCH-003",
      comment:
        "services/ não pode depender de controllers/, commands/, events/, helpers/ nem dos arquivos de composição da raiz.",
      severity: "error",
      from: { path: "^src/services/" },
      to: {
        path: "^src/((controllers|commands|events|helpers)/|[^/]+\\.ts$)",
        pathNot: "^src/modules\\.d\\.ts$",
      },
    },
    {
      name: "ARCH-004",
      comment: "controllers/ só pode depender de services/ e interfaces/.",
      severity: "error",
      from: { path: "^src/controllers/" },
      to: { path: "^src/", pathNot: "^src/(controllers|services|interfaces)/" },
    },
    {
      name: "ARCH-005",
      comment: "Somente socket.ts pode registrar/importar handlers de events/.",
      severity: "error",
      from: { pathNot: "^src/socket\\.ts$" },
      to: { path: "^src/events/" },
    },
    {
      name: "ARCH-006a",
      comment: "app.ts é o ponto de entrada; nenhum módulo pode importá-lo.",
      severity: "error",
      from: {},
      to: { path: "^src/app\\.ts$" },
    },
    {
      name: "ARCH-006b",
      comment: "socket.ts só pode ser importado por app.ts.",
      severity: "error",
      from: { pathNot: "^src/app\\.ts$" },
      to: { path: "^src/socket\\.ts$" },
    },
    {
      name: "ARCH-006c",
      comment: "config.ts (config do socket) só pode ser importado por app.ts ou socket.ts.",
      severity: "error",
      from: { pathNot: "^src/(app|socket)\\.ts$" },
      to: { path: "^src/config\\.ts$" },
    },
    {
      name: "ARCH-007a",
      comment:
        "Helpers de texto/dados (bot.texts, cardgame.texts, entertainment.data, session.auth) não dependem de módulos internos.",
      severity: "error",
      from: { path: LEAF_HELPERS },
      to: { path: "^src/" },
    },
    {
      name: "ARCH-007b",
      comment: "menu.builder.helper só pode depender de interfaces/.",
      severity: "error",
      from: { path: "^src/helpers/menu\\.builder\\.helper\\.ts$" },
      to: { path: "^src/", pathNot: "^src/interfaces/" },
    },
    {
      name: "ARCH-008",
      comment:
        "commands/ não pode depender de events/ nem dos helpers de orquestração (fluxo é invoker -> commands, nunca o inverso).",
      severity: "error",
      from: { path: "^src/commands/" },
      to: { path: `^src/events/|${ORCHESTRATION_HELPERS}` },
    },
    {
      name: "ARCH-009",
      comment:
        "Isolamento entre categorias: commands/<cat>.* só pode importar commands/<cat>.*.",
      severity: "error",
      from: { path: "^src/commands/([^./]+)\\." },
      to: { path: "^src/commands/", pathNot: "^src/commands/$1\\." },
    },
    {
      name: "ARCH-010",
      comment:
        "Somente command.invoker e message.procedures (roteadores) podem importar commands/.",
      severity: "error",
      from: {
        path: "^src/helpers/",
        pathNot: "^src/helpers/(command\\.invoker|message\\.procedures)\\.helper\\.ts$",
      },
      to: { path: "^src/commands/" },
    },
    {
      name: "ARCH-011",
      comment:
        "utils/ é camada base: não pode depender de commands/, controllers/ nem services/.",
      severity: "error",
      from: { path: "^src/utils/" },
      to: { path: "^src/(commands|controllers|services)/" },
    },
    {
      name: "ARCH-012",
      comment: "Proibido introduzir dependências circulares (imports estáticos, dinâmicos e de tipo).",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/commands/" },
      to: { circular: true },
    },
    {
      name: "ARCH-012-commands",
      comment:
        "Ciclos a partir de commands/. EXCEÇÃO ARCH-012-EX: ciclos formados apenas por <cat>.list.commands e <cat>.functions.commands da MESMA categoria são permitidos (padrão do projeto).",
      severity: "error",
      from: { path: "^src/commands/([^./]+)\\." },
      to: {
        circular: true,
        via: { pathNot: "^src/commands/$1\\.(list|functions)\\.commands\\.ts$" },
      },
    },
    {
      name: "ARCH-013a",
      comment:
        "Pacotes npm importados por src/ devem estar declarados em dependencies/optionalDependencies do package.json.",
      severity: "error",
      from: { path: "^src/" },
      to: { dependencyTypes: ["npm-no-pkg", "npm-unknown"] },
    },
    {
      name: "ARCH-013b",
      comment:
        "Código de produção não pode importar devDependencies (exceto tipos @types, apagados na compilação).",
      severity: "error",
      from: { path: "^src/" },
      to: {
        dependencyTypes: ["npm-dev"],
        dependencyTypesNot: ["type-only"],
        pathNot: "node_modules/@types/",
      },
    },
    {
      name: "ARCH-013c",
      comment: "Todo import relativo/pacote usado por src/ deve ser resolvível.",
      severity: "error",
      from: { path: "^src/" },
      to: { couldNotResolve: true },
    },
  ],
  options: {
    includeOnly: { path: ["^src/", "node_modules/"] },
    exclude: { path: ["^src/media/", "\\.d\\.ts$"] },
    doNotFollow: { path: "node_modules" },
    // Inclui imports apagados pelo tsc (tipos) para refletir o grafo do código-fonte.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
    skipAnalysisNotInRules: true,
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
