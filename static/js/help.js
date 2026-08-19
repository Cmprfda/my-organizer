// My Organizer — janela "Como usar" (?): todo o conhecimento de utilização

// Cada secção tem título e itens em [PT, EN]. Os itens aceitam HTML simples
// (<strong>, <code>) — o conteúdo é fixo, não vem de dados do utilizador.
const HELP = [
    {
        title: ["O que é isto", "What this is"],
        items: [
            ["A app abre livros de Excel (o teu <strong>BSP-G2_Daily_Tracker.xlsx</strong> ou qualquer outro) e mostra as tarefas, as CCRs e a tua lista Por fazer numa página local. O Excel continua a ser a fonte de verdade.",
                "The app opens Excel workbooks (your <strong>BSP-G2_Daily_Tracker.xlsx</strong> or any other one) and shows tasks, CCRs and your personal TODO list in a local page. Excel remains the source of truth."],
            ["A app não abre nenhum livro sozinha: carrega no <strong>+</strong> na barra dos separadores (ou no botão do painel de boas-vindas) e escolhe <strong>Excel do OneDrive</strong> — navega pelas pastas do OneDrive/SharePoint ou procura pelo nome — ou <strong>Excel de um ficheiro local</strong>, que abre a janela do Windows para escolher um .xlsx no disco.",
                "The app never opens a workbook on its own: press <strong>+</strong> in the tab bar (or the button in the welcome panel) and choose <strong>Excel from OneDrive</strong> — browse your OneDrive/SharePoint folders or search by name — or <strong>Excel from a local file</strong>, which opens the Windows dialog to pick an .xlsx on disk."],
            ["Cada livro aberto fica no seu <strong>separador</strong> e podes ter vários ao mesmo tempo — cada um com a sua aba, os seus filtros e as suas alterações por enviar. O <strong>✕</strong> no separador fecha-o: não apaga nada, e reabrir o livro traz tudo de volta.",
                "Every open workbook gets its own <strong>tab</strong> and you can keep several at once — each with its own sheet, filters and pending changes. The <strong>✕</strong> on the tab closes it: nothing is deleted, and reopening the workbook brings everything back."],
            ["O distintivo no canto superior direito mostra de onde vêm os dados: <strong>verde</strong> = ligado ao OneDrive, <strong>vermelho</strong> = pronto a ligar ou sem servidor, <strong>cinzento</strong> = ficheiro local. Clica nele para abrir as Definições.",
                "The badge in the top-right corner shows where data comes from: <strong>green</strong> = connected to OneDrive, <strong>red</strong> = ready to connect or no server, <strong>grey</strong> = local file. Click it to open Settings."],
            ["Podes abrir a app no telemóvel ou noutro PC da mesma rede pelo endereço mostrado por baixo dos botões.",
                "You can open the app on your phone or another PC on the same network using the address shown under the buttons."],
            ["No telemóvel abres livros do OneDrive como aqui: <strong>+</strong> → <strong>Excel do OneDrive</strong>, e navegas pelas pastas na mesma. Quem lê os ficheiros é o computador onde a app corre, com a sessão que já lá está ligada — por isso o telemóvel não precisa de conta nem de login. O que fica de fora é o <strong>Excel de um ficheiro local</strong> (a janela do Windows só abre no PC) e a própria ligação da conta, que se faz nas Definições do PC.",
                "On your phone you open OneDrive workbooks just like here: <strong>+</strong> → <strong>Excel from OneDrive</strong>, and you browse the folders the same way. The reading is done by the computer running the app, with the session already connected there — so the phone needs no account and no sign-in. What it can't do is <strong>Excel from a local file</strong> (the Windows dialog only opens on the PC) and connecting the account itself, which is done in the PC's Settings."],
            ["A versão instalada está sempre visível no canto inferior direito do ecrã.",
                "The installed version is always visible in the bottom-right corner of the screen."],
            ["Clica em qualquer item (tarefa, CCR ou item da lista Por fazer) para o abrir numa <strong>caixa</strong> com tudo o que ele tem, sem cortes. Dentro da caixa podes editar tudo como na lista: estados, OBS, notas, checklists e passos. <strong>Esc</strong> ou ✕ fecham a caixa.",
                "Click any item (task, CCR or TODO entry) to open it in a <strong>box</strong> with everything it holds, nothing truncated. Inside the box you can edit everything just like in the list: statuses, OBS, notes, checklists and steps. <strong>Esc</strong> or ✕ close the box."],
            ["<strong>Botão direito</strong> em qualquer sítio abre um menu para <strong>copiar</strong>: a seleção de texto, a célula, a linha ou o item inteiro (cartão do Kanban, caixa de nota, cartão do Jira) e as <strong>imagens</strong> coladas nas Notas. Nas caixas de texto continua a aparecer o menu normal do Windows.",
                "<strong>Right-click</strong> anywhere opens a menu to <strong>copy</strong>: the selected text, the cell, the row or the whole item (Kanban card, note box, Jira card) and the <strong>images</strong> pasted in Notes. Text fields keep the normal Windows menu."],
            ["<strong>Ctrl+K</strong> abre a <strong>pesquisa em tudo</strong>: escreve o nome de qualquer coisa e salta para lá — linhas de qualquer livro aberto, CCRs, itens Por fazer, notas do quadro (pelo título ou pelo texto das caixas), issues do Jira ligadas e ações da app (\"relatório da semana\", \"métricas\"). <strong>↑</strong>/<strong>↓</strong> escolhem, <strong>Enter</strong> vai, <strong>Esc</strong> fecha. Cada vista continua a ter a sua própria caixa de pesquisa, para filtrar só o que está à frente.",
                "<strong>Ctrl+K</strong> opens <strong>search everything</strong>: type the name of anything and jump to it — rows from any open workbook, CCRs, TODO entries, board notes (by title or by the text inside their boxes), linked Jira issues and app actions (\"week report\", \"metrics\"). <strong>↑</strong>/<strong>↓</strong> move, <strong>Enter</strong> goes there, <strong>Esc</strong> closes. Each view keeps its own search box, for filtering just what is in front of you."],
        ],
    },
    {
        title: ["Hoje", "Today"],
        items: [
            ["O botão <strong>☀</strong> na barra de cima abre o <strong>ponto de situação</strong> num sítio só: o que tem <strong>data-limite</strong> para hoje (e o que já está atrasado), o que vem a caminho nos próximos dias, as tarefas em que a <strong>bola está do teu lado</strong>, as que passaram a <strong>paradas</strong>, o que <strong>mexeram na folha</strong> desde a última vez que aqui estiveste, e o tempo dos cronómetros que ainda não foi para o Jira.",
                "The <strong>☀</strong> button in the top bar opens <strong>where things stand</strong>, all in one place: what is <strong>due</strong> today (and what is already late), what is coming up in the next few days, the tasks where the <strong>ball is on your side</strong>, the ones that turned <strong>stale</strong>, what <strong>changed on the sheet</strong> since you were last here, and the timer time that has not reached Jira yet."],
            ["Abre-se sozinho <strong>uma vez por dia</strong>, na primeira vez que abres a app nesse dia; depois é sempre pelo botão. Fechá-lo é dizer \"já vi\": o \"desde a última vez\" passa a contar a partir dali.",
                "It opens by itself <strong>once a day</strong>, the first time you open the app that day; after that it is the button. Closing it means \"I have read this\": the \"since you were last here\" starts counting from then."],
            ["Cada linha é clicável e salta para onde a coisa vive — o item na lista Por fazer, a linha no livro certo.",
                "Every line is clickable and jumps to where the thing lives — the item in the TODO list, the row in the right workbook."],
        ],
    },
    {
        title: ["Tarefas (Excel)", "Tasks (Excel)"],
        items: [
            ["<strong>Ver tudo</strong> mostra as tarefas de toda a gente; <strong>Vista resumida/completa</strong> troca entre o resumo por TC e todas as colunas da folha.",
                "<strong>Show all</strong> lists everyone's tasks; <strong>Compact/Full view</strong> switches between the per-TC summary and every column of the sheet."],
            ["<strong>Lista</strong> e <strong>Caixas</strong> trocam entre a tabela normal e um mural de cartões, um por tarefa — nas vistas resumida e completa. A escolha fica guardada.",
                "<strong>List</strong> and <strong>Boxes</strong> switch between the normal table and a wall of cards, one per task — in both the compact and the full view. Your choice is remembered."],
            ["Clica nos números do resumo (estado, papel, lado) para filtrar; clica outra vez para limpar o filtro.",
                "Click the summary counters (status, role, side) to filter; click again to clear the filter."],
            ["Na <strong>Pesquisa</strong>, carrega em <strong>Enter</strong> para fixar o texto escrito e continuar a escrever outro termo. O botão <strong>OU/E</strong> ao lado da caixa escolhe se basta um dos termos aparecer (OU) ou se têm de aparecer todos (E). Clica num termo fixado para o remover.",
                "In <strong>Search</strong>, press <strong>Enter</strong> to pin the text you typed and keep typing another term. The <strong>OR/AND</strong> button next to the box decides whether any single term is enough (OR) or all of them must appear (AND). Click a pinned term to remove it."],
            ["Clica num estado para o alterar. A alteração fica <strong>local</strong> (marcada com ✎) e só vai para o Excel quando carregas em <strong>Enviar</strong>. <strong>Atualizar sem enviar</strong> relê os dados sem escrever; <strong>Descartar locais</strong> deita fora as alterações pendentes.",
                "Click a status to change it. The change stays <strong>local</strong> (marked with ✎) and only reaches Excel when you press <strong>Push</strong>. <strong>Refresh without pushing</strong> re-reads the data; <strong>Discard local</strong> throws the pending changes away."],
            ["O botão <strong>✎ Ver alterações</strong>, ao lado do <strong>Enviar</strong>, abre a lista do que está por enviar: linha a linha, o campo alterado, o valor que está na folha e o que o Enviar vai escrever. Aparece nas Tarefas e no Por fazer, sempre que houver alterações locais.",
                "The <strong>✎ View changes</strong> button next to <strong>Push</strong> opens the list of what is waiting: row by row, the changed field, the value currently in the sheet and the value the Push will write. It shows in Tasks and in TODO whenever there are local changes."],
            ["Clica em <strong>Obs:</strong> (ou <strong>+ obs</strong>) para escrever a coluna <strong>OBS</strong> da folha. Tal como os estados, fica local (✎) até carregares em <strong>Enviar</strong>.",
                "Click <strong>Obs:</strong> (or <strong>+ note</strong>) to write the sheet's <strong>OBS</strong> column. Like statuses, it stays local (✎) until you press <strong>Push</strong>."],
            ["Na vista resumida, o <strong>nome do TC/função</strong> e o <strong>o que fazer</strong> também se editam: clica em cima para escrever o novo texto nas colunas <strong>Function/TC</strong> e <strong>To Do</strong> da folha. Fica local (✎) até <strong>Enviar</strong>; quando é enviado, as notas fixadas e os itens da lista <strong>Por fazer</strong> ligados a essa linha passam a apontar para o texto novo.",
                "In the compact view, the <strong>TC/function name</strong> and the <strong>to do</strong> text are editable too: click either to write the new text into the sheet's <strong>Function/TC</strong> and <strong>To Do</strong> columns. It stays local (✎) until <strong>Push</strong>; once pushed, the pinned notes and <strong>TODO</strong> entries linked to that row follow the new text."],
            ["<strong>+ nota</strong> guarda etiquetas, checklists e texto livre por tarefa (só na app, nunca no Excel). <strong>Limpar notas</strong> apaga-as todas.",
                "<strong>+ note</strong> stores tags, checklists and free text per task (app only, never in Excel). <strong>Clear notes</strong> deletes them all."],
            ["A app verifica de poucos em poucos segundos se o livro foi gravado e recarrega sozinha quando isso acontece. <strong>Atualizar</strong> lê tudo de raiz, como se estivesses a abrir o ficheiro pela primeira vez. Se o livro do OneDrive também estiver sincronizado no teu computador, a app lê essa cópia: o que gravas no Excel aparece logo, sem esperar pelo OneDrive. Enquanto a cópia na nuvem estiver diferente da tua, aparece um aviso ℹ por baixo do nome do ficheiro — os teus colegas ainda não veem essas alterações.",
                "The app checks every few seconds whether the workbook was saved and reloads by itself when it was. <strong>Refresh</strong> reads everything from scratch, as if you had just opened the file. If the OneDrive workbook is also synced to your computer, the app reads that copy: whatever you save in Excel shows up immediately, without waiting for OneDrive. While the cloud copy still differs from yours, an ℹ notice appears under the file name — your colleagues cannot see those changes yet."],
            ["Quando alguém mexe no livro numa tarefa <strong>tua</strong> (és autor, reviewer ou estás mencionado na linha), aparece um <strong>aviso do lado direito</strong> a dizer qual é a tarefa e o que mudou (ex.: <code>Status TC: In progress → Done</code>). Os avisos desaparecem sozinhos em poucos segundos, ou fecha-os com o ✕. As tuas alterações locais (✎) nunca geram avisos, e mudanças em tarefas de outras pessoas também não — mesmo com o <strong>Ver tudo</strong> ligado.",
                "When someone changes one of <strong>your</strong> tasks in the workbook (you are its author, reviewer or are mentioned in the row), a <strong>notification appears on the right</strong> naming the task and what changed (e.g. <code>Status TC: In progress → Done</code>). Notifications fade away after a few seconds, or dismiss them with ✕. Your own local changes (✎) never raise notifications, and neither do changes to other people's tasks — even with <strong>Show all</strong> on."],
            ["Os <strong>filtros personalizados</strong> que montares para uma aba podem <strong>passar-se a um colega</strong>: na janela dos filtros, <strong>Copiar</strong> põe o conjunto na área de transferência (pronto a colar num chat) e <strong>Colar</strong> acrescenta aos teus os que alguém te mandou — as listas predefinidas que eles usem vão à boleia. Nunca substitui os teus, e os repetidos ficam de fora; falta só carregar em <strong>Gravar</strong>.",
                "The <strong>custom filters</strong> you build for a sheet can be <strong>passed to a colleague</strong>: in the filters window, <strong>Copy</strong> puts the set on the clipboard (ready to paste into a chat) and <strong>Paste</strong> adds someone else's to yours — any predefined lists they use come along. It never replaces your own, and duplicates are left out; all that is left is to hit <strong>Save</strong>."],
            ["<strong>Estado em massa</strong> (na barra) muda o mesmo estado em <strong>todas as tarefas que estão à vista</strong> — os filtros que tens ligados são a seleção. A janela diz quantas são e mostra as primeiras antes de aplicares. Como qualquer alteração de estado, fica local (✎) até ao <strong>Enviar</strong>, por isso um clique a mais desfaz-se com o <strong>Descartar locais</strong>.",
                "<strong>Bulk status</strong> (in the toolbar) changes the same status across <strong>every task in view</strong> — your active filters are the selection. The dialog says how many and shows the first few before you apply. Like any status change it stays local (✎) until <strong>Push</strong>, so one click too many is undone with <strong>Discard local</strong>."],
            ["No <strong>Histórico</strong> de uma tarefa, o <strong>↺</strong> de cada linha <strong>volta ao valor de antes</strong> dessa célula. É uma alteração local (✎) como as outras, e só aparece nas colunas que a app sabe escrever e quando o valor em vigor já não é o antigo.",
                "In a task's <strong>History</strong>, the <strong>↺</strong> on each line <strong>puts the old value back</strong> in that cell. It is a local change (✎) like any other, and only shows on the columns the app can write and when the current value is not already the old one."],
            ["<strong>À espera de</strong> (na caixa de detalhe) marca <strong>quem está a segurar</strong> a tarefa e até quando é razoável esperar. Com prazo, ela deixa de contar como <strong>parada</strong> até lá — passado o prazo (ou sem prazo nenhum) aparece no botão <strong>À espera</strong>, que é a lista do que há a cobrar a alguém. O chip <strong>⏸</strong> com o nome e o \"há quantos dias\" fica ao lado do nome da tarefa.",
                "<strong>Waiting on</strong> (in the detail box) marks <strong>who is holding</strong> the task and how long it is reasonable to wait. With a date it stops counting as <strong>stale</strong> until then — past the date (or with no date at all) it shows up under the <strong>Chasing</strong> button, the list of what there is to chase. The <strong>⏸</strong> chip with the name and the \"how many days\" sits next to the task name."],
            ["O <strong>☁</strong> do histórico passa a dizer <strong>quem gravou</strong> o livro: a folha não guarda o autor de uma célula, mas o OneDrive guarda as versões do ficheiro e quem gravou cada uma. É por gravação e não por célula — duas pessoas a gravar no mesmo minuto dão o mesmo nome — e só existe nos livros do OneDrive.",
                "The <strong>☁</strong> in history now says <strong>who saved</strong> the workbook: the sheet keeps no author per cell, but OneDrive keeps the file versions and who saved each one. It is per save and not per cell — two people saving in the same minute give the same name — and it only exists for OneDrive workbooks."],
            ["<strong>Obter do SharePoint</strong> abre o download do ficheiro no teu browser, quando estás a usar o ficheiro local.",
                "<strong>Fetch from SharePoint</strong> opens the file download in your browser when you are using the local file."],
            ["Cada leitura da folha é comparada com a anterior, por isso a app sabe <strong>o que aconteceu a cada tarefa</strong>: abre a caixa de detalhe de uma linha e no fim aparece o <strong>Histórico</strong> — data, coluna e <code>valor antigo → valor novo</code>, com <strong>✎</strong> quando a alteração saiu desta app (Enviar) e <strong>☁</strong> quando alguém mexeu no livro. O Excel não guarda nada disto; a app só conhece o que mudou desde que esta versão começou a acompanhar a folha.",
                "Each read of the sheet is compared with the previous one, so the app knows <strong>what happened to each task</strong>: open a row's detail box and the <strong>History</strong> field appears at the end — date, column and <code>old value → new value</code>, with <strong>✎</strong> when the change came from this app (Push) and <strong>☁</strong> when someone edited the workbook. Excel keeps none of this; the app only knows what changed since this version started tracking the sheet."],
            ["Uma tarefa <strong>por fechar</strong> que não muda há muitos dias ganha uma etiqueta com a idade ao lado do nome (<strong>⏳ 7 dias</strong>) e aparece um botão <strong>Paradas</strong> no resumo, que filtra só essas. Os dias a partir dos quais uma tarefa conta como parada escolhem-se nas <strong>Definições</strong>. Uma idade escrita com <strong>≥</strong> quer dizer \"pelo menos isto\": é uma tarefa que nunca foi vista a mudar, por isso a idade verdadeira pode ser maior.",
                "An <strong>unfinished</strong> task that has not changed for many days gets an age tag next to its name (<strong>⏳ 7 days</strong>) and a <strong>Stale</strong> button appears in the summary, filtering just those. The number of days after which a task counts as stale is set in <strong>Settings</strong>. An age written with <strong>≥</strong> means \"at least this much\": the task has never been seen changing, so the real age may be greater."],
            ["Uma linha com uma <strong>nota do quadro</strong> ligada a ela mostra um <strong>📌</strong> ao lado do nome — clica para abrir a nota. A ligação faz-se do lado das Notas (<em>Ligar a uma tarefa</em>) e agora vê-se dos dois lados.",
                "A row with a <strong>board note</strong> linked to it shows a <strong>📌</strong> next to its name — click it to open the note. The link is made on the Notes side (<em>Link to a task</em>) and is now visible from both sides."],
        ],
    },
    {
        title: ["CCRs", "CCRs"],
        items: [
            [() => t("ccr_hint"), () => t("ccr_hint")],
        ],
    },
    {
        title: ["Por fazer", "TODO list"],
        items: [
            [() => t("todo_hint"), () => t("todo_hint")],
            ["Cada tarefa tem uma <strong>prioridade</strong> (Baixa, Normal, Alta, Urgente) no badge ao lado do estado: clica para subir e usa o botão direito para descer. Mudar a prioridade <strong>arruma logo a lista</strong>, da mais importante para a menos importante (dentro da mesma prioridade fica a ordem em que as puseste). As tarefas que já tinhas ficam em <strong>Normal</strong>, que é de propósito sem cor — só o que foge ao normal salta à vista.",
                "Every task has a <strong>priority</strong> (Low, Normal, High, Urgent) on the badge next to its status: click to raise it and right-click to lower it. Changing the priority <strong>reorders the list right away</strong>, from the most important to the least (within the same priority the order you set is kept). Tasks you already had stay on <strong>Normal</strong>, which is deliberately colourless — only what differs from normal stands out."],
            ["No modo <strong>Kanban</strong>, arrasta os cartões entre colunas — podes largar em qualquer ponto da coluna, incluindo o título e o espaço vazio. O cronómetro conta o tempo em <strong>Em curso</strong>.",
                "In <strong>Kanban</strong> mode, drag the cards between columns — you can drop anywhere in the column, including its title and empty space. The timer counts the time spent <strong>In progress</strong>."],
            ["<strong>O quadro é teu:</strong> o <strong>✕</strong> no título de uma coluna esconde-a e o <strong>+</strong> no fim do quadro cria uma coluna nova com o nome que quiseres (ex.: \"À espera\"). O botão <strong>⚙ Colunas</strong> abre o painel onde ligas/desligas cada coluna, mudas a ordem (↑ ↓) e mudas o nome (✎) ou apagas (✕) as que criaste. Esconder uma coluna nunca perde cartões: os que lá estiverem aparecem na coluna visível mais próxima, com a borda tracejada, e voltam ao lugar quando a mostrares outra vez; apagar uma coluna passa os cartões dela para a coluna ao lado. As colunas escolhidas ficam guardadas neste computador.",
                "<strong>The board is yours:</strong> the <strong>✕</strong> on a column title hides it and the <strong>+</strong> at the end of the board creates a new column with any name you like (e.g. \"Waiting\"). The <strong>⚙ Columns</strong> button opens the panel where you switch each column on/off, change the order (↑ ↓) and rename (✎) or delete (✕) the ones you created. Hiding a column never loses cards: the ones inside it show up in the nearest visible column with a dashed border and go back once you show it again; deleting a column moves its cards to the column next to it. The columns you pick are remembered on this computer."],
            ["<strong>Do cronómetro para o Jira:</strong> num item com uma issue ligada, o botão do esforço mostra o tempo do cronómetro que <strong>ainda não foi registado</strong> (ex.: <strong>⏱ 1h 20m</strong>) e abre a janela do registo já com esse tempo escrito, com a data de início recuada outro tanto. Podes mudar o tempo antes de registar: se registares menos do que está proposto, o resto continua à espera em vez de se dar tudo por registado. Quando arrastas um cartão para <strong>fora de Em curso</strong>, o cronómetro para e aparece um aviso a perguntar se queres registar esse tempo — clica nele e a janela abre preenchida.",
                "<strong>From the timer to Jira:</strong> on an item with a linked issue, the effort button shows the timer time that has <strong>not been logged yet</strong> (e.g. <strong>⏱ 1h 20m</strong>) and opens the logging dialog with that time already filled in, with the start time moved back by the same amount. You can change the time before logging: if you log less than what is offered, the rest stays pending instead of being written off. When you drag a card <strong>out of In progress</strong>, the timer stops and a prompt asks whether you want to log that time — click it and the dialog opens pre-filled."],
            ["O chip <strong>📅</strong> de cada item põe (e muda) a <strong>data-limite</strong>: fica vermelho quando passa e escreve <strong>Hoje</strong>/<strong>Amanhã</strong> quando é o caso. No mesmo editor escolhe-se a <strong>repetição</strong> — todos os dias, dias úteis, semanal, de 2 em 2 semanas, mensal. Dar o item como feito faz nascer logo o seguinte, com a data certa, sem tempo contado e com a checklist outra vez por marcar; o item fechado fica onde está, como registo do que se fez. O <strong>↻</strong> ao lado da data é a pista de que o item se repete.",
                "The <strong>📅</strong> chip on each item sets (and changes) the <strong>due date</strong>: it turns red once it passes and reads <strong>Today</strong>/<strong>Tomorrow</strong> when that applies. The same editor picks the <strong>repeat</strong> — daily, weekdays, weekly, fortnightly, monthly. Marking the item done spawns the next one right away, with the right date, no time counted and the checklist unticked again; the closed item stays where it is, as the record of what was done. The <strong>↻</strong> next to the date is the hint that the item repeats."],
            ["No painel <strong>⚙ Colunas</strong> do quadro podes escrever um <strong>limite de cartões</strong> por coluna. O cabeçalho passa a mostrar <strong>3/2</strong> e a coluna ganha um risco vermelho quando leva mais do que devia. É um aviso, nunca uma tranca: o cartão larga-se sempre onde quiseres.",
                "In the board's <strong>⚙ Columns</strong> panel you can set a <strong>card limit</strong> per column. The header then shows <strong>3/2</strong> and the column gets a red rule when it holds more than it should. A warning, never a lock: you can always drop the card where you want."],
            ["<strong>＋</strong> ao lado do campo da issue <strong>cria uma issue no Jira</strong> a partir do item: escolhes o projeto e o tipo, e ela nasce já ligada — o registo de esforço do cronómetro funciona daí em diante. Com uma issue ligada, o chip ao lado da chave vai buscar <strong>em que pé ela está</strong> e, clicando outra vez, oferece os passos que o fluxo do projeto permite, para a mover sem sair da app.",
                "<strong>＋</strong> next to the issue field <strong>creates a Jira issue</strong> from the item: you pick the project and the type, and it is created already linked — logging timer effort works from then on. With an issue linked, the chip next to the key fetches <strong>where it stands</strong> and, clicked again, offers the steps the project's workflow allows, to move it without leaving the app."],
        ],
    },
    {
        title: ["Notas", "Notes"],
        items: [
            [() => t("note_hint"), () => t("note_hint")],
            ["<strong>Selecionar várias caixas:</strong> com a ferramenta <strong>↖</strong>, arrasta o rato em volta delas — a área apanha caixas, traços, formas e ligações. Se a área não apanhar nada, é ali que nasce uma caixa nova (como antes). <strong>Ctrl</strong> (ou <strong>Shift</strong>) + clique numa caixa junta-a ou tira-a da seleção, e Ctrl/Shift enquanto arrastas junta a área ao que já estava escolhido.",
                "<strong>Selecting several boxes:</strong> with the <strong>↖</strong> tool, drag the mouse around them — the area picks up boxes, strokes, shapes and links. If the area picks up nothing, that is where a new box is created (as before). <strong>Ctrl</strong> (or <strong>Shift</strong>) + click on a box adds or removes it from the selection, and holding Ctrl/Shift while dragging adds the area to what was already selected."],
            ["<strong>Delete</strong> apaga tudo o que estiver selecionado de uma vez. <strong>Ctrl+C</strong> copia as caixas selecionadas e <strong>Ctrl+V</strong> cola-as um pouco ao lado (o printscreen de uma caixa copiada fica com uma cópia própria, por isso apagar uma nunca estraga a outra). Dentro do texto de uma caixa o Ctrl+C/Ctrl+V continua a copiar e colar texto.",
                "<strong>Delete</strong> removes everything selected at once. <strong>Ctrl+C</strong> copies the selected boxes and <strong>Ctrl+V</strong> pastes them slightly offset (a copied box's screenshot gets its own copy, so deleting one never breaks the other). Inside a box's text, Ctrl+C/Ctrl+V still copy and paste text."],
            ["<strong>↺ (Ctrl+Z)</strong> reverte a última alteração do quadro: caixas criadas, movidas, escritas ou apagadas, desenhos, ligações e grupos. O histórico guarda as últimas 20 alterações de cada nota e só existe enquanto a página estiver aberta — ao recarregar (F5) começa de novo.",
                "<strong>↺ (Ctrl+Z)</strong> reverts the last change to the board: boxes created, moved, typed in or deleted, drawings, links and groups. The history keeps the last 20 changes per note and only lives while the page is open — reloading (F5) starts it over."],
            ["<strong>↻ (Ctrl+Shift+Z</strong> ou <strong>Ctrl+Y)</strong> volta a pôr o que o ↺ tinha revertido, passo a passo. Assim que fizeres uma alteração nova no quadro, o caminho de volta desaparece — é a partir daí que o histórico segue.",
                "<strong>↻ (Ctrl+Shift+Z</strong> or <strong>Ctrl+Y)</strong> puts back what ↺ reverted, one step at a time. As soon as you make a new change to the board, the way forward is dropped — the history carries on from there."],
            ["<strong>🗑</strong> limpa o quadro todo de uma vez (pergunta primeiro) e também se reverte com ↺. Atenção: os printscreens colados nesse quadro são apagados do computador e não voltam com o ↺.",
                "<strong>🗑</strong> clears the whole board at once (it asks first) and can also be reverted with ↺. Careful: screenshots pasted on that board are deleted from the computer and do not come back with ↺."],
            ["<strong>Tabelas:</strong> o <strong>botão direito</strong> numa célula abre o menu da grelha — <strong>adicionar/apagar linha</strong> e <strong>adicionar/apagar coluna</strong>, no sítio onde clicaste. No cabeçalho, \"adicionar linha abaixo\" cria a primeira linha de dados; o cabeçalho e a última coluna não se apagam. A coluna nova nasce com o nome escolhido, pronto a escrever por cima. O <strong>Tab</strong> continua a mudar de célula e o <strong>Enter</strong> na última linha continua a acrescentar linhas. A tabela ocupa a <strong>largura da caixa</strong> e a letra cresce com ela: para a ler maior, arrasta o canto da caixa — não é preciso dar zoom ao quadro todo.",
                "<strong>Tables:</strong> <strong>right-click</strong> a cell to open the grid menu — <strong>insert/delete row</strong> and <strong>insert/delete column</strong>, right where you clicked. On the header, \"insert row below\" creates the first data row; the header and the last column cannot be deleted. A new column comes with its name selected, ready to type over. <strong>Tab</strong> still moves between cells and <strong>Enter</strong> on the last row still adds rows. The table takes the <strong>width of the box</strong> and its type grows with it: to read it bigger, drag the box's corner — no need to zoom the whole board."],
            ["O botão da cor (o círculo na barra da caixa e o da barra de ferramentas) abre um pequeno painel com todas as cores: escolhes a que queres em vez de ir clicando até chegar lá. <strong>Esc</strong> ou um clique fora fecham o painel.",
                "The colour button (the circle on a box's bar and the one on the toolbar) opens a small panel with every colour: you pick the one you want instead of clicking through them. <strong>Esc</strong> or a click outside closes the panel."],
            ["A lista ao lado do caminho da nota mostra a <strong>pasta</strong> onde ela está e muda-a diretamente; <strong>+ Nova pasta…</strong> cria uma pasta (dentro da atual) e leva a nota para lá. O caminho escrito continua a funcionar para mudar o nome.",
                "The dropdown next to the note's path shows the <strong>folder</strong> it lives in and changes it directly; <strong>+ New folder…</strong> creates a folder (inside the current one) and moves the note into it. Typing the path still works for renaming."],
            ["As notas ficam guardadas no teu computador, tal como as CCRs e a lista Por fazer. O ✕ ao lado de cada nota na lista da esquerda apaga-a sem teres de a abrir primeiro. Apagar uma pasta vazia (ou com só subpastas vazias) sobe o conteúdo um nível; se tiver notas ou subpastas com notas, a app avisa quantas e deixa escolher entre apagar tudo de vez ou só a pasta (o conteúdo sobe um nível).",
                "Notes are stored on your computer, just like CCRs and the TODO list. The ✕ next to each note in the left-hand list deletes it without opening it first. Deleting an empty folder (or one with only empty subfolders) moves its contents up one level; if it holds notes or subfolders with notes, the app warns how many and lets you choose between deleting everything at once or just the folder (its contents move up a level)."],
            ["Arrasta a borda entre a coluna da esquerda e o quadro para redimensionar a lista de notas. Ligações entre caixas desenham-se agora da borda de uma à borda da outra (não do centro) e acompanham-nas em tempo real enquanto arrastas; mover um grupo move também os traços e formas desenhados dentro dele.",
                "Drag the border between the left column and the board to resize the note list. Links between boxes now draw from one box's border to the other's (not their centres) and follow them live while you drag; moving a group also moves the strokes and shapes drawn inside it."],
        ],
    },
    {
        title: ["Código", "Code"],
        items: [
            ["O <strong>+</strong> da barra dos separadores (o mesmo que abre os livros de Excel) tem a opção <strong>Pasta de código</strong>: escolhes uma pasta do teu computador — os teus scripts, um repositório — e ela ganha um separador próprio, como um livro. Lá dentro está a <strong>árvore</strong> à esquerda e o <strong>ficheiro</strong> à direita, com números de linha e as cores da linguagem. A app <strong>só lê</strong>: não grava nada por cima dos teus ficheiros nem cria nada dentro da pasta.",
                "The <strong>+</strong> in the tab bar (the same one that opens Excel workbooks) has a <strong>Code folder</strong> option: you pick a folder from your computer — your scripts, a repository — and it gets a tab of its own, just like a workbook. Inside it the <strong>tree</strong> is on the left and the <strong>file</strong> on the right, with line numbers and the language's colours. The app <strong>only reads</strong>: it never writes over your files nor creates anything inside the folder."],
            ["Podes ter várias pastas abertas ao mesmo tempo, cada uma no seu separador, e cada separador guarda onde estavas: a árvore aberta, o ficheiro à frente e a procura. O <strong>⧉</strong> abre a pasta noutra janela (para ler duas ao mesmo tempo) e o <strong>✕</strong> fecha a pasta na app — não apaga nada no disco. Os separadores arrastam-se para trocar de ordem, como os dos livros.",
                "You can keep several folders open at once, each in its own tab, and each tab remembers where you were: the open tree, the file in front and the search. <strong>⧉</strong> opens the folder in another window (to read two at a time) and <strong>✕</strong> closes the folder in the app — it deletes nothing from disk. Tabs can be dragged to reorder, like the workbook ones."],
            ["A caixa <strong>Procurar ficheiro…</strong> percorre a pasta toda pelo nome (a partir de duas letras) e mostra os caminhos onde ele aparece — mais rápido do que abrir ramo a ramo. Pastas como <code>.git</code>, <code>node_modules</code> ou <code>__pycache__</code> ficam à vista mas não se abrem nem entram na procura.",
                "The <strong>Find a file…</strong> box walks the whole folder by name (from two letters up) and lists the paths where it shows up — faster than opening branch by branch. Folders like <code>.git</code>, <code>node_modules</code> or <code>__pycache__</code> stay visible but do not open and are left out of the search."],
            ["<strong>Copiar</strong> leva o ficheiro inteiro para a área de transferência e <strong>Atualizar</strong> vai buscá-lo outra vez ao disco (útil depois de o editares no teu editor). Um ficheiro binário diz que é binário em vez de mostrar lixo, e um ficheiro muito grande abre-se só até ao princípio, com aviso.",
                "<strong>Copy</strong> takes the whole file to the clipboard and <strong>Update</strong> fetches it from disk again (handy after editing it in your own editor). A binary file says it is binary instead of showing garbage, and a very large file opens only up to a point, with a warning."],
            ["Os ficheiros estão no computador onde a app corre: <strong>pela rede local não se leem</strong>, por isso quem abre a app pelo telemóvel ou por outro PC não vê a opção <strong>Pasta de código</strong> nem os separadores das pastas. É a mesma regra do diálogo para escolher um livro de Excel local.",
                "The files live on the computer running the app: <strong>over the local network they are not read</strong>, so whoever opens the app from a phone or another PC sees neither the <strong>Code folder</strong> option nor the folder tabs. It is the same rule as the dialog for picking a local Excel workbook."],
        ],
    },
    {
        title: ["Métricas e relatório", "Metrics and report"],
        items: [
            ["O separador <strong>Métricas</strong> junta num ecrã só as contas que já vinham dos dados: <strong>alterações por dia</strong> na folha (de todos os livros abertos), as tarefas <strong>paradas há mais tempo</strong>, o <strong>trabalho por estado</strong> do livro à vista, a <strong>carga por pessoa</strong> (só tarefas por fechar), o <strong>tempo</strong> contado pelos cronómetros e o que já foi para o Jira, e a lista <strong>Por fazer por coluna</strong>. O <strong>Período</strong> (7, 14 ou 30 dias) manda no gráfico dos dias e no relatório.",
                "The <strong>Metrics</strong> tab brings together, on one screen, the numbers that were already in the data: <strong>changes per day</strong> on the sheet (across every open workbook), the tasks <strong>stale the longest</strong>, the <strong>work by status</strong> of the workbook on screen, the <strong>load per person</strong> (unfinished tasks only), the <strong>time</strong> counted by the timers and how much of it reached Jira, and the <strong>TODO per column</strong> list. The <strong>Period</strong> (7, 14 or 30 days) drives both the daily chart and the report."],
            ["<strong>O meu período</strong> escreve o relatório do que fizeste no período escolhido ao lado: os estados que <strong>enviaste</strong> para a folha, os itens Por fazer que <strong>fechaste</strong> (com o tempo contado), o esforço <strong>registado no Jira</strong> e, no fim, quanto a equipa mexeu na folha fora desta app. O botão <strong>Copiar</strong> leva o texto em markdown, pronto a colar numa reunião ou no chat.",
                "<strong>My period</strong> writes up what you did in the period chosen alongside: the statuses you <strong>pushed</strong> to the sheet, the TODO entries you <strong>closed</strong> (with the time counted), the effort <strong>logged in Jira</strong> and, at the end, how much the team changed the sheet outside this app. The <strong>Copy</strong> button takes the text as markdown, ready to paste into a meeting or a chat."],
            ["A <strong>Folha de horas</strong> mostra o tempo dos cronómetros <strong>arrumado pelo dia</strong> em que foi contado, com o total do período — um cronómetro esquecido de um dia para o outro é repartido pelos dois dias, e não atirado todo para aquele em que se parou. O relatório ganhou a mesma secção e, no fim, a lista dos <strong>dias em que se contou tempo e nada foi registado no Jira</strong>. Os itens contados antes desta versão não sabem a que dia pertencem: esse tempo aparece dito à parte.",
                "The <strong>Timesheet</strong> shows timer time <strong>filed under the day</strong> it was counted, with the period total — a timer left running overnight is split across both days instead of being dumped on the day you stopped it. The report gained the same section and, at the end, the list of <strong>days with counted time and nothing logged in Jira</strong>. Items counted before this version do not know which day they belong to: that time is reported separately."],
            ["<strong>⤓ Exportar</strong> guarda o período à vista num ficheiro, na pasta <code>exports</code> ao lado da app: as <strong>alterações</strong> e a <strong>folha de horas</strong> em CSV (com <code>;</code> e BOM, para o Excel os abrir já com as colunas separadas) e o <strong>relatório</strong> em <code>.md</code>. A janela do relatório tem o mesmo no botão <strong>Guardar</strong>. Quem abre a app pela rede recebe o caminho, mas o ficheiro nasce no computador onde ela corre.",
                "<strong>⤓ Export</strong> saves the period in view to a file in the <code>exports</code> folder next to the app: the <strong>changes</strong> and the <strong>timesheet</strong> as CSV (with <code>;</code> and a BOM, so Excel opens them in columns) and the <strong>report</strong> as <code>.md</code>. The report window has the same thing on its <strong>Save</strong> button. If you opened the app over the network you get the path, but the file is created on the computer running it."],
            ["Só entram no relatório os itens Por fazer que se sabe <strong>quando</strong> foram fechados: os que já estavam fechados antes desta versão não têm data de fecho e ficam de fora. O <strong>tempo contado</strong> é o total acumulado dos cronómetros, não só o do período.",
                "Only the TODO entries whose <strong>closing date</strong> is known make it into the report: the ones already closed before this version have no closing date and are left out. <strong>Time counted</strong> is the timers' running total, not only the period's."],
        ],
    },
    {
        title: ["Assistente", "Assistant"],
        items: [
            ["O <strong>✨</strong> na barra do topo (ou <strong>Ctrl+I</strong>) abre uma caixa onde escreves a pergunta em vez de ires à vista certa: <code>as minhas tarefas</code>, <code>tarefas em curso</code>, <code>tarefas paradas</code>, <code>alterações por enviar</code>, <code>quantas tarefas em curso?</code>, <code>ccrs prontas a fechar</code>, <code>o que tenho por fazer</code>, <code>notas sobre &lt;texto&gt;</code>, <code>relatório da semana</code>, <code>resumo</code>, <code>o que faço a seguir</code>, <code>urgentes</code>, <code>estatísticas</code>, <code>linhas sem estado</code>, <code>livros abertos</code>. Qualquer outro texto procura em tudo o que está aberto. Escreve <code>ajuda</code> na caixa para ver a lista completa.",
                "The <strong>✨</strong> button in the top bar (or <strong>Ctrl+I</strong>) opens a box where you type the question instead of going to the right view: <code>my tasks</code>, <code>tasks in progress</code>, <code>stale tasks</code>, <code>pending changes</code>, <code>how many tasks in progress?</code>, <code>ccrs ready to close</code>, <code>what do I have to do</code>, <code>notes about &lt;text&gt;</code>, <code>week report</code>, <code>summary</code>, <code>what next</code>, <code>urgent</code>, <code>statistics</code>, <code>rows with no status</code>, <code>open workbooks</code>. Any other text searches everything that is open. Type <code>help</code> in the box for the full list."],
            ["Cada resposta traz os itens que encontrou: clica num para saltar para ele (a linha do Excel, o item Por fazer, a CCR ou a nota), como na pesquisa em tudo.",
                "Every answer brings the items it found: click one to jump to it (the Excel row, the TODO entry, the CCR or the note), just like in search everything."],
            ["Também pede alterações: <code>adiciona à lista: rever o TC-42</code>, <code>marca como feito: rever o TC-42</code>, <code>estado de &lt;tarefa&gt; para Done</code> (ou <code>estado tp de … para …</code>), <code>obs em &lt;tarefa&gt;: &lt;texto&gt;</code> e <code>nota em &lt;tarefa&gt;: &lt;texto&gt;</code>. O assistente <strong>nunca</strong> altera nada sozinho: mostra o que vai fazer e espera pelo <strong>Confirmar</strong>. As mudanças de estado (e a OBS) ficam <strong>locais</strong> (✎) e só vão para o Excel com o <strong>Enviar</strong>, como qualquer outra.",
                "It also takes orders: <code>add to my list: review TC-42</code>, <code>mark as done: review TC-42</code>, <code>status of &lt;task&gt; to Done</code> (or <code>status tp of … to …</code>), <code>obs on &lt;task&gt;: &lt;text&gt;</code> and <code>note on &lt;task&gt;: &lt;text&gt;</code>. The assistant <strong>never</strong> changes anything on its own: it shows what it is about to do and waits for <strong>Confirm</strong>. Status changes (and the OBS) stay <strong>local</strong> (✎) and only reach Excel with the <strong>Push</strong>, like any other."],
            ["O quadro <strong>Por fazer</strong> também se arruma daqui: <code>move &lt;item&gt; para em curso</code> (qualquer coluna do teu quadro serve, pelo nome que lhe deste), <code>prioridade de &lt;item&gt; para alta</code> e <code>remove da lista: &lt;item&gt;</code> — este último apaga mesmo, por isso é a única proposta que o diz.",
                "The <strong>TODO</strong> board is tidied from here too: <code>move &lt;item&gt; to in progress</code> (any column of your board works, by the name you gave it), <code>priority of &lt;item&gt; to high</code> and <code>remove from my list: &lt;item&gt;</code> — the last one really deletes, which is why it is the one proposal that says so."],
            ["E cria <strong>notas</strong> no quadro: <code>cria uma nota: Reunião de sexta</code> abre uma nota vazia, e <code>cria uma nota com as minhas tarefas paradas</code> (ou <code>com a lista por fazer</code>, <code>com as ccrs</code>) põe lá uma <strong>tabela</strong> já feita do que a app tem aberto, pronta a editar como qualquer outra.",
                "And it creates <strong>notes</strong> on the board: <code>create a note: Friday meeting</code> opens an empty note, and <code>create a note with my stale tasks</code> (or <code>with my todo list</code>, <code>with the ccrs</code>) drops in a ready-made <strong>table</strong> of what the app has open, editable like any other."],
            ["Por omissão o assistente é <strong>determinístico</strong>: percebe um conjunto de frases conhecido (escreve <code>ajuda</code> para o ver) e, fora disso, procura em tudo o que está aberto. Quem quiser respostas a perguntas escritas à sua maneira pode ligar o <strong>motor do modelo</strong> — fica no ficheiro <code>chat_config.json</code> ao lado da app (<code>{\"engine\": \"llm\", …}</code>) e precisa do pacote <code>anthropic</code> instalado. Mesmo ligado, o modelo só sabe o que a app tem aberto naquele momento: nunca lê a folha nem o OneDrive.",
                "By default the assistant is <strong>deterministic</strong>: it understands a known set of phrases (type <code>help</code> to see them) and otherwise searches everything that is open. If you want answers to questions phrased your own way, you can switch on the <strong>model engine</strong> — it lives in the <code>chat_config.json</code> file next to the app (<code>{\"engine\": \"llm\", …}</code>) and needs the <code>anthropic</code> package installed. Even switched on, the model only knows what the app has open at that moment: it never reads the sheet or OneDrive."],
            ["As <strong>ordens</strong> (adicionar à lista, mudar um estado, escrever uma nota) continuam sempre a passar pelo motor determinístico, com a confirmação de sempre — o modelo nunca é quem decide mexer nos dados. E se ele falhar (sem pacote, sem chave, sem rede), a pergunta é respondida pelo motor determinístico, que o diz na resposta.",
                "<strong>Orders</strong> (add to the list, change a status, write a note) always keep going through the deterministic engine, with the usual confirmation — the model is never what decides to touch your data. And if it fails (no package, no key, no network), the question is answered by the deterministic engine, which says so in the answer."],
            ["Só sabe o que a app tem aberto neste momento: um livro fechado, ou uma aba que não foi lida, não entra nas respostas. Não vai ao Excel nem ao OneDrive para responder — e por isso responde depressa.",
                "It only knows what the app has open right now: a closed workbook, or a sheet that was never read, does not show up in the answers. It never goes to Excel or OneDrive to answer — which is why it answers fast."],
        ],
    },
    {
        title: ["Ecrã dividido", "Split screen"],
        items: [
            ["Arrasta o botão ↗ de um item (ou um separador) para o lado esquerdo/direito do ecrã para ver duas vistas ao mesmo tempo. Arrasta a barra do meio para redimensionar e ⇄ para trocar de lado.",
                "Drag an item's ↗ button (or a tab) to the left/right edge of the screen to see two views at once. Drag the middle bar to resize and ⇄ to swap sides."],
            ["<strong>Esc</strong> ou ✕ fecham o painel lateral.",
                "<strong>Esc</strong> or ✕ close the side panel."],
        ],
    },
    {
        title: ["Definições e OneDrive", "Settings and OneDrive"],
        items: [
            ["Em <strong>⚙ Definições</strong> escolhes o tema, a língua e a fonte dos dados: <strong>Automático</strong> (OneDrive quando disponível), <strong>OneDrive (web)</strong> ou <strong>Ficheiro local</strong>.",
                "In <strong>⚙ Settings</strong> you pick the theme, the language and the data source: <strong>Automatic</strong> (OneDrive when available), <strong>OneDrive (web)</strong> or <strong>Local file</strong>."],
            ["<strong>Ligar</strong> autentica-te no OneDrive pelo browser; a partir daí a app lê e escreve o livro sem precisar do Excel aberto.",
                "<strong>Connect</strong> signs you in to OneDrive through the browser; from then on the app reads and writes the workbook without needing Excel open."],
            ["Quando abres uma aba que não tem as colunas do tracker (Function/TC, Author TC, Status TC…), aparece em <strong>⚙ Definições</strong> a secção <strong>Vista resumida desta aba</strong>: escolhes que coluna dessa folha entra em cada campo do resumo (nome, autor, reviewer, estado, o que fazer) e a aba passa a mostrar-se em caixas/linhas como o tracker. É só para ver — nada nessa vista se edita nem se escreve no Excel. A escolha fica guardada por livro e aba, e o botão <strong>Vista completa</strong> volta à tabela com todas as colunas.",
                "When you open a sheet without the tracker columns (Function/TC, Author TC, Status TC…), a <strong>Compact view for this sheet</strong> section shows up in <strong>⚙ Settings</strong>: you pick which column of that sheet feeds each field of the summary (name, author, reviewer, status, to do) and the sheet starts rendering as boxes/lines like the tracker. It is read-only — nothing there can be edited or written back to Excel. The choice is remembered per workbook and sheet, and the <strong>Full view</strong> button brings back the table with every column."],
            ["<strong>Avisos</strong>: os <strong>avisos do sistema</strong> (ao lado do relógio) aparecem quando alguma coisa muda nas tuas linhas e a janela da app está em <strong>segundo plano</strong> — com ela à frente já lá está o cartão. E podes escrever o endereço de um <strong>webhook do Teams/Slack</strong>: com ele preenchido, a app manda para o teu canal o que mudou, mesmo com a app fechada. Os dois começam desligados, e sem webhook escrito não sai nada do computador.",
                "<strong>Alerts</strong>: <strong>system notifications</strong> (next to the clock) appear when something changes in your rows and the app window is in the <strong>background</strong> — with it in front the card is already there. And you can write a <strong>Teams/Slack webhook</strong> address: with it filled in, the app posts what changed to your channel, even with the app closed. Both start off, and with no webhook written nothing leaves the computer."],
        ],
    },
    {
        title: ["Jira", "Jira"],
        items: [
            ["O separador <strong>Jira</strong> (só aparece com o Jira configurado nas Definições) tem um cartão por issue usada na app, com as tarefas do <strong>Por fazer</strong> ligadas a cada uma. O <strong>⏱+</strong> do cartão regista trabalho na issue e o ✕ de uma tarefa desliga-a.",
                "The <strong>Jira</strong> tab (it only shows up once Jira is configured in Settings) has one card per issue used in the app, with the <strong>TODO</strong> tasks linked to each one. The card's <strong>⏱+</strong> logs work on the issue and a task's ✕ unlinks it."],
            ["No topo da página, <strong>Tarefas por ligar</strong> lista as tarefas da tua lista que ainda não têm issue: <strong>arrasta uma para o cartão de uma issue</strong> para as ligar (assim que ligas, a tarefa sai da lista e passa a aparecer no cartão). Clica no título do painel para o fechar quando quiseres mais espaço para os cartões — a app lembra-se da escolha.",
                "At the top of the page, <strong>Tasks to link</strong> lists the tasks in your list with no issue yet: <strong>drag one onto an issue card</strong> to link them (once linked, the task leaves the list and shows up on the card). Click the panel's title to collapse it when you want more room for the cards — the app remembers your choice."],
            ["Arrastar uma tarefa de um cartão para outro muda a issue a que ela está ligada. Cada tarefa só pode estar ligada a uma issue de cada vez.",
                "Dragging a task from one card to another moves it to that issue. Each task can only be linked to one issue at a time."],
            ["Escrever palavras no campo <strong>Procurar</strong> procura-as <strong>no próprio Jira</strong> (chave ou resumo) e mostra a lista de issues por baixo: clica numa para criar logo o cartão dela. Se houver resultados a mais, a app avisa para escreveres mais. Escrever (ou colar) uma chave e carregar em <strong>Enter</strong> continua a criar o cartão dessa issue diretamente.",
                "Typing words in the <strong>Search</strong> field searches <strong>Jira itself</strong> (key or summary) and lists the matching issues below: click one to create its card right away. If there are too many results, the app tells you to type more. Typing (or pasting) a key and pressing <strong>Enter</strong> still creates that issue's card directly."],
        ],
    },
    {
        title: ["Sugestões", "Feedback"],
        items: [
            [() => t("fb_hint"), () => t("fb_hint")],
            ["Os erros da app são reportados automaticamente para a mesma pasta — não precisas de fazer nada.",
                "App errors are reported automatically to the same folder — you don't need to do anything."],
        ],
    },
];

