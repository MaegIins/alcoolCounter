// Notifs push : la notif (like, commentaire, abonné, succès) arrive aussi sur le téléphone, appli fermée.
// Un abonnement par navigateur, rattaché au compte connecté. Il faut le service worker (build servi, pas en dev)
// et des clés VAPID côté serveur (sinon /api/push/key renvoie null et rien ne s'affiche).
import { reactive } from 'vue'
import { api } from './api'

const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const push = reactive({
  ready: false, // état connu (clé du serveur, abonnement de ce navigateur)
  available: false, // possible ici : navigateur compatible, service worker en place, serveur configuré
  permission: supported ? Notification.permission : 'unsupported', // 'default' | 'granted' | 'denied'
  subscribed: false,
})
let key = null
const OWNER = 'push-user' // compte pour qui ce navigateur est abonné (pas de notifs de l'ancien compte à un autre)

const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0))
const sameKey = (sub) => {
  const k = sub.options?.applicationServerKey
  if (!k) return true
  const a = new Uint8Array(k), b = b64(key)
  return a.length === b.length && a.every((x, i) => x === b[i])
}
const store = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* stockage bloqué */ } }
const stored = (k) => { try { return localStorage.getItem(k) } catch { return null } }

/** À la connexion : on regarde où on en est, et on renvoie l'abonnement au serveur (il suit la session) */
export async function initPush(userId) {
  push.ready = false
  push.subscribed = false
  const reg = supported && (await navigator.serviceWorker.getRegistration().catch(() => null))
  key = reg ? ((await api('/push/key').catch(() => null))?.key ?? null) : null
  push.available = !!(reg && key)
  push.permission = supported ? Notification.permission : 'unsupported'
  const sub = push.available && (await reg.pushManager.getSubscription().catch(() => null))
  if (sub) {
    if (push.permission === 'granted' && sameKey(sub) && stored(OWNER) === String(userId)) {
      push.subscribed = await api('/push/subscribe', { method: 'POST', body: sub.toJSON() }).then(() => true, () => false)
    } else await sub.unsubscribe().catch(() => {}) // autre compte, clés du serveur changées, permission retirée
  }
  push.ready = true
}

/** Bouton « Activer » : permission du navigateur, puis abonnement. Renvoie un message d'erreur, ou '' si ok */
export async function enablePush(userId) {
  if (!push.available) return 'Pas disponible ici'
  push.permission = await Notification.requestPermission()
  if (push.permission !== 'granted') return push.permission === 'denied' ? 'Notifications refusées' : ''
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) })
    await api('/push/subscribe', { method: 'POST', body: sub.toJSON() })
    store(OWNER, userId)
    push.subscribed = true
    return ''
  } catch (e) {
    return e.message || 'Impossible d’activer les notifs'
  }
}

/** Couper sur ce navigateur (bouton, ou déconnexion) */
export async function disablePush() {
  const reg = supported && (await navigator.serviceWorker.getRegistration().catch(() => null))
  const sub = reg && (await reg.pushManager.getSubscription().catch(() => null))
  if (sub) {
    await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {})
    await sub.unsubscribe().catch(() => {})
  }
  store(OWNER, null)
  push.subscribed = false
}

export const testPush = () => api('/push/test', { method: 'POST' })
