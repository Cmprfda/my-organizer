// My Organizer — janela "Como usar" (?): todo o conhecimento de utilização

// Cada secção tem título e itens em [PT, EN]. Os itens aceitam HTML simples
// (<strong>, <code>) — o conteúdo é fixo, não vem de dados do utilizador.
const HELP = [
    {
        title: ["O que é isto", "What this is"],
        items: [
            ["A app abre um livro de Excel (o teu <strong>BSP-G2_Daily_Tracker.xlsx</strong> ou qualquer outro do OneDrive) e mostra as tarefas, as CCRs e a tua lista Por fazer numa página local. O Excel continua a ser a fonte de verdade.",
                "The app opens an Excel workbook (your <strong>BSP-G2_Daily_Tracker.xlsx</strong> or any other one in OneDrive) and shows tasks, CCRs and your personal TODO list in a local page. Excel remains the source of truth."],
            ["Em <strong>Definições → Livro do OneDrive</strong> podes <strong>Mudar de livro</strong>: navega pelas pastas do OneDrive/SharePoint, procura pelo nome e escolhe qualquer ficheiro .xlsx. Os últimos livros usados ficam à mão.",
                "In <strong>Settings → OneDrive workbook</strong> use <strong>Change workbook</strong>: browse your OneDrive/SharePoint folders, search by name and pick any .xlsx file. Recently used workbooks stay one click away."],
            ["O distintivo no canto superior direito mostra de onde vêm os dados: <strong>verde</strong> = ligado ao OneDrive, <strong>vermelho</strong> = pronto a ligar ou sem servidor, <strong>cinzento</strong> = ficheiro local. Clica nele para abrir as Definições.",
                "The badge in the top-right corner shows where data comes from: <strong>green</strong> = connected to OneDrive, <strong>red</strong> = ready to connect or no server, <strong>grey</strong> = local file. Click it to open Settings."],
            ["Podes abrir a app no telemóvel ou noutro PC da mesma rede pelo endereço mostrado por baixo dos botões.",
                "You can open the app on your phone or another PC on the same network using the address shown under the buttons."],
            ["A versão instalada está sempre visível no canto inferior direito do ecrã.",
                "The installed version is always visible in the bottom-right corner of the screen."],
            ["Clica em qualquer item (tarefa, CCR ou item da lista Por fazer) para o abrir numa <strong>caixa</strong> com tudo o que ele tem, sem cortes. Dentro da caixa podes editar tudo como na lista: estados, OBS, notas, checklists e passos. <strong>Esc</strong> ou ✕ fecham a caixa.",
                "Click any item (task, CCR or TODO entry) to open it in a <strong>box</strong> with everything it holds, nothing truncated. Inside the box you can edit everything just like in the list: statuses, OBS, notes, checklists and steps. <strong>Esc</strong> or ✕ close the box."],
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
            ["Clica em <strong>Obs:</strong> (ou <strong>+ obs</strong>) para escrever a coluna <strong>OBS</strong> da folha. Tal como os estados, fica local (✎) até carregares em <strong>Enviar</strong>.",
                "Click <strong>Obs:</strong> (or <strong>+ note</strong>) to write the sheet's <strong>OBS</strong> column. Like statuses, it stays local (✎) until you press <strong>Push</strong>."],
            ["<strong>+ nota</strong> guarda etiquetas, checklists e texto livre por tarefa (só na app, nunca no Excel). <strong>Limpar notas</strong> apaga-as todas.",
                "<strong>+ note</strong> stores tags, checklists and free text per task (app only, never in Excel). <strong>Clear notes</strong> deletes them all."],
            ["A app verifica de poucos em poucos segundos se o livro foi gravado e recarrega sozinha quando isso acontece. <strong>Atualizar</strong> lê tudo de raiz, como se estivesses a abrir o ficheiro pela primeira vez. Se o livro do OneDrive também estiver sincronizado no teu computador, a app lê essa cópia: o que gravas no Excel aparece logo, sem esperar pelo OneDrive. Enquanto a cópia na nuvem estiver diferente da tua, aparece um aviso ℹ por baixo do nome do ficheiro — os teus colegas ainda não veem essas alterações.",
                "The app checks every few seconds whether the workbook was saved and reloads by itself when it was. <strong>Refresh</strong> reads everything from scratch, as if you had just opened the file. If the OneDrive workbook is also synced to your computer, the app reads that copy: whatever you save in Excel shows up immediately, without waiting for OneDrive. While the cloud copy still differs from yours, an ℹ notice appears under the file name — your colleagues cannot see those changes yet."],
            ["<strong>Obter do SharePoint</strong> abre o download do ficheiro no teu browser, quando estás a usar o ficheiro local.",
                "<strong>Fetch from SharePoint</strong> opens the file download in your browser when you are using the local file."],
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
            ["No modo <strong>Kanban</strong>, arrasta os cartões entre colunas — podes largar em qualquer ponto da coluna, incluindo o título e o espaço vazio. O cronómetro conta o tempo em <strong>Em curso</strong>.",
                "In <strong>Kanban</strong> mode, drag the cards between columns — you can drop anywhere in the column, including its title and empty space. The timer counts the time spent <strong>In progress</strong>."],
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
            ["<strong>🗑</strong> limpa o quadro todo de uma vez (pergunta primeiro) e também se reverte com ↺. Atenção: os printscreens colados nesse quadro são apagados do computador e não voltam com o ↺.",
                "<strong>🗑</strong> clears the whole board at once (it asks first) and can also be reverted with ↺. Careful: screenshots pasted on that board are deleted from the computer and do not come back with ↺."],
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
    setSettingsOpen(false);
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
