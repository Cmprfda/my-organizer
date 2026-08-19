// My Organizer — assistente (✨): perguntar e mandar fazer, por escrito
//
// A app tem muita coisa em vistas diferentes; isto é uma caixa onde se pergunta
// pelo que interessa agora ("as minhas tarefas em curso", "o que está parado")
// e se mandam fazer alterações pequenas sem ir à vista certa clicar nos sítios
// certos.
//
// Três invariantes:
//
// 1. O contexto sai daqui, não da folha. O que se manda ao servidor é o retrato
//    do que a app JÁ tem em memória (os mesmos dados da pesquisa global) — uma
//    pergunta ao assistente nunca abre o Excel nem vai ao OneDrive.
// 2. As alterações são propostas. O servidor devolve uma `action`; só depois de
//    se carregar em Confirmar é que ela é executada — e sempre pelos caminhos
//    normais (/api/todo, /api/update, /api/note), nunca por uma via própria.
// 3. Nada chega ao Excel sem o Push de sempre: as alterações de estado ficam
//    locais (✎), como se tivessem sido feitas na tabela.

// quantas linhas de cada livro vão no contexto (o suficiente para uma aba
// inteira; o servidor corta outra vez, por segurança)
const CHAT_MAX_ROWS = 400;

// ---------- a conversa ----------
// { who: "me"|"bot", text, items, action, note, done }
//
// Fica guardada neste browser (como o tema ou o tamanho do ecrã dividido), não
// no servidor: a conversa é de quem a teve, e o contexto que a gerou é o que
// este browser tinha aberto. Fechar a app deixou de a esquecer; o botão Limpar
// continua a ser a forma de a deitar fora.
const CHAT_STORE_KEY = "bsp-tracker-chat";
const CHAT_KEEP = 60;          // mensagens guardadas (as mais recentes)
const CHAT_MAX_BYTES = 120000; // teto do que se escreve no localStorage

// Uma proposta por confirmar é de uma sessão anterior: o livro pode ter sido
// relido (ou nem sequer estar aberto) desde então, por isso não se deixa
// confirmar às cegas — fica no registo, marcada como fora de prazo.
function restoreChatMsg(m) {
  if (!m || typeof m !== "object") return null;
  const msg = {
    who: m.who === "me" ? "me" : "bot",
    text: String(m.text || ""),
    items: Array.isArray(m.items) ? m.items : [],
    action: m.action || null,
    note: String(m.note || ""),
    done: m.done ? String(m.done) : "",
  };
  if (msg.action && !msg.done) msg.done = t("chat_expired");
  return msg;
}

function loadChatMsgs() {
  try {
    const raw = JSON.parse(localStorage.getItem(CHAT_STORE_KEY) || "null");
    if (!Array.isArray(raw)) return [];
    return raw.map(restoreChatMsg).filter(Boolean);
  } catch (e) {
    return [];
  }
}

function saveChatMsgs() {
  try {
    let guardar = chatMsgs.slice(-CHAT_KEEP);
    // conversas com muitos resultados listados chegam a ser grandes: corta-se
    // pela frente até caber, em vez de estoirar a quota do localStorage
    while (guardar.length > 1 && JSON.stringify(guardar).length > CHAT_MAX_BYTES)
      guardar = guardar.slice(1);
    localStorage.setItem(CHAT_STORE_KEY, JSON.stringify(guardar));
  } catch (e) { /* sem espaço: a conversa continua a viver em memória */ }
}

let chatMsgs = loadChatMsgs();
let chatBusy = false;

const chatIsOpen = () => !$("chatPanel").classList.contains("hidden");

// ---------- o retrato que vai com a pergunta ----------
// Com "Ver tudo" desligado o servidor já filtrou as linhas pela pessoa, por
// isso são todas minhas; com ele ligado vêm as de todos e a pertença tem de ser
// adivinhada pelo nome (a mesma tolerância a nomes parciais do servidor).
const chatPersonTokens = () => norm(PERSON).split(/\s+/).filter(w => w.length > 2);

