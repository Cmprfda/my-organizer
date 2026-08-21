// My Organizer — partilha das esperas com a equipa
//
// O "à espera de alguém" (waiting.js) era uma marca só desta instalação: o botão
// **À espera** de cada pessoa era a lista dela. Com este interruptor ligado, as
// minhas esperas passam a ser publicadas na pasta partilhada e todas as
// instalações leem as das outras — assim ninguém vai cobrar uma linha que um
// colega já está a cobrar (ver cswaios/team.py).
//
// É opt-in de propósito: escrever para a pasta partilhada é mandar coisas para
// fora desta máquina, como o webhook dos avisos. Desligado, nada sai — e
// continua-se a ver as esperas de quem partilha.

let teamInfo = { share_waiting: false, canEdit: false, shareFound: false };

async function loadTeamConfig() {
  try {
    const res = await fetch("/api/team/config");
    const out = await res.json();
    teamInfo = {
      share_waiting: !!out.share_waiting,
      canEdit: !!out.canEdit,
      shareFound: !!out.shareFound,
    };
  } catch (err) {
    return;   // sem servidor não há nada a mostrar
  }
  renderTeamCard();
}

function renderTeamCard() {
  const chk = $("teamShareChk");
  chk.checked = teamInfo.share_waiting;
  // quem chega pela rede local vê o estado, não mexe nele (a partilha é a partir
  // do computador onde a app corre, como o webhook e o aviso)
  chk.disabled = !teamInfo.canEdit || !teamInfo.shareFound;
  $("teamShareState").textContent = !teamInfo.shareFound
    ? t("team_share_nofolder")
    : teamInfo.share_waiting ? t("team_share_on") : t("team_share_off");
}

async function setTeamShare(on) {
  if (on && !PERSON) {
    $("teamShareChk").checked = false;
    toast(t("team_share_noname"), "err");
    return;
  }
  try {
    const res = await fetch("/api/team/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ share_waiting: !!on, person: PERSON }),
    });
    const out = await res.json();
    if (!out.ok) { toast(out.error || t("team_share_failed"), "err"); return; }
    teamInfo = {
      share_waiting: !!out.share_waiting, canEdit: true,
      shareFound: !!out.shareFound,
    };
    renderTeamCard();
    toast(out.share_waiting ? t("team_share_on") : t("team_share_off"), "ok");
    // as esperas dos outros entram pela leitura da folha: recarrega-se para
    // elas aparecerem (ou desaparecerem) já
    load();
  } catch (err) {
    toast(t("team_share_failed"), "err");
  }
}

$("teamShareChk").addEventListener("change", e => setTeamShare(e.target.checked));

// ---------------------------------------------------------------------------
// Recados numa linha, bola passada e o kit de chegada
//
// As esperas dizem a quem se cobra; os anúncios falam para todos. Faltava a
// mensagem DIRIGIDA a uma pessoa sobre UMA linha, e o saber que ela chegou. Sem
// servidor, o recibo é outro ficheiro na partilha (ver cswaios/team.py).
//
// Tudo o que se escreve aqui é legível por toda a equipa — a caixa do recado
// di-lo, e nada disto sai sozinho: publicar é sempre um clique.
// ---------------------------------------------------------------------------

let teamMessages = [];      // recados que me dizem respeito (e os meus)
let teamHandoffs = [];      // bolas passadas (para mim e por mim)
let teamWaitingMe = [];     // esperas dos colegas em que o cobrado sou eu
let teamMsgAsked = false;

async function loadTeamMessages(force = false) {
  if (teamMsgAsked && !force) return;
  teamMsgAsked = true;
  try {
    const res = await fetch(`/api/team/messages?person=${encodeURIComponent(PERSON || "")}`);
    const out = await res.json();
    teamMessages = out.ok ? (out.messages || []) : [];
    teamHandoffs = out.ok ? (out.handoffs || []) : [];
    teamWaitingMe = out.ok ? (out.waiting_me || []) : [];
  } catch (err) {
    teamMessages = [];
    teamHandoffs = [];
    teamWaitingMe = [];
  }
}

// a chave partilhada de uma linha (aba||função||to do): a mesma do servidor, sem
// o livro — o caminho do ficheiro é diferente em cada máquina
function teamRowKey(meta, sheet) {
  const aba = String(sheet || (activeTab() && activeTab().sheet) || "");
  return [aba, String((meta && meta.fn) || ""), String((meta && meta.todo) || "")]
    .join("||");
}

function teamMessagesFor(meta) {
  const chave = teamRowKey(meta);
  return (teamMessages || []).filter(m => m.key === chave);
}

