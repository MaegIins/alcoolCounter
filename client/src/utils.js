// Fonctions pures, sans Vue ni navigateur : testables avec `node --test` (voir test/utils.test.js).

// Catégories (couleurs des graphes). Pour en ajouter une : ici + CATS côté serveur (server/app.js) + style.css.
// degrees = raccourcis proposés quand on choisit le degré d'un verre de cette catégorie.
// icon = emoji (textes simples), fa = icône Font Awesome (affichage). alco: false = sans alcool (dégustations : Monster, sodas, café…), noté comme le reste mais hors score.
// caf = raccourcis de caféine (mg) proposés pour cette catégorie (vide : pas de champ caféine).
export const CATS = [
  { key: 'biere', label: 'Bière', icon: '🍺', fa: 'fa-beer-mug-empty', color: 'bg-biere', hex: '#d4ac3a', alco: true, degrees: [0, 4.5, 5, 6, 6.5, 7, 8, 8.5, 10] },
  { key: 'vin', label: 'Vin', icon: '🍷', fa: 'fa-wine-glass', color: 'bg-vin', hex: '#a33447', alco: true, degrees: [11, 12, 12.5, 13, 14] },
  { key: 'fort', label: 'Fort', icon: '🥃', fa: 'fa-whiskey-glass', color: 'bg-fort', hex: '#6f93ad', alco: true, degrees: [18, 25, 35, 40, 45, 50] },
  { key: 'shot', label: 'Shot', icon: '🔥', fa: 'fa-fire', color: 'bg-shot', hex: '#c4703a', alco: true, degrees: [15, 18, 25, 35, 40, 45, 50], caf: [0, 80] },
  { key: 'cocktail', label: 'Cocktail', icon: '🍹', fa: 'fa-martini-glass-citrus', color: 'bg-cocktail', hex: '#739b4f', alco: true, degrees: [0, 6, 8, 10, 12, 15], caf: [0, 80] },
  { key: 'autre', label: 'Autre alcool', icon: '🍾', fa: 'fa-champagne-glasses', color: 'bg-autre', hex: '#9277a8', alco: true, degrees: [4, 5, 6, 8, 12] },
  { key: 'energy', label: 'Énergisant', icon: '⚡', fa: 'fa-bolt', color: 'bg-energy', hex: '#9fb33a', alco: false, degrees: [], caf: [80, 160, 200] },
  { key: 'soft', label: 'Soft', icon: '🥤', fa: 'fa-glass-water', color: 'bg-soft', hex: '#4f8f8a', alco: false, degrees: [], caf: [0, 10, 35, 50] },
  { key: 'chaud', label: 'Café, thé', icon: '☕', fa: 'fa-mug-hot', color: 'bg-chaud', hex: '#8a6448', alco: false, degrees: [], caf: [0, 40, 80, 120, 200] },
]
export const ALCO_CATS = CATS.filter((c) => c.alco)
export const catOf = (key) => CATS.find((c) => c.key === key) ?? CATS.find((c) => c.key === 'autre')