function chatRowIsMine(cells, meta) {
  if (!showAll) return true;
  const tokens = chatPersonTokens();
  if (!tokens.length) return false;
  const texto = norm([...(cells || []), ...Object.values((meta && meta.people) || {})].join(" "));
  return tokens.some(w => texto.includes(w));
}

function chatBookContext(tab) {
  const data = tab.lastData;
  if (!data || data.error || !Array.isArray(data.rows)) return null;
  const metas = data.row_meta || [];
  const rows = data.rows.slice(0, CHAT_MAX_ROWS).map((r, i) => {
    const meta = metas[i] || {};
    const cur = meta.cur || {};
    const nota = meta.note || {};
    const idade = taskAgeInTab(tab.id, meta);
    return {
      fn: meta.fn || r[0] || "", todo: meta.todo || "", xlrow: meta.xlrow,
      tc: cur["Status TC"] || "", tp: cur["Status TP"] || "", obs: cur["OBS"] || "",
      people: Object.values(meta.people || {}).filter(Boolean).join(" · "),
      note: [nota.tag, nota.note].filter(Boolean).join(" — "),
      mine: chatRowIsMine(r, meta),
      over: Object.keys(meta.over || {}).filter(k => (meta.over || {})[k]),
      age_days: idade ? idade.days : null,
      age_est: !!(idade && idade.estimated),
      text: r.join(" "),
    };
  });
  return {
    name: tab.name, sheet: data.sheet || tab.sheet || "",
    file: data.file || tabFile(tab), view: `wb:${tab.id}`,
    active: tab.id === activeTabId,
    statuses: data.statuses || [],
    rows,
  };
}

function chatContext() {
  return {
    person: PERSON,
    view: currentView,
    stale_days: staleDays(),
    pending: (lastData && lastData.pending) || 0,
    books: workbookTabs.map(chatBookContext).filter(Boolean),
    todos: (todos || []).map(it => ({
      id: it.id, title: it.title, col: todoColOf(it),
      col_label: todoColLabel(todoColOf(it)), priority: it.priority || "normal",
      done: !!it.done, detail: it.detail || "",
      jira: (it.jiraIssues || []).map(j => j && j.key).filter(Boolean),
    })),
    ccrs: Object.keys(ccrs || {}).map(id => {
      const checks = (ccrs[id] && ccrs[id].checks) || {};
      const ready = CCR_PRE.every(([k]) => checks[k]);
      return {
        id: String(id), note: (ccrs[id] && ccrs[id].note) || "",
        ready, closed: ready && CCR_POST.every(([k]) => checks[k]),
      };
    }),
    notes: (typeof notepad !== "undefined" && notepad && notepad.notes ? notepad.notes : [])
      .map(n => ({
        id: n.id, title: n.title || "",
        folder: folderChainNames(n.folder).join("/"),
        text: (n.boxes || []).map(b => b.text || "").join(" ").slice(0, 600),
      })),
  };
}

