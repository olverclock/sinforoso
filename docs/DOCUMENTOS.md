# Motor de documentos (PDF, imagens, OCR e conversões)

Todo o processamento acontece **no próprio servidor do bot**: nenhum documento é enviado a sites ou APIs externas, e os arquivos são apagados quando o trabalho termina.

## A. Diagnóstico inicial

- **O que existia:** nenhuma função de PDF, OCR ou conversão de escritório. Já havia `sharp` (imagens) e `file-type` (identificação de arquivo), e as duas foram reaproveitadas.
- **Ambiente:** Node 24 e Baileys 7, com Docker Debian 13 (`node:24-trixie-slim`), usuário não-root e `/tmp` em memória.
- **O que faltava:** ferramentas nativas na imagem, uma fila com limites, validação de entrada, coleta de vários arquivos e o envio de documentos pelo WhatsApp (`replyDocumentFromBuffer` foi criado).

## B. Arquitetura

```
WhatsApp → command.invoker → commands/utility.document.functions (!pdf, !ocr, !topdf, !pdfdocx)
                                 │  baixa a mídia (limite de tamanho antes e depois)
                                 ├─ utils/document/validate  → tipo pelo CONTEÚDO, dimensões, páginas
                                 ├─ utils/document/queue     → fila (1 por vez), 1 tarefa por usuário, tempo máximo
                                 ├─ utils/document/pdf       → operações
                                 │      └─ utils/document/tools → spawn seguro (sem shell), pasta exclusiva, timeout
                                 └─ utils/document/session   → coleta de vários arquivos (juntar, fotos)
mensagens com mídia → message.procedures.collectDocumentFile (em segundo plano, na ordem enviada)
```

**Container único, sem worker separado.** O bot é uma instância só. As ferramentas já rodam em processos separados, como o usuário `node`, com tempo máximo e em fila de concorrência 1. Um segundo container acrescentaria comunicação entre serviços e mais memória, sem ganho real de segurança neste cenário. Os limites de CPU, memória e processos ficam no `docker-compose.yml`. Um worker isolado só passaria a valer a pena se o bot rodasse em várias réplicas ou recebesse documentos de muitos usuários desconhecidos ao mesmo tempo.

## C. Ferramentas e justificativas

| Ferramenta (apt) | Uso | Por quê |
|---|---|---|
| `qpdf` | juntar, extrair, remover, dividir, girar, senha, informações | Transformação estrutural, sem recompressão nem perda |
| `ghostscript` | só `!pdf comprimir` | Único caso que exige reprocessar o PDF. Roda com `-dSAFER` e recebe apenas PDFs validados, nunca PostScript |
| `poppler-utils` | texto, páginas em imagem, metadados | O Tesseract não lê PDF; o Poppler renderiza as páginas para ele |
| `tesseract-ocr` + `por` + `eng` | OCR e PDF pesquisável | O OCR livre mais usado. Português e inglês combinados |
| `libreoffice-writer-nogui`, `-calc-nogui` | DOCX/DOC/ODT/RTF/XLSX/TXT → PDF; texto → DOCX | Não há alternativa livre confiável para converter formatos do Office. Usado só nesses casos, com perfil isolado por trabalho |

Coisas que ficaram **de fora**, de propósito:
- **Python, pikepdf e OCRmyPDF:** o Poppler, o Tesseract e o QPDF já fazem o PDF pesquisável.
- **Novas bibliotecas npm:** imagem → PDF é montado no próprio código, embutindo o JPEG sem recompressão, como faz o `img2pdf`.

## D. Comandos

| Comando | O que faz | Estado |
|---|---|---|
| `!pdf info` | páginas, tamanho, senha, metadados | ✅ testado com ferramentas reais |
| `!pdf texto` | texto do PDF digital | ✅ |
| `!pdf extrair 1-3,5` / `remover 2,4` | mantém ou remove páginas | ✅ |
| `!pdf dividir [N]` | um PDF por página, ou partes de N | ✅ |
| `!pdf girar 90 [páginas]` | 90/180/270 | ✅ |
| `!pdf comprimir [alta\|media\|baixa]` | Ghostscript; nunca devolve arquivo maior | ✅ |
| `!pdf imagens [páginas] [png]` | páginas em JPG/PNG (até 20) | ✅ |
| `!pdf pesquisavel` | OCR → PDF pesquisável | ✅ |
| `!pdf proteger senha` / `desproteger senha` | AES-256; recusa senha errada | ✅ |
| `!pdf juntar` → arquivos → `!pdf pronto` | junta PDFs na ordem enviada | ✅ |
| `!pdf fotos` → imagens → `!pdf pronto` | várias imagens → um PDF | ✅ testado na função; a coleta é a mesma do *juntar* |
| `!pdf cancelar` | cancela a coleta ou a tarefa na fila | ✅ |
| `!ocr` | texto de imagem ou PDF (OCR se for escaneado) | ✅ |
| `!topdf` | DOCX/DOC/ODT/RTF/XLSX/TXT, imagem ou texto digitado → PDF | ✅ (texto e DOCX testados) |
| `!pdfdocx` | PDF → DOCX com **texto editável** | ✅. **Não reproduz o layout** (colunas, tabelas e imagens). O guia avisa. |

