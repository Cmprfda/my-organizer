// My Organizer — avisos por tarefa: quando alguém mexe no livro numa linha que
// é minha (autor, reviewer ou só mencionada), aparece um cartão do lado direito
// a dizer o que mudou. Não substitui o toast genérico ("o livro mudou — dados
// atualizados"): este empilha vários avisos ao mesmo tempo, cada um com o seu
// próprio tempo de vida e o seu ✕.

// Colunas seguidas: as mesmas que a app sabe ler/escrever no Excel. Os valores
// vêm de meta.orig, que é o valor REAL da folha — sem as minhas alterações
// locais (✎) aplicadas por cima. Se comparássemos as células apresentadas,
// mudar um estado aqui gerava um aviso a mim mesmo na gravação seguinte.
const NOTIFY_COLS = ["Status TC", "Status TP", "OBS", "Function/TC", "To Do"];
const NOTIFY_MAX = 4;       // cartões detalhados por ronda (o resto vai contado num só)
const NOTIFY_KEEP = 6;      // cartões no ecrã ao mesmo tempo
const NOTIFY_LINES = 3;     // colunas mostradas por cartão
const NOTIFY_LIFE = 7000;   // ms até o cartão desaparecer sozinho

// snapshot da última leitura só das minhas linhas: { xlrow: {fn, todo, cols} }.
// É separado do lastData/rows da tabela à vista de propósito: a tabela pode
// estar em "Ver tudo" (ou noutra vista) e isto tem de continuar a comparar
// sempre o mesmo conjunto — as tarefas ligadas a mim.
let notifySnap = null;
let notifySig = "";         // livro||aba||pessoa a que o snapshot pertence
let notifySeq = 0;

// ---------- pilha de cartões ----------

