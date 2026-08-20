## Backlog

### [DONE] Avisos do servidor, arquivo do histórico, autoria por célula, ocorrências, ferramentas do assistente, folha de horas no Jira, filtros da equipa, bloqueios, tabela de rotas, testes da interface, blocos de código e menus no telemóvel
- **Source:** ronda pedida pelo Carlos Andrade (2026-08-20) a partir da lista de
  melhorias que ele pediu para levantar, mais dois pedidos do feedback
  (`20260819_230821` — os menus das notas não funcionam no telemóvel — e
  `20260820_091531` — poder pôr blocos de código nas caixas).
- **What landed:**
  - `cswaios/events.py` (novo) + `GET /api/events` + `static/js/events.js`
    (novo): ligação pendurada (SSE) por janela, com fila própria, teto de
    ouvintes e `ping` de 15s. O `statefile.write_json` publica `state`, o
    `push_overrides` publica `sheet`, o `excel.com_wait` publica `excel`, e o
    `restore_backup` publica `state` com `restored`. Cada evento leva a janela
    que o causou (cabeçalho `X-Csw-Client` -> `events.set_origin`); o
    `static/js/main.js` passa a espaçar os ciclos (60s/6min) enquanto os avisos
    chegarem, e a voltar aos 20s/2min quando pararem.
  - `history.ARCHIVE_DIRNAME`, `_archive()`, `archived_events()`,
    `_batch_month()`: o que passa dos `MAX_EVENTS` vai para
    `history\history-<AAAA-MM>.json` e o `sheet_history`, o `recent_events` e o
    `batch_events` leem-no (o `batch_events` só o mês que o nome do lote indica).
  - `cswaios/authors.py` (novo) + `GET /api/history/who` + o `☁` clicável em
    `static/js/history.js`: quem mudou aquela célula, lido nas versões do livro.
  - `todos.normalize_occurrence`/`merge_occurrences` + `occurrences` nos itens
    (escritas em `catch_up_repeats` e `spawn_repeat`) e `todoStreak()` em
    `static/js/todo.js`: "fechado 8 das últimas 10 vezes", com os dias.
  - `cswaios/chatllm.py` (novo, sai do `chat.py`) com as ferramentas
    `sheet_rows` (sobre `tasks.cached_rows`, todas as folhas que o servidor leu)
    e `history` (sobre `recent_events`); `chat.engine_fn()` importa-o só quando
    o motor é o `llm`.
  - `report.timesheet_lines()` + `POST /api/jira/worklog/bulk` +
    `Handler._worklog_one()` (partilhado com o registo de uma issue) + o diálogo
    em `static/js/metrics.js`: registar a semana no Jira de uma vez.
  - `team.publish_filters()`/`load_team_filters()` + `GET`/`POST
    /api/team/filters` + os botões *Publicar* / *Da equipa…* em
    `static/js/customfilters.js`.
  - `store.normalize_blocker()` + `blocker` na marca da espera + o chip que
    salta e o "acabar isto desbloqueia N" em `static/js/waiting.js`.
  - `Handler.GET_ROUTES`/`POST_ROUTES` e 53 métodos (`get_api_tasks`,
    `post_api_todo`, …): as duas cadeias de if/elif (de 200 e 1250 linhas)
    passam a uma tabela; ficam na cadeia só os caminhos que não são igualdades.
    `Handler.STATE_POST_PATTERNS` fecha um buraco antigo — o registo de esforço
    (`/api/jira/issue/<key>/worklog`) mexia no `todo.json` sem trinco.
  - `Handler.send_static`: `ETag` + `Cache-Control: no-cache` + gzip (o
    `i18n.js` passa de 93 KB a 31 KB, e um F5 leva 304 sem corpo em vez de
    ~800 KB). `static/js/lazy.js` (novo): o `help.js` e o `metrics.js` chegam a
    pedido.
  - `statefile`: cópias por HORA nos dias recentes com `_prune` por camadas, e
    `state_lock()` — trinco também entre PROCESSOS (`msvcrt`/`fcntl` num
    ficheiro `.lock`), usado pelo `do_POST`.
  - Notas: `noteCodeBlock`/`noteCodeHtml`/`noteCodeText`/`noteCodePlain` em
    `static/js/notes.js`, `ncCodeHtml`/`ncPaintCode` em `static/js/noteclip.js`,
    o botão `</>` na barra da caixa e o `.noteBoxCode` no CSS: blocos de código
    nos quatro pintores (vista, leitura de volta, texto simples, HTML e tela).
  - Notas no telemóvel: o `preventDefault` do `mousedown` passa a ser só do
    rato (no toque cancelava o `click` que abria o menu) e há um caminho pelo
    `pointerup` para o dedo; o painel do grupo dobra em linhas
    (`flex-wrap`/`max-width`) em vez de sair do ecrã.
  - Testes: `tests/js/harness.js` (novo) corre os ficheiros de `static/js/` num
    contexto do `vm` com um DOM de mentira, e `tests/js/test_notes_text.js` +
    `test_ui_pure.js` provam os blocos de código (incluindo o mapa da vista),
    os estados, as colunas e as ocorrências — 13 testes, `node --test`, no CI.
    Do lado do servidor: `tests/test_events.py`, `test_arquivo_e_copias.py` e
    `test_ocorrencias.py` (191 testes de Python, offline).
