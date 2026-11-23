# Auditoria de Engenharia — 2026-11-17

Escopo: código-fonte em `src/`, com 72 arquivos e cerca de 17 mil linhas. O ambiente é Node 24.19 e TypeScript 6.0.3, em ESM, com Baileys 7 e NeDB.
Sem git: o snapshot do código anterior foi guardado fora do projeto antes das alterações.

## 1. Baseline (antes)

| Item | Estado inicial |
|---|---|
| Build (`tsc` + cópia de mídia) | Aprovado |
| `tsc` com `noImplicitReturns` / `noUnusedLocals` | 4 TS7030 (caminhos sem `return`) e 171 variáveis/imports não usados. Nenhum é erro no modo atual do projeto. |
| Testes automatizados do bot | **Nenhum.** Só existiam os testes das regras de arquitetura. |
| Cobertura | 0% |
| Arquitetura (`validate-architecture`) | 0 violações |
| Dependências de produção (`npm audit --omit=dev`) | 0 vulnerabilidades |
| Complexidade ciclomática (775 funções) | 737 ≤10 · 27 entre 11–15 · 6 entre 16–20 · **5 acima de 20** |

Ferramentas: compilador TypeScript (já existente), `node:test` + `tsx` (já existentes) e o script próprio `scripts/complexity-report.mjs`, que lê o código pela API do compilador.
O Stryker 10.1.1 foi usado para os testes de mutação, instalado fora do projeto. **Nenhuma dependência nova foi adicionada ao projeto.**

## 2. Problemas confirmados e corrigidos

| ID | Prioridade | Arquivo | Problema | Evidência antes | Correção | Evidência depois |
|---|---|---|---|---|---|---|
| BUG-01 | **P1** | `helpers/message.procedures.helper.ts` (anti-link) | ReDoS: a regex de link tinha custo quadrático (CWE-1333). Qualquer membro de um grupo com anti-link ativo podia travar o bot inteiro. | 65 mil caracteres = **2.038–2.619 ms** de event loop bloqueado por mensagem | `findLinks()` em `utils/general.util.ts`: varredura linear por segmentos e a regex original ancorada (`y`) só nos candidatos | 4 ataques de 65 mil caracteres em **16 ms no total**. Resultado **idêntico** à regex original em 20.000 entradas aleatórias e num corpus real. |
| BUG-02 | **P1** | `services/automation.service.ts` | Cada reconexão criava outro `setInterval` do monitor de jogos grátis, preso ao socket antigo e fechado. O primeiro envio falhava, abortava o laço, e as ofertas já marcadas como notificadas **nunca eram enviadas**. Além disso, os sockets antigos ficavam retidos (vazamento). | Teste: 2 monitores após 1 reconexão | Monitor único (`freeGamesStarted`) que sempre usa o socket mais recente | Teste: 1 monitor, usando o socket novo |
| BUG-03 | **P1** | `automation.service.ts`, `message.procedures.helper.ts`, `engagement.functions.commands.ts` | Callbacks de timer (tempo esgotado do jogo, próxima pergunta, timeout de troca de cartas) chamavam `sendText` sem tratar erro. No Node 24, uma rejeição não tratada **encerra o processo**, por exemplo quando o bot sai do grupo ou a conexão cai. | Teste: rejeição `socket fechado` escapando do timer | `try/catch` e `.catch()` com `showConsoleError` | Teste: nenhuma rejeição escapa |
| BUG-04 | P3 (latente) | `helpers/events.queue.helper.ts` | `splice()` dentro de `forEach()` pulava o item seguinte e deixava eventos duplicados na fila de inicialização | Teste: duplicata mantida | `filter()` | Teste: só o evento mais recente por chave |

## 3. Refatoração de complexidade

| Função | Antes (CC / cognitiva / linhas) | Depois | Garantia |
|---|---|---|---|
| `formatWAMessage` (`utils/whatsapp.util.ts`) | **87 / 83 / 111** | **37 / 31 / 63** | Teste de caracterização com 33 casos (golden gerado com a implementação anterior), cobrindo texto, mídia, citações, grupos, admins e mensagens descartadas. Saída idêntica. |