Cada comando tem guia: `!pdf guia`, `!ocr guia` e os demais. Também aparecem no `!menu 2`, na seção 📄 DOCUMENTOS.

**Não implementado:** XLSX/HTML → PDF como comandos próprios. O `!topdf` aceita XLSX; HTML ficou de fora de propósito por causa dos alertas de macro do LibreOffice em 2026. Extração de imagens embutidas também não foi feita (as páginas viram imagens com `!pdf imagens`).

## E. Segurança

**Medidas aplicadas:**
- O tipo do arquivo é identificado pela assinatura do conteúdo, nunca pela extensão. Um EXE com nome `.pdf` é recusado.
- Limites:
  - 25 MB de entrada, conferidos antes de baixar (tamanho informado pelo WhatsApp) e depois de baixar;
  - 64 MB de saída;
  - 200 páginas (30 no OCR);
  - imagens até 12.000 px de lado e 60 megapixels, contra bombas de descompressão.
- As ferramentas são executadas com `spawn` e lista de argumentos, **sem shell**. Intervalos de páginas só aceitam dígitos, vírgula e hífen, e senhas só caracteres ASCII visíveis. Há teste de injeção (`;`, `$()`).
- Cada trabalho tem uma pasta própria (`mkdtemp`). Os arquivos são gravados com `wx` (nunca sobrescrevem nem seguem um link existente) e recebem nomes internos; o nome enviado pelo usuário nunca é usado. A pasta é apagada no fim, e uma varredura de hora em hora remove o que tiver sobrado.
- Cada execução tem tempo máximo. No Linux, o grupo de processos inteiro é encerrado. stdout e stderr têm limite, o código de saída é verificado e o usuário recebe uma mensagem amigável, sem detalhes internos.
- A fila processa uma tarefa por vez, aceita uma tarefa por usuário por conversa e no máximo 10 aguardando. Tarefas travadas são interrompidas.
- As coletas ficam isoladas por conversa e usuário, expiram em 10 minutos e aceitam até 20 arquivos e 100 MB.
- No Docker: usuário `node`, `no-new-privileges`, `cap_drop: ALL` (com as poucas capacidades que o entrypoint usa), `pids_limit`, `mem_limit` e `cpus`. Sem montagem do socket do Docker. `/tmp` em memória.
- O VirusTotal continua só pelo hash. Nenhum documento é enviado a terceiros.

