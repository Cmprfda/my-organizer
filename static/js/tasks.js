// My Organizer — vista do Excel: leitura, tabela e editores

// índices das colunas do tracker nesta folha (-1 = a coluna não existe)
function compactIdx(data) {
  const h = (data.headers || []).map(norm);
  const col = name => h.findIndex(x => x === norm(name));
  return {
    fn: col("Function/TC"),
    todo: col("To Do"),
    authorTC: col("Author TC"), reviewerTC: col("Reviewer TC"), statusTC: col("Status TC"),
    authorTP: col("Author TP"), reviewerTP: col("Reviewer TP"), statusTP: col("Status TP"),
    obs: col("OBS"),
  };
}

// Esta folha tem mesmo as colunas do tracker? Só nesse caso a vista resumida
// normal (editável) existe — as outras folhas dependem do mapa de colunas
// escolhido nas Definições (ver buildCustomCompact).
function hasCanonicalCompact(data) {
  if (!data || data.error || !(data.headers || []).length) return false;
  const idx = compactIdx(data);
  return idx.fn >= 0 && idx.authorTC >= 0 && idx.statusTC >= 0;
}

/* Constrói a vista resumida a partir das colunas do tracker:
   TCs/Funções · Papel (Autor/Reviewer de TC/TP) · Estado · O que fazer */
function buildCompact(data) {
  if (!hasCanonicalCompact(data)) return null;
  const idx = compactIdx(data);

  const me = norm(PERSON);
  const meTokens = me.split(" ").filter(t => t.length >= 4);
  const val = (row, i) => (i >= 0 && row[i]) ? String(row[i]).trim() : "";
  // aceita "Carlos Andrade" mas também só "Carlos"/"Andrade" (nomes inconsistentes na folha)
  const isMe = (row, i) => {
    const c = norm(val(row, i));
    return c.includes(me) || meTokens.includes(c);
  };

  // uma vertente (TC/TP) só conta se o estado dela for real:
  // "N/A" ou vazio significa que não é suposto ser feita
  const applicable = s => { const t = norm(s); return t !== "" && t !== "n/a"; };

  // quem está na linha (autor/reviewer de cada vertente), para as linhas que
  // não são minhas: sem isto ficava só "Mencionado", sem dizer de quem é
  // (os nomes vêm do row_meta; a célula da linha serve de reserva, porque uma
  // coluna toda vazia é retirada da resposta e deixa de ter índice aqui)
  const peopleOf = (meta, row) => {
    const p = (meta && meta.people) || {};
    const quem = (k, i) => String(p[k] || val(row, i) || "").trim();
    return [
      [t("role_author_tc"), quem("author_tc", idx.authorTC)],
      [t("role_reviewer_tc"), quem("reviewer_tc", idx.reviewerTC)],
      [t("role_author_tp"), quem("author_tp", idx.authorTP)],
      [t("role_reviewer_tp"), quem("reviewer_tp", idx.reviewerTP)],
      // "N/A" na coluna do autor/reviewer quer dizer "ninguém", não um nome
    ].filter(([, nome]) => nome && norm(nome) !== "n/a");
  };

  const rows = data.rows.map((row, ri) => {
    // elementos 4+ não são colunas visíveis: side (filtros), meta e
    // colunas de cada linha de estado (edição de estados)
    const meta = (data.row_meta || [])[ri] || null;
    const okTC = applicable(val(row, idx.statusTC));
    const okTP = applicable(val(row, idx.statusTP));
    const rolesTC = [];
    if (okTC && isMe(row, idx.authorTC)) rolesTC.push(t("role_author"));
    if (okTC && isMe(row, idx.reviewerTC)) rolesTC.push(t("role_reviewer"));
    const rolesTP = [];
    if (okTP && isMe(row, idx.authorTP)) rolesTP.push(t("role_author"));
    if (okTP && isMe(row, idx.reviewerTP)) rolesTP.push(t("role_reviewer"));

    const parts = [];
    for (const role of [t("role_author"), t("role_reviewer")]) {
      const scopes = [];
      if (rolesTC.includes(role)) scopes.push("TC");
      if (rolesTP.includes(role)) scopes.push("TP");
      if (scopes.length) parts.push(`${role} ${scopes.join("+")}`);
    }
    let papel = parts.join(", ");
    // chave de papel usada pelos filtros/contadores (elemento 9): continua a
    // ser "Autor"/"Reviewer"/"Mencionado" mesmo quando a coluna passa a mostrar
    // nomes de outras pessoas, para os botões do resumo não mudarem de sentido
    let roleKey = papel;
    const sTC = val(row, idx.statusTC), sTP = val(row, idx.statusTP);
    if (!parts.length) {
      const soVertentesNA = [idx.authorTC, idx.reviewerTC, idx.authorTP, idx.reviewerTP]
        .some(i => isMe(row, i));
      // nada é suposto ser feito nesta tarefa (só me toca em vertentes N/A) —
      // em "Ver tudo" a linha fica na mesma, senão a vista escondia linhas
      if (soVertentesNA && !showAll) return null;
      // nomes/"sem responsável" só em "Ver tudo" — na vista pessoal mantém-se
      // "Mencionado" como sempre foi, para não mudar o que já lá estava
      if (showAll) {
        const quem = peopleOf(meta, row);
        if (quem.length) papel = quem.map(([r, nome]) => `${r}: ${nome}`).join("\n");
        // ninguém atribuído numa linha que é mesmo para fazer: é preciso saber-se
        else if (applicable(sTC) || applicable(sTP)) papel = t("role_unassigned");
        else papel = t("role_mentioned");
        roleKey = papel === t("role_unassigned") ? t("role_unassigned") : t("role_mentioned");
      } else {
        papel = t("role_mentioned");
        roleKey = t("role_mentioned");
      }
    }

    const lines = [], linesCols = [];
    if (rolesTC.length && sTC && norm(sTC) !== "n/a") { lines.push("TC: " + sTC); linesCols.push("Status TC"); }
    if (rolesTP.length && sTP && norm(sTP) !== "n/a") { lines.push("TP: " + sTP); linesCols.push("Status TP"); }
    // linha que não é minha: mostra as vertentes que existem mesmo
    if (!lines.length && !parts.length) {
      if (applicable(sTC)) { lines.push("TC: " + sTC); linesCols.push("Status TC"); }
      if (applicable(sTP)) { lines.push("TP: " + sTP); linesCols.push("Status TP"); }
    }
    if (!lines.length && sTC) { lines.push(sTC); linesCols.push("Status TC"); }
    const estado = lines.length === 1 ? lines[0].replace(/^TC: |^TP: /, "") : lines.join("\n");

    const sides = [];
    if (rolesTC.length) sides.push(sideOf(rolesTC[0], sTC));
    if (rolesTP.length) sides.push(sideOf(rolesTP[0], sTP));
    const side = sides.includes("On my side") ? "On my side"
      : sides.includes("On the other side") ? "On the other side"
        : sides.includes("Done") ? "Done"
          // só vertentes removidas: a linha não conta para nenhum dos lados
          : sides.includes("Removed") ? null
            : "On the other side";

    let resumo = val(row, idx.todo);
    // valor cru da coluna "To Do" (antes do resumo gerado e antes de lhe ser
    // colada a OBS): é este que o editor grava, para nunca escrever na folha
    // o texto que a app gerou sozinha
    const rawTodo = resumo;
    if (!resumo) {
      // linhas de review costumam ter o "To Do" vazio — gera um resumo a partir do papel
      const gen = [];
      if (rolesTC.includes(t("role_reviewer"))) gen.push(`${t("review_tc")} ${val(row, idx.authorTC) || "?"}`);
      if (rolesTP.includes(t("role_reviewer"))) gen.push(`${t("review_tp")} ${val(row, idx.authorTP) || "?"}`);
      resumo = gen.join("\n") || "—";
    }
    const obs = val(row, idx.obs);
    if (obs) resumo += "\u001F" + obs;   // separador interno para formatar a OBS à parte

    const execDisplay = execSummary(meta);
    return [val(row, idx.fn), papel, estado, resumo, execDisplay, side, meta, linesCols, rawTodo, roleKey];
  }).filter(Boolean);

  return { headers: compactHeaders(), rows };
}

