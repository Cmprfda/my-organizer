// My Organizer — vista do Excel: leitura, tabela e editores

/* Constrói a vista resumida a partir das colunas do tracker:
   TCs/Funções · Papel (Autor/Reviewer de TC/TP) · Estado · O que fazer */
function buildCompact(data) {
  const h = data.headers.map(norm);
  const col = name => h.findIndex(x => x === norm(name));
  const idx = {
    fn: col("Function/TC"),
    todo: col("To Do"),
    authorTC: col("Author TC"), reviewerTC: col("Reviewer TC"), statusTC: col("Status TC"),
    authorTP: col("Author TP"), reviewerTP: col("Reviewer TP"), statusTP: col("Status TP"),
    obs: col("OBS"),
  };
  if (idx.fn < 0 || idx.authorTC < 0 || idx.statusTC < 0) return null;

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

  const rows = data.rows.map((row, ri) => {
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
    if (!parts.length) {
      const soVertentesNA = [idx.authorTC, idx.reviewerTC, idx.authorTP, idx.reviewerTP]
        .some(i => isMe(row, i));
      if (soVertentesNA) return null;   // nada é suposto ser feito nesta tarefa
      papel = t("role_mentioned");
    }

    const lines = [], linesCols = [];
    const sTC = val(row, idx.statusTC), sTP = val(row, idx.statusTP);
    if (rolesTC.length && sTC && norm(sTC) !== "n/a") { lines.push("TC: " + sTC); linesCols.push("Status TC"); }
    if (rolesTP.length && sTP && norm(sTP) !== "n/a") { lines.push("TP: " + sTP); linesCols.push("Status TP"); }
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
    if (!resumo) {
      // linhas de review costumam ter o "To Do" vazio — gera um resumo a partir do papel
      const gen = [];
      if (rolesTC.includes(t("role_reviewer"))) gen.push(`${t("review_tc")} ${val(row, idx.authorTC) || "?"}`);
      if (rolesTP.includes(t("role_reviewer"))) gen.push(`${t("review_tp")} ${val(row, idx.authorTP) || "?"}`);
      resumo = gen.join("\n") || "—";
    }
    const obs = val(row, idx.obs);
    if (obs) resumo += "\u001F" + obs;   // separador interno para formatar a OBS à parte

    // elementos 4+ não são colunas visíveis: side (filtros), meta e
    // colunas de cada linha de estado (edição de estados)
    const meta = (data.row_meta || [])[ri] || null;
    const n = meta && meta.note;
    const feitos = n && n.checks
      ? CHECKS.filter(([k]) => n.checks[k]).map(([, , s]) => s).join(" ")
      : "";
    const execDisplay = n ? [n.tag, feitos, n.note].filter(Boolean).join("\n") : "";
    return [val(row, idx.fn), papel, estado, resumo, execDisplay, side, meta, linesCols];
  }).filter(Boolean);

  return { headers: [t("hdr_fn"), t("hdr_role"), t("hdr_status"), t("hdr_todo"), t("hdr_exec")], rows };
}

