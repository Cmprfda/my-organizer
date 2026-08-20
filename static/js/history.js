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
      // quantas células levou cada Envio (batch -> nº): a caixa de uma tarefa só
      // vê os eventos DELA e sem isto não saberia dizer que o envio mexeu em
      // mais linhas (ver histBatchUndo)
      batches: out.batches || {},
      // idas e voltas de cada linha (ver bounceChipHtml)
      bounces: out.bounces || {},
    });
    // o histórico chegou depois do desenho: o botão "Paradas" e as idades só
    // existem com ele, por isso desenha-se outra vez (nunca por cima de um
    // editor aberto — o render() já se protege disso sozinho). O cartão
    // "Paradas" das Métricas depende do mesmo histórico.
    if (tab.id === activeTabId) {
      render();
      // o metrics.js só existe depois de a vista dele abrir (ver lazy.js)
      if (typeof refreshMetricsIfOpen === "function") refreshMetricsIfOpen();
    }
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

// ---------- ricochete: idas e voltas de uma linha ----------
// O histórico já guardava cada reversão, mas tratava cada evento como uma linha
// isolada: "voltou da revisão duas vezes" não estava em sítio nenhum. A conta é
// feita pelo servidor sobre os eventos que ele de qualquer maneira devolve (ver
// history.bounce_counts) e só vê a janela de dias desse pedido.
function taskBouncesInTab(tabId, meta) {
  const hist = taskHistoryByTab.get(tabId) || null;
  if (!hist || !hist.bounces || !meta || meta.xlrow == null) return null;
  const entry = hist.bounces[String(meta.xlrow)];
  return entry && entry.n ? entry : null;
}

const taskBounces = meta => taskBouncesInTab(activeTabId, meta);

// a marca ao lado do nome. Uma linha acabada também a leva: ter ricocheteado
// duas vezes é parte da história dela, e é isso que se vai ver depois
function bounceChipHtml(meta) {
  const b = taskBounces(meta);
  if (!b) return "";
  const onde = (b.cols || []).join(" · ");
  return `<span class="bounceChip" title="${esc(tf("t_bounce", b.n, onde))}">↩${b.n > 1 ? `×${b.n}` : ""}</span>`;
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

// Desfazer o ENVIO inteiro de que esta alteração veio. O botão só aparece
// quando o envio mexeu em mais do que uma célula — com uma só, o ↺ da linha já
// faz o mesmo. Fica tudo local (✎) à espera do Push, como qualquer alteração.
function histBatchSize(e) {
  const h = activeHistory();
  const lote = String((e && e.batch) || "");
  return lote ? Number((h && h.batches && h.batches[lote]) || 0) : 0;
}

async function undoHistoryBatch(batch, quantas) {
  const h = activeHistory();
  // a contagem pode vir de fora (as Métricas mostram alterações de VÁRIOS
  // livros, e o histórico em memória é só o do separador ativo)
  const total = Number(quantas || ((h && h.batches) || {})[batch] || 0);
  if (!confirm(tf("hist_undo_batch_confirm", total))) return;
  try {
    const res = await fetch("/api/history/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch }),
    });
    const out = await res.json();
    if (!out.ok) { alert(`${t("err_save")} ` + (out.error || "?")); return; }
    toast(tf("hist_undone_batch", out.queued), "ok");
    if ((out.failed || []).length) clientLog(`desfazer envio: falhas ${out.failed.join(" | ")}`);
  } catch (err) {
    alert("Não foi possível contactar o servidor: " + err);
    return;
  }
  load();
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
    // o mesmo Push mexeu noutras linhas: desfazê-lo todo de uma vez
    const nLote = histBatchSize(e);
    const undoLote = nLote > 1
      ? `<button type="button" class="histUndo histUndoBatch" data-histbatch="${esc(e.batch)}"` +
        ` title="${esc(tf("t_hist_undo_batch", nLote))}">↺${nLote}</button>`
      : "";
    return `<li class="histRow${e.via === "app" ? " histApp" : ""}">` +
      `<span class="histWhen">${esc(histWhen(e.ts))}</span>` +
      `<span class="histCol">${esc(e.col)}</span>` +
      `<span class="histVals"><span class="histFrom">${esc(histValue(e.from))}</span>` +
      `<span class="histArrow">→</span>` +
      `<span class="histTo">${esc(histValue(e.to))}</span></span>` +
      (e.via === "app"
        ? `<span class="histVia" title="${esc(marca)}">✎</span>`
        // o ☁ é um botão: clicar vai VER à versão do livro de quem foi esta
        // alteração, em vez de ficar pelo nome de quem gravou àquela hora
        : `<button type="button" class="histVia histAsk" data-histwho="${i}"` +
          ` title="${esc(marca + "\n" + t("t_hist_who"))}">☁` +
          (quem ? ` <span class="histWho">${esc(quem)}</span>` : "") + `</button>`) +
      undo + undoLote +
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
  wrap.innerHTML = resumo + taskKinHtml(meta) + taskDossierHtml(meta) + (linhas
    ? `<ul class="histList">${linhas}</ul>`
    : `<div class="histEmpty">${esc(vazio)}</div>`);
  // o índice no botão aponta para a lista MOSTRADA (a mesma fatia de 12), por
  // isso lê-se daqui e não de um novo taskEvents (que podia já ter mudado)
  wrap.addEventListener("click", ev => {
    const lote = ev.target.closest("[data-histbatch]");
    if (lote) {
      ev.stopPropagation();
      undoHistoryBatch(lote.dataset.histbatch);
      return;
    }
    const ask = ev.target.closest("[data-histwho]");
    if (ask) {
      ev.stopPropagation();
      askHistoryWho(ask, eventos[+ask.dataset.histwho]);
      return;
    }
    const btn = ev.target.closest("[data-histundo]");
    if (!btn) return;
    ev.stopPropagation();
    const e = eventos[+btn.dataset.histundo];
    if (e) undoHistoryChange(meta, e.col, String(e.from || ""));
  });
  return wrap;
}

