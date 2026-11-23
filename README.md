<p align="center">
  <img src="casaos/icon.png" width="180" height="180" alt="Sinforoso"/>
</p>

<h1 align="center">🤖 Sinforoso — Bot de WhatsApp</h1>

<p align="center">
  Bot brasileiro para WhatsApp, feito para grupos e conversas no privado: figurinhas, downloads,
  documentos e PDF, lembretes, consultas brasileiras, moderação de grupos e muito mais.<br>
  Roda no seu próprio servidor, com <b>Docker</b>, inclusive em <b>Orange Pi / Raspberry Pi (ARM64)</b> e no <b>CasaOS</b>.
</p>

<p align="center">
  <img alt="Versão" src="https://img.shields.io/github/package-json/v/olverclock/lbot-whatsapp?label=vers%C3%A3o&color=79C83D"/>
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white"/>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white"/>
  <img alt="Baileys" src="https://img.shields.io/badge/Baileys-7-25D366?logo=whatsapp&logoColor=white"/>
  <img alt="Docker" src="https://img.shields.io/badge/Docker-amd64%20%7C%20arm64-2496ED?logo=docker&logoColor=white"/>
  <img alt="Licença" src="https://img.shields.io/badge/licen%C3%A7a-GPL--3.0-blue"/>
</p>

<p align="center">
  <a href="#-recursos">Recursos</a> •
  <a href="#-instalação-com-docker-recomendado">Instalação</a> •
  <a href="#%EF%B8%8F-configuração-env">Configuração</a> •
  <a href="#-primeiros-passos">Primeiros passos</a> •
  <a href="#-privacidade-e-segurança">Segurança</a> •
  <a href="#-créditos">Créditos</a>
</p>

---

## ✨ Destaques

- 🐳 **Pronto para Docker**: imagem enxuta (Debian 13 + Node 24), roda sem root, com limites de memória e CPU, e `amd64` e `arm64`.
- 🏠 **CasaOS com ícone**: compose pronto em [`casaos/`](casaos/docker-compose.casaos.yml).
- 💾 **Backup automático** todo dia às 4h, feito também ao ligar se o horário foi perdido, com cópia opcional no **Google Drive** que sobe quando a internet voltar.
- 📄 **Documentos 100% locais**: PDF, OCR e conversões no próprio servidor. Nenhum arquivo sai da máquina.
- 🛡️ **Moderação moderna**: verificação anti-robô de novos membros, filtro de golpes, anti-link, anti-flood, anti-fake e lista negra, compatível com o identificador novo do WhatsApp (LID).
- ✅ **Qualidade**: TypeScript estrito, quase 300 testes automatizados, regras de arquitetura e auditoria de dependências (`npm run check`).

---

## 🧰 Recursos

> Todo comando tem um guia: envie **`!comando guia`** (ex.: `!pdf guia`). O menu completo está em **`!menu`**.

### 🖼️ Figurinhas
Imagem ou vídeo em figurinha (normal, circular ou sem corte), figurinha sem fundo, renomear pacote e autor, figurinha em imagem, mistura de emojis e figurinha automática no grupo ou no privado.

### 📥 Downloads
**YouTube** (vídeo na melhor qualidade que cabe no limite, até 1080p, sem recomprimir, e áudio em MP3), **Instagram** (vídeos, reels e carrosséis públicos), **TikTok**, **Facebook** e **X/Twitter**.

### 📄 Documentos e PDF (processamento local)
| Comando | O que faz |
|---|---|
| `!pdf` | Separar páginas (ex.: *10 a 50*), juntar, dividir, remover, girar, comprimir, proteger e remover senha, extrair texto e imagens |
| `!ocrpdf` | Qualquer arquivo (PDF escaneado, imagem, DOCX, DOC, TXT…) em **PDF pesquisável**, mantendo intactas as páginas que já têm texto |
| `!ocr` | Lê o texto de fotos e PDFs escaneados (português e inglês) |
| `!topdf` / `!pdfdocx` | DOCX, DOC, ODT, RTF, XLSX, TXT e imagens em PDF, e PDF em DOCX editável. O arquivo gerado **mantém o nome original** |
| `!upload` | Gera um link temporário para compartilhar um arquivo (storage.to) |

### ⏰ Organização
- **`!lembrete`** em português natural: *18h30*, *amanhã 9h*, *em 20 minutos*, *25/12 15h*, *todo dia 8h*, *toda segunda 9h*. Sai mesmo que o bot estivesse desligado no horário, com aviso de atraso.
- **`!agendar`** mensagens no grupo (únicas ou repetidas) e **`!enquete`** nativa do WhatsApp.