A expressão `(typeof X != "string" && X && "campo" in X) ? X.campo : undefined` estava repetida 11 vezes. Ela foi trocada por `getMessageField`, `extractMedia` e `formatQuotedMessage`, com CC 4, 5 e 14.
O CC restante vem dos `a || b || ''` nos campos do objeto. Quebrar mais seria artificial.

**Funções que eram mantidas acima de 20:** corrigidas na seção 12.

## 4. Testes automatizados (`npm test`): 152 testes em 15 arquivos

| Arquivo | O que verifica |
|---|---|
| `format-wamessage` | Caracterização (golden) de `formatWAMessage` com 35 casos gerados pelo código original |
| `antilink` | BUG-01: equivalência com a regex original, tempo linear e teste diferencial com 20.000 entradas |
| `automation` | BUG-02 (monitor único) e BUG-03 (nenhuma rejeição escapa do timer) |
| `events-queue` | BUG-04 |
| `commands-util` | Registro de comandos, guias, prefixo e BUG-05 (`$&` no `buildText`) |
| `group-commands` | Todos os comandos de grupo: permissões, alternâncias, filtros, exceções, lista negra, promover/rebaixar/banir |
| `admin-info-misc` | Admin do bot (modo admin, PV, taxa, prefixo, bloqueios, anúncio espaçado, desligar), menu/info e comandos variados |
| `message-flow` | Anti-link, filtro de palavras, mudo, anti-flood, resposta automática, PV, modo admin, taxa de comandos, boas-vindas, lista negra, anti-fake, sincronização de grupos |
| `engagement` | XP, jogo de cartas (roll → resgate → inventário → venda/troca), bolão, oráculo, bitcoin/fortnite |
| `media` | ffmpeg/sharp/webpmux **reais**: conversões, figurinhas (estáticas, animadas, EXIF), efeitos de áudio, reconhecimento de música/anime |
| `media-commands` | `!s`, `!snome`, `!simg`, `!emojimix`, auto-figurinha, `!yt`, `!play`, com mídia **criptografada pelo próprio Baileys** e descriptografada pelo bot |
| `menu-utility-game` | Menus de todas as categorias, filmes/séries, clima, moeda, pesquisa, voz, Show do Milhão e cassino |
| `more-commands` | Marcar todos, apagar, link/foto do grupo, adicionar, foto/recado/entrar, limpeza de sessão em 3 etapas, `!audio`/`!efeitoaudio`/`!ouvir`/`!qualmusica`/`!qualanime`, downloads, jogos grátis, notícias, leilão |
| `scrapers` | Tratamento dos dados de cada serviço externo simulado (cálculo, moedas, DDD, clima, busca, MangaDex, TMDB, encurtador, jogos, SimSimi) |
| `zz-all-modules` | Todos os módulos de `src/` carregam, o que garante que a cobertura use o projeto inteiro como denominador |

Como os testes funcionam (`tests/helpers/harness.ts`):
- As mensagens passam pelo **fluxo real**: `messageReceived`, `formatWAMessage`, handlers, `commandInvoker`, comando, NeDB e resposta.
- O cliente WhatsApp é falso e registra cada chamada e envio.
- Rodam numa **pasta temporária** com `storage/` vazio. **Os dados reais do bot nunca são tocados.**
- **Sem internet:** `fetch` e o axios falham, a menos que o teste simule a resposta.
- As esperas de "digitação" (até 15 s) disparam na hora. Timers longos, como a sessão de carta, o Janitor e os jogos, mantêm a duração real.

**Cobertura do projeto inteiro** (`npm run test:coverage`, tudo menos `app.ts`):
- Era 31,9% das linhas e 14,6% das funções. Agora é **77,5% das linhas, 83,3% das funções e 65,3% dos branches**.
- A cobertura roda num único processo (`--test-isolation=none`), porque o Node 24 falha ao mesclar a cobertura de vários processos. Os testes passam nos dois modos.

Limitações:
- `app.ts` e `socket.connect` (conexão real) não são testados.
- `!animes` não é testado, porque executa `curl` real na internet.
- Os downloads de TikTok, Instagram, Facebook e X só têm o caminho de erro testado: as bibliotecas fazem as próprias requisições.
- Nenhum teste usa o WhatsApp real.

