// A montra: quatro números para ler a dois metros (ver montra.html).
//
// Não carrega a interface da app (são ~800 KB de JS para mostrar quatro
// números): pede o /api/montra, que já traz as contas feitas, e fica pendurada
// nos avisos do servidor (/api/events) para se refazer quando algo mexer. O
// ciclo lento continua lá como rede de segurança — uma ligação pendurada morre
// calada, e uma montra parada a mostrar números de ontem é pior do que uma
// montra que pergunta de vez em quando.

const MONTRA_CICLO = 120000;      // rede de segurança, não o caminho normal
const MONTRA_DIAS = 7;            // limite das paradas (o mesmo valor por omissão da app)
// o nome vive no browser (a mesma chave do state.js): sem ele o servidor não
// pode dizer quem está à espera desta pessoa
const MONTRA_PESSOA = localStorage.getItem("bsp-tracker-person") || "";

function montraSet(id, valor, alerta) {
  const el = document.getElementById(id);
  if (!el) return;
  el.querySelector(".montraValue").textContent = valor;
  el.classList.toggle("alerta", !!alerta);
}

function montraTempo(ms) {
  const min = Math.round((+ms || 0) / 60000);
  if (!min) return "0";
  const h = Math.floor(min / 60);
  return h ? `${h}h${String(min % 60).padStart(2, "0")}` : `${min}m`;
}

function montraHora(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

async function montraCarrega() {
  let out;
  try {
    const res = await fetch(`/api/montra?days=${MONTRA_DIAS}` +
      `&person=${encodeURIComponent(MONTRA_PESSOA)}`);
    out = await res.json();
  } catch (err) {
    document.getElementById("montraWhen").textContent = "sem servidor";
    document.body.classList.add("montraOff");
    return;
  }
  document.body.classList.remove("montraOff");
  // um número grande não diz se é bom ou mau: o vermelho é só para o que está à
  // espera de alguém (a cobrar) e para o que ficou por enviar
  montraSet("tileChase", out.chase || 0, (out.chase || 0) > 0);
  montraSet("tileStale", out.stale || 0, false);
  montraSet("tilePending", out.pending || 0, (out.pending || 0) > 0);
  montraSet("tileUnlogged", montraTempo(out.unlogged_ms), false);
  // este só aparece quando há mesmo alguém à espera: um zero permanente numa
  // montra é ruído, e quem trabalha sozinho não tem esperas de colegas
  const espera = out.waitme || 0;
  const mosaico = document.getElementById("tileWaitMe");
  if (mosaico) mosaico.hidden = !espera;
  montraSet("tileWaitMe", espera, espera > 0);
  document.getElementById("montraWhen").textContent =
    `${new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}` +
    ` · ${out.open || 0} linhas abertas · paradas há ${out.days} dias`;
  const feed = document.getElementById("montraFeed");
  const eventos = out.events || [];
  feed.innerHTML = eventos.length
    ? eventos.map(e => `<li><span class="mWhen">${montraHora(e.ts)}</span>` +
      `<span class="mName">${(e.fn || "").slice(0, 44)}</span>` +
      `<span class="mVal">${(e.col || "")}: ${(e.to || "—").slice(0, 28)}</span></li>`).join("")
    : `<li class="mQuiet">nada desde ontem</li>`;
}

// os avisos do servidor: a montra refaz-se em menos de um segundo quando alguém
// grava a folha ou mexe no estado, em vez de esperar pelo ciclo
function montraEscuta() {
  let es;
  try {
    es = new EventSource("/api/events");
  } catch (err) {
    return;
  }
  ["state", "sheet", "excel"].forEach(tipo =>
    es.addEventListener(tipo, () => montraCarrega()));
  es.addEventListener("error", () => {
    // o EventSource volta a tentar sozinho (retry: 3000 do servidor); o ciclo
    // abaixo garante que a montra não fica parada se ele desistir
  });
}

montraCarrega();
montraEscuta();
setInterval(montraCarrega, MONTRA_CICLO);
