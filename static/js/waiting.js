// My Organizer — "à espera de alguém" numa tarefa.
//
// O botão "Paradas" (⏳) conta as linhas que ninguém mexeu há N dias, mas trata
// da mesma maneira duas coisas diferentes: a tarefa que foi esquecida e a que
// está à espera de resposta de outra pessoa. Esta segunda não é um esquecimento
// — é trabalho a decorrer, e o que se quer saber dela é QUANDO voltar a cobrar.
//
// Por isso uma linha pode ficar marcada com "à espera de <quem>", opcionalmente
// com um prazo. Enquanto o prazo não passa a linha não conta como parada;
// passado o prazo (ou sem prazo, desde o primeiro dia) aparece no botão
// "À espera", que é a lista do que há a cobrar a alguém.
//
// Onde vive: `waiting.json` no servidor, com a mesma chave dos overrides e das
// notas (livro||aba||função||to do), por isso a marca é a mesma em todos os
// dispositivos — ver load_waiting em cswaios/store.py.
//
// Uma marca pode não ser minha: com a partilha ligada (Definições → Equipa),
// cada instalação publica as suas esperas na pasta partilhada e todas leem as
// das outras (ver cswaios/team.py). Nesse caso a marca traz o `by` — quem a
// pôs — e o chip di-lo, para não parecer minha uma cobrança que é de um colega.
// A minha marca ganha sempre à de outra pessoa na mesma linha.

// a marca desta linha, ou null
function waitingOf(meta) {
  const w = meta && meta.waiting;
  return (w && typeof w === "object" && w.who) ? w : null;
}

// A espera ainda está dentro do prazo? Sem prazo, uma espera nunca "tapa" a
// tarefa: mostra-se o chip, mas ela continua a contar como parada quando o for
// (senão escrever um nome ali fazia a tarefa desaparecer das paradas para
// sempre, que é o contrário do que isto serve).
function waitingActive(meta) {
  const w = waitingOf(meta);
  if (!w || !w.until) return false;
  return daysUntil(w.until) >= 0;
}

// A cobrar: há uma espera e ela já não protege a linha (prazo passado ou sem
// prazo nenhum).
function waitingOverdue(meta) {
  return !!waitingOf(meta) && !waitingActive(meta);
}

function waitingDays(meta) {
  const w = waitingOf(meta);
  if (!w || !w.since) return null;
  const dias = daysUntil(w.since);
  return dias === null ? null : -dias;
}

// chip ao lado do nome da tarefa (tabela, caixas e caixa de detalhe)
function waitingChipHtml(meta) {
  const w = waitingOf(meta);
  if (!w) return "";
  const dias = waitingDays(meta);
  const desde = dias === null ? "" : dias <= 0 ? t("age_today")
    : dias === 1 ? t("age_day") : tf("age_days", dias);
  const cobrar = waitingOverdue(meta);
  const tip = [tf("waiting_tip", w.who), desde ? `${t("waiting_since")}: ${desde}` : "",
    w.until ? `${t("waiting_until")}: ${fmtDueShort(w.until)}` : t("waiting_no_deadline"),
    w.by ? tf("waiting_by", w.by) : ""]
    .filter(Boolean).join("\n");
  return `<span class="waitChip${cobrar ? " chase" : ""}${w.by ? " theirs" : ""}" title="${esc(tip)}">` +
    `⏸ ${esc(w.who)}${desde ? ` · ${esc(desde)}` : ""}` +
    `${w.by ? ` · ${esc(w.by.split(" ")[0])}` : ""}</span>` +
    // o que a segura, quando é uma coisa e não só alguém
    blockerChipHtml(meta);
}

// ---------- o que está a segurar a linha ----------
// O "à espera de <quem>" diz a quem se cobra. Isto diz o QUÊ: outra linha da
// folha, uma CCR ou um item da lista Por fazer. Serve as duas pontas — a linha
// bloqueada mostra o bloqueio (e salta para ele), e a coisa que bloqueia passa
// a dizer o que se desbloqueia quando ela acabar.

function blockerOf(meta) {
  const w = waitingOf(meta);
  const b = w && w.blocker;
  return (b && typeof b === "object" && (b.label || b.ref)) ? b : null;
}

const BLOCKER_ICON = { row: "▤", ccr: "◆", todo: "✓" };