function renderHelp() {
    const i = LANG === "en" ? 1 : 0;
    $("helpBody").innerHTML = HELP.map(sec =>
        `<h3>${sec.title[i]}</h3><ul>` +
        sec.items.map(it => `<li>${typeof it[i] === "function" ? it[i]() : it[i]}</li>`).join("") +
        "</ul>").join("");
}

function setHelpOpen(open) {
    $("helpOverlay").classList.toggle("hidden", !open);
    $("helpBtn").classList.toggle("active", open);
    $("helpBtn").setAttribute("aria-expanded", open ? "true" : "false");
    if (open) $("helpBody").scrollTop = 0;
}

$("helpBtn").addEventListener("click", e => {
    e.stopPropagation();
    setHelpOpen($("helpOverlay").classList.contains("hidden"));
});

$("helpClose").addEventListener("click", () => setHelpOpen(false));

// clicar fora do cartão fecha
$("helpOverlay").addEventListener("click", e => {
    if (e.target === $("helpOverlay")) setHelpOpen(false);
});

// em captura: com a ajuda aberta, o Esc fecha-a sem mexer no ecrã dividido
document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || $("helpOverlay").classList.contains("hidden")) return;
    e.stopPropagation();
    setHelpOpen(false);
}, true);

// "Novidades": historico de changelog por versao, mais recente primeiro
let changelogEntries = null;   // null = por carregar; "pending"/"error" | array de {version, notes}
let changelogCurrentVersion = null;