// ---------- desenho ----------
// Markdown de bolso: o servidor responde em texto com **negrito**, `código`,
// listas com "-", títulos com "#" e citações com ">". Escapa-se sempre primeiro.
function chatMarkdown(text) {
  const inline = s => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  const out = [];
  let lista = null;
  const fechaLista = () => { if (lista) { out.push(`<ul>${lista.join("")}</ul>`); lista = null; } };
  String(text || "").split("\n").forEach(linha => {
    const l = linha.trim();
    if (!l) { fechaLista(); return; }
    if (/^[-*]\s+/.test(l)) {
      (lista = lista || []).push(`<li>${inline(l.replace(/^[-*]\s+/, ""))}</li>`);
      return;
    }
    fechaLista();
    if (/^#{1,6}\s+/.test(l)) out.push(`<div class="chatH">${inline(l.replace(/^#{1,6}\s+/, ""))}</div>`);
    else if (/^>\s?/.test(l)) out.push(`<blockquote>${inline(l.replace(/^>\s?/, ""))}</blockquote>`);
    else out.push(`<p>${inline(l)}</p>`);
  });
  fechaLista();
  return out.join("");
}

const CHAT_ICONS = { task: "▤", todo: "✔", ccr: "⚑", note: "✎" };

function chatItemsHtml(items, msgIndex) {
  if (!items || !items.length) return "";
  return `<div class="chatItems">` + items.map((it, i) =>
    `<button type="button" class="chatItem" data-chatgo="${msgIndex}:${i}">` +
    `<span class="chatItemIcon">${CHAT_ICONS[it.kind] || "•"}</span>` +
    `<span class="chatItemText"><strong>${esc(it.title || "")}</strong>` +
    (it.sub ? `<small>${esc(it.sub)}</small>` : "") + `</span></button>`
  ).join("") + `</div>`;
}

function chatActionHtml(msg, msgIndex) {
  if (!msg.action) return "";
  if (msg.done) return `<div class="chatActionDone">${esc(msg.done)}</div>`;
  return `<div class="chatActions">` +
    `<button type="button" class="chatOk" data-chatdo="${msgIndex}">${esc(t("chat_confirm"))}</button>` +
    `<button type="button" class="chatNo" data-chatskip="${msgIndex}">${esc(t("chat_cancel"))}</button>` +
    `</div>`;
}

function renderChatLog() {
  const box = $("chatLog");
  box.innerHTML = chatMsgs.map((m, i) => {
    if (m.who === "me") return `<div class="chatMsg me">${esc(m.text)}</div>`;
    return `<div class="chatMsg bot">${chatMarkdown(m.text)}` +
      (m.note ? `<div class="chatNote">${esc(m.note)}</div>` : "") +
      chatItemsHtml(m.items, i) + chatActionHtml(m, i) + `</div>`;
  }).join("") + (chatBusy ? `<div class="chatMsg bot chatWait">${esc(t("chat_thinking"))}</div>` : "");
  box.scrollTop = box.scrollHeight;
}

function renderChatSuggestions() {
  $("chatSuggest").innerHTML = ["chat_sug_tasks", "chat_sug_next", "chat_sug_stale", "chat_sug_todo", "chat_sug_help"]
    .map(k => `<button type="button" class="chatChip" data-chatsug="${esc(t(k))}">${esc(t(k))}</button>`)
    .join("");
}

// ---------- abrir / fechar ----------
function setChatOpen(open) {
  $("chatPanel").classList.toggle("hidden", !open);
  $("chatBtn").classList.toggle("active", open);
  $("chatBtn").setAttribute("aria-expanded", open ? "true" : "false");
  if (!open) return;
  if (!chatMsgs.length) {
    chatMsgs.push({ who: "bot", text: t("chat_greeting") });
    renderChatLog();   // a saudação não se guarda: é o que se mostra a quem chega
  }
  $("chatInput").focus();
}

// ---------- perguntar ----------
async function chatAsk(message) {
  const texto = String(message || "").trim();
  if (!texto || chatBusy) return;
  chatMsgs.push({ who: "me", text: texto });
  chatBusy = true;
  renderChatLog();
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: texto, lang: LANG, context: chatContext() }),
    });
    const out = await res.json();
    chatBusy = false;
    if (!out.ok) {
      chatMsgs.push({ who: "bot", text: `${t("chat_err")} ${out.error || "?"}` });
    } else {
      chatMsgs.push({
        who: "bot", text: out.reply || "", items: out.items || [],
        action: out.action || null, note: out.engine_note || "",
      });
    }
  } catch (err) {
    chatBusy = false;
    chatMsgs.push({ who: "bot", text: t("err_server") });
  }
  saveChatMsgs();
  renderChatLog();
}

