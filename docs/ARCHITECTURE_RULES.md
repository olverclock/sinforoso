# Regras Arquiteturais — Validação de Dependências

> Ferramenta: **dependency-cruiser 18.7.2** (MIT), devDependency com versão exata.
> Configuração: [`.dependency-cruiser.cjs`](../.dependency-cruiser.cjs) ·
> Baseline: [`.dependency-cruiser-known-violations.json`](../.dependency-cruiser-known-violations.json) ·
> Testes: [`scripts/test-architecture-rules.mjs`](../scripts/test-architecture-rules.mjs) + [`arch-fixtures/`](../arch-fixtures)
>
> Escopo exclusivo: ciclos, direção entre camadas, imports proibidos e isolamento.
> Nenhuma métrica de complexidade, acoplamento, cobertura ou lint geral.

## 1. Arquitetura observada

Pacote único TypeScript (ESM, `moduleResolution: Bundler`), MVC organizado por pastas:

```
app.ts → socket.ts → events/ → helpers/ (orquestração) → commands/ → controllers/ → services/
                                                                                    ↓
                                    utils/  ·  helpers/ (texto/dados)  ·  data/  ·  interfaces/
```

| Grupo | Arquivos | Papel |
|---|---|---|
| Raiz | `app.ts`, `socket.ts`, `config.ts` | Composição / ponto de entrada |
| `events/` | 5 handlers | Eventos do Baileys, registrados só por `socket.ts` |
| Helpers de orquestração | `command.invoker`, `message.handler`, `message.procedures`, `groups.sync`, `events.queue`, `database.migrate` | Roteamento e fluxo |
| Helpers folha | `bot.texts`, `cardgame.texts`, `entertainment.data`, `session.auth`, `menu.builder` | Textos, dados, sessão |
| `commands/` | pares `<cat>.list` + `<cat>.functions` | Comandos por categoria |
| `controllers/` | bot, group, user | Fachada sobre services |
| `services/` | 12 | Regras e persistência (NeDB) |
| `utils/` | 9 | Utilitários |
| `data/`, `interfaces/` | — | Dados estáticos e tipos |

## 2. Matriz de regras (aprovada em 2026-11-17)

| ID | Origem | Destino proibido | Violações na adoção |
|---|---|---|---|
| ARCH-001 | `interfaces/` | qualquer coisa fora de `interfaces/` | 0 |
| ARCH-002 | `data/` | qualquer coisa fora de `data/`, `interfaces/` | 0 |
| ARCH-003 | `services/` | `controllers/`, `commands/`, `events/`, `helpers/`, arquivos da raiz | 0 |
| ARCH-004 | `controllers/` | qualquer coisa fora de `controllers/`, `services/`, `interfaces/` | 0 |
| ARCH-005 | tudo exceto `socket.ts` | `events/` | 0 |
| ARCH-006a/b/c | — | `app.ts` (ninguém); `socket.ts` (só `app.ts`); `config.ts` (só `app.ts`/`socket.ts`) | 0 |
| ARCH-007a | helpers folha de texto/dados | qualquer módulo interno | 0 |
| ARCH-007b | `menu.builder.helper` | qualquer coisa fora de `interfaces/` | 0 |
| ARCH-008 | `commands/` | `events/`, helpers de orquestração | 0 |
| ARCH-009 | `commands/<cat>.*` | `commands/<outra cat>.*` | 0 |
| ARCH-010 | `helpers/` exceto `command.invoker`/`message.procedures` | `commands/` | 0 |
| ARCH-011 | `utils/` | `commands/`, `controllers/`, `services/` | 0 (13 corrigidas em 2026-11-17 — ver §3.1) |
| ARCH-012 / ARCH-012-commands | qualquer | dependência circular | 0 (ciclo de 39 arquivos eliminado em 2026-11-17) |
| ARCH-012-EX | exceção | ciclo **somente** entre `<cat>.list` e `<cat>.functions` da mesma categoria é permitido | — |
| ARCH-013a | `src/` | pacote npm não declarado em `dependencies`/`optionalDependencies` | 0 (4 corrigidas em 2026-11-17: `moment` declarado) |
| ARCH-013b | `src/` | `devDependencies` (exceto `@types` / `import type`) | 0 |
| ARCH-013c | `src/` | import não resolvível | 0 |

Categoria de dependência verificada: **dependências de código** (imports estáticos, `import()` com literal,
re-exports e imports de tipo — `tsPreCompilationDeps: true`), mais a declaração em `package.json` (ARCH-013).

## 3. Exceções aprovadas

| Regra | Origem → Destino | Justificativa | Responsável | Revisão |
|---|---|---|---|---|
| ARCH-012-EX | `commands/<cat>.list.commands.ts` ↔ `commands/<cat>.functions.commands.ts` | Padrão do projeto: a lista registra as funções e as funções leem guias/textos da lista. Ciclo contido na categoria. | Mantenedor do projeto | Se o carregador dinâmico de comandos (roadmap) for implementado |

### 3.1 Pontos de registro na inicialização (corrigem ARCH-011 sem mudar o comportamento)

`utils/` não importa mais camadas superiores. As quatro dependências que existiam foram **invertidas**:
a camada superior registra o que `utils/` precisa quando o módulo é carregado. Isso cria
dependências de **runtime** que a análise estática não vê (veja §7).

