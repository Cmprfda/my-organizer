// My Organizer — histórico de uma linha da folha e tarefas paradas
//
// O servidor compara cada leitura da folha com a anterior e guarda o que mudou
// (ver cswaios/history.py). Daqui sai: a lista "o que aconteceu a esta tarefa"
// dentro da caixa de detalhe, e a idade de cada linha — quanto tempo está sem
// mexer — que alimenta o botão "Paradas" no resumo.

// histórico por separador de livro: id -> { rows, events, seeded, digest }
// (não vai para o localStorage — é sempre o servidor que manda)
const taskHistoryByTab = new Map();

// dias sem mexer a partir dos quais uma tarefa conta como parada. Escolhido nas
// Definições, porque o que é "parado" depende do ritmo de cada equipa.
const STALE_KEY = "bsp-tracker-stale-days";
const STALE_CHOICES = [2, 3, 5, 7, 14];
const STALE_DEFAULT = 5;

function staleDays() {
  const n = +localStorage.getItem(STALE_KEY);
  return STALE_CHOICES.includes(n) ? n : STALE_DEFAULT;
}

function setStaleDays(n) {
  localStorage.setItem(STALE_KEY, String(STALE_CHOICES.includes(+n) ? +n : STALE_DEFAULT));
  render();
}

// ---------- ir buscar ao servidor ----------
// Só se volta a pedir quando a leitura do livro trouxe conteúdo diferente
// (digest): o histórico só muda quando a folha muda, por isso os pedidos de
// 20/20s que não encontram nada de novo não pedem nada aqui.
async function loadTaskHistory(tab) {
  if (!tab || !tab.lastData || tab.lastData.error) return;
  const data = tab.lastData;
  if (!data.file || !data.sheet) return;
  const digest = `${data.file}|${data.sheet}|${data.digest || ""}`;
  const cached = taskHistoryByTab.get(tab.id);
  if (cached && cached.digest === digest) return;
  try {
    const res = await fetch(`/api/history?file=${encodeURIComponent(data.file)}` +
      `&sheet=${encodeURIComponent(data.sheet)}`);
    const out = await res.json();
    taskHistoryByTab.set(tab.id, {
      digest,
      seeded: out.seeded || "",
      rows: out.rows || {},
      events: out.events || [],
    });
    // o histórico chegou depois do desenho: o botão "Paradas" e as idades só
    // existem com ele, por isso desenha-se outra vez (nunca por cima de um
    // editor aberto — o render() já se protege disso sozinho)
    if (tab.id === activeTabId) render();
  } catch (e) { /* sem histórico a app funciona como antes */ }
}

const activeHistory = () => taskHistoryByTab.get(activeTabId) || null;

// ---------- idade de uma linha ----------
const DAY_MS = 86400000;

// { days, estimated, changed } de uma linha, ou null quando o histórico ainda
// não a conhece. `estimated` = a linha nunca foi vista a mudar, por isso a
// idade é "pelo menos isto" (mostra-se com ≥).
function taskAge(meta) {
  const hist = activeHistory();
  if (!hist || !meta || meta.xlrow == null) return null;
  const entry = hist.rows[String(meta.xlrow)];
  if (!entry || !entry.changed) return null;
  const when = new Date(entry.changed);
  if (isNaN(when)) return null;
  return {
    days: Math.floor((Date.now() - when.getTime()) / DAY_MS),
    estimated: !!entry.estimated,
    changed: when,
  };
}

// Uma tarefa parada é uma que está à espera de alguém há demasiado tempo: as
// concluídas (e as que não se aplicam) nunca contam, senão o botão enchia-se de
// trabalho que já não é trabalho.
function taskIsDone(meta) {
  const cur = (meta && meta.cur) || {};
  // meta.cur é o valor EM VIGOR (já com a alteração local ✎ aplicada): marcar
  // uma tarefa como feita aqui tira-a das paradas logo, sem esperar pelo Push
  const estados = [cur["Status TC"], cur["Status TP"]]
    .map(s => String(s || "").trim())
    .filter(s => s && norm(s) !== "n/a");
  // sem nenhum estado aplicável não há trabalho à espera de ninguém
  if (!estados.length) return true;
  return estados.every(s => statusClass(s) === "done");
}

function taskIsStale(meta) {
  if (!meta || taskIsDone(meta)) return false;
  const age = taskAge(meta);
  return !!age && age.days >= staleDays();
}

function ageLabel(age) {
  if (!age) return "";
  const dias = age.days;
  const texto = dias <= 0 ? t("age_today")
    : dias === 1 ? t("age_day")
      : tf("age_days", dias);
  return (age.estimated ? "≥ " : "") + texto;
}

// etiqueta da tarefa parada, ao lado do nome (tabela, cartões e caixa)
function staleChipHtml(meta) {
  if (!taskIsStale(meta)) return "";
  const age = taskAge(meta);
  return `<span class="staleChip" title="${esc(tf("t_stale", staleDays()))}">⏳ ${esc(ageLabel(age))}</span>`;
}

// ---------- histórico de uma linha, para a caixa de detalhe ----------
function taskEvents(meta) {
  const hist = activeHistory();
  if (!hist || !meta || meta.xlrow == null) return [];
  return hist.events.filter(e => String(e.xlrow) === String(meta.xlrow));
}

function histWhen(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return String(iso || "");
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  const hora = d.toLocaleTimeString(LANG === "en" ? "en-GB" : "pt-PT",
    { hour: "2-digit", minute: "2-digit" });
  if (mesmoDia) return `${t("hist_today")} ${hora}`;
  return `${d.toLocaleDateString(LANG === "en" ? "en-GB" : "pt-PT",
    { day: "2-digit", month: "2-digit" })} ${hora}`;
}

const histValue = v => String(v || "").trim() || "—";

// Campo "Histórico" da caixa de detalhe (ver itemBoxFields, itembox.js).
// Devolve null quando não há nada para mostrar sobre esta linha.
function taskHistoryNode(meta) {
  const eventos = taskEvents(meta);
  const age = taskAge(meta);
  if (!eventos.length && !age) return null;
  const wrap = document.createElement("div");
  wrap.className = "histBox";
  const linhas = eventos.slice(0, 12).map(e => {
    const marca = e.via === "app" ? t("hist_via_app") : t("hist_via_sheet");
    return `<li class="histRow${e.via === "app" ? " histApp" : ""}">` +
      `<span class="histWhen">${esc(histWhen(e.ts))}</span>` +
      `<span class="histCol">${esc(e.col)}</span>` +
      `<span class="histVals"><span class="histFrom">${esc(histValue(e.from))}</span>` +
      `<span class="histArrow">→</span>` +
      `<span class="histTo">${esc(histValue(e.to))}</span></span>` +
      `<span class="histVia" title="${esc(marca)}">${e.via === "app" ? "✎" : "☁"}</span>` +
      `</li>`;
  }).join("");
  const resumo = age
    ? `<div class="histAge${taskIsStale(meta) ? " stale" : ""}">${esc(t("hist_age"))}: ` +
      `<strong>${esc(ageLabel(age))}</strong></div>`
    : "";
  // sem eventos há dois casos diferentes, e dizer o mesmo nos dois confundia:
  // a tarefa nunca mudou desde que há histórico (idade estimada), ou mudou mas
  // as alterações já saíram da janela guardada
  const vazio = age && !age.estimated ? t("hist_pruned") : t("hist_none");
  wrap.innerHTML = resumo + (linhas
    ? `<ul class="histList">${linhas}</ul>`
    : `<div class="histEmpty">${esc(vazio)}</div>`);
  return wrap;
}
