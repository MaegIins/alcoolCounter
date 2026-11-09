// Service worker minimal : rend l'appli installable (écran d'accueil, appli Android) et affiche une page
// « Pas de réseau » au lieu du dinosaure de Chrome. Volontairement rien d'autre : pas de cache de l'API ni
// de l'appli (le cache HTTP s'occupe déjà des /assets), donc jamais de vieille version servie après un déploiement.
const OFFLINE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#100f0a"><title>L’Ardoise</title></head>
<body style="margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#100f0a;color:#e4dcc3;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box">
<div style="font-size:64px">🍺</div><h1 style="margin:0;font-size:22px;color:#d4bc35">Pas de réseau</h1>
<p style="margin:0;color:#978e76;max-width:280px">Le bar capte mal. Ça repart tout seul dès que le réseau revient.</p>
<button onclick="location.reload()" style="margin-top:8px;padding:10px 20px;border:0;border-radius:999px;background:#d4bc35;color:#100f0a;font:inherit;font-weight:700">Réessayer</button>
<script>addEventListener('online', () => location.reload())</script></body></html>`

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return // tout le reste : le navigateur, comme sans service worker
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })))
})
