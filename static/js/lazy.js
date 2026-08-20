// My Organizer — carregar um ficheiro de interface só quando ele é preciso
//
// A página trazia 34 scripts, todos lidos antes de aparecer qualquer coisa. Dois
// deles não servem para nada até se clicar: a ajuda (o "?") e a página das
// Métricas. Ficam de fora do arranque e chegam no clique — o resto continua a
// vir tudo, porque tudo se usa a desenhar a primeira vista.
//
// Regra para quem acrescentar aqui outro ficheiro: as funções dele deixam de
// existir enquanto não for carregado. Quem lhe chamar de fora tem de o fazer
// por `lazyThen(...)` (preciso agora) ou com um `typeof f === "function"`
// (só se já estiver cá).

const LAZY_DONE = {};      // nome -> Promise (a mesma para quem pedir outra vez)

function lazyModule(name) {
  if (LAZY_DONE[name]) return LAZY_DONE[name];
  LAZY_DONE[name] = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `/static/js/${name}.js`;
    s.onload = () => resolve(name);
    s.onerror = () => {
      // sem rede a app já avisa por outros lados; aqui deixa-se tentar outra vez
      delete LAZY_DONE[name];
      reject(new Error(`sem ${name}.js`));
    };
    document.head.appendChild(s);
  });
  return LAZY_DONE[name];
}

// carrega e faz. Erro a carregar não pode partir quem chamou: fica sem a vista,
// que é exatamente o que já acontecia sem servidor.
function lazyThen(name, fn) {
  return lazyModule(name).then(fn).catch(e => clientLog(`lazy ${name}: ${e}`));
}

// Botão cujo tratador vive no ficheiro que ainda não veio: o primeiro clique
// carrega e volta a clicar, para o tratador de verdade responder a esse mesmo
// clique. Em captura e com stopPropagation, senão o clique seguia caminho e
// chegava aos tratadores globais (fechar menus, sair de vistas) duas vezes.
function lazyButton(id, name) {
  const el = document.getElementById(id);
  if (!el) return;
  const boot = e => {
    e.stopPropagation();
    e.preventDefault();
    el.removeEventListener("click", boot, true);
    lazyModule(name).then(() => el.click())
      .catch(e2 => { clientLog(`lazy ${name}: ${e2}`); el.addEventListener("click", boot, true); });
  };
  el.addEventListener("click", boot, true);
}

// a ajuda e as "Novidades" vivem as duas no help.js
lazyButton("helpBtn", "help");
lazyButton("changelogBtn", "help");