function teamHandoffsFor(meta) {
  const chave = teamRowKey(meta);
  return (teamHandoffs || []).filter(h => h.key === chave);
}

// chip ao lado do nome: um recado por ler pesa mais do que um já lido
function messageChipHtml(meta) {
  const recados = teamMessagesFor(meta);
  const bolas = teamHandoffsFor(meta).filter(h => !h.mine && !(h.taken || []).length);
  if (!recados.length && !bolas.length) return "";
  const paraMim = recados.filter(m => !m.mine);
  const meus = recados.filter(m => m.mine);
  // o meu recado mostra se já foi lido; o dos outros mostra que existe
  const tip = [
    ...paraMim.map(m => `${m.from}: ${m.text}`),
    ...meus.map(m => (m.seen || []).length
      ? tf("msg_seen_by", (m.seen || []).map(s => s.who).join(", "))
      : t("msg_unseen")),
    ...bolas.map(h => tf("handoff_tip", h.from, h.col || "", h.value || "")),
  ].join("\n");
  const n = paraMim.length + bolas.length;
  return `<span class="msgChip${n ? " unread" : " sent"}" title="${esc(tip)}">` +
    `✉${n > 1 ? n : ""}${bolas.length ? " ⚑" : ""}</span>`;
}

// ---------- a caixa do recado, na caixa de detalhe da linha ----------
function messageNode(meta) {
  const wrap = document.createElement("div");
  wrap.className = "msgBox";
  const recados = teamMessagesFor(meta);
  const bolas = teamHandoffsFor(meta);
  const lista = recados.map(m => {
    const vistos = (m.seen || []).map(s => `${s.who} (${s.at})`).join(", ");
    return `<li class="msgRow${m.mine ? " mine" : ""}">
      <span class="msgWho">${esc(m.mine ? tf("msg_to", m.to || t("msg_anyone")) : m.from)}</span>
      <span class="msgText">${esc(m.text)}</span>
      <span class="msgWhen">${esc(m.at)}</span>
      ${m.mine
        ? `<span class="msgSeen">${esc(vistos ? tf("msg_seen_by", vistos) : t("msg_unseen"))}</span>`
        + `<button type="button" class="ccr-x msgDel" data-msgdel="${esc(m.id)}"`
        + ` title="${esc(t("msg_del"))}">✕</button>`
        : `<span class="msgSeen">${esc((m.seen || []).some(s => norm(s.who) === norm(PERSON))
          ? t("msg_read") : t("msg_new"))}</span>`}
    </li>`;
  }).join("");
  const bolasHtml = bolas.map(h => `<li class="msgRow handoff">
      <span class="msgWho">${esc(h.mine ? tf("msg_to", h.to) : h.from)}</span>
      <span class="msgText">${esc(tf("handoff_row", h.col || "?", h.value || "?"))}</span>
      <span class="msgWhen">${esc(h.at)}</span>
      <span class="msgSeen">${esc((h.taken || []).length
    ? tf("handoff_taken", (h.taken || []).map(x => x.who).join(", "))
    : t("handoff_pending"))}</span>
    </li>`).join("");
  wrap.innerHTML = (lista || bolasHtml
    ? `<ul class="msgList">${bolasHtml}${lista}</ul>` : "")
    + `<div class="msgFields">
      <input type="text" class="msgTo" list="msgWhoList" maxlength="80"
        placeholder="${esc(t("msg_ph_to"))}" value="">
      <input type="text" class="msgText" maxlength="600"
        placeholder="${esc(t("msg_ph_text"))}">
      <button type="button" class="mini msgSend">${esc(t("msg_send"))}</button>
      <datalist id="msgWhoList">${teamPeopleOptions(meta)}</datalist>
    </div>
    <p class="msgNote">${esc(t("msg_note"))}</p>`;

  // abrir a caixa é ter lido: o recibo vai daqui, e nunca de passar os olhos
  // pela tabela (ver team.ack_seen)
  const porLer = recados.filter(m => !m.mine
    && !(m.seen || []).some(s => norm(s.who) === norm(PERSON)));
  if (porLer.length) ackTeam(porLer.map(m => m.id), []);

  wrap.querySelector(".msgSend").addEventListener("click", async () => {
    const texto = wrap.querySelector(".msgText").value.trim();
    if (!texto) return;
    await sendMessage(meta, wrap.querySelector(".msgTo").value.trim(), texto);
  });
  wrap.addEventListener("click", async e => {
    const del = e.target.closest("[data-msgdel]");
    if (del) { e.stopPropagation(); await deleteMessage(del.dataset.msgdel); }
  });
  return wrap;
}

