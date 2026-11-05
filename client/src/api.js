import { ref } from 'vue'
import { nightOf, addDays, sanitizeDigits } from './utils.js'

export * from './utils.js'

let token = localStorage.getItem('token') || ''
// Appelé quand le serveur répond 401 sur une requête authentifiée (session expirée / révoquée)
let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn)

export const setToken = (t) => {
  token = t || ''
  t ? localStorage.setItem('token', t) : localStorage.removeItem('token')
}
export const hasToken = () => !!token

// Bande courante (envoyée dans l'en-tête X-Group) ; réactive pour que l'appli recharge en changeant de bande
const readGroup = () => {
  try {
    return Number(localStorage.getItem('group')) || null
  } catch {
    return null
  }
}
export const currentGroup = ref(readGroup())
export const setGroup = (id) => {
  currentGroup.value = id || null
  try {
    id ? localStorage.setItem('group', String(id)) : localStorage.removeItem('group')
  } catch {}
}
// Appelé quand le serveur répond que je ne suis dans aucune bande (ou plus dans celle-ci)
let onNoGroup = () => {}
export const setNoGroupHandler = (fn) => (onNoGroup = fn)

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(currentGroup.value ? { 'X-Group': String(currentGroup.value) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 409 && data.code === 'NO_GROUP') onNoGroup()
    if (res.status === 401 && token) {
      setToken('')
      onUnauthorized()
    }
    throw Object.assign(new Error(data.error || 'Erreur serveur'), { status: res.status })
  }
  return data
}

// « Ce soir » réactif : la soirée en cours (jusqu'à 6h du matin, on compte pour la veille).
// Se met à jour au changement de soirée ou au retour sur l'onglet, donc tous les computed qui appellent today() suivent.
const now = ref(nightOf(new Date()))
const tick = () => (now.value = nightOf(new Date()))
setInterval(tick, 60e3)
document.addEventListener('visibilitychange', tick)
export const today = () => now.value
export const prettyDay = (day) => {
  if (day === today()) return 'Ce soir'
  if (day === addDays(today(), -1)) return 'Hier soir'
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

// Recadre au carré + redimensionne côté client avant envoi
export async function resizeImage(file, size = 192) {
  const img = await createImageBitmap(file)
  const s = Math.min(img.width, img.height)
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size })
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff' // JPEG n'a pas de transparence : fond blanc plutôt que noir
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size)
  return canvas.toDataURL('image/jpeg', 0.85)
}

// Photo de conso ou de produit, compressée pour prendre peu de place sur le serveur :
// plus grand côté à `max` px, WebP si le navigateur sait l'encoder (sinon JPEG), qualité baissée puis image
// réduite jusqu'à passer sous PHOTO_BUDGET (≈ 100 ko). Le serveur refuse au-delà de 200 000 caractères.
export const PHOTO_BUDGET = 140_000 // caractères de data URL (base64 : ~4/3 de la taille réelle)
export async function resizePhoto(file, max = 800) {
  const img = await createImageBitmap(file)
  let k = Math.min(1, max / Math.max(img.width, img.height))
  for (let attempt = 0; attempt < 4; attempt++, k *= 0.75) {
    const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) })
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const q of [0.72, 0.6, 0.48]) {
      let url = canvas.toDataURL('image/webp', q)
      if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', q) // Safari ancien : pas de WebP
      if (url.length <= PHOTO_BUDGET) return url
    }
  }
  throw new Error('Photo trop lourde, même compressée')
}
export const photoUrl = (key) => (key ? `/api/photos/${key}` : '')

// v-digits : n'accepte que des chiffres (frappe, collage, autocorrection). v-digits="59" plafonne la valeur.
export const vDigits = {
  mounted(el, binding) {
    // Frappe d'un caractère non numérique : bloquée net. Collage : nettoyé dans 'input'.
    el.addEventListener('beforeinput', (e) => {
      if (e.data?.length === 1 && /\D/.test(e.data)) e.preventDefault()
    })
    el.addEventListener('input', () => {
      const v = sanitizeDigits(el.value, binding.value)
      if (v !== el.value) {
        el.value = v
        el.dispatchEvent(new Event('input')) // resynchronise v-model avec la valeur nettoyée
      }
    })
  },
}
