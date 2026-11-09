// Compteur de notifs non lues (cloche de l'en-tête). Paliers de chacun (ranks.js) : à la connexion et quand une notif arrive. Rafraîchi toutes les minutes tant que l'onglet est visible,
// et quand on revient sur l'appli. Notifs push activées : le service worker prévient à chaque notif, on ne
// redemande alors que toutes les 5 min (filet de sécurité).
import { reactive } from 'vue'
import { api, hasToken } from './api'
import { refreshRanks } from './ranks'
import { push } from './push'
import { openUrl } from './nav'

export const notifs = reactive({ unread: 0 })

let last = 0
export async function refreshNotifs() {
  if (!hasToken() || document.hidden) return
  last = Date.now()
  const before = notifs.unread
  notifs.unread = (await api('/notifications/unread').catch(() => null))?.unread ?? notifs.unread
  if (notifs.unread > before) refreshRanks() // une nouvelle notif peut être un succès (likes, abonnés…)
}

let timer = null
export function startNotifs() {
  if (timer) return
  refreshNotifs()
  refreshRanks() // paliers : une fois à la connexion, puis seulement quand un succès tombe
  timer = setInterval(() => (!push.subscribed || Date.now() - last > 5 * 60e3) && refreshNotifs(), 60e3)
  document.addEventListener('visibilitychange', refreshNotifs)
}
export function stopNotifs() {
  clearInterval(timer)
  timer = null
  document.removeEventListener('visibilitychange', refreshNotifs)
  notifs.unread = 0
}

// Messages du service worker : une notif push vient d'arriver (la cloche se met à jour), ou on a touché une notif
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'notif') refreshNotifs()
    else if (e.data?.type === 'open' && hasToken()) openUrl(e.data.url)
  })
  navigator.serviceWorker.startMessages?.()
}
