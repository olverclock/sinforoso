# Notas de atualização
Colocarei neste arquivos as mudanças significativas em cada versão começando na versão 3.0.0

## 3.6.0 - 21/11/2026

### NOVOS RECURSOS
- **!lembrete**, **!lembretes**, **!rmlembrete**: lembretes com horário em português natural; repetições diárias e semanais; enviados com aviso de atraso se o bot estava desligado ou sem internet.
- **!agendar** (admins): mensagens agendadas no grupo.
- **!enquete**: enquete nativa do WhatsApp (uma ou várias opções).
- **!regras**, **!setregras**, **!rmregras**, **!regrasauto**: regras do grupo e envio automático para novos membros.
- **!verificacao**: verificação anti-robô de novos membros, guardada no banco (sobrevive a reinícios).
- **!antigolpe**: filtro local de golpes comuns no Brasil.
- **!amigosecreto**: amigo secreto com sorteio em ciclo único, enviado no privado.
- **!sorteiomembro** aceita quantidade e prêmio (sem argumentos continua igual).
- **!cep** (também CEP pelo endereço), **!cnpj**, **!feriados**, **!loteria**, **!rastreio**.
- **Backup automático** diário às 4h, com recuperação do horário perdido, e o comando **!backup**.

- **Backup no Google Drive** (**!backup drive**): login por código (google.com/device), permissão mínima drive.file, envio que espera a internet voltar e rotação no Drive.
- **!pdf separar** 10 a 50: PDF novo só com as páginas pedidas.
- **!ocrpdf** (e **!pdf ocr**): qualquer arquivo (PDF escaneado, imagem, DOCX, DOC, TXT...) em PDF pesquisável; páginas digitais ficam intactas.
- **!jogosgratis**: ofertas da Epic e da Steam conferidas na loja do Brasil; as indisponíveis aqui não são divulgadas.

- **!rastreio** mostra a situação atual e o histórico da encomenda pela API do Site Rastreio (chave grátis em RASTREIO_API_KEY, 1.000 consultas/mês), com cache de 30 minutos e limite diário por pessoa. Sem chave, continua validando o código e mandando o link oficial.

- **!yt** baixa na melhor qualidade que cabe no limite (até 1080p e 50 MB, ajustável por YT_MAX_HEIGHT e YT_MAX_MB), em H.264 e sem recomprimir. Antes era limitado a 480p.
- **!ig** explica o motivo quando não consegue baixar (login exigido, limite do Instagram, link inválido) e envia as fotos de carrosséis que têm vídeo.
- **!marcar** / **!tagall**: marca todos invisivelmente, com lista de @ (*lista*) ou respondendo uma mensagem.
- **!discord**: convites do Discord por grupo, com o nome da comunidade, configurados pelos admins.

### SORTEIOS (docs/SORTEIOS.md)
- **!sorteio novo / relampago / caca**: sorteio com inscrições e horário, sorteio relâmpago com animação (roleta e troféu) e caça à chave protegida (4 códigos, tentativas no privado, primeiro acerto vence).
- Cofre de chaves com AES-256-GCM, entrega automática só ao vencedor no privado, novas tentativas e `!sorteio resgatar`.
- **!sorteio premio** (no privado): guarda o prêmio antes e devolve um código; `!sorteio novo CÓDIGO | 1h` (ou o nome do prêmio) cria o sorteio já vinculado, com entrega automática. `!sorteio premios` e `!sorteio apagar`.
- Sorteio sem prêmio guardado: o organizador recebe no privado quem ganhou, para entregar manualmente.
- Os subcomandos do !sorteio aceitam quebra de linha (ex.: a chave colada na linha de baixo).
- Comandos copiados das mensagens do bot com negrito (ex.: `*!sorteio relampago* CÓDIGO`) funcionam: o asterisco que fecha o negrito não gruda mais no argumento.