function renderChangelog() {
    const body = $("changelogBody");
    if (changelogEntries === null) {
        changelogEntries = "pending";
        body.innerHTML = `<p>${esc(t("changelog_loading"))}</p>`;
        fetch("/api/changelog")
            .then(res => res.json())
            .then(out => {
                changelogEntries = Array.isArray(out.entries) ? out.entries : [];
                changelogCurrentVersion = out.currentVersion;
                renderChangelog();
            })
            .catch(() => {
                changelogEntries = "error";
                renderChangelog();
            });
        return;
    }
    if (changelogEntries === "pending") {
        body.innerHTML = `<p>${esc(t("changelog_loading"))}</p>`;
        return;
    }
    if (changelogEntries === "error") {
        body.innerHTML = `<p>${esc(t("changelog_error"))}</p>`;
        return;
    }
    if (!changelogEntries.length) {
        body.innerHTML = `<p>${esc(t("changelog_empty"))}</p>`;
        return;
    }
    body.innerHTML = changelogEntries.map(e => `<h3>v${e.version}${e.version === changelogCurrentVersion ? ` (${esc(t("changelog_current"))})` : ""
        }</h3><ul>${(e.notes || []).map(n => `<li>${esc(n)}</li>`).join("")}</ul>`).join("");
}

function setChangelogOpen(open) {
    $("changelogOverlay").classList.toggle("hidden", !open);
    if (open) renderChangelog();
}

$("changelogBtn").addEventListener("click", () => setChangelogOpen(true));
$("changelogClose").addEventListener("click", () => setChangelogOpen(false));

// clicar fora do cartão fecha
$("changelogOverlay").addEventListener("click", e => {
    if (e.target === $("changelogOverlay")) setChangelogOpen(false);
});

// em captura, como na ajuda: o Esc fecha as novidades sem mexer no ecrã dividido
document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || $("changelogOverlay").classList.contains("hidden")) return;
    e.stopPropagation();
    setChangelogOpen(false);
}, true);