// ---------- executar uma proposta ----------
// A linha é reencontrada no livro certo pelo nº de linha do Excel: entre a
// proposta e o Confirmar pode ter havido um reload (o ciclo de 20s), por isso o
// `meta` de então já não serve — e se a linha desapareceu, não se escreve nada.
function chatFindRow(ref) {
  const nome = (ref || {}).workbook;
  // sem o livro da proposta aberto NÃO se escreve no que estiver à frente: o
  // separador ativo pode ser outro livro, com outra folha e outras linhas
  const tab = nome ? workbookTabs.find(x => x.name === nome) : activeTab();
  const data = tab && tab.lastData;
  if (!data || data.error) return null;
  const meta = (data.row_meta || []).find(m =>
    m && String(m.xlrow) === String((ref || {}).xlrow) && (m.fn || "") === ((ref || {}).fn || ""));
  return meta ? { tab, data, meta } : null;
}

async function chatSetStatus(action) {
  const hit = chatFindRow(action.ref);
  if (!hit) { toast(t("chat_row_gone"), "err"); return false; }
  const cols = hit.data.xlcols || {};
  try {
    const res = await fetch("/api/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sheet: hit.data.sheet, fn: hit.meta.fn, todo: hit.meta.todo,
        column: action.column, value: action.value,
        base: (hit.meta.orig || {})[action.column] || "",
        file: hit.data.file, xlrow: hit.meta.xlrow,
        xlcol: cols[action.column], fncol: cols.fn,
      }),
    });
    const out = await res.json();
    if (!out.ok) { alert(`${t("err_save")} ${out.error || "?"}`); return false; }
  } catch (err) {
    alert(`${t("err_save")} ${err}`);
    return false;
  }
  // esperar pela releitura: o ✎ na tabela e o botão Enviar (N) têm de já estar
  // certos quando a caixa disser "Feito."
  await load();
  return true;
}

// A nota de execução de uma linha é uma só (etiqueta + texto + checklist): o
// texto novo junta-se ao que já lá estava, e a etiqueta e a checklist ficam
// como estão — o /api/note grava a nota inteira de cada vez.
async function chatAddNote(action) {
  const hit = chatFindRow(action.ref);
  if (!hit) { toast(t("chat_row_gone"), "err"); return false; }
  const nota = hit.meta.note || {};
  const texto = [String(nota.note || "").trim(), action.note].filter(Boolean).join("\n");
  try {
    const res = await fetch("/api/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file: hit.data.file, sheet: hit.data.sheet,
        fn: hit.meta.fn, todo: hit.meta.todo,
        tag: nota.tag || "", note: texto, checks: nota.checks || {},
      }),
    });
    const out = await res.json();
    if (!out.ok) { alert(`${t("err_save")} ${out.error || "?"}`); return false; }
  } catch (err) {
    alert(`${t("err_save")} ${err}`);
    return false;
  }
  // esperar pela releitura: o ✎ na tabela e o botão Enviar (N) têm de já estar
  // certos quando a caixa disser "Feito."
  await load();
  return true;
}

// Uma nota nova no quadro: primeiro a nota, depois — se o assistente montou
// uma tabela — uma caixa com ela. A caixa é alta o suficiente para o que leva
// (o texto sai em linhas de "| coluna |", ver noteTableBlock em notes.js), e no
// fim abre-se a nota: quem pediu quer vê-la.
async function chatNewNote(action) {
  const out = await postNotepad({ action: "add_note", title: action.title, folder: "" });
  if (!out) return false;
  const nota = (out.notepad.notes || [])[(out.notepad.notes || []).length - 1];
  if (!nota) return false;
  const texto = String(action.text || "");
  if (texto) {
    const linhas = texto.split("\n").length;
    const feito = await postNotepad({
      action: "add_box", id: nota.id, x: 80, y: 80,
      w: 520, h: Math.max(160, Math.min(900, 28 * linhas + 40)), text: texto,
    });
    if (!feito) return false;
  }
  setCurrentNote(nota.id);
  showView("notes");
  return true;
}