**Alertas de segurança das ferramentas em 2026 (conferidos em 18/11/2026):**
- **Ghostscript:** falhas de "SAFER bypass" exploradas com PostScript/EPS ([CVE-2026-101258](https://security-tracker.debian.org/tracker/CVE-2026-101258), corrigida no Debian 13 em 10.05.1~dfsg-1+deb13u3; [CVE-2026-125396](https://security-tracker.debian.org/tracker/CVE-2026-125396), confirmar). O motor só entrega PDF ao Ghostscript.
- **LibreOffice:** macros em documentos Base e HTML ([alertas oficiais](https://www.libreoffice.org/security/)). Esses formatos não são aceitos.
- **Poppler:** [CVE-2026-10118](https://security-tracker.debian.org/tracker/CVE-2026-10118) corrigida ([DSA-6334-1](https://lwn.net/Articles/1086785/)).
- **Risco restante:** ferramentas que processam arquivos de terceiros sempre têm superfície de ataque. **Reconstrua a imagem pelo menos uma vez por mês** (`docker compose build --pull && docker compose up -d`) para receber as correções do Debian.

## F. Testes

`tests/document-engine.test.ts` tem 18 testes. Eles usam as ferramentas reais quando estão instaladas; sem elas, os testes de operação são pulados e o motivo aparece no relatório.
- **Validação:** extensão falsa, EXE, vazio, acima do limite, bomba de imagem e intervalo malicioso.
- **Fila:** ordem, duplicada, fila cheia, cancelamento e tarefa travada.
- **Sessões:** isolamento entre usuários e grupos, expiração e limite de arquivos.
- **Execução segura:** sem shell, pasta apagada.
- **Operações reais:** informações, juntar, extrair, remover, dividir, girar, senha certa e errada, PDF protegido, PDF corrompido, compressão que nunca piora, acentos, OCR em português, PDF pesquisável, PDF → DOCX → PDF.
- **Fluxo do bot:** `!pdf` sem opção, opção inválida, `!pdf juntar` (inclui arquivo errado ignorado e ordem preservada), `!ocr`, `!topdf` e `!pdfdocx`, `!pdf proteger`.

**Resultado:** 18 de 18 testes passaram com as ferramentas reais (WSL Ubuntu 24.04: qpdf 11.9, Ghostscript 10.02, Poppler 24.02, Tesseract 5.3.4, LibreOffice 24.2). Na suíte completa, 227 passaram, 0 falharam e 1 foi pulado (um teste antigo, já pulado antes). A regressão de 323 verificações teve 0 itens removidos ou alterados; só entraram os novos comandos.

Para rodar no Windows com WSL, use `DOC_TOOLS_WSL=Ubuntu-24.04 npm test`.

## G. Medições (WSL x86, 12 núcleos, NÃO é o Orange Pi)

Mediana de 3 execuções:

| Operação | Tempo |
|---|---|
| TXT → PDF (LibreOffice) | 3,98 s |
| Extrair páginas (qpdf) | 0,44 s |
| Comprimir 10 páginas (Ghostscript) | 0,69 s |
| Texto (pdftotext) | 0,58 s |
| Imagem → PDF (interno) | 0,02 s |
| OCR de imagem (Tesseract por+eng) | 1,48 s |
| PDF pesquisável, 1 página | 4,88 s |
| PDF → DOCX, 1 página escaneada | 10,09 s |

Pico de RAM por ferramenta:

| Ferramenta | RAM |
|---|---|
| qpdf | ~9 MB |
| Ghostscript | ~25 MB |
| pdftoppm (300 dpi) | ~49 MB |
| Tesseract (300 dpi) | ~150 MB |
| LibreOffice | ~213 MB |

Com concorrência 1, o pico do motor fica perto de 250 MB acima do bot.

No WSL, cada chamada de ferramenta custa cerca de 0,4 s a mais, por isso "juntar 10 PDFs" deu 4,65 s; no Linux nativo esse custo não existe. O tamanho da imagem Docker e as medidas no Orange Pi 5 (ARM64) **ainda precisam ser feitos lá**:

```bash
docker images sinforoso-whatsapp
```
```bash
docker stats sinforoso
```

## H. Uso no Orange Pi 5

1. Atualize os arquivos do projeto e rode `docker compose up -d --build`. A imagem passa a incluir as ferramentas, cerca de 700 MB a mais.
2. Para ajustar os limites, edite o `.env` (`DOC_MAX_INPUT_MB`, `DOC_MAX_PAGES`, `DOC_MAX_OCR_PAGES`, `DOC_TIMEOUT_S`, `DOC_CONCURRENCY`, `DOC_MAX_QUEUE`).
3. **Logs:** `docker logs -f sinforoso`. As falhas aparecem com o nome da ferramenta e o código de saída; o conteúdo dos documentos nunca vai para o log.
4. **Diagnóstico:** `docker exec sinforoso qpdf --version` (e o mesmo com `gs --version`, `tesseract --list-langs` e `soffice --version`).
5. **Desativar o módulo:** bloqueie os comandos com `!bcmdglobal` (`!pdf`, `!ocr`, `!topdf`, `!pdfdocx`). Para tirar as ferramentas da imagem, remova a linha de pacotes do Dockerfile.
6. **Rollback:** volte para a versão anterior dos arquivos e rode `docker compose up -d --build`. A pasta `storage/` (sessão do WhatsApp e bancos) e o `.env` não são alterados pelo motor.

## I. Pendências

- Rodar e medir no Orange Pi 5 (ARM64): tamanho da imagem, RAM em repouso, picos e tempos. As medições acima são de x86.
- Construir a imagem Docker. Não há Docker nesta máquina; o Dockerfile e o compose não foram executados.
- Confirmar no Debian o estado da CVE-2026-125396 do Ghostscript.
- OCR de letra de mão e de fotos tortas ou escuras tem precisão limitada, como em qualquer OCR livre.