// ---------- porquê assim? a biografia de uma linha ----------
// Cada ingrediente já existe num painel diferente: o histórico, as idades, os
// ricochetes, a espera, o bloqueio, a nota, o pino do quadro. O que nunca era
// montado era a HISTÓRIA de uma linha — e é essa que responde à pergunta que se
// faz a olhar para ela pela primeira vez ("porque é que isto está assim?").
//
// Tudo isto é conta local: não há um pedido novo ao servidor.

function taskDossier(meta) {
  const eventos = taskEvents(meta).slice().sort((a, b) =>
    String(a.ts || "") < String(b.ts || "") ? -1 : 1);
  const age = taskAge(meta);
  const hist = activeHistory();
  const b = taskBounces(meta);
  const w = typeof waitingOf === "function" ? waitingOf(meta) : null;
  const partes = [];

  // 1) desde quando se sabe dela
  const nascimento = eventos.length ? eventos[0].ts : "";
  if (nascimento) partes.push(tf("dossier_first", histWhen(nascimento)));
  else if (hist && hist.seeded) partes.push(tf("dossier_seeded", histWhen(hist.seeded)));

  // 2) quantas vezes mexeu, e por quem
  if (eventos.length) {
    const daApp = eventos.filter(e => e.via === "app").length;
    partes.push(tf("dossier_changes", eventos.length, daApp, eventos.length - daApp));
  }

  // 3) o maior silêncio: é o que explica uma linha que parece abandonada
  const pausa = taskLongestGap(eventos);
  if (pausa && pausa.days >= 3) {
    partes.push(tf("dossier_gap", pausa.days, histWhen(pausa.from), histWhen(pausa.to)));
  }

  // 4) idas e voltas
  if (b) partes.push(tf("dossier_bounce", b.n, (b.cols || []).join(" · ")));

  // 5) à espera de alguém, e o que a segura
  if (w) {
    const dias = typeof waitingDays === "function" ? waitingDays(meta) : null;
    partes.push(tf("dossier_waiting", w.who, dias == null ? "?" : dias));
    const bl = typeof blockerOf === "function" ? blockerOf(meta) : null;
    if (bl) partes.push(tf("dossier_blocked", bl.label || bl.ref));
  }

  // 6) e há quanto tempo está como está
  if (age) partes.push(tf("dossier_age", ageLabel(age)));
  return partes;
}