// os nomes que a folha já conhece nesta linha e nas vizinhas: escrever o nome de
// um colega à mão é a maneira mais fácil de o recado não chegar a ninguém
function teamPeopleOptions(meta) {
  const nomes = new Set();
  const gente = (meta && meta.people) || {};
  ["author_tc", "reviewer_tc", "author_tp", "reviewer_tp"].forEach(k => {
    const nome = String(gente[k] || "").trim();
    if (nome && norm(nome) !== norm(PERSON)) nomes.add(nome);
  });
  (teamMessages || []).forEach(m => { if (m.from) nomes.add(m.from); });
  return [...nomes].map(n => `<option value="${esc(n)}"></option>`).join("");
}

// publicar substitui a minha lista inteira: a lista atual são os meus recados
// que o servidor devolveu, mais (ou menos) este
async function publishMyMessages(lista) {
  try {
    const res = await fetch("/api/team/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person: PERSON, messages: lista }),
    });
    const out = await res.json();
    if (!out.ok) { toast(out.error || t("err_server"), "bad"); return false; }
    await loadTeamMessages(true);
    if (typeof refreshItemBox === "function") refreshItemBox();
    render();
    return true;
  } catch (err) {
    toast(t("err_server"), "bad");
    return false;
  }
}

const myMessages = () => (teamMessages || []).filter(m => m.mine)
  .map(m => ({ id: m.id, key: m.key, to: m.to, text: m.text, at: m.at, label: m.label }));

async function sendMessage(meta, para, texto) {
  if (!PERSON) { toast(t("team_share_noname"), "bad"); return; }
  const novo = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    key: teamRowKey(meta), to: para, text: texto,
    label: String((meta && meta.fn) || ""),
  };
  if (await publishMyMessages([...myMessages(), novo])) toast(t("msg_sent"), "ok");
}

async function deleteMessage(id) {
  await publishMyMessages(myMessages().filter(m => m.id !== id));
}

async function ackTeam(seen, taken) {
  if (!PERSON || (!seen.length && !taken.length)) return;
  try {
    await fetch("/api/team/ack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person: PERSON, seen, taken }),
    });
  } catch (err) { /* o recibo é um extra: sem ele o recado continua a valer */ }
}

// ---------- passar a bola ----------
// Um Envio que muda o estado de uma linha muda de quem é a vez. A folha já o
// dizia; o que ninguém fazia era confirmar que a outra pessoa deu por isso.
//
// Pergunta-se UMA vez por pessoa (e não uma por linha): três confirmações
// seguidas depois de um Envio são três cliques a dizer sim ao mesmo.

// a quem passa a bola desta linha: o reviewer da vertente que mudou, e na falta
// dele o autor. Sem ninguém escrito na folha não há a quem passar.
function handoffTarget(meta, col) {
  const gente = (meta && meta.people) || {};
  const vertente = String(col || "").toUpperCase().includes("TP") ? "tp" : "tc";
  return [gente[`reviewer_${vertente}`], gente[`author_${vertente}`]]
    .map(x => String(x || "").trim())
    .find(x => x && norm(x) !== norm(PERSON)) || "";
}

// as linhas que este Envio vai levar, com a coluna de estado que muda em cada
// uma: lê-se ANTES do Envio, que é quando as alterações locais ainda existem
function pendingStatusRows() {
  const out = [];
  (currentMeta || []).forEach(meta => {
    const over = (meta && meta.over) || {};
    ["Status TC", "Status TP"].forEach(col => {
      if (over[col] != null && String(over[col]).trim()) {
        out.push({ meta, col, value: String(over[col]) });
      }
    });
  });
  return out;
}

async function offerHandoffs(linhas) {
  if (!PERSON || !(linhas || []).length) return;
  const porPessoa = new Map();
  linhas.forEach(l => {
    const alvo = handoffTarget(l.meta, l.col);
    if (!alvo) return;
    if (!porPessoa.has(alvo)) porPessoa.set(alvo, []);
    porPessoa.get(alvo).push(l);
  });
  if (!porPessoa.size) return;
  const novos = [];
  for (const [alvo, suas] of porPessoa) {
    const nomes = suas.map(l => String(l.meta.fn || "")).filter(Boolean).slice(0, 3);
    if (!confirm(tf("handoff_ask", alvo, suas.length, nomes.join(", ")))) continue;
    suas.forEach(l => novos.push({
      key: teamRowKey(l.meta), to: alvo, col: l.col, value: l.value,
      label: String(l.meta.fn || ""),
    }));
  }
  if (!novos.length) return;
  const minhas = (teamHandoffs || []).filter(h => h.mine)
    .map(h => ({ key: h.key, to: h.to, col: h.col, value: h.value, at: h.at, label: h.label }));
  try {
    const res = await fetch("/api/team/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person: PERSON, handoffs: [...minhas, ...novos] }),
    });
    const out = await res.json();
    if (out.ok) {
      await loadTeamMessages(true);
      toast(tf("handoff_sent", novos.length), "ok");
    }
  } catch (err) { /* sem partilha ao alcance a app continua igual */ }
}