### SEGURANÇA
- Corrigida falha herdada: o bot dava **admin e até dono** a qualquer pessoa que usasse o **mesmo nome** do admin no WhatsApp. Agora a mesma pessoa em LID e em número é reconhecida só pela ligação oficial do WhatsApp.
- **!info** mostra só telefones de verdade, uma vez por pessoa (o LID, ID interno do WhatsApp, não aparece mais como se fosse celular). **!admins** indica quando dois registros são a mesma conta.
- **!rmadmin** remove marcas de dono copiadas por versões antigas (sem remover o próprio dono nem o último dono) e não trava com número de lista inexistente.
- Sorteio verificável (compromisso SHA-256 + semente revelada, escolha sem viés) com `!sorteio verificar`.
- Encerramento no horário mesmo após reinício; fila por sorteio impede dois vencedores e inscrições duplicadas.
- O `!sorteio 100` antigo continua igual.

### GUIAS DOS COMANDOS
- Revisados os guias dos 185 comandos. 81 guias curtos foram reescritos com exemplo, quem pode usar (admin do grupo, bot admin do grupo, admin do bot), limites e dicas, conferidos no código de cada comando.
- Corrigidos guias que mandavam usar comandos inexistentes: **!frase** (citava `!fch`), **!dcmd** (`!status`) e **!rmadmin** (`!veradmins`).
- Novo teste automático: todo comando tem guia, o guia mostra o próprio comando e só cita comandos que existem.

