// Effets « juicy » : texte qui s'envole, bulles, confettis, toasts, vibration.
// Les particules sont de simples éléments DOM animés en CSS (style.css), retirés à la fin de l'animation.
import { reactive } from 'vue'
import { refreshRanks } from './ranks'

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const spawn = (cls, style, text = '', icon = '') => {
  const el = document.createElement('span')
  el.className = `fx ${cls}`
  if (icon) el.innerHTML = `<i class="fa-solid ${icon}"></i>` // icône Font Awesome (classe fixe, pas de saisie)
  else el.textContent = text
  Object.assign(el.style, style)
  el.addEventListener('animationend', () => el.remove(), { once: true })
  document.body.append(el)
  return el
}

/** « +2,1 » qui s'envole depuis (x, y), et des gouttes qui giclent puis retombent. */
// icon = classe Font Awesome à faire s'envoler à la place du texte
export function burst(x, y, { text = '', icon = '', color = '#d4bc35', bubbles = 9 } = {}) {
  if (text || icon) spawn('fx-float', { left: `${x}px`, top: `${y}px`, color }, text, icon)
  if (reduced()) return
  for (let i = 0; i < bubbles; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6 // surtout vers le haut, en éventail
    const d = 25 + Math.random() * 55
    const size = 3 + Math.random() * 6
    spawn('fx-drop', {
      left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size * (1 + Math.random() * 0.6)}px`,
      '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d}px`, '--fall': `${60 + Math.random() * 90}px`,
      background: color, animationDelay: `${Math.random() * 60}ms`,
    })
  }
}
/** Centre d'un élément (ou d'un évènement de clic) pour y lancer un burst. */
export const centerOf = (e) => {
  const r = (e.currentTarget ?? e.target ?? e).getBoundingClientRect?.()
  return r ? [r.left + r.width / 2, r.top + r.height / 3] : [window.innerWidth / 2, window.innerHeight / 2]
}

// Grosse occasion (premier de la soirée, badge) : pas de confettis, de la cendre et des gouttes qui tombent du plafond
const FALLOUT = ['#6e6a62', '#6e6a62', '#8a857a', '#4a4740', '#d4bc35', '#a88a1c']
export function confetti(n = 60) {
  if (reduced()) return
  for (let i = 0; i < n; i++) {
    const c = FALLOUT[i % FALLOUT.length]
    const drop = c === '#d4bc35' || c === '#a88a1c'
    const size = drop ? 3 + Math.random() * 4 : 2 + Math.random() * 7
    spawn(drop ? 'fx-rain' : 'fx-ash', {
      left: `${Math.random() * 100}vw`,
      background: c,
      '--drift': `${(Math.random() - 0.5) * (drop ? 20 : 140)}px`,
      '--spin': `${(Math.random() - 0.5) * 540}deg`,
      animationDuration: `${drop ? 0.9 + Math.random() * 0.6 : 2.4 + Math.random() * 2}s`,
      animationDelay: `${Math.random() * 500}ms`,
      width: `${size}px`, height: `${drop ? size * 2.2 : size * (0.5 + Math.random() * 0.6)}px`,
    })
  }
}

export const vibrate = (p = 25) => navigator.vibrate?.(p)

// --- Toasts -------------------------------------------------------------------------
export const toasts = reactive([])
let seq = 0
// action = { label, run } : bouton dans le toast (ex. « Annuler »), qui reste alors affiché plus longtemps
// icon = classe Font Awesome affichée devant le texte (ex. 'fa-droplet')
export function toast(text, { kind = 'info', ms, action, icon } = {}) {
  const id = ++seq
  toasts.push({ id, text, kind, action, icon })
  setTimeout(() => dismiss(id), ms ?? (action ? 5000 : 2200))
  return id
}
export function dismiss(id) {
  const i = toasts.findIndex((t) => t.id === id)
  if (i >= 0) toasts.splice(i, 1)
}

// Badges débloqués : gros toast + confettis
export function celebrateBadges(badges = []) {
  if (badges.length) refreshRanks() // mon anneau change peut-être de couleur
  badges.forEach((b, i) =>
    setTimeout(() => {
      toast(`${b.icon} Badge débloqué : ${b.label}`, { kind: 'badge', ms: 3500 })
      confetti(40)
      vibrate([30, 40, 30])
    }, 600 + i * 900)
  )
}

// Clopes et eau : juste le compte, pas de commentaire
export const smokeLine = (n) => `Clope n°${n}`
export const waterLine = (n) => `Verre d'eau n°${n}`

// Paliers de la soirée (en verres standard) : info sobre, avec un rappel d'eau aux gros paliers
export const MILESTONES = [
  { at: 5, text: "5 verres aujourd'hui" },
  { at: 10, text: '10 verres aujourd’hui · pense à l’eau' },
  { at: 20, text: '20 verres aujourd’hui · eau, et personne ne conduit' },
  { at: 30, text: '30 verres · suspect' },
]
export const milestoneBetween = (before, after) => MILESTONES.filter((m) => before < m.at && after >= m.at).at(-1)

// --- Confirmation (remplace window.confirm) -----------------------------------------
// const ok = await ask({ title, message, confirm: 'Retirer', danger: true })
export const dialog = reactive({ open: false, title: '', message: '', confirm: 'OK', cancel: 'Annuler', danger: false, icon: '' })
let settle = null
export function ask(opts) {
  settle?.(false) // une seule fenêtre à la fois : la précédente vaut « annuler »
  Object.assign(dialog, { title: '', message: '', confirm: 'OK', cancel: 'Annuler', danger: false, icon: '' }, opts, { open: true })
  return new Promise((resolve) => (settle = resolve))
}
export function answer(ok) {
  dialog.open = false
  settle?.(ok)
  settle = null
}