// o outro lado: mexi na linha que me passaram, logo já estou com ela
function takeHandoffsFor(linhas) {
  const minhas = (teamHandoffs || []).filter(h => !h.mine && !(h.taken || []).length);
  if (!minhas.length || !(linhas || []).length) return;
  const chaves = new Set(linhas.map(l => teamRowKey(l.meta || l)));
  const aceitar = minhas.filter(h => chaves.has(h.key))
    .map(h => `${norm(h.from)}||${h.key}`);
  if (aceitar.length) ackTeam([], aceitar);
}

// ---------- kit de chegada ----------
// A primeira hora de quem entra no projeto é a pior conversa que a app tem com
// alguém. A cápsula leva o que é CONFIGURAÇÃO (filtros, preferências) e uma
// página com o estado do projeto escrita pela app — nunca trabalho de ninguém.
async function publishCapsule() {
  if (!PERSON) { toast(t("team_share_noname"), "bad"); return; }
  // os filtros vão no mesmo formato do "Publicar" da janela dos filtros, para
  // quem os receber os poder colar na caixa de sempre
  const sets = (customFilterDraft || []).length
    ? [(() => {
      const pacote = JSON.parse(customFilterShareText());
      return {
        name: tf("capsule_set_name", PERSON), sheet: pacote.sheet,
        filters: pacote.filters, lists: pacote.lists,
      };
    })()]
    : [];
  const prefs = { stale_days: staleDays(), lang: LANG };
  try {
    const res = await fetch("/api/team/capsule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person: PERSON, capsule: { name: PERSON, sets, prefs } }),
    });
    const out = await res.json();
    toast(out.ok ? t("capsule_published") : (out.error || t("err_server")),
      out.ok ? "ok" : "bad");
  } catch (err) {
    toast(t("err_server"), "bad");
  }
}

async function openCapsules(btn) {
  let kits = [];
  try {
    const res = await fetch("/api/team/capsules");
    const out = await res.json();
    kits = (out.capsules || []).filter(c => norm(c.person) !== norm(PERSON));
  } catch (err) {
    toast(t("err_server"), "bad");
    return;
  }
  if (!kits.length) { toast(t("capsule_none"), ""); return; }
  const r = btn ? btn.getBoundingClientRect() : { left: 60, bottom: 60 };
  openCopyMenu(r.left, r.bottom + 4, kits.map(k => ({
    label: tf("capsule_item", k.person, (k.sets || []).length, k.updated),
    run: () => applyCapsule(k),
  })));
}

function applyCapsule(kit) {
  // as preferências entram; os filtros passam pela MESMA caixa de colar de
  // sempre (ver customfilters.js): ninguém recebe filtros sem os ver
  if (kit.prefs && +kit.prefs.stale_days) setStaleDays(+kit.prefs.stale_days);
  const set = (kit.sets || [])[0];
  if (set) {
    openCustomFilterPaste(JSON.stringify({
      kind: CUSTOMFILTER_SHARE_KIND, sheet: set.sheet,
      filters: set.filters, lists: set.lists,
    }, null, 1));
  }
  if (kit.brief) {
    // a página do estado do projeto abre na janela do relatório, que já sabe
    // mostrar (e copiar, e guardar) markdown
    $("reportOverlay").classList.remove("hidden");
    $("reportTitle").textContent = tf("capsule_brief", kit.person);
    $("reportBody").textContent = kit.brief;
    weekReportText = kit.brief;
  }
  toast(tf("capsule_imported", kit.person), "ok");
}

function applyTeamLang() {
  $("setSecTeam").textContent = t("team_sec");
  $("teamShareLbl").textContent = t("team_share_lbl");
  $("teamShareHint").textContent = t("team_share_hint");
  $("teamCapsuleLbl").textContent = t("capsule_lbl");
  $("teamCapsulePub").textContent = t("capsule_publish");
  $("teamCapsuleGet").textContent = t("capsule_get");
  $("teamCapsuleHint").textContent = t("capsule_hint");
  renderTeamCard();
}

$("teamCapsulePub").addEventListener("click", publishCapsule);
$("teamCapsuleGet").addEventListener("click", e => openCapsules(e.currentTarget));