function notifyStackEl() {
  let el = $("notifyStack");
  if (!el) {
    el = document.createElement("div");
    el.id = "notifyStack";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  return el;
}

function notifyClose(card) {
  if (!card) return;
  clearTimeout(Number(card.dataset.timer));
  card.remove();
}

// cada cartão é um elemento independente (id próprio): fechar ou expirar um
// nunca mexe nos outros, ao contrário do #toast, que só tem um lugar
function notifyCard(inner) {
  const stack = notifyStackEl();
  const card = document.createElement("div");
  card.className = "notifyCard";
  card.id = `notify-${++notifySeq}`;
  card.innerHTML = inner +
    `<button type="button" class="notifyX" title="${esc(t("notify_close"))}" ` +
    `aria-label="${esc(t("notify_close"))}">✕</button>`;
  card.querySelector(".notifyX").addEventListener("click", () => notifyClose(card));
  stack.appendChild(card);
  card.dataset.timer = String(setTimeout(() => notifyClose(card), NOTIFY_LIFE));
  // o livro é gravado muitas vezes de seguida: a pilha não pode crescer sem fim
  while (stack.children.length > NOTIFY_KEEP) notifyClose(stack.firstElementChild);
  return card;
}

// o nome da tarefa segue a convenção do resto da app: o Function/TC é o título
// e o "To Do" a linha de baixo. Sem Function/TC (folha sem essa coluna) sobra o
// nº da linha do Excel, que é o que identifica a linha de forma única.
function notifyTitle(row) {
  return (row.fn || "").trim() || tf("notify_row", row.xlrow);
}

function notifyChangeHtml(ch) {
  const de = ch.from ? esc(ch.from) : "—";
  const para = ch.to ? esc(ch.to) : "—";
  return `<div class="notifyLine"><span class="notifyCol">${esc(ch.col)}</span>` +
    `<span class="notifyFrom">${de}</span><span class="notifyArrow">→</span>` +
    `<span class="notifyTo">${para}</span></div>`;
}

function notifyTaskCard(row) {
  const todo = (row.todo || "").trim();
  const curto = todo.length > 90 ? todo.slice(0, 90) + "…" : todo;
  const extra = row.changes.length - NOTIFY_LINES;
  notifyCard(
    `<div class="notifyHead">${esc(t("notify_task_changed"))}</div>` +
    `<div class="notifyTitle">${esc(notifyTitle(row))}</div>` +
    (curto ? `<div class="notifySub">${esc(curto)}</div>` : "") +
    row.changes.slice(0, NOTIFY_LINES).map(notifyChangeHtml).join("") +
    (extra > 0 ? `<div class="notifyLine notifyMore">${esc(tf("notify_more_cols", extra))}</div>` : "")
  );
}

// ---------- leitura e comparação ----------

function notifySnapshot(metas) {
  const snap = {};
  (metas || []).forEach(m => {
    if (!m || m.xlrow === undefined || m.xlrow === null) return;
    const cols = {};
    NOTIFY_COLS.forEach(c => {
      if (m.orig && Object.prototype.hasOwnProperty.call(m.orig, c))
        cols[c] = String(m.orig[c] === null || m.orig[c] === undefined ? "" : m.orig[c]);
    });
    snap[String(m.xlrow)] = { fn: m.fn || "", todo: m.todo || "", cols };
  });
  return snap;
}

// compara por xlrow (o nº real da linha na folha): é a única chave estável —
// há linhas com o mesmo Function/TC e "To Do" em branco, e o índice no array
// muda sozinho quando se insere ou apaga uma linha no Excel. Linhas novas ou
// desaparecidas ficam de fora em silêncio (não há nada de útil a dizer).
function notifyDiff(antes, agora) {
  const mudou = [];
  Object.keys(agora).forEach(k => {
    const a = antes[k];
    const b = agora[k];
    if (!a) return;
    const changes = [];
    Object.keys(b.cols).forEach(c => {
      if (!Object.prototype.hasOwnProperty.call(a.cols, c)) return;  // coluna nova na folha
      if (a.cols[c] !== b.cols[c]) changes.push({ col: c, from: a.cols[c], to: b.cols[c] });
    });
    if (changes.length)
      mudou.push({ xlrow: k, fn: b.fn || a.fn, todo: b.todo || a.todo, changes });
  });
  return mudou;
}

// linhas da pessoa, sempre com "Ver tudo" desligado: o aviso é sobre as MINHAS
// tarefas, independentemente do que a tabela está a mostrar. Com o "Ver tudo"
// desligado o load() que acabou de correr já trouxe exatamente essas linhas —
// reaproveita-se, para não reler o livro (uma chamada ao OneDrive) duas vezes.
async function notifyScopedPayload() {
  if (!lastData || lastData.error) return null;
  if (!showAll) return lastData;
  try {
    const res = await fetch(`/api/tasks?person=${encodeURIComponent(PERSON)}&all=0` +
      `&sheet=${encodeURIComponent(lastData.sheet || SHEET)}` +
      `&file=${encodeURIComponent(lastData.file || FILE)}` +
      `&cycle=0&fresh=0&lang=${LANG}&source=${SOURCE}`);
    return await res.json();
  } catch (e) {
    return null;   // sem rede: a ronda seguinte volta a tentar
  }
}

// chamada no arranque (só semeia) e depois de cada recarga por gravação do livro
async function notifyTaskChanges() {
  const data = await notifyScopedPayload();
  if (!data || data.error) return;
  // leitura degradada (ficheiro bloqueado pelo Excel, cache antiga): os valores
  // podem não ser os da folha. O snapshot fica intocado para a comparação
  // seguinte ser feita contra a última leitura boa.
  if (data.warning) return;
  const metas = data.row_meta || [];
  if (!metas.length) return;
  const sig = `${data.file || ""}||${data.sheet || ""}||${norm(data.person || PERSON)}`;
  const snap = notifySnapshot(metas);
  if (!notifySnap || notifySig !== sig) {
    // primeira leitura da sessão (ou mudou de livro/aba/pessoa): semeia em
    // silêncio, senão a app abria com um cartão por cada tarefa
    notifySnap = snap;
    notifySig = sig;
    return;
  }
  const mudou = notifyDiff(notifySnap, snap);
  notifySnap = snap;
  if (!mudou.length) return;
  clientLog(`avisos: ${mudou.length} tarefa(s) minha(s) mudaram no livro`);
  mudou.slice(0, NOTIFY_MAX).forEach(notifyTaskCard);
  if (mudou.length > NOTIFY_MAX)
    notifyCard(`<div class="notifyHead">${esc(t("notify_task_changed"))}</div>` +
      `<div class="notifyTitle">${esc(tf("notify_more_rows", mudou.length - NOTIFY_MAX))}</div>`);
}