// resumo de texto da nota de execução (etiqueta + checklist + nota)
function execSummary(meta) {
  const n = meta && meta.note;
  if (!n) return "";
  const feitos = n.checks
    ? CHECKS.filter(([k]) => n.checks[k]).map(([, , s]) => s).join(" ")
    : "";
  return [n.tag, feitos, n.note].filter(Boolean).join("\n");
}

const compactHeaders = () =>
  [t("hdr_fn"), t("hdr_role"), t("hdr_status"), t("hdr_todo"), t("hdr_exec")];

/* ---------- vista resumida à medida (qualquer folha, só leitura) ----------
   Para folhas sem as colunas do tracker, o utilizador escolhe nas Definições
   que coluna alimenta cada campo da vista resumida. Como as colunas não são as
   do tracker, nada aqui se edita nem se escreve no Excel: as células saem como
   texto simples, sem os editores da vista resumida normal. */
const VIEWMAP_PREFIX = "bsp-tracker-viewmap";
// campos da vista resumida que se podem mapear: [chave, chave i18n do rótulo]
const VIEWMAP_SLOTS = [
  ["fn", "viewmap_fn"], ["author", "viewmap_author"], ["reviewer", "viewmap_reviewer"],
  ["status", "viewmap_status"], ["todo", "viewmap_todo"],
];

function viewMapKey(data) {
  return `${VIEWMAP_PREFIX}:${(data && data.file) || ""}:${(data && data.sheet) || ""}`;
}

function loadViewMap(data) {
  if (!data || !data.sheet) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(viewMapKey(data)) || "null");
    return raw && typeof raw === "object" ? raw : null;
  } catch (e) {
    return null;
  }
}

function saveViewMap(data, map) {
  if (!data || !data.sheet) return;
  const limpo = {};
  Object.entries(map || {}).forEach(([k, v]) => { if (v) limpo[k] = v; });
  if (Object.keys(limpo).length) localStorage.setItem(viewMapKey(data), JSON.stringify(limpo));
  else localStorage.removeItem(viewMapKey(data));
}

function buildCustomCompact(data) {
  if (!data || data.error || !(data.headers || []).length) return null;
  if (hasCanonicalCompact(data)) return null;   // a folha do tracker tem vista própria
  const map = loadViewMap(data);
  if (!map) return null;
  const h = data.headers.map(norm);
  const col = name => (name ? h.findIndex(x => x === norm(name)) : -1);
  const idx = {
    fn: col(map.fn), author: col(map.author), reviewer: col(map.reviewer),
    status: col(map.status), todo: col(map.todo),
  };
  // nenhuma das colunas escolhidas existe nesta folha (mudou de aba ou de livro)
  if (!Object.values(idx).some(i => i >= 0)) return null;

  const cel = (row, i) => (i >= 0 && row[i]) ? String(row[i]).trim() : "";
  const rows = data.rows.map((row, ri) => {
    const meta = (data.row_meta || [])[ri] || null;
    const quem = [[t("role_author"), cel(row, idx.author)], [t("role_reviewer"), cel(row, idx.reviewer)]]
      .filter(([, nome]) => nome);
    // side/linesCols/rawTodo/roleKey ficam vazios: sem os papéis e os estados do
    // tracker não há "lado" nem coluna do Excel para onde escrever
    return [cel(row, idx.fn), quem.map(([r, nome]) => `${r}: ${nome}`).join("\n"),
      cel(row, idx.status), cel(row, idx.todo), "", null, meta, [], "", ""];
  });

  return { headers: compactHeaders(), rows, readonly: true };
}

let lastSelectorsSig = "";

// localiza a meta de uma linha do Excel pelo nº da linha real na folha —
// ao contrário de currentMeta (só as linhas atualmente filtradas na vista do
// Excel), isto funciona a partir de qualquer vista (ex.: o painel da tarefa
// dentro de um TODO). Usa-se o xlrow (não função+"to do") porque há linhas
// com a mesma função e "to do" em branco — só o nº de linha é mesmo único.
function metaByRow(xlrow) {
  const list = (lastData && lastData.row_meta) || [];
  return list.find(m => m && String(m.xlrow) === String(xlrow)) || null;
}