### CONEXÃO
- **Queda "Stream Errored (ack)" a cada ~50 minutos** (class "status", type "media"): bug do Baileys 7.0.0-rc14 (WhiskeySockets/Baileys#2858). O WhatsApp entrega os status dos contatos num elemento `<status>` que o Baileys não confirma; sem a confirmação, o servidor segura as mensagens novas e depois derruba a conexão. O bot agora confirma esse elemento, igual à correção oficial ainda não lançada (PRs #2866/#2883).

- **Erro "Cannot read properties of undefined (reading 'attrs')" em handleEncryptNotification**: o servidor às vezes pede a verificação das chaves de criptografia (`<notification type="encrypt">` com `<digest>`), e o Baileys rc14 quebrava ao ler esse pedido (sem derrubar a conexão). O bot agora atende o pedido como o WhatsApp Web, com o método oficial `digestKeyBundle()` do Baileys, que reenvia as chaves se estiverem faltando.

### DOCKER (ARM64)
- **!ig falhava no Orange Pi** (`yt-dlp terminou com código 127`): a imagem usava o yt-dlp standalone (PyInstaller), que não iniciava no container ARM64. Agora usa a versão *zipimport*, a recomendada pelo yt-dlp para Linux, com o `python3` do Debian. O build testa se o yt-dlp executa e para com erro se não executar.

### REMOVIDO
- **!steamverde**: buscava links de repacks piratas de jogos (FitGirl, DODI etc.). Para jogos grátis legais use **!jogosgratis** e **!free**.

### CORREÇÕES
- **Administradores não reconhecidos (WhatsApp novo / LID)**: os membros dos grupos chegam como LID (@lid), mas o bot e quem escreve pelo WhatsApp do bot chegam pelo número. Resultado: "Apenas administradores do grupo" mesmo sendo admin, o bot achando que não era admin (desligando o anti-fake e não conseguindo apagar/banir) e a lista negra nunca reconhecendo ninguém. Agora LID e número são ligados como a mesma pessoa.
- **Anti-fake** confere o número de telefone real; quem chega só com LID (país desconhecido) não é removido por engano.
- Comandos escritos na **legenda de um documento** (ex.: !topdf, !pdf, !ocr, !upload, !scan) eram ignorados, e responder um documento que tinha legenda também falhava.
- Arquivos gerados agora mantêm o **nome do documento original** (antes: documento.pdf).
- O bot respondia a **status (stories)** dos contatos como se fossem conversas, e podia publicar um status (boas-vindas ou figurinha automática). O WhatsApp derrubava a conexão ("Stream Errored (ack)"). Status, listas de transmissão e canais agora são ignorados.

### DOCKER
- Nova pasta montada `backups/` (docker-compose e CasaOS).

## 3.4.6 - 09/06/2025

### CORREÇÕES
- Corrigido erro dos comandos do Youtube (**!play** e **!yt**) revertendo para a biblioteca **ytdl-core**

## 3.4.5 - 07/06/2025

### CORREÇÕES
- Corrigido o comando no README para fazer instalação no Termux

### ALTERAÇÕES
- Revertida a versão da API do Tiktok

### DEPENDENCIAS
- As dependencias do projeto foram atualizadas para as versões mais recentes.

## 3.4.4 - 01/06/2025

### CORREÇÕES
- Corrigida a conexão por código de pareamento.

### DEPENDENCIAS
- As dependencias do projeto foram atualizadas para as versões mais recentes.

## 3.4.3 - 23/05/2025

### ALTERAÇÕES
- Alterada versão da API do Tiktok

## 3.4.2 - 20/05/2025

### DEPENDENCIAS
- As dependencias do projeto foram atualizadas para as versões mais recentes.

## 3.4.1 - 06/05/2025

### CORREÇÃO
- Correção na conexão com código de pareamento
- Correção no download de mídias do Instagram

## 3.4.0 - 02/05/2025

### GERAL
- Melhoria na migração de dados que acontece após cada atualização.
- O menu de grupo foi reorganizado e agora exibe os recursos do grupo em categorias separadas.
- A mensagem de erro quando um usuário fazia um comando incorretamente agora exibe diretamente o guia do comando.

### NOVO
- Recurso **Respostas automáticas (Grupo)**: Novo recurso de **GRUPO** para configurar mensagens automáticas de acordo com as palavras configuradas.
- Comando **!audio**: Novo comando **UTILITÁRIO** para extrair áudio de vídeos.

### ALTERAÇÕES
- Recurso **Anti-fake**: O Anti-fake recebeu comandos para adicionar/remover exceções de prefixos internacionais ou até mesmo um número especifico, e as configurações não serão zeradas quando este recurso for desabilitado.
- Recurso **Anti-link**: O Anti-link recebeu comandos para adicionar/remover exceções de links, e as configurações não serão zeradas quando este recurso for desabilitado.
- Comando **!audio**: O comando de efeito de áudio agora foi renomeado para **!efeitoaudio**

### CORREÇÃO
- Correção no **Anti-fake** que não incluía o DDI 55 automaticamente quando configurava as exceções e podia gerar bans acidentais.
- Correções nos efeitos de grave/agudo no comando **!efeitoaudio**

## 3.3.7 - 25/04/2025

### GERAL
- Agora o bot sincroniza todas as mensagens antes de iniciar, isso pode demorar dependendo de quantos grupos o bot está e por quanto tempo o bot estava offline recebendo mensagens.

### CORREÇÃO
- Corrigido possíveis erros na reconstrução do banco de dados
- Corrigido erros nos comandos do Youtube **!play** e **!yt**
- Corrigido erro na criação de stickers em imagens com formato **webp**
- Corrigido envio incorreto de imagem que poderia acontecer no comando **!detector**


## 3.3.6 - 21/04/2025

### CORREÇÃO
- Corrigido o registro de grupos, agora as mensagens de grupo devem ser reconhecidas corretamente.

## 3.3.5 - 21/04/2025

### GERAL
- O registro do Baileys agora está ativo para indicar qualquer problema no bot, não se assuste se aparecer mais letras no console.
- Foram adicionadas mais mensagens de erro nos caso de não conseguir ler a mensagem ou a mensagem não poder ser formatada de forma correta.

### CORREÇÃO
- Correção no registro de usuários, alguns grupos estavam sendo registrados como usuário indevidamente.

## 3.3.4 - 21/04/2025

### GERAL
- Revertida versão do Baileys para a última versão original
- O problema de grupos ainda não foi resolvido, estarei aguardando uma nova versão do Baileys.

## 3.3.3 - 21/04/2025

### CORREÇÕES
- Mais uma tentativa em corrigir as sessões em grupos

## 3.3.2 - 20/04/2025

### CORREÇÕES
- Correção de erro ao tentar usar o código de pareamento
- O armazenamento de sessão foi revertido para a versão antiga já que vários usuários de Termux relataram problemas

## 3.3.1 - 20/04/2025

### CORREÇÕES
- Correção na mensagem de espera do comando **!ig**
- Correção na sessão que não estava detectando corretamente algumas mensagens de grupo.

## 3.3.0 - 18/04/2025

### Com as novas mudanças na sessão após essa atualização você terá que se conectar novamente lendo o código QR ou código de pareamento.

### GERAL
- O armazenamento de dados da sessão foi melhorado, isso deve ajudar a resolver alguns problemas do bot parar de responder do nada e alguns outros erros que aconteciam raramente.
- O bot agora só lê as mensagens após iniciar totalmente para garantir que as mensagens recebidas são novas e não de quando ele estava desligado.
- Os stickers criados agoram recebem o nome de quem fez o comando como autor do sticker.
- As imagens enviadas pelos comandos da categoria **VARIADO** agora ficam armazenadas localmente.
- Adicionado suporte a exceções de links no recurso **ANTI-LINK**

### COMANDOS
- Comando **!nomeautor** foi removido
- Comando **!nomepack**  foi removido

### CORREÇÕES
- Correção da exibição da lista no comando **!top5**
- Correção da conversão de sticker para imagem no comando **!simg**
- Correção do erro 429 em comandos da categoria **VARIADO**

## 3.2.0 - 11/04/2025

### GERAL
- A partir dessa versão o banco de dados é reconstruído a cada atualização não sendo mais necessário perder os dados para atualizar.
- Melhoria na sincronização de grupos.
- Melhoria na fila de eventos para evitar eventos desnecessários.
- Pequenas alterações nos textos exibidos no terminal em cada inicialização.

### COMANDOS
- Todos os comandos que necessitavam de uma chave API (com pouco limite) foram removidos, no momento apenas o **!ia** e **!criarimg** por serem altamente requisitados e acabar rápido o limite.
- Adicionada mensagem de erro ao usar o **!grupos** se o bot não estiver em nenhum grupo.

### CORREÇÕES
- Correção ao remover administrador do grupo que não era reconhecido pelo bot que um membro não já não era mais administrador.

## 3.2.0 - 11/04/2025

### GERAL
- A partir dessa versão o banco de dados é reconstruído a cada atualização não sendo mais necessário perder os dados para atualizar.
- Melhoria na sincronização de grupos.
- Melhoria na fila de eventos para evitar eventos desnecessários.
- Pequenas alterações nos textos exibidos no terminal em cada inicialização.

### COMANDOS
- Todos os comandos que necessitavam de uma chave API (com pouco limite) foram removidos, no momento apenas o **!ia** e **!criarimg** por serem altamente requisitados e acabar rápido o limite.
- Adicionada mensagem de erro ao usar o **!grupos** se o bot não estiver em nenhum grupo.

### CORREÇÕES
- Correção ao remover administrador do grupo que não era reconhecido pelo bot que um membro não já não era mais administrador.

## 3.1.5 - 04/04/2025

### CORREÇÕES
- Correção na escolha de método de autenticação no Termux

## 3.1.4 - 04/04/2025

### GERAL
- Adicionado suporte a código de pareamento, quando iniciar o bot pela primeira vez será perguntado se deseja se conectar pelo QR Code ou Código de pareamento.
- Removida a necessidade de configurar API Key para funcionamento de certos comandos.
- Erros de chamadas externas de API/Bibliotecas agoras são exibidas no console.
- Novo recurso de grupo para **filtrar palavras e deletar mensagem** se alguma palavra do filtro for detectada.

### COMANDOS
- Novo comando de admin **!modoadmin** para apenas administradores do bot conseguirem usar comandos.
- Novo comando de grupo **!rmaviso** para remover aviso de um membro.
- Novo comando de grupo **!zeraravisos** para zerar os avisos de todos os membros.
- Novo comando de grupo **!addfiltros** para adicionar palavras ao filtro do grupo.
- Novo comando de grupo **!rmfiltros** para remover palavas do filtro do grupo.
- Comando **!grupo** agora também exibe os filtros de palavras ativos no grupo.
- Suporte ao campeonato de 2025 no comando **!brasileirao**.

### CORREÇÕES
- Correção na reprodução do video no comando **!qualanime**


## 3.1.3 - 31/03/2025

### COMANDOS
- Comando **!ia** foi adicionado novamente
- Comando **!criarimg** foi adicionado novamente

### CORREÇÕES
- Correção na mensagem de espera do comando **!play**
- Correção no problema de download dos comandos **!play** e **!yt**
- Correção no antiflood que ficava sempre ativo mesmo ele estando desativado.


## 3.1.2 - 29/03/2025

### CORREÇÕES
- Corrigida a sincronização inicial de grupos e da lista negra
- Corrigida resposta quando não encontra nenhuma letra de música pelo comando **!letra**


## 3.1.1 - 28/03/2025

### CORREÇÕES
- Corrigida a atualização de grupos quando o bot inicia, agora ele remove corretamente os participantes do banco de dados que já sairam do grupo.
- Corrigido banimento do comando **!aviso**, agora ao chegar aos 3 avisos ele irá banir corretamente e adicionar a lista negra.


## 3.1.0 - 28/03/2025

### GERAL
- Reorganização na estrutura do projeto para me facilitar na manutenção.
- O atualizador agora verifica se a versão nova é compativel com os dados atuais, caso não seja será perguntado se deseja instalar a versão nova e deletar os dados antigos.
- Implementação de banco de dados para guardar os dados de participantes dos grupos.

### COMANDOS
- Comando **!menu** agora não exibe a categoria grupo quando é usado no privado.
- Comando **!contador** foi removido e agora o contador já está integrado com o grupo.
- Comando **!atividade** foi renomeado para **!membro** e foram adicionadas informações adicionais sobre o membro do grupo.
- Comando **!verusuario** foi renomeado para **!usuario**
- Comando **!veradmins** foi renomeado para **!admins**
- Comando **!vergrupos** foi renomeado para **!grupos**
- Novo comando de grupo **!aviso** (Se o membro receber 3 avisos será automaticamente adicionado a lista negra).

### CORREÇÕES
- Corrigida a resposta do comando **!par**
- Modificado visual do menu para corrigir o visual quebrado em alguns navegadores no PC.
- Corrigida falha que se o usuário fosse bloqueado pelo bot ele não passava pelos filtros dos recursos de segurança do grupo.


## 3.0.2 - 24/03/2025

### GERAL
- Agora quando uma atualização é feita a pasta da versão anterior é deletada para evitar os arquivos que não são mais usados se acumulem.
- Projeto foi reorganizado e agora as API's estão juntas com o bot para facilitar nas atualizações.

### COMANDOS
- Novo comando **!steamverde** para procurar links de "jogos alternativos" para PC.
- Comando **!simi** removido do bot.

### CORREÇÕES
- Os comandos **!ouvir** e **!qualmusica** foram corrigidos e agora recebem a chave de API corretamente.

## 3.0.1 - 21/03/2025

### NOVO
- Novos comandos **!sorteio** para sortear um número.
- Novo comando **!sorteiomembro** para sortear um membro do grupo.

### MUDANÇAS
- O comando **!roletarussa** foi reescrito para ficar mais fiel ao jogo real e agora funciona também em chat privado.

### CORREÇÕES
- Agora se o atualizador não se conseguir se conectar ao GitHub ele não irá impedir de inicializar o bot.

## 3.0.0 - 21/03/2025

### GERAL
- O projeto foi totalmente reescrito para Typescript.
- Agora o projeto utiliza a [**biblioteca-lbot**](https://www.npmjs.com/package/@victorsouzaleal/biblioteca-lbot) para obter dados externos para os comandos.
- Adicionada verificação de versão ao iniciar e se for possível ele fará a atualização automaticamente.
- O visual dos menus e das mensagens de resposta foram reformulados.
- Adicionado suporte a chats que tem mensagens temporárias que desaparecem com o tempo.
- Adicionado recurso de **múltiplos administradores do bot**.
- A configuração de chaves de API agora é feita por comando.
- O recurso de grupo **contador** foi reescrito
- O recurso **Taxa de comandos** foi reescrito
- O recurso **Anti-flood** foi reescrito 
- Os recursos de **Limite diário de comandos** e de **Tipo de usuário** foram removidos.
- O recurso de **Revelar mensagens de visualização única** foi removido.
- Melhoria na fila de eventos em espera enquanto o bot inicializa.
- Melhoria no tratamento de erro nos comandos para o usuário saber o que houve de errado.
- Melhoria no armazenamento de mensagens do bot.
- Melhorias em geral em comandos.
- A categoria de comando **DIVERSÃO** foi renomeada para **VARIADO**


### COMANDOS 

#### Mudanças
- Melhoria nos comandos da categoria DOWNLOAD dando mais informações sobre a mídia baixada e agora permite downloads de no máximo **6 MINUTOS**.
- Melhorias nos comandos da categoria VARIADO, alguns comandos foram reescritos.
- Comando **!s** agora possibilita fazer sticker sem redimensionar a imagem original usando o comando **!s 2**.
- Comando **!status** foi renomeado para **!grupo** e agora exibe mais informações sobre o grupo inclusive quantos comandos foram feitos e quais recursos estão ativos/desativados.
- Comando **!info** agora exibe o contatos de todos que estão registrados como administrador do bot.
- Comando **!reportar** agora reporta a mensagem para todos que estão registrados como administrador do bot.
- Comando **!remlista** foi renomeado para **!rmlista** e agora não é mais necessário digitar o número completo da pessoa que você quer remover da lista negra, é só usar o **!listanegra** e ver qual posição da lista a pessoa que você quer remover está e usar o rmlista. Por exemplo **!rmlista 1** remove a pessoa da posição 1 da lista negra.
- Comando **!listanegra** agora exibe quantos usuários estão na lista negra, e se o usuário que está na lista já tiver tido contato com o bot também será exibido o nome dele ao lado do número.
- Comando **!tw** foi renomeado para **!x**
- Comando **!nomeadm** foi renomeado para **!nomeautor** e agora serve para renomear o nome do autor das figurinhas.
- Comando **!nomesticker** foi renomeado para **!nomepack** e agora serve para renomear o nome do pack das figurinhas.
- Comando **!alink** foi renomeado para **!antilink**.
- Comando **!afake** foi renomeado para **!antifake**.
- Comando **!aflood** foi renomeado para **!antiflood**.
- Comando **!bv** foi renomeado para **!bemvindo**.
- Comando **!fch** foi renomeado para **!frase**.
- Comando **!add** teve a resposta melhorada e só adiciona 1 membro pro comando ao grupo para evitar banimentos.
- Comando **!ban** teve a resposta melhorada e exibe se conseguiu banir ou não o participante.
- Todos os comandos de marcação **!mm**, **!mt** e **!adms** agora usam marcação silenciosa para evitar mostrar uma lista muito grande de pessoas marcadas.
- Comando **!topativos** como padrão agora exibe o ranking dos 10 membros com mais mensagens no grupo.
- Comando **imarcar** foi renomeado para **!inativos**.
- Comando **!verdados** foi renomeado para **!verusuario**
- Comando **!grupos** foi renomeado para **!vergrupos**
- Comando **!estado** foi renomeado para **!recado** e agora pode ser usado para colocar qualquer texto na parte de recado/status no perfil do bot.
- Os comandos **!sair** , **!linkgrupo** e **!sairgrupos** não ficarão mais expostos no menu de admin, eles serão subcomandos do comando **!vergrupos**.
- Comando **!pvliberado** foi renomeado para **!comandospv**
- Comando **!info** agora exibe quais recursos do bot estão ligados/desligados se quem fizer o comando for administrador do bot.

#### Novo
- Novos comandos **!addadmin**, **!rmadmin**, **!veradmins** para adicionar, remover e listar os administradores do bot.
- Novo comando **!api** para configurar as chaves de API sem a necessidade de alterar o .env.

#### Removidos
- Comandos de limite diário e de tipos de usuários **!limitediario**, **!usuarios**, **!tipos**, **!novotipo**, **!tipotitulo**, **!deltipo**, **!usuariotipo**, **!limpartipo**, **!tipocomandos**, **!rtodos**, **!r** foram removidos.
- Comandos de revelar mensagens **!autorevelar** e **!revelar** foram removidos.
- Comando **!rt** foi removido.
- Comando **!enquete** foi removido.
- Comando **!regras** foi removido e foi integrado ao **!grupo**
- Comando **!rastreio** foi removido por não ter mais suporte dos Correios.
- Comandos **!ia** e **!criarimg** removidos, e serão adicionados novamente se voltarem a funcionar ou eu achar alguma alternativa gratuita.
- Comando **!bantodos** foi removido.
- Comando **ibanir** foi removido.
- Comando **!infobot** foi removido, o comando **!info** vai servir para a função dele.