- **Design:**
  - **Os avisos não substituem o ciclo de perguntar.** Uma ligação pendurada
    morre calada e a janela só descobre quando tenta ouvir outra vez; o ciclo é
    a rede de segurança, e por isso espaça-se em vez de desaparecer.
  - **O aviso leva quem o causou.** Sem isso, a janela que clicou recarregava-se
    por causa do próprio clique (e perdia o que estava a escrever). Com o `from`,
    quem mandou o pedido ignora o eco.
  - **A autoria por célula vai VER, não adivinha.** Cruzar horas dava o mesmo
    nome a duas pessoas que gravaram no mesmo minuto. Descarregar a versão e ler
    a célula custa megabytes — por isso é a pedido, perto da hora da alteração,
    com o resultado guardado, e diz quando tem a certeza e quando não tem.
  - **O arquivo do histórico é vizinho do `history.json`** (e não da pasta da
    app), como as cópias do estado: os testes apontam o ficheiro para uma pasta
    temporária e um arquivo de teste na pasta a sério ficava lá a contar
    história que não aconteceu.
  - **O registo em lote no Jira não é um caminho novo:** é o mesmo
    `_worklog_one` do diálogo de uma issue, corrido N vezes, com cada linha a
    responder por si.
  - **O que já foi registado desconta-se dos dias mais antigos primeiro:** o
    Jira é que guarda os dias, a app só sabe um total por item, e essa é a ordem
    por que se registam. Nunca se oferece o que já foi.
  - **Publicar filtros é um clique, não um interruptor** (ao contrário das
    esperas, que saem sozinhas quando ligadas), e o que chega passa pela caixa
    de colar de sempre: ninguém recebe filtros sem os ver.
  - **Do bloqueio só viaja o nome.** O `ref` de um item por fazer é um id desta
    instalação; saltar para ele no computador de outra pessoa não levava a nada.
  - **A tabela de rotas ganha à cadeia**, e a cadeia fica com o que não é uma
    igualdade. Um caminho fixo é sempre mais específico do que um prefixo ou uma
    expressão regular, por isso a ordem não muda de comportamento.
  - **`no-cache` não é `no-store`:** o browser guarda mas pergunta sempre, e a
    resposta é um 304. Uma versão nova muda a data dos ficheiros, logo o ETag —
    era esse o medo que mantinha o `no-store`.
  - **Um bloco de código não interpreta nada por dentro.** Um asterisco no meio
    de um comando é um asterisco. As cercas ficam guardadas nos `data-` do
    `<pre>` para o texto voltar a ser exatamente o mesmo.
  - **O `mousedown` só se cancela com o rato.** No modelo de compatibilidade do
    toque, o `mousedown` é inventado depois de o dedo levantar e cancelá-lo
    cancela o `click` a seguir — era isso que deixava os menus sem abrir no
    telemóvel.