// depois de cancelar/fechar um editor aberto a partir de QUALQUER vista (a
// mesma célula pode ter sido clonada para o TODO ou para a caixa de detalhe),
// as duas têm de ser refeitas — cada uma já trata sozinha de repor a caixa
function refreshTaskViews() {
  render();
  if (currentView === "todo") renderTodo();
}

function badgeHtml(text, col, meta) {
  const editable = meta && (col === "Status TC" || col === "Status TP");
  const local = !!(meta && meta.over && meta.over[col]);
  const title = local ? t("t_local") : t("t_edit_status");
  return `<span class="badge ${statusClass(text)}${local ? " local" : ""}"` +
    (editable ? ` data-xlrow="${esc(meta.xlrow)}" data-col="${esc(col)}" title="${title}"` : "") +
    `>${esc(text)}${local ? " ✎" : ""}</span>`;
}

// a OBS do Excel é editável: escrever aqui fica como alteração local (✎) e
// só chega à folha no Push, tal como os estados. O valor atual (já com
// qualquer alteração local aplicada) vem em data-obscur — meta.over só guarda
// um booleano (há alteração ou não), não o texto, por isso não chega aqui.
function obsHtml(obs, meta) {
  const editable = !!(meta && lastData && (lastData.xlcols || {})["OBS"]);
  const local = !!(meta && meta.over && meta.over["OBS"]);
  const attrs = editable
    ? ` data-obsxlrow="${esc(meta.xlrow)}" data-obscur="${esc(obs || "")}" title="${t("t_edit_obs")}"`
    : "";
  if (!obs) return editable ? `<span class="obs addnote"${attrs}>${t("addobs")}</span>` : "";
  return `<span class="obs${local ? " local" : ""}"${attrs}>${t("obs_prefix")} ${esc(obs)}${local ? " ✎" : ""}</span>`;
}

// O Function/TC também é editável: fica alteração local (✎) até ao Push.
// data-fncur leva o valor atual (já com qualquer alteração local aplicada),
// porque meta.orig guarda sempre o valor da folha — sem isto, reabrir o editor
// antes do Push mostrava o valor antigo em vez do que se acabou de escrever.
function fnHtml(fn, meta) {
  const editable = !!(meta && lastData && (lastData.xlcols || {})["Function/TC"]);
  const local = !!(meta && meta.over && meta.over["Function/TC"]);
  const attrs = editable
    ? ` data-fnxlrow="${esc(meta.xlrow)}" data-fncur="${esc(fn || "")}" title="${local ? t("t_local") : t("t_edit_fn")}"`
    : "";
  return `<span class="fnText${local ? " local" : ""}"${attrs}>${esc(fn)}${local ? " ✎" : ""}</span>`;
}

// O "To Do" também é editável, tal como a OBS — grava como alteração local e
// só chega à folha no Push. rawTodo é o valor real da coluna (sem o resumo
// gerado quando a célula está vazia), para o editor nunca gravar texto gerado.
function todoTextHtml(display, rawTodo, meta) {
  const editable = !!(meta && lastData && (lastData.xlcols || {})["To Do"]);
  const local = !!(meta && meta.over && meta.over["To Do"]);
  const attrs = editable
    ? ` data-todoxlrow="${esc(meta.xlrow)}" data-todocur="${esc(rawTodo || "")}" title="${local ? t("t_local") : t("t_edit_todo")}"`
    : "";
  return `<span class="todoText${local ? " local" : ""}"${attrs}>${esc(display)}${local ? " ✎" : ""}</span>`;
}

// conteúdo da célula de execução (etiqueta, checklist e nota)
function execCellHtml(meta) {
  const n = meta && meta.note;
  let inner = "";
  if (n && n.tag) inner += `<span class="badge ${tagClass(n.tag)}">${esc(tagDisplay(n.tag))}</span>`;
  if (n && n.checks && Object.values(n.checks).some(Boolean)) {
    inner += `<span class="chips">` + CHECKS.map(([k, label, short]) =>
      `<span class="chip${n.checks[k] ? " done" : ""}" title="${esc(t(label))}">${esc(short)}${n.checks[k] ? " ✓" : ""}</span>`
    ).join("") + `</span>`;
  }
  if (n && n.note) inner += `<span class="obs">${esc(n.note)}</span>`;
  if (!inner) inner = `<span class="addnote">${t("addnote")}</span>`;
  // não escapar aqui: quem chama já faz esc(title) ao inserir no atributo —
  // escapar também aqui duplicaria entidades (& -> &amp;amp;)
  const title = (n && n.updated ? `${t("t_updated")} ${n.updated} — ` : "") + t("t_edit_note");
  return { inner, title };
}

function populateSelectors(data) {
  const files = data.files || [];
  const sheets = data.sheets || [];
  // com a fonte web (ou a cópia sincronizada dela) não há ficheiro local a escolher
  const web = data.source === "onedrive" || data.synced_copy;
  // servidor antigo (sem listas): esconde os seletores em vez de os mostrar vazios
  $("fileSelect").parentElement.classList.toggle("hidden", web || !files.length);
  $("sheetSelect").parentElement.classList.toggle("hidden", !sheets.length);
  // fonte web: o nome do livro em uso fica ao lado da aba (clicar troca de livro)
  const livro = web ? (graphInfo.book || (files[0] || {}).label || "") : "";
  $("bookField").classList.toggle("hidden", !livro);
  if (livro) {
    $("bookQuick").textContent = livro;
    $("bookQuick").title = graphInfo.book_path ? `${graphInfo.book_path} — ${t("t_book_quick")}` : t("t_book_quick");
  }

  // só reconstrói quando algo mudou — senão a atualização automática
  // fechava um dropdown aberto
  const sig = JSON.stringify([files, sheets, data.file || FILE, data.sheet || SHEET]);
  if (sig === lastSelectorsSig) return;
  lastSelectorsSig = sig;

  const chosen = data.file || FILE;
  $("fileSelect").innerHTML =
    `<option value="">${t("newest")}</option>` +
    files.map(f =>
      `<option value="${esc(f.path)}"${f.path === chosen ? " selected" : ""} title="${esc(f.path)}">${esc(f.label)}${f.modified ? " \u2014 " + esc(f.modified) : ""}</option>`
    ).join("");

  const current = data.sheet || SHEET;
  $("sheetSelect").innerHTML =
    sheets.map(s => `<option${s === current ? " selected" : ""}>${esc(s)}</option>`).join("");
}

