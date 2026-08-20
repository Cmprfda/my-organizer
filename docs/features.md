## Features

- **OneDrive workbook** (Settings → *Change workbook*): browse folders in
  OneDrive and the SharePoint sites you follow, search by name, and open any
  `.xlsx` file. Recently used workbooks stay within reach.
- **`?` button** (in the top bar, right of the connection indicator): opens
  the **"How to use"** guide with all app usage instructions.
- **Badge in the top-right corner**: shows where the data comes from —
  green (OneDrive connected), red (ready to connect / no server) or gray
  (local file). Click it to open Settings.
- **Compact view** (default): TCs/Functions · Role (Author/Reviewer of TC/TP) · Status · What to do
- Filter buttons (can be combined):
  - **Author / Reviewer** — filter by your role
  - **On my side** — the ball is on your side (work to do or reviews waiting on you)
  - **On the other side** — waiting on others (in review, or the author reworking it)
  - **Done** — completed
- **Status editing** — click a status badge to change it. The app **saves the
  change to the Excel file itself** via Excel/COM (preserves charts and
  validations; the change syncs up to SharePoint via OneDrive like a normal
  edit). Before writing it confirms the sheet row hasn't changed. If writing
  to Excel fails, the change is saved locally (**✎** and a blue ring on the
  badge) and the sheet catches up next time that cell is refreshed.
- **Execution / notes** — per task: quick tag (Running on Jenkins, Saving
  logs, …), **execution checklist** (ran on dev branch, ran on component
  branch, component branch updated, review branch updated — green chips when
  done) and free text (number of runs, links). Saved on the server: the same
  state across all your devices.
- **Personal TODO** with two modes: **List** and **Kanban** (To do, In
  progress, Pending, Done), with drag&drop between columns and support for
  dragging items from Tasks/CCRs into the TODO.
- On TODO cards with detail, the note also appears as a **chip** (📝), in the
  visual style of the integrated board.
- Filter button counts recalculate based on active filters; buttons with no
  results are dimmed
- Free-text search box
- **Full view** — the original table with all columns and detailed statuses
- **See all** — the whole team's tasks
- Auto-refresh every 2 minutes
- **Task history** — the app compares each read of the sheet with the previous
  one and keeps what changed, so a task's detail box shows *what happened to
  it*: date, column, old → new value, and whether the change was pushed from
  this app (**✎**) or came from someone editing the workbook (**☁**). Excel
  keeps none of this. Only changes made since this version started tracking the
  sheet are known.
- **Stale tasks** — unfinished tasks with no change on the sheet for N days get
  an age tag (⏳ 7 days) next to their name, and a **Stale** filter button in
  the summary row. The threshold is set in Settings (2/3/5/7/14 days). An age
  shown as *≥ 7 days* means the task has never been seen changing, so that is a
  lower bound, not the real age.
- **Pin (📌) on a task** — a task linked to a board note now shows the pin on
  the Excel side too (CCRs and TODO items already had it); clicking it opens the
  note. The link used to be visible only from inside the note.
- **Kanban timer → Jira** — the effort button on a TODO item shows the timer
  time that has not been logged yet (⏱ 1h 20m) and opens the effort dialog with
  it already filled in, with the start time moved back accordingly. Logging less
  than what is offered leaves the rest pending instead of writing it all off.
  When a card leaves *In progress* the timer stops and a one-click prompt offers
  to log it.
- **Metrics** (tab): changes per day, tasks stale the longest, work by status,
  load per person, time counted vs. logged in Jira, and TODO per column.
  The period can be the last 7/14/30 days, a date range of your choosing
  (*datas à escolha*, up to 92 days), or a single day. Clicking a column of the
  daily chart opens that day: every change of every workbook, with the time, the
  task, the column and the before → after — and a button back to the period.
- **My period** (button in Metrics): a report of what you did in the period
  chosen alongside — statuses you pushed to the sheet, TODO items closed, time
  counted, effort logged in Jira, plus how much the team changed the sheet
  outside the app. Copies as markdown, ready to paste into a meeting or a chat.
- **Search everything** (**Ctrl+K**): one box across the rows of every open
  workbook, CCRs, TODO items, board notes (title and box text), linked Jira
  issues, and app actions. ↑/↓ to move, Enter to jump there, Esc to close.
- **Assistant** (💬 in the top bar, or **Ctrl+I**): a box where you type the
  question instead of walking to the right view — *my tasks*, *tasks in
  progress*, *stale tasks*, *pending changes*, *how many …?*, *ccrs ready to
  close*, *what do I have to do*, *notes about X*, *week report*, *summary*;
  anything else searches everything that is open. Each answer lists the items it
  found, and clicking one jumps there. It also takes orders — *add to my list:
  X*, *mark as done: X*, *status of X to Done*, *note on X: text* — but never
  acts on its own: it shows what it is about to do and waits for **Confirm**,
  and status changes stay local (✎) until the Push, like any other. It only
  knows what the app has open at that moment: it never reads Excel or OneDrive
  to answer. Type `help` in the box for the full list of what it understands.