### 🇧🇷 Consultas brasileiras
| Comando | Fonte |
|---|---|
| `!cep` — endereço pelo CEP **e CEP pelo endereço**, escolhendo a faixa de numeração certa | ViaCEP / BrasilAPI |
| `!cnpj` — dados públicos da empresa | Receita Federal (BrasilAPI) |
| `!feriados` — próximos feriados nacionais | BrasilAPI |
| `!loteria` — Mega-Sena, Lotofácil, Quina e outras | Loterias Caixa |
| `!rastreio` — situação e histórico da encomenda (com chave grátis da API) ou validação do código e link oficial | Correios |
| `!clima`, `!moeda`, `!ddd`, `!noticias` | WeatherAPI, AwesomeAPI e outras |

### 👥 Administração de grupos
- **Membros**: marcar todos (**`!marcar`**, invisível ou com lista), link do grupo, avisos, banir, promover e rebaixar.
- **Proteções**: verificação de novos membros (**`!verificacao`**), filtro de golpes (**`!antigolpe`**), anti-link, anti-fake, anti-flood, filtro de palavras e lista negra.
- **Comunidade**: regras com envio automático para quem entra (**`!regras`**), convites do Discord por grupo (**`!discord`**), boas-vindas e amigo secreto com sorteio no privado (**`!amigosecreto`**).
- **Engajamento**: ranking de atividade, XP e níveis, sorteio de membros com prêmio e jogos.

### 🎁 Sorteios
Sorteio com inscrições e horário, **relâmpago com animação** e **caça à chave** (4 códigos, só 1 certo). As chaves dos prêmios ficam criptografadas e vão **só para o vencedor, no privado**. Guarde o prêmio antes no privado (`!sorteio premio Nome | CHAVE`) e crie o sorteio no grupo pelo código: já sai vinculado, com entrega automática. O resultado é **verificável** (`!sorteio verificar`). Detalhes em [docs/SORTEIOS.md](docs/SORTEIOS.md).

### 🤖 Automações
Jogos grátis para resgatar (Epic, Steam e GOG, **conferidos para o Brasil**), avisos de **live** (Twitch, Kick, YouTube e TikTok), frases automáticas e verificação de links e arquivos (**VirusTotal**).

### ⚙️ Administração do bot
Backup (**`!backup`**, com Google Drive), modo só admins, taxa de comandos, bloqueio de comandos e usuários, mensagem para todos os grupos, nome, foto e prefixo do bot.

📚 **Lista completa:** [docs/COMANDOS.md](docs/COMANDOS.md)

---

## 🚀 Instalação com Docker (recomendado)

### Requisitos
- Um número de celular com WhatsApp para ser o bot.
- Um computador ou servidor Linux, Windows ou macOS com **Docker** e **Docker Compose 2.24+**. Funciona em `amd64` e `arm64` (Orange Pi 5, Raspberry Pi 4/5).

### Passo a passo
```bash
git clone https://github.com/olverclock/lbot-whatsapp.git sinforoso
cd sinforoso
cp .env.example .env   # opcional: chaves de APIs e ajustes
docker compose up -d --build
docker logs -f sinforoso
```

No primeiro start, o log pergunta se você quer conectar por **QR Code** ou **Código de Pareamento**. No celular do bot, abra **WhatsApp → Aparelhos conectados → Conectar aparelho**.

### Atualizar
```bash
git pull
docker compose build --pull && docker compose up -d
docker image prune -f
```

### Pastas importantes
| Pasta | Conteúdo | Observação |
|---|---|---|
| `storage/` | Sessão do WhatsApp, bancos de dados e configurações | **Não apague**: o bot desconecta |
| `backups/` | Backups automáticos (`.tar.gz`) | Criada sozinha; guarda os mais recentes |

Guia completo do Docker, CasaOS, backup e Google Drive: **[docs/DOCKER.md](docs/DOCKER.md)**

### 🏠 CasaOS
Use o arquivo [`casaos/docker-compose.casaos.yml`](casaos/docker-compose.casaos.yml) em **App Store → Instalar personalizado → Importar**. O app aparece com ícone no painel. Os dados ficam em `/DATA/AppData/sinforoso/`.

<details>
<summary><b>💻 Instalação sem Docker (Node.js)</b></summary>

<br>

Requisitos: **Node.js 24** e **Git**. Para os comandos de documentos, instale também `ffmpeg`, `qpdf`, `ghostscript`, `poppler-utils`, `tesseract-ocr` (com `por` e `eng`) e `libreoffice`. A imagem Docker já traz tudo isso.