## 5. Testes de mutação

Resultados abaixo, gerados com o Stryker 10.1.1 sobre o código corrigido ou refatorado.

Stryker 10.1.1 com o runner `command`, sobre o código corrigido ou refatorado (configuração em `stryker.config.json`). Foram 419 mutantes, executados duas vezes:

| Arquivo | 1ª execução | Final (com testes que cobriram as lacunas da 1ª) |
|---|---|---|
| `commands.util.ts` | 94,23% | **100%** |
| `whatsapp.util.ts` (`formatWAMessage` e funções auxiliares) | 91,67% | **93,98%** |
| `events.queue.helper.ts` (`queueEvent`) | 87,18% | 87,18% |
| `general.util.ts` (`findLinks`) | 79,46% | 79,46% |
| **Total** | 88,31% | **90,21%** (360 mortos + 18 por timeout, 41 sobreviventes, 0 sem cobertura) |
| **2ª rodada** (com o teste de citação sem remetente) | — | **90,95%** (364 + 18 por timeout, 38 sobreviventes). `whatsapp.util`: 95,39%. `commands.util`: 100%. |

Análise dos 41 sobreviventes:
- **`events.queue` (5):** equivalentes. O `filter` repete a checagem do tipo de evento.
- **`findLinks` (23):** equivalentes no resultado. São otimizações de desempenho, como pular segmentos sem TLD, a checagem redundante do protocolo e a ordenação dos candidatos. Também entram o `{1}` da regex e código defensivo inalcançável. As mutações que tiram a otimização são mortas pelos testes de tempo e aparecem como os 18 timeouts.
- **`whatsapp.util` (13 na 1ª rodada, 10 na 2ª):** os 10 restantes são equivalentes, como *optional chaining* em valores sempre definidos e *fallbacks* `|| ''` em mensagens que acabam descartadas. A lacuna real (citação sem `participant` e sem `remoteJid`) foi coberta na 2ª rodada.
- O mutante da linha 302 foi conferido à mão para confirmar que é equivalente: trocar a condição inteira por `true` dá o mesmo resultado para conteúdo de texto ou objeto.

Para rodar de novo, sem adicionar dependência ao projeto:
1. Numa pasta separada, rode `npm install --before=<data> @stryker-mutator/core@10.1.1 typescript@6.0.3`.
2. Na raiz do projeto, rode `node <pasta>/node_modules/@stryker-mutator/core/bin/stryker.js run`.

## 6. Pendências (confirmadas, não corrigidas)

| ID | Prioridade | Problema | Por que ficou pendente |
|---|---|---|---|
| SEC-02 | P2 | Chaves da TMDB e da WeatherAPI fixas no código (`utils/misc.util.ts`, linhas 146 e 282) e também em `docs/project_analysis.md` (CWE-798) | Precisam ir para variáveis de ambiente **e ser trocadas** por quem administra as contas |

Itens verificados **sem** problema:
- Permissões: todos os 41 comandos de grupo que alteram algo checam `isGroupAdmin`.
- Nenhuma entrada do usuário chega a caminhos de arquivo, `exec` ou `eval`.
- O `curl` usa uma URL fixa.
- Os contadores de flood e de taxa de comandos ficam no NeDB, sem crescer na memória.
- Os downloads têm limite de duração.

### 6.1 Resolvidos na 2ª rodada (2026-11-17)

