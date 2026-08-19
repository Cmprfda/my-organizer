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
    // editor aberto — o render() já se protege disso sozinho). O cartão
    // "Paradas" das Métricas depende do mesmo histórico.
    if (tab.id === activeTabId) { render(); refreshMetricsIfOpen(); }
    // quem gravou cada versão do livro: pedido à parte, porque é o OneDrive
    // que responde e pode demorar (ou não responder de todo)
    loadHistoryAuthors(tab);
  } catch (e) { /* sem histórico a app funciona como antes */ }
}

const activeHistory = () => taskHistoryByTab.get(activeTabId) || null;

// ---------- idade de uma linha ----------
const DAY_MS = 86400000;

// { days, estimated, changed } de uma linha de UM livro qualquer (o histórico é
// por separador), ou null quando o histórico ainda não a conhece. `estimated` =
// a linha nunca foi vista a mudar, por isso a idade é "pelo menos isto"
// (mostra-se com ≥). O assistente precisa disto para os livros que não estão à
// vista (ver chatContext, static/js/chat.js).
function taskAgeInTab(tabId, meta) {
  const hist = taskHistoryByTab.get(tabId) || null;
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

// idade de uma linha do livro que está à vista (o caso de sempre)
const taskAge = meta => taskAgeInTab(activeTabId, meta);

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
  return estados.every(s => statusIsFinal(s));
}

// A mesma pergunta numa aba concreta: o painel Hoje passa por TODOS os livros
// abertos e a idade de uma linha sai do histórico do livro dela, não do que
// está à vista. As duas contas têm de ser a mesma, senão a lista "Paradas" do
// painel e o botão ⏳ da tabela diziam números diferentes da mesma coisa.
function taskIsStaleInTab(tabId, meta) {
  if (!meta || taskIsDone(meta)) return false;
  // à espera de alguém e dentro do prazo: não está parada, está a decorrer
  // (ver waitingActive, static/js/waiting.js)
  if (typeof waitingActive === "function" && waitingActive(meta)) return false;
  const age = taskAgeInTab(tabId, meta);
  return !!age && age.days >= staleDays();
}

// parada na aba que está à vista (o caso de sempre)
function taskIsStale(meta) {
  return taskIsStaleInTab(activeTabId, meta);
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

// ---------- desfazer uma alteração ----------
// O histórico já guarda o antes e o depois de cada célula: com isso, voltar
// atrás é escrever o valor de antes. Não é uma operação nova do Excel — é a
// mesma alteração local (✎) de sempre, que só chega à folha no Push, por isso
// um "desfazer" por engano desfaz-se com o "Descartar locais".
//
// Só as colunas que a app sabe escrever têm botão: nas outras o histórico é
// leitura (o que mudou na folha, mas não por aqui).
const HIST_UNDOABLE = ["Status TC", "Status TP", "OBS", "Function/TC", "To Do"];

// Vale a pena oferecer o "desfazer" desta alteração?
// Não vale quando a coluna não se escreve daqui, nem quando o valor em vigor já
// é o de antes (aí o botão não faria nada) — ex.: duas alterações seguidas na
// mesma célula, em que a mais antiga já foi desfeita pela recente.
function histCanUndo(meta, e) {
  if (!meta || !e || !HIST_UNDOABLE.includes(e.col)) return false;
  const atual = String(((meta.cur) || {})[e.col] || "").trim();
  return atual !== String(e.from || "").trim();
}

async function undoHistoryChange(meta, col, valor) {
  try {
    const cols = (lastData && lastData.xlcols) || {};
    const res = await fetch("/api/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sheet: lastData.sheet, fn: meta.fn, todo: meta.todo, column: col,
        value: valor,
        // a base é o valor CRU da folha, como em qualquer alteração de célula:
        // é o que faz o Push desistir se a folha tiver mudado entretanto
        base: (meta.orig || {})[col] || "",
        file: lastData.file, xlrow: meta.xlrow,
        xlcol: cols[col], fncol: cols.fn,
      }),
    });
    const out = await res.json();
    if (!out.ok) { alert(`${t("err_save")} ` + (out.error || "?")); return; }
    toast(tf("hist_undone", col, histValue(valor)), "ok");
  } catch (err) {
    alert("Não foi possível contactar o servidor: " + err);
    return;
  }
  load();
}