// chip do bloqueio, a seguir ao da espera. Só salta quando o bloqueio é DESTA
// instalação: o que chega de um colega traz o nome mas não o id (ver team.py),
// e um salto para um id que não existe aqui não levava a nada.
function blockerChipHtml(meta) {
  const b = blockerOf(meta);
  if (!b) return "";
  const nome = String(b.label || b.ref || "");
  const salta = !!b.ref && !waitingOf(meta).by;
  const tip = tf("blocker_tip", nome) + (salta ? `\n${t("blocker_go")}` : "");
  const icon = BLOCKER_ICON[b.kind] || "⛔";
  if (!salta) {
    return `<span class="blockChip" title="${esc(tip)}">⛔ ${esc(icon)} ${esc(nome)}</span>`;
  }
  return `<button type="button" class="blockChip go" title="${esc(tip)}"` +
    ` data-blockgo="${esc(b.kind)}" data-blockref="${esc(b.ref)}">` +
    `⛔ ${esc(icon)} ${esc(nome)}</button>`;
}

// saltar para o que está a bloquear
function blockerGo(kind, ref) {
  if (kind === "ccr") { revealSource({ view: "ccrs", ccr: ref }); return; }
  if (kind === "todo") { revealSource({ view: "todo", todoId: ref }); return; }
  const [fn, todo] = String(ref).split("||");
  const tab = workbookTabs.find(x => x.id === activeTabId);
  revealSource({
    view: `wb:${activeTabId}`, workbook: tab && tab.name,
    sheet: lastData && lastData.sheet, fn: fn || "", todo: todo || "",
  });
}

// a chave de uma linha como bloqueio (a mesma identidade que os overrides usam)
const blockerRowRef = meta => `${String(meta.fn || "")}||${String(meta.todo || "")}`;

// O outro lado: quem está à espera DESTA linha (ou deste item). É o que
// transforma a marca numa cadeia — a linha que segura três outras passa a
// dizê-lo, em vez de ser preciso ir ver uma por uma.
function blockedByThis(kind, ref) {
  const alvo = norm(String(ref || ""));
  if (!alvo) return [];
  const out = [];
  // o row_meta é a lista das linhas tal como o servidor as leu (é de lá que
  // vem o `waiting` de cada uma): serve para todos os livros abertos, não só
  // para o separador à frente
  workbookTabs.forEach(tab => {
    (((tab.lastData || {}).row_meta) || []).forEach(meta => {
      const b = meta && blockerOf(meta);
      if (!b || b.kind !== kind || norm(String(b.ref || "")) !== alvo) return;
      out.push({ tab, meta, name: String(meta.fn || "").trim() || `linha ${meta.xlrow}` });
    });
  });
  return out;
}

