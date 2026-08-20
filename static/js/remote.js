// O comando (remote.html): o telemóvel a conduzir a app, não a repeti-la.
//
// Três coisas, com botões do tamanho de um dedo: ligar/parar o cronómetro do
// item em curso, dar o item por feito, e marcar o próximo passo da checklist.
// Cada toque usa os MESMOS caminhos da app (/api/todo, as ações de sempre) e
// manda ainda um /api/remote, que faz as janelas do computador saltarem para
// aquele item — é isso que distingue um comando de uma segunda app.

let remItens = [];
let remAtual = null;

function remEl(id) {
  return document.getElementById(id);
}

function remTempo(ms) {
  const seg = Math.floor((+ms || 0) / 1000);
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, "0")}` : `${m} min`;
}

// o tempo em vigor: o total do item mais o que o cronómetro leva desde que
// arrancou (a app faz a mesma conta em todoLiveElapsed)
function remElapsed(item) {
  const base = +item.elapsed_ms || 0;
  return item.timer_started ? base + (Date.now() - +item.timer_started) : base;
}

async function remCarrega() {
  try {
    const res = await fetch("/api/todo/list");
    const out = await res.json();
    remItens = (out.todo || []).filter(x => x && !x.done);
  } catch (err) {
    remEl("remoteState").textContent = "sem servidor";
    return;
  }
  // o item em curso é o que manda; sem nenhum, o primeiro da lista por fazer
  remAtual = remItens.find(x => x.col === "inprogress") || remItens[0] || null;
  remDesenha();
}

function remDesenha() {
  const st = remEl("remoteState");
  st.textContent = remAtual && remAtual.col === "inprogress"
    ? (remAtual.timer_started ? "a contar" : "em curso") : "parado";
  st.classList.toggle("live", !!(remAtual && remAtual.timer_started));
  remEl("remoteItem").textContent = remAtual ? remAtual.title : "nada em curso";
  remEl("remoteTimer").textContent = remAtual ? remTempo(remElapsed(remAtual)) : "";
  remEl("btnTimer").classList.toggle("running", !!(remAtual && remAtual.timer_started));
  // os passos que faltam, para o botão "próximo passo" dizer o que vai marcar
  const passo = remProximoPasso();
  remEl("btnStep").textContent = passo ? `✓ ${passo.title}` : "✓ próximo passo";
  remEl("btnStep").disabled = !passo;
  remEl("btnDone").disabled = !remAtual;
  remEl("btnTimer").disabled = !remAtual;
  // os outros itens: tocar num deles passa a ser o item do comando
  remEl("remoteList").innerHTML = remItens
    .filter(x => x !== remAtual).slice(0, 8)
    .map(x => `<li><button type="button" data-rem="${x.id}">${x.title}</button></li>`)
    .join("");
}

function remProximoPasso() {
  const subs = (remAtual && remAtual.subtasks) || [];
  return subs.find(s => s && !s.done) || null;
}

async function remTodo(payload) {
  try {
    const res = await fetch("/api/todo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const out = await res.json();
    if (out && out.todo) {
      remItens = out.todo.filter(x => x && !x.done);
      remAtual = remItens.find(x => x.id === (remAtual && remAtual.id))
        || remItens.find(x => x.col === "inprogress") || remItens[0] || null;
      remDesenha();
    } else {
      await remCarrega();
    }
  } catch (err) {
    remEl("remoteState").textContent = "falhou";
  }
}

// o ecrã grande segue as mãos: o computador salta para o item em que se tocou
async function remManda(action) {
  if (!remAtual) return;
  try {
    await fetch("/api/remote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ref: remAtual.id, label: remAtual.title }),
    });
  } catch (err) { /* o comando local já fez o que era essencial */ }
}

remEl("btnTimer").addEventListener("click", async () => {
  if (!remAtual) return;
  await remTodo({ action: "toggle_timer", id: remAtual.id });
  remManda("show_todo");
});

remEl("btnDone").addEventListener("click", async () => {
  if (!remAtual) return;
  await remTodo({ action: "toggle", id: remAtual.id });
  remManda("show_todo");
});

remEl("btnStep").addEventListener("click", async () => {
  const passo = remProximoPasso();
  if (!passo || !remAtual) return;
  await remTodo({ action: "toggle_subtask", id: remAtual.id, sub_id: passo.id });
  remManda("show_todo");
});

remEl("btnShow").addEventListener("click", () => remManda("show_todo"));

remEl("remoteList").addEventListener("click", e => {
  const btn = e.target.closest("[data-rem]");
  if (!btn) return;
  remAtual = remItens.find(x => x.id === btn.dataset.rem) || remAtual;
  remDesenha();
  remManda("show_todo");
});

remCarrega();
// o cronómetro a andar no ecrã, e uma leitura de vez em quando para apanhar o
// que foi feito no computador
setInterval(() => { if (remAtual && remAtual.timer_started) remDesenha(); }, 1000);
setInterval(remCarrega, 30000);
