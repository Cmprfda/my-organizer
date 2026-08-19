// My Organizer — service worker (só a casca da app)
//
// Para quê: a app é usada no telemóvel pela rede local, e quando o PC onde o
// servidor corre adormece o browser mostrava a página de erro dele — nem o nome
// da app. Com isto, a casca (index.html, CSS, JS, ícones) fica guardada e a app
// abre sempre: quem não responde é o servidor, e a app já sabe dizer isso à sua
// maneira (o sinal vermelho no canto).
//
// Duas regras, ambas de propósito:
//
// 1. **Rede primeiro, cache como rede de emergência.** A app atualiza-se sozinha
//    (ver updates.py) e uma casca velha servida por cima de um servidor novo
//    dava uma app a falar com uma versão que já não existe. Com rede, ganha
//    sempre a rede — e a resposta boa fica guardada para a próxima falha.
// 2. **Os `/api/` NUNCA entram na cache.** Mostrar tarefas de ontem como se
//    fossem de agora é pior do que não mostrar nada: uma pessoa marcava um
//    estado a partir de uma folha que já mudou. Sem servidor, os pedidos falham
//    e a interface mostra o que já mostra hoje.
//
// Nota: um service worker só corre em contexto seguro (https ou localhost), por
// isso no telemóvel — que chega por http à rede local — isto não se registra. Lá
// o que vale é o manifest e o "adicionar ao ecrã principal" (ver index.html).

const CACHE = "organizer-shell-v1";

// a casca mínima: o suficiente para a app abrir e dizer o que se passa
const SHELL = [
  "/",
  "/static/css/theme.css",
  "/static/css/layout.css",
  "/static/img/app-icon-192.png",
  "/static/manifest.webmanifest",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll é tudo-ou-nada: um ficheiro em falta deixava a app sem casca
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;   // dados nunca vêm da cache

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copia)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match("/")))
  );
});