// ---------- quem gravou o livro ----------
// A folha não guarda o autor de uma célula: uma alteração que não saiu desta
// app aparece com ☁ e mais nada. O OneDrive, esse, guarda as versões do
// ficheiro e quem gravou cada uma — a alteração pertence à PRIMEIRA gravação
// feita a partir do momento em que ela foi detetada.
//
// É uma atribuição por gravação, não por célula: duas pessoas a gravar no mesmo
// minuto (ou uma a gravar o trabalho de outra em coautoria) dão o mesmo nome. É
// por isso que o nome aparece como "gravado por", e não como "alterado por".
const histVersionsByTab = new Map();     // id do separador -> [{when, who}]

async function loadHistoryAuthors(tab) {
  if (!tab || !tab.lastData || tab.lastData.error) return;
  const ficheiro = tab.lastData.file || "";
  // só a fonte web tem versões; um ficheiro local não tem de onde as tirar
  if (!ficheiro.startsWith("onedrive:")) return;
  try {
    const res = await fetch(`/api/history/authors?file=${encodeURIComponent(ficheiro)}`);
    const out = await res.json();
    if (!Array.isArray(out.versions) || !out.versions.length) return;
    histVersionsByTab.set(tab.id, out.versions);
    if (tab.id === activeTabId) render();
  } catch (e) { /* sem nomes o histórico fica como antes */ }
}

// nome de quem gravou a versão que apanhou esta alteração ("" se não se souber)
function histWhoInTab(tabId, iso) {
  const versoes = histVersionsByTab.get(tabId);
  if (!versoes || !iso) return "";
  // as versões vêm da mais recente para a mais antiga: a que interessa é a
  // última cuja hora ainda é >= à da alteração
  let escolhida = "";
  for (let i = versoes.length - 1; i >= 0; i--) {
    if (versoes[i].when >= iso) { escolhida = versoes[i].who || ""; break; }
  }
  return escolhida;
}

const histWho = iso => histWhoInTab(activeTabId, iso);

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
  const linhas = eventos.slice(0, 12).map((e, i) => {
    const quem = e.via === "app" ? "" : histWho(e.ts);
    const marca = e.via === "app" ? t("hist_via_app")
      : (quem ? tf("hist_saved_by", quem) : t("hist_via_sheet"));
    const undo = histCanUndo(meta, e)
      ? `<button type="button" class="histUndo" data-histundo="${i}"` +
        ` title="${esc(tf("t_hist_undo", histValue(e.from)))}">↺</button>`
      : "";
    return `<li class="histRow${e.via === "app" ? " histApp" : ""}">` +
      `<span class="histWhen">${esc(histWhen(e.ts))}</span>` +
      `<span class="histCol">${esc(e.col)}</span>` +
      `<span class="histVals"><span class="histFrom">${esc(histValue(e.from))}</span>` +
      `<span class="histArrow">→</span>` +
      `<span class="histTo">${esc(histValue(e.to))}</span></span>` +
      `<span class="histVia" title="${esc(marca)}">${e.via === "app" ? "✎" : "☁"}` +
      (quem ? ` <span class="histWho">${esc(quem)}</span>` : "") + `</span>` +
      undo +
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
  // o índice no botão aponta para a lista MOSTRADA (a mesma fatia de 12), por
  // isso lê-se daqui e não de um novo taskEvents (que podia já ter mudado)
  wrap.addEventListener("click", ev => {
    const btn = ev.target.closest("[data-histundo]");
    if (!btn) return;
    ev.stopPropagation();
    const e = eventos[+btn.dataset.histundo];
    if (e) undoHistoryChange(meta, e.col, String(e.from || ""));
  });
  return wrap;
}