- **Released in:** v155.
- **Known limits (worth revisiting):**
  - Os avisos são desta INSTÂNCIA: duas instalações diferentes (dois PCs) não se
    avisam uma à outra — o que as liga continua a ser a pasta partilhada e o
    ciclo de leitura. E a ligação prende um fio do servidor, por isso há um teto
    de 24 janelas penduradas; passando dele, quem chega fica só a perguntar.
  - A recarga por aviso é a mesma recarga de sempre (`load()`): com um editor
    aberto o desenho espera, como já esperava. E o painel "Hoje" não se refaz
    com um aviso de `state` que não seja do histórico.
  - A autoria por célula responde a UMA célula de cada vez e só enquanto o
    OneDrive tiver a versão (ele guarda um número limitado). Duas alterações à
    mesma célula na mesma gravação continuam a ser uma só, e uma célula que
    mudou outra vez desde então dá "nenhuma das gravações tem este valor".
  - O arquivo do histórico só é lido para o período pedido e nunca é apagado:
    numa folha com muito movimento cresce ~1 MB por mês. Não há botão para o
    limpar (é o registo, e apagá-lo é o contrário do que isto serve).
  - As ocorrências guardam-se por dia e ficam as 60 últimas: um item que se
    repete de hora a hora (não há repetição dessas) ou dois fechos no mesmo dia
    contam uma vez só.
  - O registo em lote propõe o dia às 9h (o registo do cronómetro é por dia, não
    por hora) e um dia parcialmente registado à mão no Jira pode voltar a ser
    oferecido: a app só sabe o total que ELA registou.
  - Os filtros publicados não têm versão nem "quem já os trouxe": publicar outra
    vez substitui o meu ficheiro, e quem já importou fica com a cópia que
    trouxe.
  - O bloqueio é uma marca nossa e não uma regra: nada impede fechar uma tarefa
    bloqueada, e apagar o que bloqueia deixa a marca a apontar a nada (o chip
    fica lá, sem salto).
  - O `metrics.js` a pedido não poupa nada a quem abre no Início — o separador
    Início É a vista das Métricas. Poupa a quem abre num livro.
  - Os testes da interface só chegam às funções puras: o que precisa de um DOM a
    sério (escrever na caixa, arrastar, os menus ao toque) continua a ser
    Playwright à mão.
  - O trinco entre processos é por ficheiro e espera 5 segundos: passado esse
    tempo grava sem ele (mais vale gravar do que pendurar o clique), e aí volta
    a ser possível perder uma alteração de outra instância.

### [DONE] Cópias do estado, repetição pelo calendário, escolha linha a linha, desfazer um envio, histórico pela identidade da linha, esperas da equipa, assistente com ferramentas e app no telemóvel
- **Source:** ronda de melhorias pedida pelo Carlos Andrade (2026-08-19), a partir das
  próprias notas de "known limits" deste ficheiro.