// Formats proposés : on choisit le contenant, puis l'appli demande le degré (abv = valeur par défaut).
export const FORMATS = [
  { name: 'Demi', cat: 'biere', cl: 25, abv: 5 },
  { name: 'Bouteille', cat: 'biere', cl: 33, abv: 5 },
  { name: 'Pinte', cat: 'biere', cl: 50, abv: 5 },
  { name: 'Verre de vin', cat: 'vin', cl: 12, abv: 12.5 },
  { name: 'Coupe', cat: 'vin', cl: 12, abv: 12 },
  { name: 'Shot', cat: 'shot', cl: 4, abv: 40 },
  { name: 'Cocktail', cat: 'cocktail', cl: 20, abv: 10 },
  { name: 'Cidre', cat: 'autre', cl: 25, abv: 5 },
  { name: 'Canette', cat: 'energy', cl: 50, abv: 0 },
  { name: 'Soda', cat: 'soft', cl: 33, abv: 0 },
  { name: 'Café', cat: 'chaud', cl: 5, abv: 0 },
]
// Caféine (mg) estimée d'après le nom, la catégorie et le volume : même règle que le serveur (guessCaffeine).
// Repères : expresso 80 mg, thé 40 mg, énergisant 32 mg/100 ml (Monster 50 cl = 160 mg), cola 10 mg/100 ml.
const fold = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
export function guessCaffeine({ name = '', cat, cl = 0 }) {
  const n = fold(String(name ?? ''))
  if (cat === 'chaud') {
    if (/tisane|infusion|verveine|camomille|rooibos/.test(n)) return 0
    if (/deca/.test(n)) return 3
    if (/chocolat|cacao/.test(n)) return 5
    if (/\bmate\b/.test(n)) return 80
    if (/\bthe\b|tea|chai|matcha/.test(n)) return 40
    return 80
  }
  if (cat === 'energy') return Math.round(cl * 3.2)
  if (cat === 'soft') {
    if (/cola|coca|pepsi/.test(n)) return Math.round(cl)
    if (/ice ?tea|the glace|\bmate\b/.test(n)) return Math.round(cl * 1.5)
    return 0
  }
  if (cat === 'cocktail' || cat === 'shot') {
    if (/espresso|expresso|cafe|coffee/.test(n)) return 80
    if (/red ?bull|monster|bomb|energ/.test(n)) return 80
  }
  return 0
}
// Caféine sur une journée : repère des autorités sanitaires (EFSA) = 400 mg par jour pour un adulte
export const CAFFEINE_DAY = 400
export const MAX_CAFFEINE = 1000

// Même identité qu'une boisson habituelle côté serveur : nom + catégorie + volume + degré
export const drinkId = (d) => `${d.name}|${d.cat}|${d.cl}|${d.abv}`
export const SUSPECT_UNITS = 30
export const MAX_CL = 200
// Verres standard (10 g d'alcool pur) : cl × 10 × degré/100 × 0,8
export const unitsOf = ({ cl, abv }) => cl * abv * 0.008
export const round1 = (n) => Math.round(n * 10) / 10

// Palette des courbes : 12 couleurs ordonnées pour que deux voisines restent distinctes.
// Attribuées à la sélection dans Stats.vue, on boucle au-delà de 12.
export const PALETTE = [
  '#c9452c', '#6f93ad', '#d4bc35', '#739b4f', '#9277a8', '#b8697a',
  '#4f8f8a', '#b07a3a', '#7a6fb0', '#8f9a3a', '#a33447', '#5f7fa0',
]
// Couleur de fond des avatars sans photo : pure déco, peut se répéter
export const colorMap = (users) => Object.fromEntries(users.map((u) => [u.id, PALETTE[u.id % PALETTE.length]]))

// --- Dates locales au format YYYY-MM-DD --------------------------------------
export const toDay = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
// Une soirée ne s'arrête pas à minuit : avant NIGHT_END heures, on compte encore pour la veille.
export const NIGHT_END = 6
export const nightOf = (d) => toDay(new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() - NIGHT_END))
export const addDays = (day, n) => {
  const [y, m, d] = day.split('-').map(Number)
  return toDay(new Date(y, m - 1, d + n))
}
export const monthBounds = (day) => {
  const [y, m] = day.split('-').map(Number)
  return [toDay(new Date(y, m - 1, 1)), toDay(new Date(y, m, 0))]
}
export const mondayOf = (day) => {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return addDays(day, -((date.getDay() + 6) % 7))
}

export const dayLabel = (day, long = false) => {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return long
    ? date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')
    : date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')
}

// --- Formats (verres standard) -----------------------------------------------
export const num = (n) => String(round1(n)).replace('.', ',')
export const fmt = (n) => `${num(n)} verre${round1(n) >= 2 ? 's' : ''}`
export const fmtShort = (n) => num(n)
// Libellé court d'une conso : « 50 cl · 6,5° »
export const fmtDrink = (d) => `${num(d.cl)} cl · ${d.abv > 0 ? `${num(d.abv)}°` : 'sans alcool'}`
// Une fiche de la carte : pour une bière, pas de contenance (elle se choisit à chaque verre), juste le degré
export const fmtProduct = (p) => (p.cat === 'biere' ? (p.abv > 0 ? `${num(p.abv)}°` : 'sans alcool') : fmtDrink(p))

