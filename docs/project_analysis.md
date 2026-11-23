# Bot Sinforoso (lbot-whatsapp) - Análise Técnica

## Visão Geral do Projeto
**Nome**: lbot-whatsapp
**Versão**: 3.4.6
**Tecnologias Principais**: TypeScript, Node.js, Baileys (WhatsApp Web API), NeDB (Banco de Dados)

## Arquitetura
- **Ponto de Entrada**: `src/app.ts` inicializa as migrações do banco de dados e conecta o socket.
- **Conexão**: `src/socket.ts` gerencia o socket do Baileys, lida com eventos de conexão (QR code, pareamento) e despacha eventos.
- **Gerenciamento de Eventos**: `src/events/` contém manipuladores (handlers) para eventos específicos (`messages.upsert`, `group-participants.update`, etc.).
- **Sistema de Comandos**:
    - Comandos são definidos em `src/commands/*.list.commands.ts`.
    - Implementações estão em `src/commands/*.functions.commands.ts`.
    - `commandInvoker` em `src/helpers/` roteia mensagens para os comandos.

## URLs e APIs Identificadas

### APIs Críticas
1.  **Chaves Deepgram & ACRCloud**: `https://dub.sh/lbot-api-keys`
    -   Usado para buscar chaves dinâmicas para transcrição de áudio e reconhecimento de música.
    -   *Status*: **Operacional** (Disponível/JSON Válido).
2.  **The Movie DB**: `https://api.themoviedb.org`
    -   Chave: `6618ac868ff51ffa77d586ee89223f49` (Hardcoded/Fixa no código)
    -   *Status*: **Operacional** (Chave é válida).
3.  **WeatherAPI**: `http://api.weatherapi.com`
    -   Chave: `516f58a20b6c4ad3986123104242805` (Hardcoded/Fixa no código)
    -   *Status*: **Operacional** (Chave é válida).

### Alvos de Scraping
-   **Anime**: `https://animesday.org/` (*Status*: **Online**, acessível)
-   **Mangá**: `https://lermangas.me/` (*Status*: **Online**, acessível)
-   **Jogos**: `https://hydralinks.cloud/...` (*Status*: **Não verificado**, múltiplas fontes)
-   **Remoção de Fundo**: `https://www.freebackgroundremover.com/` (*Status*: **Online**, fluxo complexo verificado via análise de código)

### Outras APIs
-   **SimSimi**: `https://api.simsimi.vn` (*Status*: **Online**, respondeu 400 como esperado para requisição vazia)
-   **Trace.moe**: `https://api.trace.moe` (*Status*: **Online**, respondeu 405 como esperado para GET)
-   **MathJS**: `https://api.mathjs.org/v4/`
-   **Encurtador**: `https://shorter.me/page/shorten`
-   **Google TTS**: `https://translate.google.com/translate_tts`

## Estrutura de Comandos

O bot organiza comandos em categorias, definidas em `src/helpers/command.invoker.helper.ts`:

| Categoria | Descrição | Prefixo |
| :--- | :--- | :--- |
| **Info** | Comandos de informação (menu, reportar, dados) | `info` |
| **Utility** | Utilidades (clima, calc, moeda) | `utility` |
| **Sticker** | Criação e manipulação de figurinhas | `sticker` |
| **Download** | Baixadores de Vídeo/Mídia | `download` |
| **Misc** | Variados (anime, jogos, diversão) | `misc` |
| **Group** | Gerenciamento de grupo | `group` |
| **Admin** | Administração do bot | `admin` |

### Módulos Chave
-   `src/events/message-received.event.ts`: Entrada principal para tratamento de mensagens.
-   `src/helpers/command.invoker.helper.ts`: Despachante central que roteia comandos para funções.
-   `src/utils/misc.util.ts`: Contém a lógica para a maioria dos comandos "Misc" e "Utility" (web scraping, chamadas de API).

## Recomendações

### 1. Segurança (Crítico)
-   **Mover Chaves de API para `.env`**: O projeto atualmente possui **CHAVES DE API FIXAS NO CÓDIGO** para TMDb (`6618...`) e WeatherAPI (`516f...`). Elas devem ser movidas para variáveis de ambiente imediatamente.
-   **Gerenciamento de Segredos**: As chaves Deepgram/ACRCloud são buscadas de uma URL pública (`dub.sh`). Embora dinâmico, esta URL é pública. Considere uma estratégia de gerenciamento de segredos mais segura se essas chaves forem sensíveis.

### 2. Estabilidade
-   **Dependência de Scraping**: O bot depende fortemente de web scraping (Anime, Mangá, Remoção de Fundo). Isso é frágil e quebrará se os sites alvo mudarem sua estrutura HTML. Implemente tratamento de erros robusto (algum já existe, ex: em `removeBackground`) e considere APIs oficiais onde possível.
-   **Remoção de Fundo**: A lógica para `removeBackground` envolve buscar tokens CSRF e cookies. Isso é extremamente específico e frágil. Requer monitoramento constante.

### 3. Arquitetura
-   **Carregador de Comandos**: O carregamento atual de comandos é manual (mapeado em `CATEGORY_MAP`). Um carregador dinâmico (lendo arquivos de `commands/`) seria mais escalável.
-   **Tipagem (Type Safety)**: O projeto usa TypeScript, o que é excelente. Continue aplicando tipos estritos, especialmente para respostas de API que atualmente são frequentemente `any` ou tipadas de forma frouxa.

## Mapa do Código (Codebase Map)
-   **Fluxo Lógico**: `app.ts` (Init) -> `socket.ts` (Conexão) -> `events/` (Escuta) -> `message-received.event.ts` (Parser) -> `command.invoker.helper.ts` (Roteamento) -> `commands/*.ts` (Execução).
-   **Armazenamento de Dados**: Usa `NeDB` (provavelmente para sessão/auth) e arquivos JSON. Simples, mas eficaz para um bot local.
