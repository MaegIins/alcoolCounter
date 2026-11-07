// Compteur de notifs non lues (cloche de l'en-tête). Rafraîchi toutes les minutes tant que l'onglet est visible,
// et quand on revient sur l'appli.
import { reactive } from 'vue'
import { api, hasToken } from './api'

export const notifs = reactive({ unread: 0 })

export async function refreshNotifs() {
  if (!hasToken() || document.hidden) return
  notifs.unread = (await api('/notifications/unread').catch(() => null))?.unread ?? notifs.unread
}

let timer = null
export function startNotifs() {
  if (timer) return
  refreshNotifs()
  timer = setInterval(refreshNotifs, 60e3)
  document.addEventListener('visibilitychange', refreshNotifs)
}
export function stopNotifs() {
  clearInterval(timer)
  timer = null
  document.removeEventListener('visibilitychange', refreshNotifs)
  notifs.unread = 0
}
