# 🎁 Sorteios do Sinforoso

Sistema de sorteios de jogos, programas, licenças e chaves digitais, com três modalidades, entrega automática do prêmio no privado (PV) e resultado verificável. Tudo é salvo no banco do bot: sobrevive a reinícios, quedas de energia e reconexões.

> O `!sorteio 100` antigo (sortear um número) continua funcionando igual. Os sorteios novos usam palavras depois do comando (`novo`, `entrar`, `caca`...).

## Modalidades

| Modalidade | Comando (admin do grupo) | Como funciona |
|---|---|---|
| **Inscrições** | `!sorteio novo Prêmio \| 1h \| 1` | As pessoas entram com `!sorteio entrar` até o horário; no fim o bot sorteia e entrega no PV. |
| **Relâmpago** | `!sorteio relampago Prêmio \| 1` | Sorteio na hora entre os membros do grupo (nunca o bot), com animação de roleta e troféu. |
| **Caça à chave** | `!sorteio caca Prêmio \| 30m \| 1` | Quatro códigos de desafio (A–D), só um certo. As tentativas vão no **privado do bot**; vence o primeiro acerto que chegar ao bot. A chave real do prêmio **nunca aparece no grupo**. |

Acrescente `| sem admins` no fim para os administradores não participarem (a regra fica gravada e não muda depois).

**Horários:** `30m`, `1h`, `2d` (daqui a quanto tempo) · `às 20h`, `20:00`, `amanhã 20h`, `25/12 18h` (horário de Brasília). Entre 1 minuto e 30 dias.

## Guardar o prêmio antes (recomendado, no privado)

```
!sorteio premio Elden Ring (Steam) | XXXXX-XXXXX-XXXXX
```

- O bot guarda o prêmio criptografado e devolve um **código do prêmio** (ex.: `PK7M2Q`).
- No grupo, crie o sorteio com o código ou com o nome do prêmio: `!sorteio novo PK7M2Q | 1h`, `!sorteio relampago PK7M2Q`, `!sorteio caca PK7M2Q | 30m`. O sorteio já nasce **vinculado** e o vencedor recebe a chave sozinho, no privado.
- Várias chaves = vários vencedores (se você não informar o número de vencedores, ele é a quantidade de chaves).
- `!sorteio premios` lista os seus prêmios guardados; `!sorteio apagar PK7M2Q` apaga um que não foi usado. Só quem guardou pode usar, ver ou apagar.
- Código que não existe é recusado (o bot não cria um sorteio chamado "PK7M2Q" por engano).

## Sem prêmio guardado (entrega manual)

Se o sorteio for criado só com o nome (`!sorteio novo Camiseta do grupo | 1h`), o anúncio informa que o organizador entrega o prêmio. No fim, o bot manda **no privado do organizador** quem ganhou (com a marcação do ganhador) e avisa o ganhador que o prêmio vem do organizador. Se o organizador cadastrar a chave depois, ela é entregue na hora.

## Cadastrar a chave num sorteio já criado (sempre no privado)

```
!sorteio chave ID XXXXX-XXXXX-XXXXX
```

- Pode ser antes ou depois do resultado. Se o vencedor já foi sorteado, o prêmio é entregue na hora.
- Para vários vencedores, mande várias chaves (separadas por espaço ou uma por linha); elas vão na ordem do sorteio.
- Só quem criou o sorteio ou um administrador do grupo pode cadastrar.
- Se alguém mandar a chave no grupo, o bot tenta apagar a mensagem e recusa (a chave já pode ter sido vista).
- A confirmação mostra a chave mascarada (`KEY•••••CCC`), nunca inteira.
- A mesma chave não pode ser cadastrada em dois sorteios.

## Participar e consultar

| Comando | O que faz |
|---|---|
| `!sorteio entrar [ID]` | Entra (sem ID, no único sorteio de inscrições aberto do grupo). Entrar duas vezes não conta em dobro. |
| `!sorteio sair [ID]` | Sai antes do encerramento. |
| `!sorteio tentar ID B` | Tentativa na caça à chave (**no privado**). Limite de tentativas definido na criação (1 a 3). |
| `!sorteio resgatar ID` | O vencedor recebe o prêmio de novo no privado. Saber o ID não basta: só o vencedor registrado recebe. |
| `!sorteio ativos` · `status ID` · `historico` | Consultas. |
| `!sorteio verificar ID` | Mostra o compromisso, a semente revelada e se o resultado confere. |
| `!sorteio fechar ID` · `cancelar ID` | Admin: encerrar agora / cancelar (o prêmio continua guardado). |
| `!sorteio animacao` | Admin: liga/desliga as animações no grupo (padrão: ligadas). |