- **Hoje** (☀ na barra de cima): o ponto de situação de quem acaba de abrir a
  app, numa janela só — o que tem data-limite para hoje (e o que está atrasado),
  o que vem a caminho, as tarefas cuja bola está do teu lado, as que passaram a
  paradas, o que mexeu na folha desde a última vez que aqui estiveste, e o tempo
  de cronómetro que ainda não foi para o Jira. Abre-se sozinho na primeira vez
  que a app é aberta em cada dia; depois é o botão. Cada linha salta para o sítio
  onde a coisa vive.
- **Data-limite e repetição** nos itens Por fazer: o chip 📅 põe (e muda) a data,
  que fica vermelha quando passa e mostra *Hoje*/*Amanhã* quando é o caso. No
  mesmo sítio escolhe-se a repetição — todos os dias, dias úteis, semanal, de 2
  em 2 semanas ou mensal: dar o item como feito faz nascer logo o seguinte, com
  a data certa, sem tempo contado e com a checklist outra vez por marcar.
- **Limite de cartões por coluna (WIP)** no quadro: no painel ⚙ *Colunas*
  escreve-se o máximo de cada coluna. O cabeçalho passa a mostrar *3/2* e a
  coluna ganha um risco vermelho quando passa do limite. É um aviso, nunca uma
  tranca — o cartão larga-se sempre onde se quiser.
- **Folha de horas** (nas Métricas): o tempo dos cronómetros arrumado pelo dia em
  que foi contado, com o total do período. Um cronómetro esquecido de um dia para
  o outro é repartido pelos dois dias, e não atirado todo para aquele em que se
  carregou no stop. O relatório da semana ganhou a mesma secção, mais a lista dos
  dias em que se contou tempo e nada foi registado no Jira.
- **Exportar** (nas Métricas, e *Guardar* na janela do relatório): o período à
  vista vai para um ficheiro na pasta `exports` ao lado da app — as alterações e
  a folha de horas em CSV (separador `;` e BOM, para o Excel os abrir com as
  colunas já separadas), o relatório em `.md`.
- **Estado em massa** (na barra das Tarefas): muda o mesmo estado em várias
  tarefas de uma vez. Parte das que estão à vista, com os filtros que tens
  ligados, e a janela lista-as com uma caixa de marcar cada (ver mais abaixo, em
  *Estado em massa linha a linha*). Como qualquer alteração de estado, fica local
  (✎) até ao Enviar — um clique a mais desfaz-se com o *Descartar locais*.
- **Desfazer uma alteração** (↺ no histórico da tarefa): o histórico já guardava
  o antes e o depois de cada célula; agora volta-se ao valor de antes com um
  clique. Fica local (✎) como qualquer outra alteração. O botão só aparece nas
  colunas que a app sabe escrever e quando o valor em vigor não é já o antigo.
- **À espera de alguém** (na caixa de detalhe da tarefa): marca quem está a
  segurar a linha e até quando é razoável esperar. Com prazo, a tarefa deixa de
  contar como *parada* até lá — passado o prazo (ou sem prazo nenhum) aparece no
  botão **À espera**, que é a lista do que há a cobrar. O chip ⏸ com o nome e o
  "há quantos dias" fica ao lado do nome da tarefa.
- **Quem gravou o livro**: a folha não diz quem mexeu numa célula, mas o OneDrive
  guarda as versões do ficheiro e quem gravou cada uma. O ☁ do histórico (e o do
  dia à lupa, nas Métricas) passa a trazer o nome de quem fez a gravação que
  apanhou a alteração.
- **Estado da issue do Jira no cartão**: o chip ao lado da chave vai buscar em
  que pé a issue está e, clicando outra vez, oferece os passos que o fluxo do
  projeto permite — a issue muda de estado sem sair da app.
- **Criar uma issue do Jira a partir de um item** (＋ ao lado do campo de ligar):
  escolhe-se o projeto e o tipo, e a issue nasce já ligada ao item — o registo de
  esforço do cronómetro funciona a partir daí.
- **Avisos fora da app** (Definições → *Avisos*): os avisos do sistema (ao lado
  do relógio) aparecem quando a janela está em segundo plano, e um webhook do
  Teams/Slack leva o que mudou nas tuas linhas mesmo com a app fechada. Os dois
  estão desligados por omissão; sem webhook escrito não sai nada da máquina.
- **Filtros personalizados que se passam a um colega**: na janela dos filtros, o
  *Copiar* põe o conjunto na área de transferência (pronto a colar num chat) e o
  *Colar* acrescenta aos teus os que um colega mandou, com as listas
  predefinidas que eles usem a viajar à boleia. Nunca substitui os teus.
- **Assistente com motor LLM** (opcional): com `chat_config.json` em
  `{"engine": "llm", …}` e o pacote `anthropic` instalado, as perguntas escritas
  à maneira de cada um passam a ser respondidas pelo modelo — sempre e só a
  partir do que a app tem aberto naquele momento. As ordens (*adiciona à minha
  lista*, *estado de X para Done*) continuam a passar pelo motor local, com a
  confirmação de sempre. Sem SDK, sem chave ou sem rede, responde o motor local
  e diz que foi ele.
- **Mais comandos no assistente**: além do que já sabia, responde a *o que faço a
  seguir* (o urgente, o que está em curso e o que está parado, por essa ordem),
  *urgentes*, *estatísticas*, *linhas sem estado* e *livros abertos*. E aceita
  mais ordens, sempre com o Confirmar de antes: *obs em &lt;tarefa&gt;: &lt;texto&gt;*
  (fica local ✎ até ao Enviar), *move &lt;item&gt; para em curso*, *prioridade de
  &lt;item&gt; para alta*, *remove da lista: &lt;item&gt;* e *cria uma nota: &lt;título&gt;* —
  esta última também põe na nota uma **tabela** do que está aberto (*cria uma
  nota com as minhas tarefas paradas*, *com a lista por fazer*, *com as ccrs*).
- **Cópias do teu trabalho** (Definições): a lista Por fazer, as notas, as CCRs,
  o quadro e o histórico vivem em ficheiros ao lado da app e não existem em mais
  nenhum sítio. A app guarda uma cópia por dia de cada um antes da primeira
  gravação, dá para guardar outra à mão, e qualquer uma se repõe com um clique —
  o que estava em vigor é guardado antes da troca, para o restauro se poder
  desfazer.
- **A repetição anda com o calendário**: um item diário deixado por fazer três
  dias já não mostra a data de há três dias nem dá UMA ocorrência seguinte ao ser
  fechado. A data sobe até à de hoje e o chip 📅 mostra quantas ocorrências
  passaram sem ele ser fechado (o número ao lado do ↻). Não nascem cópias em
  atraso: um item que se repete é um trabalho que volta.
- **Recomeçar o cronómetro sem perder a folha de horas**: pôr o tempo de um item
  a zero é sobre o total daquele item — os dias em que aquele tempo foi contado
  ficam na folha de horas, que é sobre os dias e não sobre o item.
- **Estado em massa linha a linha**: a janela continua a partir do que está à
  vista, mas agora cada linha tem a sua caixa de marcar (com *Marcar todas* e
  *Desmarcar todas*), com o nome e o estado atual à frente. Uma vista mal
  filtrada deixa de ser "tudo ou nada", e a janela avisa antes de aplicar quando
  são linhas demais.
- **Desfazer um envio inteiro** (↺ com um número, no histórico da tarefa e nas
  alterações do dia): o Push que mexeu em sete células desfaz-se de uma vez, em
  vez de célula a célula. Fica tudo local (✎) até ao Enviar, como qualquer
  alteração, e a linha em que alguém mexeu entretanto é deixada em paz.
- **As idades e as paradas deixam de recomeçar**: o histórico passa a reconhecer
  cada linha pelo que ela diz (Function/TC + To Do) e não pelo número que tem na
  folha. Inserir ou apagar uma linha no meio da folha já não faz parecer que meio
  livro mudou, e o histórico de uma linha renomeada pela app continua a ser o
  dela.
- **O "Hoje" diz em que pé está**: as secções das tarefas dependem dos livros,
  que são lidos depois de o painel abrir. Em vez de aparecerem vazias — o que
  quer dizer "não há nada para ti" —, o painel diz que está a ler (e quantos
  livros já leu), ou nomeia o livro que não conseguiu ler.
- **Esperas partilhadas com a equipa** (Definições → *Equipa*): com o
  interruptor ligado, as linhas em que estás à espera de alguém são publicadas na
  pasta partilhada e aparecem a quem tem a app — o chip diz quem marcou a espera,
  para não se cobrar duas vezes a mesma coisa. Desligado por omissão: só as
  esperas viajam, a tua lista Por fazer e as notas nunca saem da máquina.
- **Assistente com ferramentas**: com o motor LLM ligado, as perguntas deixam de
  ser respondidas só sobre as primeiras linhas de cada lista — o assistente
  procura, percorre e conta tudo o que a app tem aberto naquele momento (e as
  contas que dá são as mesmas das Métricas). Continua a nunca ler a folha nem o
  OneDrive, e as ordens continuam a passar pelo Confirmar.
- **App no telemóvel**: o "adicionar ao ecrã principal" passa a dar um ícone e
  uma janela sem a barra do browser, em vez de um atalho para uma página.
- **Duas pessoas a gravar ao mesmo tempo**: os pedidos que mexem na lista, nas
  notas, nas CCRs, nas esperas ou nas alterações locais passam a esperar uns
  pelos outros, e a gravação é atómica — o item acabado de criar no telemóvel já
  não desaparece porque o browser gravou no mesmo instante.

## v155

- **O que muda numa janela aparece nas outras**: a app deixou de esperar pelo
  ciclo de 20 segundos para dar por uma alteração. Uma nota escrita no
  telemóvel, um item arrastado na segunda janela, uma cópia do estado reposta
  nas Definições — aparece nas outras janelas em menos de um segundo, sem F5. O
  ciclo de perguntar continua lá, mais espaçado, para quando a ligação morrer
  calada (proxy, portátil a adormecer).
- **A app abre mais depressa**: a interface passa a ser guardada pelo browser
  (só se volta a descarregar quando muda mesmo) e vai comprimida — eram ~800 KB
  a cada arranque. A ajuda e a página das Métricas só chegam quando se clica
  nelas.
- **Quem mudou ESTA célula**: o `☁` de uma alteração no histórico passa a ser
  clicável. Em vez de mostrar quem gravou o livro àquela hora, vai ver às
  versões do livro no OneDrive qual é a gravação que trouxe aquele valor àquela
  célula — e diz quando é que tem a certeza (a versão anterior ainda tinha o
  valor antigo) e quando é só a mais antiga que já o tem.
- **O histórico não desaparece mais**: o que passa dos 5000 eventos guardados
  vai para um arquivo por mês, em vez de se perder. As Métricas de um período
  mais atrás voltam a ter dados e o desfazer de um Push antigo volta a funcionar.
- **Registar a semana no Jira de uma vez** (Métricas → *Folha de horas*): uma
  linha por item e por dia com o que falta registar, o tempo editável, e um
  Registar que as manda todas. Uma linha que falhe não leva as outras atrás.
- **Como tem corrido um item que se repete**: além de dizer quantas ocorrências
  passaram sem ele ser fechado, o chip 📅 passa a dizer QUAIS — "fechado 8 das
  últimas 10 vezes", com os dias.
- **Bloqueada por**: a marca "à espera de alguém" pode agora apontar ao que está
  a segurar a tarefa — outra tarefa, uma CCR ou um item por fazer. O chip leva-te
  lá, e a coisa que bloqueia passa a dizer o que se desbloqueia quando ela
  acabar.
- **Levar os filtros a toda a equipa** (janela dos filtros personalizados):
  *Publicar* deixa o conjunto na pasta partilhada com o teu nome e *Da equipa…*
  traz o de um colega. O que chega passa pela mesma caixa de colar de sempre —
  vê-se antes de aceitar.
- **Blocos de código nas notas**: uma caixa pode ter um bloco de código
  (`` ``` `` a abrir e a fechar, ou o botão `</>` da barra da caixa). Lá dentro
  nada é interpretado — nem negrito, nem tabelas — e a letra é de largura fixa.
  Copiar leva o código tal e qual: em texto simples sem as cercas, em texto
  formatado com o bloco desenhado, e na imagem da caixa.
- **Os menus das notas funcionam no telemóvel**: os grupos da barra
  (Ferramentas, Formas, Editar, Ver) abrem ao toque — não abriam nenhum — e o
  painel de cada um dobra em linhas em vez de sair do ecrã.
- **O assistente pode perguntar mais**: com o motor LLM ligado, passa a poder
  percorrer TODAS as linhas de TODAS as folhas que o servidor já leu (não só as
  primeiras da janela de quem pergunta) e a consultar o histórico das
  alterações. Continua a não escrever nada e a não ler a folha.
- **Cópias do estado de hora a hora**: nos dias recentes guarda-se uma cópia por
  hora (era uma por dia), por isso duas coisas apagadas no mesmo dia deixam de
  se repor as duas ao princípio do dia. Nos dias antigos fica uma por dia, como
  antes.
- **Duas instâncias na mesma pasta já não se pisam**: a DEV e a estável (ou a
  app aberta duas vezes) passam a esperar uma pela outra a gravar o estado —
  antes podia perder-se uma alteração.
- **Uma escrita no Excel de cada vez, e agora diz-se**: quando um Push espera
  que outro acabe, a janela que está à espera passa a dizê-lo em vez de mostrar
  o mesmo rodar de sempre.