```bash
git clone https://github.com/olverclock/lbot-whatsapp.git sinforoso
cd sinforoso
npm ci
npm run setup:yt-dlp   # baixa o yt-dlp oficial e confere o SHA-256
npm run build
npm start
```
</details>

---

## ⚙️ Configuração (`.env`)

Tudo é opcional: o bot funciona sem nenhuma chave. As chaves só ativam recursos extras, e todas são **gratuitas**.

| Variável | Para quê |
|---|---|
| `GROQ_API_KEY` / `HF_TOKEN` | Áudio para texto (`!ouvir`) mais rápido e com mais cota |
| `VIRUSTOTAL_API_KEY` | Verificação de links e arquivos (`!scan`, `!scanlinks`) |
| `RASTREIO_API_KEY` | Histórico de encomendas no `!rastreio` (Site Rastreio, 1.000 consultas/mês) |
| `GDRIVE_CLIENT_ID` / `GDRIVE_CLIENT_SECRET` | Cópia dos backups no Google Drive (`!backup drive`) |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`, `KICK_CLIENT_ID` / `KICK_CLIENT_SECRET` | Avisos de live da Twitch e do Kick |
| `STORAGETO_API_TOKEN` | Sem limite diário no `!upload` |
| `BACKUP_HOUR`, `BACKUP_KEEP`, `GDRIVE_KEEP` | Horário do backup e quantos guardar no servidor e no Drive |
| `YT_MAX_MB`, `YT_MAX_HEIGHT` | Tamanho e resolução máximos do `!yt` (padrão: 50 MB e 1080p) |
| `FREEGAMES_COUNTRY` | País usado para conferir os jogos grátis (padrão: `BR`) |
| `GIVEAWAY_VAULT_KEY` | Chave do cofre dos prêmios dos sorteios (opcional; separa a chave do backup) |

Todas as opções estão comentadas no [`.env.example`](.env.example).

---

## 👣 Primeiros passos

1. Depois de conectar, envie **`!admin`** no privado do bot: o seu número vira **dono**.
2. **`!menu`** mostra o menu principal. Dentro de um grupo, **`!menu 5`** mostra os comandos do grupo (completo para admins).
3. Para moderar um grupo, deixe o **bot como administrador** do grupo.
4. Qualquer dúvida sobre um comando: **`!comando guia`**.

---

## 🔒 Privacidade e segurança

- **Seus dados ficam com você**: sessão, bancos e backups ficam só no seu servidor (e no seu Google Drive, se você conectar).
- **Documentos processados localmente**: PDF, OCR e conversões não usam serviços externos.
- **Container endurecido**: usuário sem root, `no-new-privileges`, capacidades mínimas, limite de processos e memória, e `/tmp` em memória.
- **Sem burlar proteções de terceiros**: o bot usa apenas APIs públicas, oficiais ou contratadas por você.
- **Dependências auditadas**: `npm audit` sem vulnerabilidades e o yt-dlp oficial com checksum conferido.
- ⚠️ O backup contém a **sessão do WhatsApp**: guarde as cópias em local seguro.

> Este projeto não tem vínculo com o WhatsApp ou a Meta. Use com responsabilidade e respeite os Termos de Serviço do WhatsApp e as leis de direitos autorais.

---

## 🧪 Para desenvolvedores

```bash
npm run check        # tipos, complexidade, testes, arquitetura e auditoria
npm test             # só os testes
npm run dev          # compila e inicia
```

- Arquitetura em camadas: `commands → controllers → services`, com `utils` como base. As regras estão em [docs/ARCHITECTURE_RULES.md](docs/ARCHITECTURE_RULES.md).
- Histórico de mudanças: [docs/CHANGELOG.md](docs/CHANGELOG.md).

---

## 📜 Licença

Distribuído sob a licença **GPL-3.0**, a mesma do projeto original. Veja [LICENSE](LICENSE).

---

## 🙏 Créditos

O **Sinforoso** é um fork, mantido e modernizado, do **LBot**.

Agradecimento especial a **[Victor Souza Leal](https://github.com/victorsouzaleal)**, criador do **[LBot — lbot-whatsapp](https://github.com/victorsouzaleal/lbot-whatsapp)**, a base sobre a qual este bot foi construído. Obrigado por disponibilizar o projeto para a comunidade. 💚

Agradecimentos também à equipe e à comunidade do **[WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys)**, a biblioteca que conecta o bot ao WhatsApp.
