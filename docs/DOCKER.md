# Rodando no Docker (Orange Pi 5 / CasaOS / Debian arm64)

A imagem funciona em arm64 e amd64. Ela é compilada no próprio servidor, então nada do Windows (`node_modules`, `dist`) é copiado para ela.

## O que o Dockerfile resolve sozinho

| Item | Como |
|---|---|
| Base | `node:24-trixie-slim`: Debian 13, que é o estável atual, com o Node 24 em que o projeto é testado |
| ffmpeg atual | `apt install ffmpeg` (Debian) e `FFMPEG_PATH=/usr/bin/ffmpeg`. O binário 4.1 do npm é ignorado. |
| YouTube no yt-dlp | O yt-dlp usa o próprio Node como runtime JavaScript (`--js-runtimes node`), como recomenda a wiki EJS do yt-dlp |
| yt-dlp para ARM64 | `scripts/install-yt-dlp.mjs` baixa a versão `yt-dlp_linux_aarch64` e confere o SHA-256 |
| sharp para ARM64 | O pacote `@img/sharp-linux-arm64` vem do `package-lock.json` |
| Scripts de instalação | `npm ci --ignore-scripts`, igual ao npm 12 no desenvolvimento |
| Fuso horário | `TZ=America/Sao_Paulo` |
| Segurança | O bot roda como o usuário `node`, não como root. `no-new-privileges`, `cap_drop: ALL` e limites de CPU, memória e processos |
| Documentos | qpdf, Ghostscript, Poppler, Tesseract (pt/en) e LibreOffice sem interface, pelo apt (ver `docs/DOCUMENTOS.md`) |

## Passo a passo

1. Copie a pasta do projeto para o servidor, sem `node_modules`, `dist` e `bin`. Exemplo de destino: `/DATA/AppData/sinforoso`.
2. Crie o arquivo de configuração:
   ```bash
   cp .env.example .env
   nano .env
   ```
   Preencha `GROQ_API_KEY`, `MYMEMORY_EMAIL` e o que mais quiser usar.
3. Para manter a sessão atual sem parear de novo, copie também a pasta `storage/` do PC.
4. Suba o container:
   ```bash
   docker compose up -d --build
   ```
5. Só na primeira vez:
   ```bash
   docker attach sinforoso
   ```
   Escolha QR code ou código de pareamento. Depois, saia com **Ctrl+P** e **Ctrl+Q**, sem parar o bot.
6. Para ver os logs:
   ```bash
   docker logs -f sinforoso
   ```

## Limpeza automática (o disco não enche)

| O que | Como é limpo |
|---|---|
| Fotos, vídeos e áudios de conversões | Cada comando apaga os seus arquivos ao terminar. Sobras com mais de 1 hora (de erros ou reinícios) são apagadas **de hora em hora**. |
| Pasta `/tmp` do container | Fica em memória (`tmpfs`, até 1 GB) e é zerada a cada reinício. Não grava no cartão ou SSD. |
| Logs do container | Driver `local`, o recomendado pela Docker: no máximo 3 arquivos de 10 MB, compactados |
| Bancos NeDB | Compactados ao iniciar e a cada 24 horas. O cache de personagens com mais de 30 dias e os participantes de grupos que o bot deixou também são apagados. |
| Cache do npm | Não entra na imagem (cache do BuildKit) |

O que **não** se limpa sozinho, porque é do Docker e não do bot: imagens antigas que sobram a cada `--build`. Depois de atualizar, rode:

```bash
docker image prune -f && docker builder prune -f --filter until=168h
```

Para automatizar isso no Debian, uma vez por semana, aos domingos às 4h, rode `sudo crontab -e` e adicione esta linha:

```
0 4 * * 0 docker image prune -f && docker builder prune -f --filter until=168h
```

## Backup automático

Todo dia às **4h** (horário de Brasília) o bot grava um `.tar.gz` da pasta `storage/` (bancos, sessão do WhatsApp e configurações) na pasta `backups/`, ao lado do `docker-compose.yml` (no CasaOS: `/DATA/AppData/sinforoso/backups`).

- **Sem energia ou desligado às 4h?** O backup é feito assim que o bot liga. Uma verificação a cada 5 minutos cobre qualquer outro horário perdido. O backup é local e **não depende de internet**.
- Ficam os **7** mais recentes; os mais antigos são apagados.
- Cada backup é gravado primeiro como `.partial` e só depois renomeado: uma queda de energia no meio nunca deixa um arquivo quebrado parecendo bom.
- Comandos (admin do bot): `!backup` (agora), `!backup lista`, `!backup enviar` (só no privado).
- Ajustes no `.env`: `BACKUP_HOUR` (0–23), `BACKUP_KEEP`, `BACKUP_DIR`; `BACKUP_ENABLED=0` desliga.

> ⚠️ O backup contém a **sessão do WhatsApp**: quem tiver o arquivo pode usar o número do bot. Guarde cópias em local seguro.