// o maior intervalo entre duas alterações seguidas (o "esteve 12 dias sem se
// mexer"), sobre eventos já ordenados no tempo
function taskLongestGap(eventos) {
  let maior = null;
  for (let i = 1; i < eventos.length; i++) {
    const a = new Date(eventos[i - 1].ts);
    const b = new Date(eventos[i].ts);
    if (isNaN(a) || isNaN(b)) continue;
    const dias = Math.floor((b.getTime() - a.getTime()) / DAY_MS);
    if (!maior || dias > maior.days) {
      maior = { days: dias, from: eventos[i - 1].ts, to: eventos[i].ts };
    }
  }
  return maior;
}

function taskDossierHtml(meta) {
  const linhas = taskDossier(meta);
  if (!linhas.length) return "";
  return `<ul class="histStory">` +
    linhas.map(l => `<li>${esc(l)}</li>`).join("") + `</ul>`;
}

// ---------- quem já andou nisto ----------
// A folha diz quem é autor e quem é reviewer de cada linha. Cruzar isso com as
// linhas VIZINHAS (as que partilham o prefixo da função) dá uma tabela de
// encaminhamento que ninguém escreveu: "pergunta ao Pedro, ele mexeu em todas as
// FCU-3x". Não é autoria por célula (essa custa uma descarga do livro e responde
// a uma célula de cada vez, ver authors.py) — é o que a folha já diz de graça.

// o prefixo de uma função, sem o número do caso no fim
function taskFnPrefix(fn) {
  const limpo = String(fn || "").trim();
  if (!limpo) return "";
  const semNumero = limpo.replace(/[\s_\-.]*\d+[a-z]?$/i, "");
  return (semNumero.length >= 3 ? semNumero : limpo).toLowerCase();
}

const ROLE_KEYS = ["author_tc", "reviewer_tc", "author_tp", "reviewer_tp"];

// as pessoas que aparecem nas linhas vizinhas desta, das que aparecem mais
// vezes para as que aparecem menos
function taskKinPeople(meta) {
  const prefixo = taskFnPrefix(meta && meta.fn);
  const data = (workbookTabs || []).find(x => x.id === activeTabId);
  const metas = (data && data.lastData && data.lastData.row_meta) || [];
  if (!prefixo || metas.length < 2) return null;
  const contagem = new Map();
  let linhas = 0;
  metas.forEach(m => {
    if (!m || taskFnPrefix(m.fn) !== prefixo) return;
    linhas++;
    const gente = (m.people || {});
    // uma pessoa conta UMA vez por linha, mesmo que seja autora e reviewer:
    // senão quem faz os dois papéis parecia saber o dobro
    const nesta = new Set();
    ROLE_KEYS.forEach(k => {
      const nome = String(gente[k] || "").trim();
      if (nome) nesta.add(nome);
    });
    nesta.forEach(nome => contagem.set(nome, (contagem.get(nome) || 0) + 1));
  });
  if (linhas < 2 || !contagem.size) return null;
  const gente = [...contagem.entries()]
    .map(([who, n]) => ({ who, n }))
    .sort((a, b) => b.n - a.n || a.who.localeCompare(b.who));
  return { prefix: prefixo, rows: linhas, people: gente.slice(0, 3) };
}