// Note sur 10 (demi-étoiles) → « ★★★½ »
export const starsText = (r) => (r ? '★'.repeat(Math.floor(r / 2)) + (r % 2 ? '½' : '') : '')

// « à l'instant », « il y a 5 min », « il y a 3 h », puis la date
export const timeAgo = (ms, now = Date.now()) => {
  const min = Math.round((now - ms) / 60e3)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  if (min < 24 * 60) return `il y a ${Math.floor(min / 60)} h`
  if (min < 7 * 24 * 60) return `il y a ${Math.floor(min / 1440)} j`
  return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace('.', '')
}
// Axe Y : graduations rondes (1, 2, 5, 10, 20, 50…), au plus 4 intervalles
const stepFor = (m) => {
  for (let p = 1; ; p *= 10) for (const s of [1, 2, 5]) if (m / (s * p) <= 4) return s * p
}
export const niceMax = (m) => Math.ceil(m / stepFor(m)) * stepFor(m)
export const niceTicks = (max) => {
  const step = stepFor(max - 1 || 1)
  return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step)
}

// Nettoie une saisie numérique : garde les chiffres, plafonne à max (utilisé par v-digits)
export const sanitizeDigits = (value, max) => {
  let v = String(value ?? '').replace(/\D/g, '')
  if (max != null && v !== '' && Number(v) > max) v = String(max)
  return v
}

// --- URL de chaque écran (voir nav.js) ------------------------------------------------
const PATHS = { home: '/', feed: '/activite', carte: '/carte', settings: '/reglages', notifs: '/notifs', nouveautes: '/nouveautes' }

/** État → URL */
export function urlOf({ view, userId, productId, placeId, postId, tab }) {
  if (view === 'user') return `/profil/${userId}${tab && tab !== 'profil' ? `?onglet=${tab}` : ''}`
  if (view === 'product') return `/boisson/${productId}`
  if (view === 'place') return `/lieu/${placeId}`
  if (view === 'post') return `/conso/${postId}`
  return PATHS[view] ?? '/'
}
/** URL → état (inconnue = Ma journée) */
export function parseUrl(pathname, search = '') {
  const tab = new URLSearchParams(search).get('onglet')
  let m
  const none = { userId: null, productId: null, placeId: null, postId: null, tab: null }
  if ((m = pathname.match(/^\/profil\/(\d+)\/?$/))) return { ...none, view: 'user', userId: Number(m[1]), tab }
  if ((m = pathname.match(/^\/boisson\/(\d+)\/?$/))) return { ...none, view: 'product', productId: Number(m[1]) }
  if ((m = pathname.match(/^\/lieu\/(\d+)\/?$/))) return { ...none, view: 'place', placeId: Number(m[1]) }
  if ((m = pathname.match(/^\/conso\/(\d+)\/?$/))) return { ...none, view: 'post', postId: Number(m[1]) }
  const view = Object.keys(PATHS).find((k) => PATHS[k] === pathname.replace(/\/$/, '') || (k === 'home' && pathname === '/')) ?? 'home'
  return { ...none, view }
}

// Palier de profil selon le % de succès débloqués (secrets compris) : juste une couleur, l'anneau autour de l'avatar.
// (Les titres, eux, sont les titres cachés : voir server/titles.js.)
export const RANKS = [
  { min: 0, color: '#6e6a62' },
  { min: 6, color: '#978e76' },
  { min: 13, color: '#4f8f8a' },
  { min: 22, color: '#739b4f' },
  { min: 33, color: '#6f93ad' },
  { min: 45, color: '#9277a8' },
  { min: 60, color: '#b8432c' },
  { min: 80, color: '#d4bc35' },
]
/** Palier d'un profil : { ...palier, i, pct, got, total, next } */
export function rankOf(got, total) {
  const pct = total ? (100 * got) / total : 0
  const i = RANKS.findLastIndex((r) => pct >= r.min)
  const next = RANKS[i + 1] ?? null
  return { ...RANKS[i], i, pct, got, total, next }
}