**Restaurar** (pare o bot antes):

```bash
docker compose down
mv storage storage-antigo
tar -xzf backups/sinforoso-backup-AAAA-MM-DD_HH-MM-SS.tar.gz
docker compose up -d
```

O arquivo já contém a pasta `storage/`, então o `tar` recria a pasta no lugar certo.

### Backup no Google Drive (grátis)

Com o Drive conectado, cada backup também sobe para a pasta **Sinforoso Backups** do seu Google Drive:

- **sem internet às 4h**: o backup é feito no servidor e sobe para o Drive **assim que a internet voltar** (o bot tenta a cada 5 minutos);
- **sem energia às 4h**: ao ligar, o bot faz o backup e envia logo em seguida;
- no Drive ficam os 7 mais recentes (`GDRIVE_KEEP`);
- o bot usa a permissão mínima `drive.file`: só enxerga os arquivos que **ele mesmo** criou. Não lê nem apaga nada do resto do seu Drive.

**Configuração (uma vez, uns 5 minutos):**

1. Abra https://console.cloud.google.com/ e crie um projeto (ex.: "Sinforoso").
2. Em **APIs e serviços → Biblioteca**, procure **Google Drive API** e clique em **Ativar**.
3. Em **Google Auth Platform** (tela de consentimento OAuth): tipo **Externo**, preencha o nome do app e o seu e-mail.
4. Em **Público-alvo**, clique em **Publicar app** (status **Em produção**). Em modo "Teste" o Google corta o acesso depois de 7 dias.
5. Em **Clientes → Criar cliente**, escolha o tipo **TVs e dispositivos de entrada limitada**. Copie o **ID do cliente** e a **Chave secreta** para o `.env`:

   ```
   GDRIVE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   GDRIVE_CLIENT_SECRET=xxxxxxxx
   ```
6. Recrie o container (`docker compose up -d`) e, **no privado do bot**, mande `!backup drive`. O bot responde com um código: abra https://www.google.com/device no celular, digite o código e permita o acesso. Pronto.

Comandos: `!backup drive status`, `!backup drive agora` (envia o que falta) e `!backup drive desconectar` (revoga o acesso). O token fica em `storage/gdrive.json`, legível só pelo usuário do bot.


## Atualizar o bot

Substitua os arquivos do projeto. A pasta `storage/` e o `.env` continuam os mesmos. Depois rode:

```bash
docker compose up -d --build
```

## CasaOS (com ícone no painel)

O arquivo `casaos/docker-compose.casaos.yml` segue o formato oficial **x-casaos v2** ([documentação](https://www.zimaspace.com/docs/developer/app-store-compose-x-casaos)). Ele traz:
- id `com.sinforoso.whatsapp`, nome, descrição em português e inglês e categoria;
- arquiteturas `arm64` e `amd64`;
- o **ícone embutido** (`casaos/icon.png`).

O CasaOS não compila imagens. Por isso, a imagem é construída uma vez pelo terminal e o painel usa essa imagem local (`pull_policy: never`).

1. Copie o projeto para o Orange Pi, por exemplo para `~/sinforoso`, e entre na pasta.
2. Construa a imagem. Isso gera `sinforoso-whatsapp:latest` para ARM64; a primeira vez demora alguns minutos.
   ```bash
   docker compose build
   ```
3. Crie a pasta de dados do CasaOS e copie a configuração:
   ```bash
   sudo mkdir -p /DATA/AppData/sinforoso/storage && sudo cp .env.example /DATA/AppData/sinforoso/.env
   ```
   Depois edite `/DATA/AppData/sinforoso/.env` com as suas chaves. Se já usava o bot, copie a pasta `storage/` antiga para `/DATA/AppData/sinforoso/storage` para não precisar parear de novo.
4. No painel do CasaOS, clique em **+ → Instalar um app personalizado → Importar** (ícone no canto superior direito da janela). Cole o conteúdo de `casaos/docker-compose.casaos.yml` e confirme.
5. O app **Sinforoso aparece no painel com o ícone**. Na primeira vez, conecte pelo terminal:
   ```bash
   docker attach sinforoso
   ```
   Escolha QR code ou código de pareamento e saia com Ctrl+P e Ctrl+Q.

**Importante:**
- Use **ou** o `docker-compose.yml` da raiz pelo terminal, **ou** o app do CasaOS, nunca os dois juntos (os dois criam o container `sinforoso`). Se já tinha subido pelo terminal, rode `docker compose down` antes de importar.
- O bot não tem página web, então clicar no ícone não abre nada. Use o menu do app para ver logs, reiniciar, parar e atualizar.
- **Para atualizar:** copie os arquivos novos, rode `docker compose build` e reinicie o app no painel.

## Segurança das ferramentas

Reconstrua a imagem pelo menos **uma vez por mês**, para receber as correções de segurança do Debian (Ghostscript, LibreOffice, Poppler):

```bash
docker compose build --pull && docker compose up -d
```