// --- pesquisa com vários termos ---
// Termos ativos = os fixados (Enter) mais o que está a ser escrito na caixa.
function activeSearchTerms() {
  const terms = searchTerms.map(norm).filter(Boolean);
  const live = norm($("search").value);
  if (live && !terms.includes(live)) terms.push(live);
  return terms;
}

// texto legível dos termos ativos, para as mensagens de "sem resultados"
function searchLabel() {
  const sep = ` ${t(searchMode === "and" ? "search_and" : "search_or")} `;
  return searchTerms.concat([$("search").value.trim()]).filter(Boolean).join(sep);
}

function pinSearchTerm() {
  const termo = $("search").value.trim();
  if (!termo) return;
  const dup = searchTerms.some(s => norm(s) === norm(termo));
  if (dup) toast(t("search_dup"), "err");
  else searchTerms.push(termo);
  $("search").value = "";
  render();
}

function renderSearchChips() {
  const box = $("searchChips"), btn = $("searchMode");
  box.innerHTML = searchTerms.map((s, i) =>
    `<span class="chip" data-i="${i}" title="${t("t_chip_del")}">${esc(s)}<b>×</b></span>`).join("");
  box.classList.toggle("hidden", !searchTerms.length);
  btn.classList.toggle("hidden", !searchTerms.length);
  btn.textContent = t(searchMode === "and" ? "search_and" : "search_or");
  btn.title = t(searchMode === "and" ? "t_search_and" : "t_search_or");
}

// A versão vive num canto fixo da página (canto inferior direito), fora da
// barra de informação — assim está sempre à vista, seja qual for a vista.
function renderVersionBadge(data) {
  const el = $("verBadge");
  const v = data && data.app_version;
  el.classList.toggle("hidden", !v);
  if (!v) return;
  el.innerHTML = (data.mode === "dev" ? `<span class="devbadge">DEV</span> ` : "") +
    `csw.ai.os ${esc(v)}`;
}