| Registro | Quem registra | Quem usa | Substitui | Se não for registrado |
|---|---|---|---|---|
| `registerCommands()` | `helpers/command.invoker.helper.ts` | `utils/commands.util.ts` (`commandExist`, `getCommandGuide`, …) | 9 imports `utils → commands/*.list` | lança erro explícito |
| `setPrefixProvider()` | `services/bot.service.ts` | `buildText` em `utils/general.util.ts` | `general.util → controllers/bot.controller` | lança erro explícito |
| `setSentMessageListener()` | `services/automation.service.ts` | `sendText` / `replyText` em `utils/whatsapp.util.ts` | `whatsapp.util → services/automation.service` | mensagens não são auto-excluídas (Janitor) |
| parâmetro `lookups` de `formatWAMessage` | `events/message-received.event.ts` | `utils/whatsapp.util.ts` | `whatsapp.util → controllers/group\|user.controller` | erro de compilação (parâmetro obrigatório) |

`messageErrorCommandUsage` foi movida de `general.util.ts` para `commands.util.ts`, o que eliminou o ciclo
`general.util ↔ commands.util`. Todos os registradores entram no grafo estático carregado por `socket.ts`
(importado por `app.ts`), então rodam antes de qualquer mensagem ser processada.

**Equivalência verificada:** o código anterior e o novo foram compilados e executados lado a lado, cada um com
uma cópia de `storage/`. Os dois produziram saída idêntica (323 verificações) para:
- as 150 guias de comando, categorias e `commandExist`;
- `messageErrorCommandUsage` e `buildText` com `{$p}`;
- os envios e o agendamento do Janitor;
- `formatWAMessage` com mensagem privada, de grupo e de tipo não permitido.

O baseline é uma lista **por aresta** (origem, destino, regra). Ele não cria exclusões genéricas:
uma aresta nova — mesmo entre as mesmas pastas — falha.

## 4. Comandos

| Comando | O que faz | Falha quando |
|---|---|---|
| `npm run validate-architecture` | Gate: valida `src/` (baseline hoje vazio) | Qualquer violação (exit ≠ 0) |
| `npm run validate-architecture:all` | Mostra **todas** as violações, inclusive as do baseline | Sempre que houver violação (informativo) |
| `npm run validate-architecture:json` | Relatório para automação em `reports/architecture-violations.json` | Nunca (exit 0) |
| `npm run validate-architecture:baseline` | Regenera o baseline — **só após decisão explícita** | — |
| `npm run test:architecture` | Testa as regras contra `arch-fixtures/` (cenários A–G) | Algum cenário diverge do esperado |

Funcionam igualmente em Windows (PowerShell/cmd), Linux e macOS. Não há CI no projeto (nem repositório git);
quando houver, basta adicionar `npm ci && npm run validate-architecture && npm run test:architecture`.

**Ao corrigir uma violação antiga**, o gate continua passando; rode
`npm run validate-architecture:baseline` para retirá-la do baseline e impedir que ela volte. O gate avisa quando há entradas *stale* (violações do baseline que não existem mais).

## 5. Testes das regras (`npm run test:architecture`)

| Cenário | Fixture | Esperado |
|---|---|---|
| A — permitida | `a-allowed` | helpers → commands → controllers → services → utils → interfaces passa |
| B — proibida | `b-forbidden` | ARCH-001, ARCH-003, ARCH-009, ARCH-011, exit ≠ 0 |
| C — ciclo | `c-cycle` | ARCH-012 detecta `a.util ↔ b.util` |
| D — falso-positivo | `d-false-positive` | helpers folha, `import type`, roteador autorizado, `socket → events`, `import()` dinâmico e `node:*` passam |
| E — exceção | `e-approved-exception` | ciclo `group.list ↔ group.functions` passa |
| E2/E3 — baseline | `f-g-new-violation` (cópia temporária) | violação conhecida não bloqueia; só a nova é reportada |
| F — violação nova | `f-g-new-violation` (cópia temporária) | inserir `controllers → commands` falha com ARCH-004 |
| G — violação removida | idem | remover o arquivo restaura a aprovação |

Os cenários que mutam fixtures trabalham numa cópia em diretório temporário; nada em `src/` é tocado.

## 6. Status de adoção

**Bloqueando todas as violações.** O baseline está vazio (`[]`): o projeto não tem nenhuma violação conhecida.
Histórico: 2026-11-17 — adoção com 89; 2026-11-17 — `moment` declarado em `package.json` (`^2.30.1`, mesma versão já instalada), ARCH-013a zerada → 85; 2026-11-17 — ARCH-011 corrigida por inversão de dependência (§3.1), ciclo de 39 arquivos eliminado → **0**.
O gate não faz parte do `npm run build` — é um comando separado.

## 7. Limitações

- Análise **estática**: `import()` só é visto com string literal; dependências via configuração,
  reflexão ou singletons em runtime (ex.: bancos NeDB, sockets do Baileys) não são detectadas.
- Os registros de §3.1 (`registerCommands`, `setPrefixProvider`, `setSentMessageListener`) são dependências de
  runtime: o dependency-cruiser não verifica se o registrador foi carregado. Se `socket.ts` deixar de
  importar `automation.service`, o Janitor pararia **sem erro**; os outros dois falham com mensagem explícita.
- Imports de `interfaces/` são contados mesmo sendo apagados pelo `tsc`; nenhuma regra os proíbe.
- O dependency-cruiser exige `typescript <7.0.0`. Com o TypeScript 7, ele analisa **0 módulos** e mesmo assim informa
  "no violations". Por isso o projeto usa TypeScript 6.0.3, e `npm run test:architecture` falha se isso voltar a acontecer.
- O dependency-cruiser reporta **um ciclo por aresta de entrada**, não todos os caminhos possíveis.
- ARCH-012-EX depende da convenção de nomes `<cat>.list|functions.commands.ts`; arquivos fora dela não recebem a exceção.
- `src/modules.d.ts` e `src/media/` são excluídos da análise.
- Dependências entre serviços externos (APIs HTTP, scraping) estão fora do escopo.