- **What landed:**
  - `cswaios/statefile.py` (novo): gravação atómica (temporário + `os.replace`,
    com paciência para a partilha do Windows), uma cópia por dia em `backups\`
    ao lado de cada ficheiro, `list_backups`/`restore_backup`/`backup_now` e um
    trinco por ficheiro. O `store.py`, o `todos.py`, o `notepad.py` e o
    `history.py` passam todos por lá; `GET`/`POST /api/backups` (o POST só do
    próprio PC) e o cartão *Cópias do teu trabalho* em `static/js/backup.js`.
  - `Handler.STATE_POST_FILE` em `cswaios/server.py`: cada pedido que mexe num
    ficheiro de estado corre com o trinco DESSE ficheiro preso — o ciclo
    ler-mexer-gravar deixa de se cruzar. `_com_lock` em `cswaios/excel.py`: uma
    escrita COM de cada vez.
  - `catch_up_repeats()` e `restart_todo_timer()` em `cswaios/todos.py`: a
    repetição anda com o calendário (com as ocorrências falhadas contadas em
    `missed`, mostradas no chip 📅) e recomeçar o cronómetro já não apaga o
    registo diário.
  - `bulkOff`/`bulkChosen()` em `static/js/tasks.js`: caixas de marcar linha a
    linha na janela do estado em massa, com *Marcar/Desmarcar todas* e o aviso
    do teto antes de aplicar.
  - `batch` nos eventos do histórico (`mark_app_write`, `push_overrides`),
    `batch_events()`, `POST /api/history/undo` e o botão ↺N no histórico da
    tarefa e nas alterações do dia: desfaz-se o Push inteiro.
  - `_ident()`/`_snapshot_rows()`/`_same_row_renamed()` em `cswaios/history.py`:
    o retrato passa a ser pela identidade da linha (Function/TC + To Do) e não
    pelo número dela.
  - `todayBooksState()`/`todayBooksNote()` em `static/js/today.js` + o
    `refreshTodayIfOpen()` a cada livro lido.
  - `cswaios/team.py` (novo) + `GET`/`POST /api/team/config` +
    `static/js/team.js`: as esperas publicadas na pasta partilhada, um ficheiro
    por pessoa, e lidas por todas as instalações.
  - `LLM_TOOLS` e o ciclo de ferramentas em `cswaios/chat.py`: `search`,
    `list_rows`, `list_items` e `counts` sobre o retrato que o cliente mandou.
  - `static/manifest.webmanifest`, `static/js/sw.js` (servido em `/sw.js`),
    ícones PNG e as marcas `apple-*` em `index.html`.
  - `tests/__init__.py` + `tests/test_statefile.py`, `tests/test_repeat_timer.py`,
    `tests/test_llm_tools.py`, `tests/test_team.py` e
    `.github/workflows/tests.yml`: `python -m unittest discover -s tests -t .`
    passa a correr a suite inteira (156 testes, offline) e o CI corre-a no
    Windows.
- **Design:**
  - **A identidade da linha** é a mesma que o resto da app já usa (a chave dos
    overrides, das notas e das esperas). Uma linha renomeada é reconhecida por
    estar na mesma posição com o resto igual, e um retrato antigo (por número de
    linha) é migrado na primeira leitura — ninguém volta a "≥ N dias" por ter
    atualizado a app.
  - **A repetição não cria cópias em atraso**: um item que se repete é UM
    trabalho que volta. A data sobe até à ocorrência de agora e o que passou
    fica contado, em vez de nascerem três itens iguais.
  - **Recomeçar o cronómetro** é sobre o total DESTE item; a folha de horas é
    sobre os dias, e aquelas horas foram trabalhadas.
  - **A escolha linha a linha vive na janela** e não na tabela: as tarefas
    mostram-se de três maneiras (lista, caixas, vista completa) e uma caixa de
    marcar em cada uma seria a mesma coisa desenhada três vezes.
  - **Desfazer um envio** não é um caminho novo até ao Excel: repõe o valor de
    antes como alterações locais (✎), com a base a ser o que o Push deixou na
    folha — se alguém mexeu na célula entretanto, o Push desiste dela.
  - **Publicar as esperas é opt-in** e só as esperas: a lista Por fazer e as
    notas nunca saem da máquina. Um ficheiro por pessoa (nunca um comum) e uma
    chave sem o livro, porque o caminho do ficheiro é diferente em cada máquina.
  - **O motor LLM continua a não escrever** e a não ler a folha: as ferramentas
    leem o retrato que o cliente mandou, e as ordens continuam no motor local
    com o Confirmar de sempre.
- **Released in:** v154.
- **Known limits (worth revisiting):**
  - As cópias são uma por dia e por ficheiro (14 por ficheiro): duas coisas
    apagadas no mesmo dia repõem-se ao mesmo ponto — o do princípio do dia.
  - Repor é ficheiro a ficheiro e pede um F5: a app não recarrega sozinha o que
    estava em memória noutras janelas.
  - As ocorrências falhadas (`missed`) contam-se, mas não se sabe QUAIS foram —
    não há registo por dia de um item que se repete.
  - O desfazer de um envio precisa dos eventos desse Push no histórico: passados
    os 5000 eventos guardados (ou reposto um `history.json` antigo), o lote
    desaparece e volta a ser célula a célula.
  - A identidade da linha é o Function/TC + To Do: duas linhas com os dois
    campos exatamente iguais são a mesma linha para o histórico (era o que já
    acontecia nos overrides e nas notas). E uma leitura em que MUITAS linhas
    mudam de nome ao mesmo tempo não se distingue de linhas novas: semeia-se,
    sem inventar história.
  - As esperas da equipa chegam pela pasta partilhada, por isso são de quando
    cada pessoa abriu a app pela última vez (e desaparecem depois de 21 dias sem
    ela abrir). Quem tem a partilha só de leitura publica; ler funciona sempre.
  - O service worker não se registra pelo endereço da rede local (http não é
    contexto seguro): no telemóvel o que vale é o ícone e a janela sem barra,
    não a app a abrir sem servidor.
  - O trinco é por ficheiro e por PROCESSO: duas instâncias da app na mesma
    pasta (DEV e estável) continuam a poder cruzar-se, agora sem partirem o
    ficheiro (a gravação é atómica) mas podendo perder uma alteração.

### [DONE] Data-limite, repetição, folha de horas, "Hoje", estado em massa, desfazer, "à espera de", Jira a dois tempos, avisos fora da app, filtros partilháveis e motor LLM
- **Source:** ronda de sugestões funcionais pedida pelo Carlos Andrade (2026-08-18).
- **What landed:**
  - `cswaios/todos.py`: `due`/`repeat`/`segments` nos itens (`normalize_due`,
    `normalize_repeat`, `merge_segments`, `split_by_day`, `add_timer_segments`,
    `next_due`, `spawn_repeat`, `timer_ms_in_period`), ações `set_due`/`set_repeat`
    no `/api/todo`, chip 📅 + editor e limite WIP por coluna em `static/js/todo.js`.
  - `cswaios/report.py`: secção da folha de horas + os dias sem registo no Jira;
    cartão *Folha de horas* e menu *Exportar* em `static/js/metrics.js`.
  - `cswaios/export.py` (novo) + `POST /api/export`: CSV das alterações e da folha
    de horas, markdown do relatório, na pasta `exports`.
  - `static/js/today.js` + `static/css/today.css` (novos): painel "Hoje", uma vez
    por dia e depois a pedido.
  - `POST /api/update/bulk` + `queue_column_override()` (o miolo do `/api/update`,
    agora partilhado) e a janela do estado em massa em `static/js/tasks.js`.
  - `undoHistoryChange()` em `static/js/history.js`: ↺ por linha do histórico.
  - `waiting.json` (`load_waiting`/`save_waiting`), `POST /api/waiting`,
    `meta.waiting` em `read_sheet` e `static/js/waiting.js` (novo) com o chip, o
    campo na caixa e o botão-resumo **À espera**.
  - `graph_versions()` em `cswaios/graph.py` + `GET /api/history/authors`: o ☁ do
    histórico passa a dizer quem gravou.
  - `cswaios/jira.py`: `issue_status`, `issue_transitions`, `transition_issue`,
    `list_projects`, `create_issue`; `GET /api/jira/issue/<k>/state`,
    `GET /api/jira/projects`, `POST /api/jira/issue/<k>/transition`,
    `POST /api/jira/create`; chip de estado e janela de criar em `static/js/jira.js`.
  - `cswaios/notify.py` (novo) + `GET`/`POST /api/notify/config` e `POST /api/notify`;
    notificação do sistema e webhook em `static/js/notify.js`, cartão *Avisos* nas
    Definições.
  - Copiar/colar de filtros personalizados em `static/js/customfilters.js`.
  - `_llm_reply()` implementado em `cswaios/chat.py` com o SDK oficial da
    Anthropic (import dentro da função; `anthropic` é opcional em
    `requirements.txt`).
- **Design:**
  - O tempo dos cronómetros passa a ter um registo **por dia** (`segments`); o
    `elapsed_ms` continua a ser o total. Só o registo diário sabe dizer a que dia
    pertence o tempo — os itens anteriores a esta versão não o têm, e isso é dito
    à parte em vez de o tempo ser atirado para um dia qualquer.
  - O estado em massa e o desfazer não são caminhos novos até ao Excel: fazem
    exatamente o que o editor de uma célula faz (uma alteração local, ✎, com a
    base a valer para o Push), só a muitas linhas ou ao contrário.
  - "À espera de" é uma marca NOSSA sobre a linha (não uma coluna da folha), com
    a mesma chave dos overrides/notas, e por isso é igual em todos os
    dispositivos.
  - O motor LLM nunca escreve: as ordens continuam no motor local, que devolve a
    `action` e a confirmação. Qualquer falha do modelo cai no motor local com
    aviso.
  - Os avisos para fora são opt-in e o webhook só aceita `https` dos domínios do
    Teams/Slack — um endereço colado por engano não vira uma fuga de informação.
- **Released in:** v132.
- **Known limits (worth revisiting):**
  - A repetição de um item nasce quando ele é dado como feito, não à hora certa:
    um item diário que não se fecha durante três dias dá UM seguinte, não três.
  - O `restart_timer` apaga o registo diário do item junto com o total (é a
    repartição do mesmo tempo) — o tempo já registado no Jira a partir desse item
    não é afetado, mas a folha de horas perde aqueles dias.
  - "Quem gravou" é por GRAVAÇÃO, não por célula: duas pessoas a gravar no mesmo
    minuto (ou uma a gravar o trabalho de outra em coautoria) dão o mesmo nome. E
    só existe na fonte web — um ficheiro local não tem versões.
  - O estado em massa usa a vista como seleção: numa vista mal filtrada aplica-se
    a muitas linhas de uma vez (com pré-visualização e um teto de 200). Não há
    seleção linha a linha.
  - O ↺ do histórico repõe o valor de UMA célula de cada vez, e só das colunas
    que a app escreve; nas outras o histórico continua a ser leitura.
  - O painel "Hoje" abre-se antes de os livros estarem lidos e preenche-se quando
    eles chegam; se a leitura falhar, as secções das tarefas ficam vazias.
  - O motor LLM manda no pedido as primeiras 120 linhas e 60 itens de cada lista:
    numa folha grande responde sobre essa parte. E não tem ferramentas — não pede
    mais contexto do que o que lhe foi dado.
  - Os avisos do sistema só saem com a janela em segundo plano e com a app aberta;
    o webhook é que chega com a app fechada, e só a partir do computador onde ela
    corre.

### [DONE] Assistant (💬 / Ctrl+I)
- **What landed:** `cswaios/chat.py` (`answer()`, local intent engine, `POST /api/chat`),
  `static/js/chat.js` + `static/css/chat.css` (docked panel, context builder,
  confirmation of proposed changes), `taskAgeInTab()` in `static/js/history.js`
  (row age for any open workbook, not just the one on screen), plus i18n and a
  help section.
- **Design:** the context travels with the question (the client's own in-memory
  snapshot), so answering never reads Excel/OneDrive; writes come back as
  proposals the client executes through `/api/todo`, `/api/update` and
  `/api/note` after a Confirm.
- **Engine:** `local` (deterministic, the only one implemented) chosen in
  `chat_config.json`; `llm` is a documented seam (`_llm_reply`) that falls back
  to the local engine with a notice while it is not configured.
- **Known limits (worth revisiting):**
  - The local engine understands a defined set of shapes (the `help` intent
    lists them); anything else falls back to searching what is open. Free-form
    phrasing is what the `llm` engine is for.
  - `status_set` on a sheet displayed through a **mapped view** writes the
    tracker column and counts in the Push, but the mapped cell keeps showing the
    sheet value until the Push (that view reads cells by coordinate and writes
    through `/api/cellcat/update`).
  - "Mine" is exact while *Show all* is off (the server already filtered by
    person); with it on, ownership is guessed from the name in the row, with the
    same tolerance for partial names as the rest of the app.
  - The context is capped (4 workbooks, 400 rows each from the client, 800 at
    the server) — a very large sheet answers about its first rows only.
  - ~~The conversation lives in memory: closing the app forgets it.~~ Fixed in
    v127: it is kept in this browser's `localStorage` (`bsp-tracker-chat`, the
    last 60 messages), like the theme or the split size. A proposal that was
    never confirmed comes back marked as expired instead of confirmable — the
    workbook it was about may have been reread (or closed) in the meantime.

### [DONE] Task history, stale tasks, weekly report, metrics, global search, timer → Jira
- **What landed:** `cswaios/history.py` (per-sheet change history, seeded from
  `read_sheet`, app writes tagged by `push_overrides`), `cswaios/report.py`
  (`GET /api/report/week`), `GET /api/history` and `GET /api/history/recent`,
  plus `static/js/history.js`, `metrics.js` and `search.js`.
- **Released in:** v123.
- **Known limits (worth revisiting):**
  - History is keyed by sheet row number, like the notification cards. A row
    inserted or deleted shifts every row below it, so the snapshot is re-seeded
    instead of inventing a burst of changes — ages then restart as `≥` estimates
    (see `_looks_like_row_shift`).
  - App writes are tagged from an in-memory registry with a 1-hour lifetime, so
    a Push whose change only reaches the sheet much later (OneDrive co-authoring
    lag) is recorded as coming from the sheet, not from the app.
  - There is no per-person attribution for changes made outside the app: the
    sheet does not say who edited a cell.
  - "Time counted" in the report is the timers' running total, not just the
    period's — the app has no per-day breakdown of timer time.

### [DONE] Admin welcome/announcement message
- **What landed:** `announcement.json` + `load_announcement()`/`save_announcement()`
  in `cswaios/store.py`, `GET`/`POST /api/announcement` (the POST localhost-only,
  like `/api/graph`), `static/js/announce.js` with the modal and the editor card
  in the Settings page, plus i18n.
- **Design:** the `id` is a hash of the content, computed on the server — editing
  the text gives a new id and the notice shows again to everyone, and each browser
  stores the last id it read in `localStorage` (`bsp-tracker-announce-seen`), so
  reopening the app with the same text does not nag whoever already read it.
- **Reach:** the notice is written to the shared releases folder when it is
  mounted on the machine (`find_releases_dir()`), the same folder that already
  delivers updates and the changelog — so it reaches every install, not only the
  clients of one instance. The shared copy wins over the local one on read; the
  local copy is the fallback (no shared folder, or a notice meant only for the
  LAN clients of that instance).
- **Released in:** v127.
- **Known limits (worth revisiting):**
  - It reaches other installs only when they are opened (there is no push): the
    file is read once per app start and whenever the Settings page opens.
  - Recipients whose share is read-only cannot publish to everyone — their
    notice stays local, for whoever opens their instance.
  - No scheduling and no "who has read it": one live message at a time.

### [DONE] Multiple Excel workbook windows
- **Source:** Carlos Andrade — feedback `20260803_192147_Carlos_Andrade` (v1.3.0, page: Tarefas)
- **Request:** Give the ability to have multiple excel windows open simultaneously.
- **What landed:** `⧉` on each workbook tab (and middle-click) opens the app in a
  second window already on that workbook — `/?wb=<id>`, read into `SOLO_WB`
  (`static/js/state.js`); `openWorkbookWindow()` in `static/js/workbooks.js`, with
  `POST /api/window` (localhost-only) opening a native window when the UI is the
  pywebview window, where `window.open` does nothing.
- **Design:** each window is its own JavaScript context — its own data, filters
  and polling — so nothing had to be duplicated inside the page. The server side
  already keyed its caches per workbook (`_RAW_CACHE`, `_LAST_GOOD` in
  `cswaios/tasks.py`), so two windows on two workbooks never collide.
- **Released in:** v127.
- **Known limits (worth revisiting):**
  - A dedicated window never saves the open-workbook list (`saveWorkbookTabs()`
    returns early when `SOLO_WB` is set): the `localStorage` is shared with the
    main window and saving there would close its tabs. So opening another
    workbook inside a dedicated window works, but only until it is closed —
    including the sheet chosen in its selector.
  - Split screen inside one window still shows a single workbook: the `#excelView`
    panel is one, and it follows the active tab. Two workbooks side by side means
    two windows.
  - Two windows reading the same workbook each poll it on their own (the 20s
    cycle runs per window).