function render() {
  if (editorOpen) return;  // não destruir um editor de nota/estado a meio
  const data = lastData;
  const box = $("stateBox"), tbl = $("tablebox");
  $("summary").innerHTML = "";
  renderSearchChips();

  if (!data) return;
  populateSelectors(data);
  renderVersionBadge(data);
  renderViewMap(data);
  // instância de desenvolvimento: marcar bem, para não se confundir com a estável
  if (data.mode === "dev" && !document.body.classList.contains("devmode")) {
    document.body.classList.add("devmode");
    document.title = "DEV — My Organizer";
    document.querySelector("header h1").textContent = "My Organizer (DEV)";
  }

  // com alterações locais pendentes, o "Atualizar" passa a "Push"
  // (fica antes do ramo de erro: o Push funciona mesmo com o ficheiro bloqueado)
  const web = data.source === "onedrive";
  // fonte web: não há ficheiro local para descarregar nem Excel para fechar
  $("fetchBtn").classList.toggle("hidden", web);
  const pending = data.pending || 0;
  const pushLabel = pending ? `${t("btn_push")} (${pending})` : t("btn_refresh");
  $("refresh").textContent = pushLabel;
  $("reloadOnly").classList.toggle("hidden", !pending);
  $("clearLocals").classList.toggle("hidden", !pending);
  // o mesmo botão na página Por fazer, para não ser preciso voltar às Tarefas
  // só para enviar (só aparece quando há mesmo algo por enviar)
  $("refreshTodo").textContent = pushLabel;
  $("refreshTodo").title = t("t_push_todo");
  $("refreshTodo").classList.toggle("hidden", !pending);

  if (data.error) {
    tbl.classList.add("hidden");
    $("taskMode").classList.add("hidden");
    box.classList.remove("hidden");
    let html = `<h2>${esc(data.error)}</h2>`;
    if (data.hint) html += `<p>${esc(data.hint)}</p>`;
    if (!web && /Erro ao ler o ficheiro|Error reading the file/.test(data.error))
      html += `<p><button class="mini" id="cycleNow" style="margin-left:0">${t("btn_cycle")}</button></p>`;
    if (data.searched) html += `<p>${t("searched")}</p><ul>` +
      data.searched.map(p => `<li><code>${esc(p)}</code></li>`).join("") + `</ul>`;
    if (data.sheets && data.sheets.length) html += `<p>${t("sheets_avail")}</p><ul>` +
      data.sheets.map(s => `<li>${esc(s)}</li>`).join("") + `</ul>`;
    box.innerHTML = html;
    $("fileInfo").textContent = data.file ? `${t("info_file")}: ${data.file}` : "";
    refreshItemBox();
    return;
  }

  $("sheetName").textContent = data.sheet;
  $("personName").textContent = PERSON;
  $("fileInfo").innerHTML =
    (data.mode === "dev" ? `<span class="devbadge">DEV</span> ` : "") +
    `${t("info_file")}: <code${data.synced_copy ? ` title="${esc(data.file)} \u2014 ${esc(t("t_synced_copy"))}"` : ""}>${esc(data.source === "onedrive" || data.synced_copy ? (graphInfo.book || t("source_web")) : data.file)}</code> · ${t("info_mod")}: <strong>${esc(data.modified)}</strong>` +
    (data.lan_url ? ` · ${t("info_phone")} <a href="${esc(data.lan_url)}"><code>${esc(data.lan_url)}</code></a>` : "") +
    (data.warning ? `<br><span class="warn">⚠ ${esc(data.warning)}</span>` +
      (web ? "" : ` <button class="mini" id="cycleNow">${t("btn_cycle")}</button>`) : "") +
    (data.notice ? `<br><span class="notice">ℹ ${esc(data.notice)}</span>` : "");

  // vista resumida do tracker ou, para outras folhas, a que o utilizador
  // mapeou nas Definições (só leitura)
  const compact = buildCompact(data) || buildCustomCompact(data);
  $("viewToggle").classList.toggle("hidden", !compact);
  const useCompact = compact && compactView;
  // vista mapeada à medida: nada aqui se escreve no Excel
  const readOnlyRows = !!(useCompact && compact.readonly);
  // lista/caixas vale para as duas vistas (resumida e completa)
  $("taskMode").classList.remove("hidden");
  const headers = useCompact ? compact.headers : data.headers;
  const allRows = useCompact ? compact.rows : data.rows;

  const query = activeSearchTerms();
  const searched = query.length
    ? allRows.filter(r => {
      const cells = r.slice(0, headers.length);
      const hit = term => cells.some(c => norm(c).includes(term));
      return searchMode === "and" ? query.every(hit) : query.some(hit);
    })
    : allRows;

  // resumo: contagens calculadas antes do filtro de estado, para os botões não desaparecerem
  const statusIdx = headers.findIndex(isStatusHeader);
  // a coluna do papel pode mostrar nomes de outras pessoas; quem manda nos
  // filtros/contadores é a chave de papel (elemento 9), que continua a ser
  // "Autor"/"Reviewer"/"Mencionado"/"Sem responsável"
  const roleIdx = useCompact ? 9 : -1;
  const exactRoles = [t("role_mentioned"), t("role_unassigned")];
  const roleMatches = papel =>
    [...roleFilters].some(f => exactRoles.includes(f) ? papel === f : String(papel).includes(f));
  const sideIdx = useCompact ? 5 : -1;
  const roleActive = roleFilters.size && roleIdx >= 0;
  const sideActive = sideFilters.size && sideIdx >= 0;
  let rows = roleActive ? searched.filter(r => roleMatches(r[roleIdx])) : searched;
  if (sideActive)
    rows = rows.filter(r => sideFilters.has(r[sideIdx]));
  if (statusFilters.size && statusIdx >= 0 && !useCompact)
    rows = rows.filter(r => statusLines(r[statusIdx]).some(s => statusFilters.has(s)));

  // bases facetadas: cada grupo de botões é contado com os filtros dos OUTROS
  // grupos aplicados (mas não os do próprio), para os números refletirem a seleção
  const baseForRole = sideActive ? searched.filter(r => sideFilters.has(r[sideIdx])) : searched;
  const baseForSide = roleActive ? searched.filter(r => roleMatches(r[roleIdx])) : searched;

  let summaryHtml = `<span class="pill">${rows.length} ${rows.length === 1 ? t("tasks_one") : t("tasks_many")}` +
    (showAll ? ` ${t("of_all")}` : ` ${t("of_person")} ${esc(PERSON)}`) + `</span>`;
  const pillClasses = (extra, active, n) =>
    `pill${extra ? " " + extra : ""}${active ? " active" : ""}${!active && n === 0 ? " zero" : ""}`;

  if (roleIdx >= 0 && searched.length) {
    const countRoles = arr => {
      const c = {
        [t("role_author")]: 0, [t("role_reviewer")]: 0,
        [t("role_mentioned")]: 0, [t("role_unassigned")]: 0,
      };
      arr.forEach(r => {
        const p = String(r[roleIdx] === undefined ? "" : r[roleIdx]);
        if (p === t("role_unassigned")) { c[t("role_unassigned")]++; return; }
        if (p.includes(t("role_author"))) c[t("role_author")]++;
        if (p.includes(t("role_reviewer"))) c[t("role_reviewer")]++;
        if (p === t("role_mentioned")) c[t("role_mentioned")]++;
      });
      return c;
    };
    const avail = countRoles(searched), fac = countRoles(baseForRole);
    summaryHtml += Object.keys(avail).filter(k => avail[k] > 0).map(k =>
      `<span class="${pillClasses("", roleFilters.has(k), fac[k])}" data-role="${k}">${k}: ${fac[k]}</span>`
    ).join("");
  }
  if (useCompact && searched.length) {
    const countSides = arr => {
      const c = {};
      arr.forEach(r => { c[r[sideIdx]] = (c[r[sideIdx]] || 0) + 1; });
      return c;
    };
    const avail = countSides(searched), fac = countSides(baseForSide);
    const sideLabel = { "On my side": t("side_my"), "On the other side": t("side_other"), "Done": t("side_done") };
    summaryHtml += SIDES.filter(s => avail[s]).map(s =>
      `<span class="${pillClasses(SIDE_CLASS[s], sideFilters.has(s), fac[s] || 0)}" data-side="${esc(s)}">${esc(sideLabel[s] || s)}: ${fac[s] || 0}</span>`
    ).join("");
  } else if (statusIdx >= 0 && searched.length) {
    const counts = {};
    searched.forEach(r => {
      // linhas sem estado não geram botão (não haveria nada para mostrar)
      statusLines(r[statusIdx]).forEach(s => { counts[s] = (counts[s] || 0) + 1; });
    });
    summaryHtml += Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) =>
        `<span class="pill${statusFilters.has(s) ? " active" : ""}" data-status="${esc(s)}">${esc(s)}: ${n}</span>`
      ).join("");
  }
  $("summary").innerHTML = summaryHtml;

  if (!rows.length) {
    tbl.classList.add("hidden");
    box.classList.remove("hidden");
    box.innerHTML = (statusFilters.size || sideFilters.size || roleFilters.size)
      ? `<h2>${t("none_filter")}.</h2><p>${t("none_hint")}</p>`
      : query.length
        ? `<h2>${t("none_search")} "${esc(searchLabel())}".</h2>`
        : `<h2>${t("none_person")} ${esc(PERSON)}.</h2>
     <p>${t("rows_hint_1")} ${data.total_rows} ${t("rows_hint_2")}</p>`;
    refreshItemBox();
    return;
  }

  box.classList.add("hidden");
  tbl.classList.remove("hidden");
  const _narrow = window.innerWidth <= 720;
  tbl.classList.toggle("cards", taskLayout === "cards" || _narrow);
  $("thead").innerHTML = "<tr>" + headers.map(h => `<th>${esc(h)}</th>`).join("") + `<th class="todoActionCell">${esc(t("hdr_action"))}</th></tr>`;
  currentMeta = rows.map(r =>
    useCompact ? (r[6] || null) : ((data.row_meta || [])[data.rows.indexOf(r)] || null));
  currentObs = rows.map(r =>
    useCompact ? (String(r[3] === undefined ? "" : r[3]).split("\u001F")[1] || "") : "");
  currentStatuses = data.statuses || [];

  function statusCell(r, ri, i) {
    const meta = currentMeta[ri];
    // vista mapeada à medida: distintivos sem edição (não há coluna do tracker
    // para onde escrever o estado)
    if (readOnlyRows) return statusBadges(r[2] || "");
    if (useCompact) {
      const lines = String(r[2]).split("\n").filter(l => l.trim());
      const cols = r[7] || [];
      return lines.map((l, k) => badgeHtml(l, cols[k], meta)).join("<br>");
    }
    const c = r[i] ? String(r[i]) : "";
    return c ? badgeHtml(c, headers[i], meta) : "";
  }

  // "O que fazer" + OBS da linha (a OBS vem colada ao resumo pelo separador \u001F)
  function todoObsHtml(r, ri) {
    const [todo, obs] = String(r[3] === undefined ? "" : r[3]).split("\u001F");
    const rawTodo = r[8] || "";
    return `${todoTextHtml(todo, rawTodo, currentMeta[ri])}${obsHtml(obs || "", currentMeta[ri])}`;
  }

  // o botão "+ TODO" só existe enquanto a linha não estiver na TODO list
  function todoAddBtn(r, ri) {
    const title = String(r[0] === undefined ? "" : r[0]).split("\n")[0].trim();
    const meta = currentMeta[ri] || {};
    const ref = { sheet: data.sheet || "", fn: meta.fn || title, todo: meta.todo || "" };
    return todoHas("task", title, ref) ? ""
      : `<button type="button" class="todoActionBtn" data-todoadd="${ri}" title="${t("todo_add_click")}">${t("btn_add_todo")}</button>`;
  }

  $("tbody").innerHTML = rows.map((r, ri) =>
    `<tr draggable="true" title="${t("t_drag")}">` + headers.map((_, i) => {
      const cell = (() => {
        const c = r[i] !== undefined ? r[i] : "";
        if (useCompact ? i === 2 : isStatusHeader(headers[i]))
          return `<td>${statusCell(r, ri, i)}</td>`;
        // vista mapeada à medida: texto simples, sem nada em que se possa clicar
        // para editar (esta vista nunca escreve no Excel)
        if (readOnlyRows) return `<td${i === 0 ? ' class="fn"' : (i === 1 ? ' class="role"' : "")}>${esc(c)}</td>`;
        if (useCompact && i === 0) {
          const m = currentMeta[ri] || {};
          const linked = notesForTask(m.fn || c, m.todo || "");
          const flag = linked.length
            ? `<button type="button" class="taskNoteFlag" data-tasklink-fn="${esc(m.fn || c)}" data-tasklink-todo="${esc(m.todo || "")}" title="${esc(t("t_open_linked_note"))}">📌</button>`
            : "";
          return `<td class="fn">${fnHtml(c, m)}${flag}</td>`;
        }
        if (useCompact && i === 1) {
          // ninguém atribuído: a célula fica marcada, para saltar à vista
          const semDono = r[9] === t("role_unassigned");
          return `<td class="role${semDono ? " unassigned" : ""}"` +
            `${semDono ? ` title="${esc(t("t_unassigned"))}"` : ""}>${esc(c)}</td>`;
        }
        if (useCompact && i === 4) {
          const m = currentMeta[ri] || {};
          const { inner, title } = execCellHtml(m);
          return `<td class="execCell" data-xlrow="${esc(m.xlrow || "")}" title="${esc(title)}">${inner}</td>`;
        }
        if (useCompact && i === 3) {
          return `<td>${todoObsHtml(r, ri)}</td>`;
        }
        return `<td>${esc(c)}</td>`;
      })();
      // em ecrãs estreitos a tabela vira cartões: cada célula mostra o seu cabeçalho
      return cell.replace("<td", `<td data-label="${esc(headers[i])}"`);
    }).join("") + `<td class="todoActionCell">${todoAddBtn(r, ri)}</td></tr>`
  ).join("");
  refreshItemBox();
}

