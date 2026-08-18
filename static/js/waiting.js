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
    w.until ? `${t("waiting_until")}: ${fmtDueShort(w.until)}` : t("waiting_no_deadline")]
    .filter(Boolean).join("\n");
  return `<span class="waitChip${cobrar ? " chase" : ""}" title="${esc(tip)}">` +
    `⏸ ${esc(w.who)}${desde ? ` · ${esc(desde)}` : ""}</span>`;
}

// ---------- editor (campo da caixa de detalhe) ----------
// Um campo como os outros da caixa: quem se está a esperar e até quando.
// Gravar recarrega a folha, como qualquer alteração de linha.
function waitingNode(meta) {
  const w = waitingOf(meta);
  const wrap = document.createElement("div");
  wrap.className = "waitBox";
  wrap.innerHTML = `<div class="waitFields">
    <input type="text" class="waitWho" maxlength="80" placeholder="${esc(t("waiting_ph_who"))}"
      value="${esc(w ? w.who : "")}">
    <input type="date" class="waitUntil" value="${esc((w && w.until) || "")}"
      title="${esc(t("waiting_until_title"))}">
    <button type="button" class="mini waitSave">${esc(t("btn_save"))}</button>
    ${w ? `<button type="button" class="ccr-x waitClear" title="${esc(t("waiting_clear"))}">✕</button>` : ""}
  </div>` + (w
    ? `<p class="waitNote">${esc(w.until
      ? tf("waiting_note_until", w.who, fmtDueShort(w.until))
      : tf("waiting_note_open", w.who))}</p>`
    : `<p class="waitNote">${esc(t("waiting_hint"))}</p>`);

  const save = async quem => {
    const until = wrap.querySelector(".waitUntil").value;
    try {
      const res = await fetch("/api/waiting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file: lastData.file, sheet: lastData.sheet,
          fn: meta.fn, todo: meta.todo,
          who: quem, until: quem ? until : "",
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
