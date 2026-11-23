# Auditoria de Segurança das Dependências — 2026-11-17

## 1. Resultado

| Verificação | Antes | Depois |
|---|---|---|
| Malware conhecido (OSV / OpenSSF `MAL-*`) | 0 de 663 versões | **0 de 662 versões** |
| `npm audit` total | 61 (2 críticas, 47 altas) | **2** (só `picomatch` no dependency-cruiser, ferramenta de dev — ver §4) |
| `npm audit` só produção (`--omit=dev`) | — | **0** |
| Pacotes não usados pelo código | 3 (`adm-zip`, `baileys_helpers`, `tsc-alias`) | 0 |
| Origem fora do registry npm | 1 (`libsignal` via git+ssh) | 0 |

## 2. Campanhas de ataque pesquisadas (notícias de cibersegurança)

| Campanha | Pacotes | Situação no projeto |
|---|---|---|
| Comprometimento do axios (31/03/2026) | `axios@1.14.1`, `axios@0.30.4` | Não afetado: era 1.13.2, agora **1.21.0** |
| Shai-Hulud / Mini Shai-Hulud / ChainDrop (2025–2026) | centenas de pacotes (TanStack, Red Hat, SAP, keyv…) | Nenhuma versão maliciosa no lock (verificado no OSV) |
| lotusbail (dez/2025) | fork falso do Baileys que roubava sessão e mensagens | Não usado: o projeto usa o oficial `@whiskeysockets/baileys` |
| PhantomSub (forks do Baileys que seguem canais) | 101 pacotes | Nenhum pacote instalado chama `newsletterFollow` nem tem JIDs `@newsletter` fixos |

## 3. Decisões

- **Janela de 14 dias.** A instalação foi feita com `npm install --before=2026-11-03T23:59:59Z`, que é uma opção oficial do npm. Ela vale para todas as dependências, inclusive as transitivas. As campanhas de 2026 publicavam versões maliciosas novas, que eram detectadas em poucos dias. Por isso, versões com menos de 14 dias ficaram de fora: axios 1.21.1, deepgram 5.20, jsdom 31, ytdl-core 5.2.1, dependency-cruiser 18.8.0 e outras.
- **TypeScript 6.0.3, e não o 7.0.2.** O TS 7 compila o bot, mas o dependency-cruiser só suporta `typescript <7.0.0`. Com o TS 7, a validação de arquitetura analisava 0 módulos e mesmo assim passava. `npm run test:architecture` detectou o problema.
- **`@types/node` 24**, que é a mesma versão principal do Node usado (24.19), conforme a orientação do DefinitelyTyped.
- **Removidos:**
  - `adm-zip`: não era usado e tinha 8 vulnerabilidades.
  - `baileys_helpers`: não era usado e vinha de um autor anônimo, sem repositório verificável. O código inspecionado não mostrou exfiltração.
  - `@types/adm-zip`.
  - `@types/format-duration`: stub obsoleto, porque o `format-duration` 4 já traz os próprios tipos.
  - `tsc-alias`: não era usado por nenhum script e trazia `picomatch` 2.x vulnerável.
  - O override global `tough-cookie@^4`, que forçava a v4 no jsdom 30, que exige a v6.
- **Overrides com escopo:**
  - `@tobyg74/tiktok-api-dl → uuid ^11.1.1`: o pacote declara `uuid`, mas não o importa.
  - `redstar → minimatch ^3.1.5`: correção de patch na mesma versão principal.
- **Dependências novas do Baileys rc14**, conferidas:
  - `libsignal@6`: publicado pelo GitHub Actions com *provenance*, pelos mantenedores oficiais.
  - `whatsapp-rust-bridge@0.5.4`: tem um mantenedor só e não tem provenance. Foi integrado oficialmente às notas de lançamento do Baileys v7.0.0-rc10, que creditam o autor (jlucaso).

## 4. Vulnerabilidades: correções e o que restou