// Há algum livro do Excel para mostrar? Livro escolhido no OneDrive ou pelo
// menos um ficheiro encontrado no disco. Todas as respostas do /api/tasks
// trazem `graph` e `files`, mesmo as de erro.
function hasWorkbookConfigured() {
  return !!(lastData && ((lastData.graph && lastData.graph.has_book) ||
    (lastData.files && lastData.files.length > 0)));
}

async function load(cycle = false, fresh = false) {
  // com a fonte web não há Excel local para fechar: nem pedimos o ciclo nem
  // avisamos que o ficheiro pode fechar
  if (lastData && lastData.source === "onedrive") cycle = false;
  // com um editor aberto a leitura é silenciosa: o render fica à espera e a
  // barra de informação não pode ficar presa no "A carregar…"
  if (!editorOpen) $("fileInfo").textContent = cycle ? t("loading_cycle") : t("loading");
  try {
    const res = await fetch(`/api/tasks?person=${encodeURIComponent(PERSON)}&all=${showAll ? 1 : 0}` +
      `&sheet=${encodeURIComponent(SHEET)}&file=${encodeURIComponent(FILE)}&cycle=${cycle ? 1 : 0}` +
      `&fresh=${fresh ? 1 : 0}&lang=${LANG}&source=${SOURCE}`);
    lastData = await res.json();
  } catch (e) {
    lastData = { error: t("err_server") };
  }
  if (lastData && lastData.graph) {
    graphInfo = lastData.graph;
    renderGraphState();
  }
  // esta recarga já é uma prova fresca do estado da ligação — o sinal do
  // pedido de 20/20s (ver checkForChanges) fica desatualizado
  liveOffline = false;
  renderConnBadge();
  updateExcelTabVisibility();
  // os todos são atualizados primeiro: as CCRs precisam deles para saber
  // se ainda mostram o "+ TODO"
  if (lastData && lastData.todo) {
    todos = lastData.todo;
    if (currentView === "todo" && !editorOpen) renderTodo();
  }
  if (lastData && lastData.ccrs) {
    ccrs = lastData.ccrs;
    if (currentView === "ccrs" && !editorOpen) renderCCRs();
  }
  render();
}