## Justo e verificável

1. Na criação, o bot sorteia uma **semente secreta** (32 bytes, `crypto.randomBytes`) e publica só o **compromisso** (SHA-256 da semente).
2. No encerramento, a lista de participantes é congelada em ordem alfabética e resumida num hash.
3. Os vencedores saem de `HMAC-SHA256(semente, hashDaLista:contador)` com **amostragem por rejeição** (sem viés de módulo — a mesma técnica do `crypto.randomInt` do Node), retirando cada vencedor da lista.
4. A semente é revelada. Qualquer um confere que `SHA-256(semente) = compromisso` e refaz a conta (`verifyDraw` em `src/utils/giveaway.util.ts`, algoritmo `sinforoso-draw-v1`).

A lista pública mostra só a quantidade e o hash, não os números de telefone. A semente é guardada criptografada até o fim. Na caça à chave não há sorteio: vence o primeiro acerto.

## Segurança das chaves

- **AES-256-GCM** (criptografia autenticada) com IV aleatório por operação e amarrada ao sorteio (AAD): uma chave copiada para outro sorteio não abre.
- Chave mestra: `GIVEAWAY_VAULT_KEY` no `.env` (64 caracteres hex) ou gerada uma vez em `storage/giveaway-vault.key` (permissão 0600).
- ⚠️ **Guarde uma cópia da chave mestra.** Sem ela, as chaves dos prêmios não podem ser abertas. Os backups incluem a pasta `storage/` — se a chave mestra estiver lá, quem tiver o backup consegue abrir os prêmios. Para separar, defina `GIVEAWAY_VAULT_KEY` no `.env` (que não entra no backup).
- Chaves nunca vão para o log, para o grupo ou para mensagens de confirmação.
- Uma operação por sorteio de cada vez (fila por sorteio): não há dois vencedores para o mesmo prêmio nem inscrição duplicada, mesmo com mensagens simultâneas ou repetidas pela reconexão.
- LID e número de telefone são tratados como a mesma pessoa.

## Entrega no privado

- O prêmio vai só para o vencedor registrado, no privado.
- Se o envio falhar, **não** é marcado como entregue: o bot tenta de novo (até 3 vezes, com 10 minutos entre tentativas) e o vencedor pode usar `!sorteio resgatar ID`.
- Sem prêmio cadastrado, o organizador recebe no privado quem ganhou para entregar manualmente; o vencedor é avisado e, se a chave for cadastrada depois, recebe automaticamente.

## Recuperação

O agendador verifica a cada 20 segundos (e logo ao conectar): sorteios que venceram com o bot desligado são encerrados e anunciados ao voltar; entregas pendentes são refeitas. Repetir a verificação não anuncia nem entrega duas vezes.

## Animações

Dois vídeos curtos e leves em `src/media/` (roleta 3 s, 173 KB; troféu com confetes 2,5 s, 71 KB), enviados como MP4 com `gifPlayback` (forma documentada no README do Baileys, pois o WhatsApp não aceita `.gif`). São desenhos próprios, gerados uma vez por `scripts/render-giveaway-animations.mjs` — o servidor não renderiza vídeo. O vencedor é gravado **antes** da animação; se a mídia falhar ou as animações estiverem desligadas, o resultado sai em texto, com as mesmas informações e menções.

## Limites

3 sorteios abertos por grupo · até 20 vencedores · nome do prêmio até 100 caracteres · chave até 300 caracteres · 1 a 3 tentativas por pessoa na caça à chave.

## Aviso legal

Sorteios de **empresas para divulgar produtos ou serviços** são promoções comerciais (Lei 5.768/1971 e Decreto 70.951/1972) e dependem de autorização da **Secretaria de Prêmios e Apostas (SPA)** do Ministério da Fazenda, pelo sistema SCPC. O bot organiza inscrições, entrega e verificação, mas não substitui essa autorização. Em caso de dúvida, consulte um advogado.

## Limitações reais

- O WhatsApp não garante a ordem exata de chegada: na caça à chave vale a ordem em que as mensagens **chegam ao bot**.
- O bot não consegue saber se uma chave foi ativada na plataforma (Steam, Epic etc.).
- A Baileys não é um cliente oficial do WhatsApp: evite volume alto de mensagens no privado.