// os candidatos do campo do bloqueio, conforme o tipo
function blockerChoices(kind, meta) {
  if (kind === "ccr") {
    return Object.keys(ccrs || {}).sort().map(id => ({ label: id, ref: id }));
  }
  if (kind === "todo") {
    return (todos || []).filter(it => it && !it.done && String(it.title || "").trim())
      .map(it => ({ label: String(it.title).trim(), ref: String(it.id) }));
  }
  if (kind !== "row") return [];
  const eu = meta ? blockerRowRef(meta) : "";
  const vistas = new Set();
  return (((lastData || {}).row_meta) || [])
    .map(m => ({
      label: [String(m.fn || "").trim(), String(m.todo || "").trim()]
        .filter(Boolean).join(" · ").slice(0, 120),
      ref: blockerRowRef(m),
    }))
    // uma linha não se bloqueia a si mesma, e as repetidas só entram uma vez
    .filter(c => c.label && c.ref !== eu && !vistas.has(c.ref) && vistas.add(c.ref))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// saltar para o que bloqueia, de onde o chip estiver (tabela, caixa ou detalhe)
document.addEventListener("click", e => {
  const btn = e.target.closest("[data-blockgo]");
  if (!btn) return;
  e.stopPropagation();      // não abrir a caixa de detalhe da linha por baixo
  e.preventDefault();
  blockerGo(btn.dataset.blockgo, btn.dataset.blockref);
});

// "acabar isto desbloqueia…": as linhas que apontam para esta
function blockedNoteHtml(meta) {
  if (!meta) return "";
  const presas = blockedByThis("row", blockerRowRef(meta));
  if (!presas.length) return "";
  const nomes = presas.slice(0, 6).map(p => esc(p.name)).join(", ");
  const mais = presas.length > 6 ? ` (+${presas.length - 6})` : "";
  return `<p class="waitNote unblocks">${esc(tf("blocker_unblocks", presas.length))} ` +
    `${nomes}${mais}</p>`;
}

// ---------- editor (campo da caixa de detalhe) ----------
// Um campo como os outros da caixa: quem se está a esperar e até quando.
// Gravar recarrega a folha, como qualquer alteração de linha.
function waitingNode(meta) {
  const w = waitingOf(meta);
  const wrap = document.createElement("div");
  wrap.className = "waitBox";
  const b = blockerOf(meta) || {};
  wrap.innerHTML = `<div class="waitFields">
    <input type="text" class="waitWho" maxlength="80" placeholder="${esc(t("waiting_ph_who"))}"
      value="${esc(w ? w.who : "")}">
    <input type="date" class="waitUntil" value="${esc((w && w.until) || "")}"
      title="${esc(t("waiting_until_title"))}">
    <button type="button" class="mini waitSave">${esc(t("btn_save"))}</button>
    ${w ? `<button type="button" class="ccr-x waitClear" title="${esc(t("waiting_clear"))}">✕</button>` : ""}
  </div>
  <div class="waitFields waitBlock">
    <select class="blockKind" title="${esc(t("blocker_kind_title"))}">
      <option value="">${esc(t("blocker_none"))}</option>
      <option value="row"${b.kind === "row" ? " selected" : ""}>${esc(t("blocker_row"))}</option>
      <option value="ccr"${b.kind === "ccr" ? " selected" : ""}>${esc(t("blocker_ccr"))}</option>
      <option value="todo"${b.kind === "todo" ? " selected" : ""}>${esc(t("blocker_todo"))}</option>
    </select>
    <input type="text" class="blockWhat" list="blockList" maxlength="200"
      placeholder="${esc(t("blocker_ph"))}" value="${esc(b.label || "")}"
      title="${esc(t("blocker_what_title"))}">
    <datalist id="blockList"></datalist>
  </div>` + (w
    ? `<p class="waitNote">${esc(w.until
      ? tf("waiting_note_until", w.who, fmtDueShort(w.until))
      : tf("waiting_note_open", w.who))}</p>`
    : `<p class="waitNote">${esc(t("waiting_hint"))}</p>`) +
    // o outro lado da cadeia: quem está à espera DESTA linha. É o que faz a
    // marca valer para quem tem o trabalho na mão, e não só para quem espera
    blockedNoteHtml(meta);

  // os candidatos ao campo do bloqueio mudam com o tipo escolhido: as linhas
  // desta folha, as CCRs acompanhadas ou os itens por fazer
  const enche = () => {
    const kind = wrap.querySelector(".blockKind").value;
    const lista = wrap.querySelector("#blockList");
    lista.innerHTML = blockerChoices(kind, meta)
      .map(c => `<option value="${esc(c.label)}"></option>`).join("");
  };
  wrap.querySelector(".blockKind").addEventListener("change", enche);
  enche();

  const save = async quem => {
    const until = wrap.querySelector(".waitUntil").value;
    const kind = wrap.querySelector(".blockKind").value;
    const texto = wrap.querySelector(".blockWhat").value.trim();
    // o que se escreveu vale pelo nome; o `ref` vem do candidato com esse nome
    // (e sem candidato fica só o nome, que já diz a quem lê o que se espera)
    const escolha = kind && texto
      ? blockerChoices(kind, meta).find(c => norm(c.label) === norm(texto))
      : null;
    const blocker = kind && texto
      ? { kind, label: texto, ref: (escolha && escolha.ref) || "" }
      : null;
    try {
      const res = await fetch("/api/waiting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file: lastData.file, sheet: lastData.sheet,
          fn: meta.fn, todo: meta.todo,
          who: quem, until: quem ? until : "",
          blocker: quem ? blocker : null,
          // vai o meu nome porque a marca pode ser publicada para a equipa, e
          // uma cobrança sem autor não serve de nada (ver team.py)
          person: PERSON,
          // a data de início mantém-se enquanto a espera for a mesma pessoa:
          // trocar o prazo não recomeça a contagem de "há quanto tempo"
          since: (w && w.who === quem && w.since) || "",
        }),
      });
      const out = await res.json();
      if (!out.ok) { alert(`${t("err_save")} ` + (out.error || "?")); return; }
    } catch (err) {
      alert("Não foi possível contactar o servidor: " + err);
      return;
    }
    load();
  };

  wrap.querySelector(".waitSave").addEventListener("click", e => {
    e.stopPropagation();
    save(wrap.querySelector(".waitWho").value.trim());
  });
  const limpar = wrap.querySelector(".waitClear");
  if (limpar) limpar.addEventListener("click", e => { e.stopPropagation(); save(""); });
  wrap.querySelector(".waitWho").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); save(e.target.value.trim()); }
  });
  return wrap;
}
