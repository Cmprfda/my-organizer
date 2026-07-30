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
            ["O distintivo no canto superior direito mostra de onde vêm os dados: <strong>verde</strong> = ligado ao OneDrive, <strong>vermelho</strong> = por ligar ou sem servidor, <strong>cinzento</strong> = ficheiro local. Clica nele para abrir as Definições.",
                "The badge in the top-right corner shows where data comes from: <strong>green</strong> = connected to OneDrive, <strong>red</strong> = not connected or no server, <strong>grey</strong> = local file. Click it to open Settings."],
            ["Podes abrir a app no telemóvel ou noutro PC da mesma rede pelo endereço mostrado por baixo dos botões.",
                "You can open the app on your phone or another PC on the same network using the address shown under the buttons."],
            ["A versão instalada está sempre visível no canto inferior direito do ecrã.",
                "The installed version is always visible in the bottom-right corner of the screen."],
            ["Clica em qualquer item (tarefa, CCR ou item da lista Por fazer) para o abrir numa <strong>caixa</strong> com tudo o que ele tem, sem cortes. <strong>Esc</strong> ou ✕ fecham a caixa.",
                "Click any item (task, CCR or TODO entry) to open it in a <strong>box</strong> with everything it holds, nothing truncated. <strong>Esc</strong> or ✕ close the box."],
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