function tbodyTap(e) {
  const pin = e.target.closest("[data-tasklink-fn]");
  if (pin) { openTaskLinkedNote(pin.dataset.tasklinkFn, pin.dataset.tasklinkTodo); return; }
  const add = e.target.closest("[data-todoadd]");
  if (add) { e.preventDefault(); e.stopPropagation(); addTodoFromTaskRow(add); return; }
  const badge = e.target.closest(".badge[data-col]");
  if (badge) return openStatusEditor(badge);
  const obs = e.target.closest("[data-obsxlrow]");
  if (obs && !obs.dataset.editing) return openObsEditor(obs);
  const todoTxt = e.target.closest("[data-todoxlrow]");
  if (todoTxt && !todoTxt.dataset.editing) return openTodoTextEditor(todoTxt);
  const fnTxt = e.target.closest("[data-fnxlrow]");
  if (fnTxt && !fnTxt.dataset.editing) return openFnEditor(fnTxt);
  const cell = e.target.closest(".execCell");
  if (cell && !cell.dataset.editing) openNoteEditor(cell);
}
// click + pointerup: alguns browsers móveis não entregam o click delegado
$("tbody").addEventListener("click", tbodyTap);
$("tbody").addEventListener("pointerup", tbodyTap);
// os mesmos editores também servem o painel da tarefa dentro de um item do TODO
$("todoBody").addEventListener("click", tbodyTap);
$("todoBoard").addEventListener("click", tbodyTap);

$("ccrBody").addEventListener("click", e => {
  const add = e.target.closest("[data-todoaddccr]");
  if (!add) return;
  e.preventDefault();
  e.stopPropagation();
  addTodoFromCcr(add.dataset.todoaddccr);
});

function openNoteEditor(cell) {
  const meta = metaByRow(cell.dataset.xlrow);
  if (!meta) { clientLog(`nota: célula sem metadados (linha ${cell.dataset.xlrow})`); return; }
  clientLog(`nota: editor aberto (${meta.fn})`);
  cell.dataset.editing = "1";
  editorOpen = true;
  const n = meta.note || { tag: "", note: "" };
  const opts = ["", ...EXEC_TAGS];
  if (n.tag && !opts.includes(n.tag)) opts.push(n.tag);
  const checks = n.checks || {};
  cell.innerHTML =
    `<select class="statusEdit noteTag">` +
    opts.map(o => `<option value="${esc(o)}"${o === n.tag ? " selected" : ""}>${o ? esc(tagDisplay(o)) : t("opt_notag")}</option>`).join("") +
    `</select>
 <div class="chkList">` +
    CHECKS.map(([k, label]) =>
      `<label class="chk"><input type="checkbox" data-k="${k}"${checks[k] ? " checked" : ""}> ${esc(t(label))}</label>`
    ).join("") +
    `</div>
 <textarea class="noteText" rows="3" placeholder="${t("ph_note")}">${esc(n.note || "")}</textarea>
 ` + editActions();
  cell.querySelector(".actSave").addEventListener("click", async e => {
    e.stopPropagation();
    editorOpen = false;
    clientLog(`nota: a guardar (${meta.fn})`);
    try {
      await fetch("/api/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheet: lastData.sheet, fn: meta.fn, todo: meta.todo,
          tag: cell.querySelector(".noteTag").value,
          note: cell.querySelector(".noteText").value,
          checks: Object.fromEntries(
            [...cell.querySelectorAll("input[type=checkbox]")].map(cb => [cb.dataset.k, cb.checked])),
        }),
      });
    } catch (err) {
      alert("Não foi possível gravar a nota: " + err);
    }
    load();
  });
  cell.querySelector(".actCancel").addEventListener("click", e => {
    e.stopPropagation();
    editorOpen = false;
    refreshTaskViews();
  });
  cell.querySelector(".actClear").addEventListener("click", async e => {
    e.stopPropagation();
    editorOpen = false;
    try {
      await fetch("/api/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheet: lastData.sheet, fn: meta.fn, todo: meta.todo,
          tag: "", note: "", checks: {}
        }),
      });
    } catch (err) {
      alert("Não foi possível limpar a nota: " + err);
    }
    load();
  });
}

// Editor da OBS: grava como alteração local (✎), tal como os estados — só o
// Push é que a escreve mesmo na coluna OBS do Excel.
function openObsEditor(span) {
  const meta = metaByRow(span.dataset.obsxlrow);
  if (!meta) { clientLog(`obs: célula sem metadados (linha ${span.dataset.obsxlrow})`); return; }
  const atual = span.dataset.obscur || "";
  span.dataset.editing = "1";
  editorOpen = true;
  span.innerHTML =
    `<textarea class="noteText" rows="3" placeholder="${t("ph_obs")}">${esc(atual)}</textarea>` +
    editActions();
  const txt = span.querySelector("textarea");
  txt.focus();

  async function grava(valor) {
    editorOpen = false;
    try {
      const cols = lastData.xlcols || {};
      const res = await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheet: lastData.sheet, fn: meta.fn, todo: meta.todo,
          column: "OBS", value: valor,
          base: (meta.orig || {})["OBS"] || "",
          file: lastData.file, xlrow: meta.xlrow,
          xlcol: cols["OBS"], fncol: cols.fn,
        }),
      });
      const out = await res.json();
      if (!out.ok) alert(`${t("err_save")} ` + (out.error || "?"));
    } catch (err) {
      alert(`${t("err_save")} ` + err);
    }
    load();
  }

  span.querySelector(".actSave").addEventListener("click", e => {
    e.stopPropagation();
    grava(txt.value);
  });
  span.querySelector(".actCancel").addEventListener("click", e => {
    e.stopPropagation();
    editorOpen = false;
    refreshTaskViews();
  });
  // limpar = repor o que está na folha (deixa de haver alteração local)
  span.querySelector(".actClear").addEventListener("click", e => {
    e.stopPropagation();
    grava(meta.over && meta.over["OBS"] ? null : "");
  });
}

