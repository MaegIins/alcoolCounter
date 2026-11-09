// Compteur de notifs non lues (cloche de l'en-tête). Paliers de chacun (ranks.js) : à la connexion et quand une notif arrive. Rafraîchi toutes les minutes tant que l'onglet est visible,
// et quand on revient sur l'appli.
import { reactive } from 'vue'
import { api, hasToken } from './api'
import { refreshRanks } from './ranks'

export const notifs = reactive({ unread: 0 })

export async function refreshNotifs() {
  if (!hasToken() || document.hidden) return
  const before = notifs.unread
  notifs.unread = (await api('/notifications/unread').catch(() => null))?.unread ?? notifs.unread
  if (notifs.unread > before) refreshRanks() // une nouvelle notif peut être un succès (likes, abonnés…)
}

let timer = null
export function startNotifs() {
  if (timer) return
  refreshNotifs()
  refreshRanks() // paliers : une fois à la connexion, puis seulement quand un succès tombe
  timer = setInterval(refreshNotifs, 60e3)
  document.addEventListener('visibilitychange', refreshNotifs)
}
export function stopNotifs() {
  clearInterval(timer)
  timer = null
  document.removeEventListener('visibilitychange', refreshNotifs)
  notifs.unread = 0
}