function taskKinHtml(meta) {
  const kin = taskKinPeople(meta);
  if (!kin) return "";
  const gente = kin.people.map(p => `${p.who} (${p.n})`).join(" · ");
  return `<p class="histKin" title="${esc(tf("t_hist_kin", kin.rows, kin.prefix))}">` +
    `${esc(t("hist_kin"))}: ${esc(gente)}</p>`;
}

// Quem mudou esta célula, a sério: o servidor vai buscar a versão do livro
// àquela hora e LÊ a célula lá (ver cswaios/authors.py). Custa uma descarga do
// livro, por isso só acontece a pedido — e o resultado fica no botão.
async function askHistoryWho(btn, ev) {
  if (!ev || btn.dataset.asked === "1") return;
  const tab = workbookTabs.find(x => x.id === activeTabId);
  const ficheiro = (tab && tab.lastData && tab.lastData.file) || "";
  if (!ficheiro.startsWith("onedrive:")) { toast(t("hist_who_local"), ""); return; }
  btn.dataset.asked = "1";
  btn.classList.add("asking");
  const q = new URLSearchParams({
    file: ficheiro, sheet: (tab.lastData && tab.lastData.sheet) || "",
    xlrow: String(ev.xlrow || ""), col: String(ev.col || ""),
    ts: String(ev.ts || ""), from: String(ev.from || ""), to: String(ev.to || ""),
  });
  try {
    const res = await fetch(`/api/history/who?${q}`);
    const out = await res.json();
    btn.classList.remove("asking");
    if (!out.ok) {
      btn.dataset.asked = "";
      toast(tf("hist_who_unknown", out.error || "?"), "");
      return;
    }
    btn.classList.add("asked");
    btn.innerHTML = `☁ <span class="histWho">${esc(out.who || t("hist_who_nobody"))}</span>`;
    btn.title = (out.confirmed ? tf("hist_who_sure", out.who || "?")
      : tf("hist_who_maybe", out.who || "?")) +
      (out.when ? `\n${histWhen(out.when)}` : "");
  } catch (err) {
    btn.classList.remove("asking");
    btn.dataset.asked = "";
    toast(tf("hist_who_unknown", String(err)), "");
  }
}

// ---------- a folha naquele dia ----------
// O retrato guardado é o de AGORA e cada alteração guarda o antes: com isso, a
// folha de uma data passada reconstrói-se ao contrário, sem nunca ter sido
// guardada (ver history.reconstruct_at).
//
// É uma vista SÓ DE LEITURA, e à parte da tabela: a tabela das Tarefas escreve
// na folha, e uma tabela que às vezes mostra o passado e às vezes o presente é a
// maneira mais fácil de alguém enviar um valor de há duas semanas sem querer.