| Causa-raiz | Correção aplicada | Verificação |
|---|---|---|
| `zod <4.6.6`, alta, dentro do `jimp`, em produção (30 alertas) | override com escopo `jimp → zod ^4.6.7` | Teste A/B entre zod 3 e zod 4: pixels idênticos nos stickers resize/contain/circle, no thumbnail e em crop/rotate/flip/greyscale. Entradas inválidas continuam lançando erro. Thumbnail e foto de perfil do Baileys funcionam. |
| `minimatch` 7 a <11.0.1 e `glob` ≤14.0.1, moderadas, dentro do `bestzip` | override com escopo `bestzip → glob ^14.0.3, minimatch ^11.0.4` | O `bestzip` gera um zip válido com pastas e arquivos (`npm run zip`) |
| `picomatch` 2.x via `tsc-alias` | `tsc-alias` removido, porque nenhum script o usava | — |
| **`picomatch` ≤4.0.7**, alta, dentro do `dependency-cruiser` (**2 alertas restantes**) | **Sem correção possível.** A 4.0.7 é a versão mais nova que existe. O `npm audit fix --force` rebaixaria o dependency-cruiser para a 13.1.5, de 2023. | Só ferramenta de dev. Os padrões vêm da própria configuração do projeto, não de entrada externa. Reavaliar quando sair o `picomatch` 4.0.8. |

## 5. Envio de dados a terceiros pelo próprio código do bot

| Ponto | O que acontece | Risco |
|---|---|---|
| `utils/audio.util.ts`, `!qualmusica` | Gera a assinatura do áudio localmente (`shazamio-core`) e envia **só a assinatura**, por HTTPS, para `amp.shazam.com` (endpoint fixo). O link `dub.sh` não é mais usado. | Baixo |
| `utils/audio.util.ts` e `utils/hf-spaces.util.ts`, `!ouvir`/`!rbg` | Enviam o áudio ou a imagem por HTTPS para a Groq (`api.groq.com`, só com `GROQ_API_KEY`) ou para Spaces fixos do Hugging Face | Esperado para o comando. Os endpoints são fixos. |
| `utils/misc.util.ts`, `curl` | Executa `curl` com URL fixa, sem entrada do usuário | Baixo, sem injeção |
| Scrapers e APIs (cerca de 35 hosts) | Enviam o termo pesquisado pelo usuário para sites como Bing, LRCLIB, MyMemory, simsimi, trace.moe e outros | Esperado para cada comando |

## 6. Migrações de API feitas por mudanças de versão principal

- `@deepgram/sdk` 3 → 5: `createClient(key)` virou `new DeepgramClient({ apiKey })`, e `listen.prerecorded.transcribeFile` virou `listen.v1.media.transcribeFile`.
- `@distube/ytdl-core` 4 → 5. A versão 4 está oficialmente obsoleta.
  - `getInfo`/`filterFormats`/`chooseFormat` viraram `new Ytdl().getInfo` + `chooseFormat({ filter: { hasAudio, hasVideo } })`.
  - O link continua sendo reconhecido só quando é uma URL do YouTube, como fazia o `validateURL` da v4.

## 7. Verificação

- `tsc --noEmit` e `npm run build` passam.
- `npm run validate-architecture` analisa 100 módulos e não encontra violações.
- `npm run test:architecture` passa os 10 cenários.
- **Regressão:** 323 verificações deram saída idêntica à das bibliotecas antigas. Elas cobrem comandos, guias, prefixo, envios, Janitor, `formatWAMessage` e NeDB.
- `pretty-num`, `format-duration` e `emoji-mixer` foram comparados com as versões antigas usando as entradas reais do bot. Os resultados são idênticos. A única diferença é que o `emoji-mixer` 2 agora rejeita texto que não é emoji, como a letra "a", que a v1 transformava em "©".
- **Não verificado:** os comandos que dependem de rede e do WhatsApp conectado, como download, transcrição e busca. O `google-sr` 6 foi declarado obsoleto pelo autor ([issue #103](https://github.com/typicalninja/google-sr/issues/103)) e pode parar de funcionar.

## 7. Troca de serviços quebrados por gratuitos (18/11/2026)

- **Removidas:** `genius-lyrics`, `@vitalets/google-translate-api`, `@victorsouzaleal/googlethis`, `instagram-url-direct`, `yt-search`, `@deepgram/sdk`, `form-data` e `@types/yt-search` (58 pacotes).
- **Adicionadas:** `@gradio/client` 2.7.2 (ISC, cliente oficial do Gradio) e `shazamio-core` 1.3.1 (MIT, WASM).
- **yt-dlp:** binário oficial 2026.10.26, baixado por `scripts/install-yt-dlp.mjs`. O script confere o SHA-256 com o `SHA2-256SUMS` da própria release, e o binário fica em `bin/`, que está no `.gitignore`.
- `npm audit --omit=dev`: 0 vulnerabilidades.