let lastSelectorsSig = "";

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
  $("refresh").textContent = pending ? `${t("btn_push")} (${pending})` : t("btn_refresh");
  $("reloadOnly").classList.toggle("hidden", !pending);
  $("clearLocals").classList.toggle("hidden", !pending);

  if (data.error) {
    tbl.classList.add("hidden");
    $("taskBoardBox").classList.add("hidden");
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

  const compact = !showAll ? buildCompact(data) : null;
  $("viewToggle").classList.toggle("hidden", !compact);
  const useCompact = compact && compactView;
  // a vista em caixas só faz sentido no resumo (a completa tem colunas a mais)
  $("taskMode").classList.toggle("hidden", !useCompact);
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
  const roleIdx = useCompact ? 1 : -1;
  const roleMatches = papel =>
    [...roleFilters].some(f => f === t("role_mentioned") ? papel === f : papel.includes(f));
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
      const c = { [t("role_author")]: 0, [t("role_reviewer")]: 0, [t("role_mentioned")]: 0 };
      arr.forEach(r => {
        const p = r[roleIdx];
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
    $("taskBoardBox").classList.add("hidden");
    box.classList.remove("hidden");
    box.innerHTML = (statusFilters.size || sideFilters.size || roleFilters.size)
      ? `<h2>${t("none_filter")}.</h2><p>${t("none_hint")}</p>`
      : query.length
        ? `<h2>${t("none_search")} "${esc(searchLabel())}".</h2>`
        : `<h2>${t("none_person")} ${esc(PERSON)}.</h2>
     <p>${t("rows_hint_1")} ${data.total_rows} ${t("rows_hint_2")}</p>`;
    return;
  }

  box.classList.add("hidden");
  const _narrow = window.innerWidth <= 720;
  // no telemóvel a vista de tarefas fica sempre em caixas (ver #taskMode em
  // responsive.css) — o Kanban também cede nesse caso, não faz sentido
  // espremer 3 colunas num ecrã estreito
  const kanban = useCompact && taskLayout === "kanban" && !_narrow;
  tbl.classList.toggle("hidden", kanban);
  $("taskBoardBox").classList.toggle("hidden", !kanban);
  tbl.classList.toggle("cards", useCompact && !kanban && (taskLayout === "cards" || _narrow));
  $("thead").innerHTML = "<tr>" + headers.map(h => `<th>${esc(h)}</th>`).join("") + `<th class="todoActionCell">${esc(t("hdr_action"))}</th></tr>`;
  currentMeta = rows.map(r =>
    useCompact ? (r[6] || null) : ((data.row_meta || [])[data.rows.indexOf(r)] || null));
  currentObs = rows.map(r =>
    useCompact ? (String(r[3] === undefined ? "" : r[3]).split("\u001F")[1] || "") : "");
  currentStatuses = data.statuses || [];

  function badgeHtml(text, col, ri, meta) {
    const editable = meta && (col === "Status TC" || col === "Status TP");
    const local = !!(meta && meta.over && meta.over[col]);
    const title = local ? t("t_local") : t("t_edit_status");
    return `<span class="badge ${statusClass(text)}${local ? " local" : ""}"` +
      (editable ? ` data-ri="${ri}" data-col="${esc(col)}" title="${title}"` : "") +
      `>${esc(text)}${local ? " ✎" : ""}</span>`;
  }

  function statusCell(r, ri, i) {
    const meta = currentMeta[ri];
    if (useCompact) {
      const lines = String(r[2]).split("\n").filter(l => l.trim());
      const cols = r[7] || [];
      return lines.map((l, k) => badgeHtml(l, cols[k], ri, meta)).join("<br>");
    }
    const c = r[i] ? String(r[i]) : "";
    return c ? badgeHtml(c, headers[i], ri, meta) : "";
  }

  // a OBS do Excel é editável: escrever aqui fica como alteração local (✎) e
  // só chega à folha no Push, tal como os estados
  function obsHtml(obs, ri) {
    const meta = currentMeta[ri];
    const editable = !!(meta && (lastData.xlcols || {})["OBS"]);
    const local = !!(meta && meta.over && meta.over["OBS"]);
    const attrs = editable ? ` data-obsri="${ri}" title="${t("t_edit_obs")}"` : "";
    if (!obs) return editable ? `<span class="obs addnote"${attrs}>${t("addobs")}</span>` : "";
    return `<span class="obs${local ? " local" : ""}"${attrs}>${t("obs_prefix")} ${esc(obs)}${local ? " ✎" : ""}</span>`;
  }

  // conteúdo da célula de execução (etiqueta, checklist e nota) — partilhado
  // pela tabela/caixas e pelos cartões do Kanban
  function execCellHtml(ri) {
    const meta = currentMeta[ri];
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
    // não escapar aqui: as duas chamadas (tabela e Kanban) já fazem esc(title)
    // ao inserir no atributo — escapar também aqui duplicaria entidades (& -> &amp;amp;)
    const title = (n && n.updated ? `${t("t_updated")} ${n.updated} — ` : "") + t("t_edit_note");
    return { inner, title };
  }

  // "O que fazer" + OBS da linha (a OBS vem colada ao resumo pelo separador \u001F)
  function todoObsHtml(r, ri) {
    const [todo, obs] = String(r[3] === undefined ? "" : r[3]).split("\u001F");
    return `${esc(todo)}${obsHtml(obs || "", ri)}`;
  }

  // o botão "+ TODO" só existe enquanto a linha não estiver na TODO list
  function todoAddBtn(r, ri) {
    const title = String(r[0] === undefined ? "" : r[0]).split("\n")[0].trim();
    const meta = currentMeta[ri] || {};
    const ref = { sheet: data.sheet || "", fn: meta.fn || title, todo: meta.todo || "" };
    return todoHas("task", title, ref) ? ""
      : `<button type="button" class="todoActionBtn" data-todoadd="${ri}" title="${t("todo_add_click")}">${t("btn_add_todo")}</button>`;
  }

  // um cartão do Kanban de Tarefas: mesmas células da vista de caixas,
  // só que organizadas em colunas por "lado" em vez de uma parede plana
  function taskCardHtml(r, ri) {
    const meta = currentMeta[ri] || {};
    const { inner: execInner, title: execTitle } = execCellHtml(ri);
    // atributos data-drag-* : a mesma informação que o arrasto da tabela lê
    // de tr.cells[]/innerText, só que já pronta a usar (o cartão não é uma
    // linha de tabela, não tem .cells)
    const dragFn = String(r[0] === undefined ? "" : r[0]).split("\n")[0].trim();
    const dragTodo = meta.todo || "";
    const dragSheet = (lastData && lastData.sheet) || "";
    // na tabela, o detalhe arrastado/enviado para o TODO vem de tr.cells[3].innerText,
    // que inclui a OBS (o obsHtml() e anexado na mesma celula) - sem isto, o mesmo
    // item ficava com um detalhe diferente consoante o modo de vista (Kanban vs Lista/Caixas)
    const [dragTodoTxt, dragObsTxt] = String(r[3] === undefined ? "" : r[3]).split("\u001F");
    const dragDetail = dragObsTxt ? `${dragTodoTxt} ${t("obs_prefix")} ${dragObsTxt}` : (dragTodoTxt || "");
    return `<article class="taskCard" draggable="true" title="${t("t_drag")}"
      data-drag-fn="${esc(dragFn)}" data-drag-sheet="${esc(dragSheet)}"
      data-drag-todo="${esc(dragTodo)}" data-drag-detail="${esc(dragDetail)}">
    <div class="taskCardTitle fn">${esc(r[0])}</div>
    <div class="role">${esc(r[1])}</div>
    <div class="taskCardStatus">${statusCell(r, ri, 2)}</div>
    <div class="taskCardTodo">${todoObsHtml(r, ri)}</div>
    <div class="execCell" data-ri="${ri}" title="${esc(execTitle)}">${execInner}</div>
    <div class="taskCardFoot">${todoAddBtn(r, ri)}</div>
  </article>`;
  }

  // agrupa `rows` em 3 colunas pelo "lado" (mesma classificação da TODO
  // list e dos filtros do resumo) e escreve o resultado em #taskBoard
  function renderTaskBoard(rows) {
    const groups = { "On my side": [], "On the other side": [], "Done": [] };
    rows.forEach((r, ri) => {
      const side = r[5];
      if (groups[side]) groups[side].push([r, ri]);
      // lados desconhecidos (ex.: "Removed", já filtrado a montante em
      // buildCompact) não têm coluna própria — ficam de fora do Kanban
    });
    const sideLabel = { "On my side": t("side_my"), "On the other side": t("side_other"), "Done": t("side_done") };
    $("taskBoard").innerHTML = SIDES.map(side => {
      const items = groups[side] || [];
      const cards = items.map(([r, ri]) => taskCardHtml(r, ri)).join("");
      return `<section class="taskCol" data-taskcol="${esc(side)}">
    <div class="taskColHead">${esc(sideLabel[side])}<span class="taskColCount">${items.length}</span></div>
    <div class="taskColBody">${cards}</div>
  </section>`;
    }).join("");
  }

  if (kanban) {
    renderTaskBoard(rows);
    return;
  }

  $("tbody").innerHTML = rows.map((r, ri) =>
    `<tr draggable="true" title="${t("t_drag")}">` + headers.map((_, i) => {
      const cell = (() => {
        const c = r[i] !== undefined ? r[i] : "";
        if (useCompact ? i === 2 : isStatusHeader(headers[i]))
          return `<td>${statusCell(r, ri, i)}</td>`;
        if (useCompact && i === 0) return `<td class="fn">${esc(c)}</td>`;
        if (useCompact && i === 1) return `<td class="role">${esc(c)}</td>`;
        if (useCompact && i === 4) {
          const { inner, title } = execCellHtml(ri);
          return `<td class="execCell" data-ri="${ri}" title="${esc(title)}">${inner}</td>`;
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
  const add = e.target.closest("[data-todoadd]");
  if (add) { e.preventDefault(); e.stopPropagation(); addTodoFromTaskRow(add); return; }
  const badge = e.target.closest(".badge[data-col]");
  if (badge) return openStatusEditor(badge);
  const obs = e.target.closest("[data-obsri]");
  if (obs && !obs.dataset.editing) return openObsEditor(obs);
  // .execCell (e não td.execCell): no Kanban a mesma célula é um <div>
  const cell = e.target.closest(".execCell");
  if (cell && !cell.dataset.editing) openNoteEditor(cell);
}
// click + pointerup: alguns browsers móveis não entregam o click delegado
$("tbody").addEventListener("click", tbodyTap);
$("tbody").addEventListener("pointerup", tbodyTap);
$("taskBoard").addEventListener("click", tbodyTap);
$("taskBoard").addEventListener("pointerup", tbodyTap);

$("ccrBody").addEventListener("click", e => {
  const add = e.target.closest("[data-todoaddccr]");
  if (!add) return;
  e.preventDefault();
  e.stopPropagation();
  addTodoFromCcr(add.dataset.todoaddccr);
});

function openNoteEditor(cell) {
  const ri = +cell.dataset.ri;
  const meta = currentMeta[ri];
  if (!meta) { clientLog(`nota: célula sem metadados (linha ${ri})`); return; }
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
    render();
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
  const ri = +span.dataset.obsri;
  const meta = currentMeta[ri];
  if (!meta) { clientLog(`obs: célula sem metadados (linha ${ri})`); return; }
  const atual = currentObs[ri] || "";
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
    render();
  });
  // limpar = repor o que está na folha (deixa de haver alteração local)
  span.querySelector(".actClear").addEventListener("click", e => {
    e.stopPropagation();
    grava(meta.over && meta.over["OBS"] ? null : "");
  });
}

function openStatusEditor(badge) {
  const ri = +badge.dataset.ri, col = badge.dataset.col;
  const meta = currentMeta[ri];
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
  sel.addEventListener("blur", () => { if (!done) { done = true; editorOpen = false; render(); } });
}