// Editor do "To Do": grava como alteração local (✎), tal como a OBS — só o
// Push escreve mesmo na coluna "To Do" do Excel.
function openTodoTextEditor(span) {
  const meta = metaByRow(span.dataset.todoxlrow);
  if (!meta) { clientLog(`todo: célula sem metadados (linha ${span.dataset.todoxlrow})`); return; }
  const atual = span.dataset.todocur || "";
  span.dataset.editing = "1";
  editorOpen = true;
  span.innerHTML =
    `<textarea class="noteText" rows="3" placeholder="${t("ph_todo")}">${esc(atual)}</textarea>` +
    editActions();
  const txt = span.querySelector("textarea");
  txt.focus();

  async function grava(valor) {
    editorOpen = false;
    try {
      const cols = lastData.xlcols || {};
      const res = await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheet: lastData.sheet, fn: meta.fn, todo: meta.todo,
          column: "To Do", value: valor,
          base: (meta.orig || {})["To Do"] || "",
          file: lastData.file, xlrow: meta.xlrow,
          xlcol: cols["To Do"], fncol: cols.fn,
        }),
      });
      const out = await res.json();
      if (!out.ok) alert(`${t("err_save")} ` + (out.error || "?"));
    } catch (err) {
      alert(`${t("err_save")} ` + err);
    }
    load();
  }

  span.querySelector(".actSave").addEventListener("click", e => {
    e.stopPropagation();
    grava(txt.value);
  });
  span.querySelector(".actCancel").addEventListener("click", e => {
    e.stopPropagation();
    editorOpen = false;
    refreshTaskViews();
  });
  // limpar = repor o que está na folha (deixa de haver alteração local)
  span.querySelector(".actClear").addEventListener("click", e => {
    e.stopPropagation();
    grava(meta.over && meta.over["To Do"] ? null : "");
  });
}

// Editor do "Function/TC": mesma lógica, mas campo de uma linha (é um
// identificador curto, não texto livre em várias linhas como o "To Do"/OBS).
function openFnEditor(span) {
  const meta = metaByRow(span.dataset.fnxlrow);
  if (!meta) { clientLog(`fn: célula sem metadados (linha ${span.dataset.fnxlrow})`); return; }
  const atual = span.dataset.fncur || (meta.orig || {})["Function/TC"] || "";
  span.dataset.editing = "1";
  editorOpen = true;
  span.innerHTML =
    `<input type="text" class="noteText fnEdit" value="${esc(atual)}">` +
    editActions();
  const inp = span.querySelector("input");
  inp.focus();
  inp.select();

  async function grava(valor) {
    editorOpen = false;
    try {
      const cols = lastData.xlcols || {};
      const res = await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheet: lastData.sheet, fn: meta.fn, todo: meta.todo,
          column: "Function/TC", value: valor,
          base: (meta.orig || {})["Function/TC"] || "",
          file: lastData.file, xlrow: meta.xlrow,
          xlcol: cols["Function/TC"], fncol: cols.fn,
        }),
      });
      const out = await res.json();
      if (!out.ok) alert(`${t("err_save")} ` + (out.error || "?"));
    } catch (err) {
      alert(`${t("err_save")} ` + err);
    }
    load();
  }

  span.querySelector(".actSave").addEventListener("click", e => {
    e.stopPropagation();
    grava(inp.value);
  });
  span.querySelector(".actCancel").addEventListener("click", e => {
    e.stopPropagation();
    editorOpen = false;
    refreshTaskViews();
  });
  span.querySelector(".actClear").addEventListener("click", e => {
    e.stopPropagation();
    // ao contrário da OBS/"To Do", uma célula vazia não faz sentido aqui — é a
    // identidade da linha. Sem alteração pendente, "Limpar" só fecha o editor.
    if (meta.over && meta.over["Function/TC"]) grava(null);
    else { editorOpen = false; refreshTaskViews(); }
  });
}

function openStatusEditor(badge) {
  const col = badge.dataset.col;
  const meta = metaByRow(badge.dataset.xlrow);
  if (!meta) return;
  const current = badge.innerText.replace(/^TC: |^TP: /, "").trim();
  // deixa no log o que está mesmo no ecrã para esta linha: serve para comparar
  // com o Excel quando um estado parece desatualizado
  clientLog(`estado no ecra: ${meta.fn} linha ${meta.xlrow} ${col}="${current}"` +
    `${meta.over && meta.over[col] ? " (alteracao local por enviar)" : ""}` +
    ` | livro gravado ${lastData.modified} #${lastData.digest}`);

  const opts = [...currentStatuses];
  if (current && !opts.includes(current)) opts.unshift(current);
  const sel = document.createElement("select");
  sel.className = "statusEdit";
  sel.innerHTML =
    opts.map(s => `<option value="${esc(s)}"${s === current ? " selected" : ""}>${esc(s)}</option>`).join("") +
    (meta.over && meta.over[col] ? `<option value="__clear__">${t("opt_revert")}</option>` : "");
  badge.replaceWith(sel);
  editorOpen = true;
  sel.focus();

  let done = false;
  sel.addEventListener("change", async () => {
    if (done) return;
    done = true;
    editorOpen = false;
    sel.disabled = true;
    try {
      const cols = lastData.xlcols || {};
      const res = await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheet: lastData.sheet,
          fn: meta.fn,
          todo: meta.todo,
          column: col,
          value: sel.value === "__clear__" ? null : sel.value,
          base: (meta.orig || {})[col] || "",
          file: lastData.file,
          xlrow: meta.xlrow,
          xlcol: cols[col],
          fncol: cols.fn,
        }),
      });
      const out = await res.json();
      if (!out.ok) alert(`${t("err_save")} ` + (out.error || "?"));
    } catch (err) {
      alert("Não foi possível contactar o servidor: " + err);
    }
    load();
  });
  sel.addEventListener("blur", () => { if (!done) { done = true; editorOpen = false; refreshTaskViews(); } });
}
