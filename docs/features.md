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
- **Estado em massa** (na barra das Tarefas): muda o mesmo estado em todas as
  tarefas que estão à vista, com os filtros que tens ligados a servir de seleção.
  A janela diz quantas são e mostra as primeiras antes de aplicar. Como qualquer
  alteração de estado, fica local (✎) até ao Enviar — um clique a mais desfaz-se
  com o *Descartar locais*.
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
