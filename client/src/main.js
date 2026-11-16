import { createApp } from 'vue'
// Icônes Font Awesome (gratuites, embarquées dans le build : pas de CDN) — styles plein et contour seulement
import '@fortawesome/fontawesome-free/css/fontawesome.min.css'
import '@fortawesome/fontawesome-free/css/solid.min.css'
import '@fortawesome/fontawesome-free/css/regular.min.css'
import './style.css'
import App from './App.vue'
import { vDigits } from './api'
import { initTips } from './tips'

import './install' // capte la proposition d'installation dès le chargement

// Pages chargées à la demande : après une mise en ligne, un onglet resté ouvert réclame d'anciens fichiers qui
// n'existent plus. Dans ce cas on recharge (une fois par minute au plus, pour ne pas boucler si le réseau flanche).
window.addEventListener('vite:preloadError', (e) => {
  let last = 0
  try { last = Number(sessionStorage.getItem('reloadedAt')) || 0 } catch {}
  if (Date.now() - last < 60e3) return
  try { sessionStorage.setItem('reloadedAt', String(Date.now())) } catch {}
  e.preventDefault()
  window.location.reload()
})

createApp(App).directive('digits', vDigits).mount('#app')
initTips() // infobulles data-tip : au survol, et au doigt sur téléphone

// Appli installable (Android : « Installer l'appli » / écran d'accueil). Seulement sur le build servi, pas en dev.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
