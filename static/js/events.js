// My Organizer — avisos do servidor (SSE): o que muda numa janela aparece nas outras
//
// Antes: cada janela perguntava de 20 em 20 segundos se o livro tinha mudado e
// relia tudo de 2 em 2 minutos. Uma alteração feita noutra janela (ou no
// telemóvel, ou na segunda janela de um livro) só se via quando o ciclo passava
// — e repor uma cópia do estado pedia um F5 à mão.
//
// Agora há uma ligação pendurada em /api/events. Perguntar não desapareceu: uma
// ligação pendurada morre calada (proxy, portátil a adormecer, Wi-Fi a mudar) e
// o ciclo é a rede de segurança — mais lento enquanto os avisos chegam, ao ritmo
// de sempre quando não chegam.

// identidade desta janela: viaja em cada POST (cabeçalho X-Csw-Client) e volta
// no aviso, para uma janela não se recarregar por causa do próprio clique
const CSW_CID = (() => {
  try {
    let id = sessionStorage.getItem("bsp-tracker-cid");
    if (!id) {
      id = `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem("bsp-tracker-cid", id);
    }
    return id;
  } catch (e) {
    return `w${Math.random().toString(36).slice(2, 10)}`;   // sem sessionStorage
  }
})();

let evSource = null;
let evLive = false;         // a ligação está de pé e a servir
let evFails = 0;            // tentativas seguidas falhadas (desiste-se aos 5)
const evHandlers = {};      // kind -> [função]

function eventsLive() {
  return evLive;
}

// outros ficheiros penduram-se aqui (ver notes.js, todo.js): onServerEvent(
// "state", ev => …). Nunca é obrigatório — sem isto a app comporta-se como antes.
function onServerEvent(kind, fn) {
  (evHandlers[kind] = evHandlers[kind] || []).push(fn);
}

function fireServerEvent(kind, ev) {
  (evHandlers[kind] || []).forEach(fn => {
    try { fn(ev); } catch (e) { clientLog(`aviso ${kind} falhou: ${e}`); }
  });
}

// Todos os POST da app levam a identidade da janela. Fica aqui, num sítio só,
// em vez de em cada um dos fetch espalhados pelos ficheiros.
(() => {
  const nativo = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const method = String((init && init.method) ||
        (typeof input !== "string" && input && input.method) || "GET").toUpperCase();
      if (method === "POST" && url.indexOf("/api/") === 0) {
        const opts = Object.assign({}, init);
        const h = new Headers((init && init.headers) ||
          (typeof input !== "string" && input && input.headers) || undefined);
        h.set("X-Csw-Client", CSW_CID);
        opts.headers = h;
        return nativo(input, opts);
      }
    } catch (e) { /* um pedido nunca pode partir por causa disto */ }
    return nativo(input, init);
  };
})();

// ---------------------------------------------------------------------------
// o que fazer com cada aviso

// vários cliques seguidos noutra janela dão vários avisos: junta-se tudo numa
// recarga, um pouco depois, em vez de N recargas em cima uma da outra
let evPend = null;
let evPendFiles = new Set();

function evScheduleReload(file) {
  if (file) evPendFiles.add(file);
  if (evPend) return;
  evPend = setTimeout(async () => {
    evPend = null;
    const files = [...evPendFiles];
    evPendFiles = new Set();
    await evApplyReload(files);
  }, 400);
}

// que ficheiro de estado pede o quê. O que vem no pedido do livro (lista Por
// fazer, CCRs, notas de execução, alterações locais) chega com um load(); o
// quadro das notas e o histórico têm o seu próprio caminho.
async function evApplyReload(files) {
  const set = new Set(files);
  const doBook = ["todo.json", "todo_done_archive.json", "ccrs.json", "notes.json",
    "waiting.json", "status_overrides.json"].some(f => set.has(f));
  try {
    if (set.has("notepad.json") && typeof loadNotepad === "function") await loadNotepad();
    if (doBook && typeof load === "function") await load();
    if (set.has("history.json") && typeof refreshTodayIfOpen === "function") refreshTodayIfOpen();
  } catch (e) {
    clientLog(`recarga por aviso falhou: ${e}`);
  }
}

function evOnState(ev) {
  if (ev.from === CSW_CID) return;           // o meu próprio clique
  if (ev.restored) {
    // repor uma cópia troca o ficheiro por baixo dos pés: aqui é onde a janela
    // deixa de precisar de um F5 à mão
    if (typeof toast === "function") toast(t("ev_restored"), "ok");
  }
  evScheduleReload(ev.file);
}

function evOnSheet(ev) {
  if (typeof checkForChanges === "function") checkForChanges();
}

function evOnExcel(ev) {
  if (ev.from !== CSW_CID || typeof toast !== "function") return;
  // só a janela que está à espera é que ouve isto: as outras não estão paradas
  if (ev.state === "waiting") toast(t("ev_excel_wait"), "");
  else if (ev.state === "writing") toast(t("ev_excel_go"), "ok");
}

// ---------------------------------------------------------------------------
// a ligação

// O comando do telemóvel (ver remote.js e /api/remote): a janela do computador
// salta para onde o dedo tocou. É o mesmo caminho dos outros avisos — e por isso
// a janela que MANDOU o comando ignora-o (o `from` traz o id de quem pediu).
function evOnCommand(ev) {
  if (!ev || (ev.from && ev.from === CSW_CID)) return;
  if (ev.action === "show_todo") {
    if (typeof showView === "function") showView("todo");
    if (typeof load === "function") load();
  }
}

function eventsStart() {
  if (typeof EventSource === "undefined" || evSource) return;
  let src;
  try {
    src = new EventSource(`/api/events?cid=${encodeURIComponent(CSW_CID)}`);
  } catch (e) {
    return;                                   // browser antigo: fica o ciclo
  }
  evSource = src;
  src.addEventListener("open", () => {
    evLive = true;
    evFails = 0;
    clientLog("avisos do servidor ligados");
  });
  ["state", "sheet", "excel", "hello", "command"].forEach(kind => {
    src.addEventListener(kind, msg => {
      let ev = {};
      try { ev = JSON.parse(msg.data || "{}"); } catch (e) { return; }
      evLive = true;
      if (kind === "state") evOnState(ev);
      else if (kind === "sheet") evOnSheet(ev);
      else if (kind === "excel") evOnExcel(ev);
      else if (kind === "command") evOnCommand(ev);
      fireServerEvent(kind, ev);
    });
  });
  src.addEventListener("error", () => {
    evLive = false;
    // o EventSource volta a tentar sozinho (o servidor manda `retry`); ao fim
    // de cinco tentativas seguidas desiste-se e fica o ciclo de perguntar, que
    // é o que já servia a app antes disto existir
    if (++evFails >= 5) {
      try { src.close(); } catch (e) { /* já fechado */ }
      evSource = null;
      clientLog("avisos do servidor desligados (fica o ciclo de 20s)");
    }
  });
}

// a janela que volta ao ecrã depois de o portátil dormir: a ligação pode ter
// morrido calada e o navegador ainda não ter dado por isso. Pendura-se uma vez
// só — o eventsStart pode ser chamado outra vez, o tratador não se repete.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (!evSource) { evFails = 0; eventsStart(); }
  else if (typeof checkForChanges === "function") checkForChanges();
});