async function runChatAction(action) {
  if (!action) return false;
  if (action.kind === "todo_add") {
    await addTodoWithFeedback({
      action: "add", title: action.title, kind: "manual", col: todoDefaultCol(),
    });
    return true;
  }
  if (action.kind === "todo_done")
    return await postTodo({ action: "set_col", id: action.id, col: "done" });
  if (action.kind === "todo_col")
    return await postTodo({ action: "set_col", id: action.id, col: action.col });
  if (action.kind === "todo_priority")
    return await postTodo({ action: "set_priority", id: action.id, priority: action.priority });
  if (action.kind === "todo_delete")
    return await postTodo({ action: "delete", id: action.id });
  if (action.kind === "status_set") return await chatSetStatus(action);
  if (action.kind === "note_add") return await chatAddNote(action);
  if (action.kind === "note_new") return await chatNewNote(action);
  return false;
}

async function confirmChatAction(i) {
  const msg = chatMsgs[i];
  if (!msg || !msg.action || msg.done) return;
  msg.done = t("chat_working");
  renderChatLog();
  const ok = await runChatAction(msg.action);
  msg.done = ok ? t("chat_done") : t("chat_failed");
  saveChatMsgs();
  renderChatLog();
}

// ---------- eventos ----------
$("chatBtn").addEventListener("click", e => {
  e.stopPropagation();
  setChatOpen(!chatIsOpen());
});
$("chatClose").addEventListener("click", () => setChatOpen(false));
$("chatClear").addEventListener("click", () => {
  chatMsgs = [];
  saveChatMsgs();
  renderChatLog();
  setChatOpen(true);
});

$("chatForm").addEventListener("submit", e => {
  e.preventDefault();
  const texto = $("chatInput").value;
  $("chatInput").value = "";
  chatAsk(texto);
});

$("chatSuggest").addEventListener("click", e => {
  const chip = e.target.closest("[data-chatsug]");
  if (chip) chatAsk(chip.dataset.chatsug);
});

$("chatLog").addEventListener("click", e => {
  const go = e.target.closest("[data-chatgo]");
  if (go) {
    const [mi, ii] = go.dataset.chatgo.split(":").map(Number);
    const item = ((chatMsgs[mi] || {}).items || [])[ii];
    if (item && item.source) chatGo(item.source);
    return;
  }
  const ok = e.target.closest("[data-chatdo]");
  if (ok) { confirmChatAction(+ok.dataset.chatdo); return; }
  const no = e.target.closest("[data-chatskip]");
  if (no) {
    const msg = chatMsgs[+no.dataset.chatskip];
    if (msg) { msg.done = t("chat_cancelled"); saveChatMsgs(); renderChatLog(); }
  }
});

// Saltar para o item: as linhas do Excel e os itens Por fazer/CCRs já sabem
// como ser encontrados (revealSource, split.js); as notas abrem-se no quadro.
function chatGo(src) {
  if (src.view === "notes") {
    if (src.noteId) setCurrentNote(src.noteId);
    showView("notes");
    return;
  }
  revealSource(src);
}

// Ctrl+I abre/fecha; o Esc fecha só isto (em captura, antes do tratador do ecrã
// dividido em split.js) e não sai da vista onde se está.
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && (e.key === "i" || e.key === "I")) {
    e.preventDefault();
    setChatOpen(!chatIsOpen());
    return;
  }
  if (e.key === "Escape" && chatIsOpen()) {
    e.stopImmediatePropagation();
    setChatOpen(false);
  }
}, true);

// ---------- idioma ----------
function applyChatLang() {
  $("chatBtn").title = `${t("chat_title")} (Ctrl+I)`;
  $("chatBtn").setAttribute("aria-label", t("chat_title"));
  $("chatPanel").setAttribute("aria-label", t("chat_title"));
  $("chatTitle").textContent = t("chat_title");
  $("chatClear").textContent = t("chat_clear");
  $("chatClose").title = t("t_close");
  $("chatSend").title = t("btn_send");
  $("chatInput").placeholder = t("ph_chat");
  renderChatSuggestions();
  renderChatLog();
}