function asOfDefaultDate() {
  const d = new Date(Date.now() - 14 * DAY_MS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function openAsOf() {
  const tab = activeTab();
  if (!tab || !tab.lastData || tab.lastData.error) { toast(t("asof_no_book"), ""); return; }
  $("asOfOverlay").classList.remove("hidden");
  if (!$("asOfDate").value) $("asOfDate").value = asOfDefaultDate();
  loadAsOf();
}

function closeAsOf() {
  $("asOfOverlay").classList.add("hidden");
}

async function loadAsOf() {
  const tab = activeTab();
  const data = tab && tab.lastData;
  if (!data || !data.file || !data.sheet) return;
  const dia = $("asOfDate").value;
  const modo = $("asOfMode").value;
  const corpo = $("asOfBodyRows");
  const nota = $("asOfNote");
  if (!dia) { corpo.innerHTML = ""; nota.textContent = t("asof_pick"); return; }
  nota.textContent = t("loading");
  corpo.innerHTML = "";
  try {
    const res = await fetch(`/api/history/asof?file=${encodeURIComponent(data.file)}` +
      `&sheet=${encodeURIComponent(data.sheet)}&at=${encodeURIComponent(dia)}` +
      (modo === "diff" ? "&diff=1" : ""));
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || "?");
    if (modo === "diff") asOfRenderDiff(out, dia);
    else asOfRenderRows(out, dia);
  } catch (err) {
    nota.textContent = t("err_server");
  }
}

// o aviso que TEM de estar à vista: isto só sabe o que o histórico viu
function asOfLimits(out) {
  const partes = [t("asof_cols_only")];
  if (out.partial) {
    partes.push(out.seeded
      ? tf("asof_partial", histWhen(out.seeded))
      : t("asof_no_history"));
  }
  return partes.join(" ");
}

function asOfRenderDiff(out, dia) {
  const mudancas = out.changes || [];
  $("asOfNote").textContent =
    `${tf("asof_diff_note", fmtDueShort(dia), mudancas.length)} ${asOfLimits(out)}`;
  $("asOfBodyRows").innerHTML = mudancas.length
    ? mudancas.map(m => `<tr>
        <td class="asOfName" title="${esc([m.fn, m.todo].filter(Boolean).join(" · "))}">${esc(m.fn || m.todo || m.xlrow)}</td>
        <td class="asOfCol">${esc(m.col)}</td>
        <td class="asOfBefore">${esc(m.before || "—")}</td>
        <td class="asOfArrow">→</td>
        <td class="asOfAfter">${esc(m.after || "—")}</td>
      </tr>`).join("")
    : `<tr><td colspan="5" class="asOfEmpty">${esc(t("asof_no_changes"))}</td></tr>`;
}

function asOfRenderRows(out, dia) {
  const linhas = out.rows || [];
  $("asOfNote").textContent =
    `${tf("asof_rows_note", fmtDueShort(dia), linhas.length, out.undone || 0)} ${asOfLimits(out)}`;
  $("asOfBodyRows").innerHTML = linhas.length
    ? linhas.map(l => {
      // o que já não é assim hoje fica marcado: é o que faz esta vista valer a
      // pena em vez de ser uma segunda tabela igual
      const mudou = ["Status TC", "Status TP"].some(c =>
        String((l.cols || {})[c] || "") !== String((l.now || {})[c] || ""));
      return `<tr class="${mudou ? "asOfChanged" : ""}">
        <td class="asOfName">${esc(l.fn || l.todo || l.xlrow)}</td>
        <td class="asOfCol">${esc(String((l.cols || {})["To Do"] || "").slice(0, 40))}</td>
        <td class="asOfBefore">${esc((l.cols || {})["Status TC"] || "—")}</td>
        <td class="asOfArrow">${mudou ? "≠" : "="}</td>
        <td class="asOfAfter">${esc((l.now || {})["Status TC"] || "—")}</td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="5" class="asOfEmpty">${esc(t("asof_no_rows"))}</td></tr>`;
}

// etiquetas desta janela, chamadas pelo applyLang (settings.js) como as outras
function applyAsOfLang() {
  $("asOfBtn").textContent = `⏳ ${t("asof_btn")}`;
  $("asOfBtn").title = t("t_asof");
  $("asOfTitle").textContent = t("asof_title");
  $("asOfOverlay").setAttribute("aria-label", t("asof_title"));
  $("asOfClose").title = t("t_close");
  const modo = $("asOfMode");
  modo.options[0].textContent = t("asof_mode_diff");
  modo.options[1].textContent = t("asof_mode_rows");
  if (!$("asOfOverlay").classList.contains("hidden")) loadAsOf();
}

$("asOfBtn").addEventListener("click", openAsOf);
$("asOfClose").addEventListener("click", closeAsOf);
$("asOfOverlay").addEventListener("click", e => {
  if (e.target === $("asOfOverlay")) closeAsOf();
});
$("asOfDate").addEventListener("change", loadAsOf);
$("asOfMode").addEventListener("change", loadAsOf);
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("asOfOverlay").classList.contains("hidden")) {
    e.stopPropagation();
    closeAsOf();
  }
}, true);