| ID | O que foi feito | Evidência |
|---|---|---|
| REL-01 | **44 de 44** chamadas HTTP com tempo-limite (`HTTP_TIMEOUT`: api 20 s, scraping 30 s, media 60 s). No Node, o axios mede até os cabeçalhos e depois o tempo **sem dados**, então downloads grandes que continuam recebendo dados não são cortados. | Verificação pela AST e testes de `scrapers`/`media` |
| QUA-01 | As 4 funções de envio passaram a aceitar só `MediaMessageType` (imagem/vídeo/áudio), com verificação exaustiva: outro tipo **não compila** e, em runtime, gera erro claro. `noImplicitReturns` foi ativado. | `tsc` sem TS7030 |
| QUA-02 | 0 imports/variáveis sem uso (eram 23; os 150 parâmetros exigidos pela assinatura ganharam prefixo `_`) e **0 `any`** (eram 63), trocados por tipos reais ou `unknown` com `errorMessage`/`errorStatus`/`errorCode`. `noUnusedLocals`, `noUnusedParameters` e `npm run check:any` impedem a volta. | `tsc`, `check:any` |
| DEP-01 | O `google-sr` não era usado pelo código (todos os seus imports estavam sem uso) e foi removido. | Nenhum import restante |
| Mutação | Teste adicionado para citação sem `participant`/`remoteJid` (golden gerado com o código original) | §5 |
| BUG-05 (novo, P3) | `buildText` interpretava `$&`, `$$` e `` $` `` vindos do texto do usuário (ex.: o nome "Jo$&o" virava "Jo{$1}o"). Corrigido com função de substituição. | `commands-util.test.ts` |
| BUG-06 (novo, P2) | 9 laços `forEach(async …)`: uma falha virava rejeição não tratada (o bot cai no Node 24) e a resposta saía antes da gravação no banco. O `!bcgrupos` mandava para todos os grupos ao mesmo tempo, apesar da espera de 1 s por grupo. Trocados por `for…of` com `await`. `reportar`/`sairgrupos` continuam nos demais itens se um falhar. | `group-commands`, `admin-info-misc` |

Na limpeza, a correção automática do TypeScript para "campo não usado" **apagou também a atribuição `this.campo = setInterval(…)`**, ou seja, o monitor de jogos grátis inteiro. A revisão do diff detectou isso, e o arquivo foi restaurado e corrigido à mão.

## 7. Comparativo

| Indicador | Antes | Depois | Evidência |
|---|---|---|---|
| Erros de build | 0 | 0 | `npm run build` |
| Bugs confirmados abertos | 4 corrigíveis + pendências da §6 (+2 achados na 2ª rodada) | 0 dos 6 (pendências da §6 continuam) | `npm test` |
| Funções com CC > 20 | 5 (máx. 87) | 5 (máx. 37) | `npm run complexity` |
| Cobertura do projeto inteiro (linhas / funções / branches) | 31,9% / 14,6% / — (só carregando os módulos; antes: 0%) | **77,5% / 83,3% / 65,3%** | `npm run test:coverage` |
| Testes automatizados | 0 | **152** | `npm test` |
| `any` / identificadores sem uso / funções sem retorno em todo caminho | 63 / 173 / 4 | **0 / 0 / 0** | `tsc`, `check:any` |
| Chamadas HTTP sem tempo-limite | 43 de 44 | **0** | AST |
| Mutation score (código alterado) | Não existia | **90,95%** | Stryker (§5) |
| Violações arquiteturais | 0 | 0 | `npm run validate-architecture` |
| Vulnerabilidades no código | ReDoS confirmado | Corrigido | `tests/antilink.test.ts` |
| Pior caso do anti-link (65 mil caracteres) | 2.038–2.619 ms | ~4 ms por mensagem | benchmark e teste |
| Regressão (323 verificações do bot) | Referência | **Idêntica** | smoke comparativo |

## 8. Quality gates

`npm run check` executa:
1. `typecheck` (com `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` e `noFallthroughCasesInSwitch`)
2. `check:any`
3. `test`
4. `validate-architecture`
5. `test:architecture`
6. `audit:prod`

Não há CI no projeto. O comando é para rodar localmente antes de publicar.

## 9. Prontidão para produção

- **Melhorou:** os 3 problemas P1 que podiam travar ou derrubar o bot foram corrigidos e validados por testes.
- **Não é possível afirmar ausência de bugs.** Os 152 testes usam um cliente WhatsApp falso e serviços simulados. Nada foi testado com o WhatsApp conectado nem contra os sites e APIs reais.
- **Antes de publicar:**
  1. Rodar `npm run check`.
  2. Testar manualmente o anti-link, o "Show do Milhão", as trocas de cartas e uma reconexão.
  3. Decidir sobre SEC-02. (SEC-01 foi resolvido: veja a seção 10.)

## 10. Comandos que dependiam de serviços quebrados ou pagos (corrigido em 18/11/2026)

Doze comandos falhavam nos testes reais. Todos passaram a usar serviços **gratuitos**, sem nada pago:

| Comando | Causa da falha | Agora usa |
|---|---|---|
| `!letra` | Scraper do Genius quebrado | [LRCLIB](https://lrclib.net/docs) (letra) + iTunes Search API (capa) |
| `!traduz`, `!curiosidade`, `!free` | Google Translate devolvia `TooManyRequests` | [MyMemory](https://mymemory.translated.net/doc/spec.php), em partes de até 450 caracteres. `MYMEMORY_EMAIL` aumenta a cota. |
| `!pesquisa` | `googlethis`: "Could not execute search" | Resultados do Bing, com a API REST da Wikipédia (pt) como reserva |
| `!img` | `googlethis` | Bing Imagens (SafeSearch estrito) |
| `!noticias` | `googlethis` | RSS do Google Notícias |
| `!play`, `!yt` | loader.to devolvia 403 | `download()` nativo do ytdl-core 5 (vídeo e áudio separados, juntados pelo ffmpeg), com o yt-dlp oficial como reserva |
| `!ig` | `instagram-url-direct` devolvia 401 | [yt-dlp](https://github.com/yt-dlp/yt-dlp) 2026.10.26 (binário oficial, SHA-256 conferido, `npm run setup:yt-dlp`) |
| `!ouvir` | Chaves de terceiros (dub.sh) devolviam 429 | Groq Whisper Large v3 Turbo (chave gratuita, `GROQ_API_KEY`). Sem chave, usa os Spaces do Hugging Face (Whisper). |
| `!rbg` | API de remoção de fundo fora do ar | Spaces do Hugging Face: `KenjieDec/RemBG` (CPU, sem cota de GPU), com mais 2 Spaces de reserva |
| `!qualmusica` | Chaves de terceiros (dub.sh) devolviam 429 | Assinatura de áudio gerada **localmente** pelo `shazamio-core` (MIT) e enviada por HTTPS ao Shazam |

Bibliotecas removidas: `genius-lyrics`, `@vitalets/google-translate-api`, `googlethis`, `instagram-url-direct`, `yt-search`, `@deepgram/sdk`, `form-data` e `@types/yt-search` (58 pacotes ao todo). Bibliotecas adicionadas: `@gradio/client` 2.7.2 (ISC) e `shazamio-core` 1.3.1 (MIT). Os pacotes `node-shazam` e `shazam-api` foram descartados porque são GPL-2.0, incompatível com a GPL-3.0 do projeto.

**SEC-01 resolvido.** O link encurtado antigo para obter chaves de API não é mais usado. O `!qualmusica` envia só uma assinatura de áudio, não o áudio, e sempre por HTTPS.

**Configuração (opcional, tudo gratuito):** copie `.env.example` para `.env`. O `npm start` lê esse arquivo com `--env-file-if-exists` do Node.

**Limitações conhecidas:**
- `!ouvir` sem `GROQ_API_KEY` depende da cota anônima dos Spaces, que é pequena e se esgota rápido.
- No Instagram, posts só com fotos exigem login. Vídeos e reels públicos funcionam.
- A API do Shazam usada não é oficial e pode mudar sem aviso.
- Existem dois comandos `noticias` (utilidade e engajamento). O de engajamento é o que vale.
- O `!rbg` pode ficar lento (cerca de 5 s ou mais) quando o Space está dormindo.

**Validação:**
- Testes: 160 passaram, 0 falharam, 1 foi pulado.
- `npm run check`: tudo passou, com 0 vulnerabilidades em produção.
- Regressão de 323 verificações: idêntica, exceto o ID de grupo, que vem do banco local.
- Teste real: todos os 12 comandos funcionaram com a internet de verdade. O `!ouvir` funcionou pelos Spaces antes da cota anônima acabar. O caminho pela Groq **não** foi testado ao vivo, por falta de chave.

## 11. REL-02 e PERF-01 corrigidos (18/11/2026)

### REL-02: falhas de conexão e reconexão

Só o `restart: unless-stopped` não basta: ele reinicia o container quando o processo termina, mas não quando o processo fica vivo e desconectado. Por isso a reconexão passou para um supervisor próprio, `src/helpers/connection.supervisor.helper.ts`.

| Problema encontrado | Correção |
|---|---|
| `connect()` era chamado sem `await` nem `catch`, no `init` e no `setTimeout` da reconexão. No Node, uma Promise rejeitada sem tratamento encerra o processo (confirmado por teste). | O supervisor nunca rejeita: a falha é registrada e a tentativa é reagendada. `init()` tem `catch` explícito, que encerra com código 1. |
| Reconexão a cada 3 s, sem limite | Espera exponencial com variação de ±20%: 3 s, 6 s, 12 s, 24 s, 48 s e depois 60 s. Após 30 falhas seguidas, encerra com código 1 para o Docker reiniciar o processo do zero. |
| `connectionPairingCode` era uma Promise solta | Tem `catch`: registra o erro, limpa a escolha de QR ou código e reconecta |
| Exceção dentro de `connectionClose` fazia o bot não reconectar nunca mais | Agora retorna `reconnect` |
| Falha na sincronização inicial deixava o bot conectado, mas nunca "pronto" | Encerra a conexão, e o supervisor reconecta |
| Conexão antiga continuava com os ouvintes de eventos | Cada nova conexão desinscreve (`ev.process` devolve a função de desinscrição) e encerra a anterior. Eventos de gerações antigas são ignorados, e pedidos simultâneos de reconexão viram um só. |
| `loggedOut` era tratado como uma queda comum | Retorna `relogin`: apaga as credenciais e pede novo pareamento. Esperar o QR code ou o código de pareamento não conta como falha. |
| Desligamento por comando | Retorna `stop`: não reconecta, e o watchdog é desligado |
| Erro grave (`fatal_error`) deixava o processo parado | Encerra com código 1 para reiniciar limpo |
| Processo vivo, mas travado | Watchdog: se uma tentativa passar 5 minutos sem abrir, sem cair e sem dar erro, encerra com código 1 |

Testes em `tests/connection-supervisor.test.ts`, um para cada cenário exigido:
1. falha na inicialização;
2. queda temporária;
3. rejeição durante a reconexão;
4. sessão expirada (401, 405, erro ao apagar credenciais e espera do QR);
5. falhas seguidas, com a espera limitada a 60 s e a desistência acontecendo uma única vez;
6. recuperação sem duplicar conexões nem ouvintes;
7. watchdog;
8. comportamento do Node com Promise rejeitada sem tratamento.

Duas mutações aplicadas de propósito foram detectadas: remover a junção de pedidos simultâneos e não encerrar a conexão antiga.

**Ainda sem teste automático:** a fiação dentro de `socket.ts`, que liga os eventos reais do Baileys ao supervisor. Ela depende de um WhatsApp de verdade. Antes de produção, teste manualmente:
- desligar a internet do servidor por alguns minutos e religar;
- deslogar o aparelho em "Dispositivos conectados";
- reiniciar o container.

### PERF-01: leitura do `bot.json`

O conteúdo agora fica num cache em memória. Cada leitura só confere a data de modificação e o tamanho do arquivo. Edições feitas por fora continuam sendo detectadas, e um arquivo apagado é recriado com os valores padrão, como antes. Quem chama recebe uma cópia, então alterar o objeto não muda o cache.

Medição (20 mil chamadas de `new BotService().getBot()`, no Windows): **155 µs → 43 µs por chamada**, 3,6 vezes mais rápido. Testes em `tests/bot-cache.test.ts`.

**Validação:**
- Testes: 172 passaram e 0 falharam, nos dois modos (normal e cobertura).
- `npm run check`: passou.
- Regressão de 323 verificações: idêntica.

## 12. Complexidade alta corrigida (18/11/2026)

Antes de cada refatoração foram escritos testes de caracterização, que registram o comportamento atual, inclusive o que parecia estranho. A refatoração só foi aceita com esses testes continuando a passar e a regressão de 323 verificações idêntica.

| Função | CC antes | CC depois | Técnica | Testes |
|---|---|---|---|---|
| `handleGameMessage` | 35 | **9** | Retornos antecipados e *Extract Function*: `parseGameHelp`, `parseGameAnswer`, `canAnswerGame`, `useGameHelp`, `submitGameAnswer`, `onCorrectAnswer`, `onWrongAnswer` e `scheduleNextQuestion`, todas com CC ≤ 5 | `tests/game-message.test.ts`, 8 testes: ajudas, respostas 1–4 e A–D, acerto, erro, eliminação, fim de jogo e falhas |
| Callback de eventos do socket | 34 | **6** | Um tratador por evento, numa tabela evento → função. As dependências são injetadas: `socket.ts`, o único que pode importar `events/` (ARCH-005), passa as reais. | `tests/socket-events.test.ts`, 10 testes. Era 0% de cobertura; agora `socket.events.helper.ts` tem 98%. |
| `startSocket` (antigo `connect`) | 34 | **1** | Só cria o socket e liga o tratador | idem |
| `formatWAMessage` | 37 | **13** | `messageSender`, `messageIdentity`, `messageTexts`, `contextFields`, `parseCommandText`, `botPermissions` e `attachMediaAndQuote` | 35 casos golden, saída idêntica e na mesma ordem de campos |
| `youtubeMedia` | 21 | **9** | Já tinha caído na troca dos downloads | `tests/media-commands.test.ts` |

As duas mutações aplicadas de propósito nos tratadores do socket foram detectadas pelos testes: inicializar duas vezes e não limpar a escolha de pareamento.

**Uma mudança de comportamento, intencional:** antes, um erro no tratamento de `connection.update` pulava todos os eventos seguintes do mesmo lote, inclusive o `creds.update`, que salva as credenciais. Agora cada tratador tem seu próprio `try`, e uma falha não impede os outros. Há um teste para isso.

**Para não voltar:** `npm run check:complexity` (já incluído no `npm run check`) falha se qualquer função passar de CC 20, que é o limite padrão da regra `complexity` do ESLint, e lista as funções culpadas.

Ainda existem 7 funções entre 16 e 20:
- `handleGroupMessage` (20);
- `freeCommand` (19);
- `commandInvoker` (18);
- `dddCommand` (17);
- `useHelp` (17);
- `menuCommand` (16);
- `instagramMedia` (16).

Depois de reduzi-las, o limite pode baixar para 15, que é o recomendado pela NIST SP 500-235 com justificativa.

**Validação:**
- Testes: 190 passaram e 0 falharam, nos dois modos.
- `npm run check`: passou.
- Regressão de 323 verificações: idêntica.
- Distribuição de complexidade: 0 funções acima de 20 (eram 4).

## 13. Novos recursos (18/11/2026)

| Recurso | Comandos | Fonte / ferramenta | Chave |
|---|---|---|---|
| Jogos grátis automáticos | `!jogosgratis` (e `agora`) | GamerPower, só Epic, Steam, GOG, Ubisoft e EA, sem ofertas com restrição de região | não |
| Avisos de live | `!alertalive`, `!addlive`, `!rmlive`, `!lives` | Twitch Helix e Kick API oficiais (com chave grátis) ou site público; YouTube `/live`; TikTok endpoint público | opcional |
| Frases automáticas | `!frases`, `!frasehora`, `!fraseintervalo`, `!fraseagora` | Banco próprio com 5.026 frases (originais + autores em domínio público) | não |
| Proteção de links e arquivos | `!scanlinks`, `!scan` | VirusTotal v3; arquivos só pelo SHA-256 | sim (grátis) |
| Documentos | `!pdf`, `!ocr`, `!topdf`, `!pdfdocx` | qpdf, Ghostscript, Poppler, Tesseract e LibreOffice, tudo local | não |

- **Configurações:** ficam em um banco próprio (`storage/databases/chat_features.db`). Os formatos de grupos e usuários existentes não mudaram.
- **Agendador:** inicia junto com o monitor do `!free`, troca só o socket na reconexão e nunca roda dois ciclos iguais ao mesmo tempo.
- **Testes:**
  - `tests/automation-features.test.ts`: 19 testes;
  - `tests/document-engine.test.ts`: 18 testes, com as ferramentas reais.
- **Suíte completa:** 227 passaram, 0 falharam.
- **Regressão:** nenhum dos 149 comandos antigos mudou; entraram 15 novos (164 no total).
- **Detalhes do motor:** `docs/DOCUMENTOS.md`.
