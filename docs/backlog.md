## Backlog

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