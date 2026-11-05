// Fonctions pures, sans Vue ni navigateur : testables avec `node --test` (voir test/utils.test.js).

// Catégories (couleurs des graphes). Pour en ajouter une : ici + CATS côté serveur (server/app.js) + style.css.
// degrees = raccourcis proposés quand on choisit le degré d'un verre de cette catégorie.
export const CATS = [
  { key: 'biere', label: 'Bière', icon: '🍺', color: 'bg-biere', hex: '#d4ac3a', degrees: [4.5, 5, 6, 6.5, 7, 8, 8.5, 10] },
  { key: 'vin', label: 'Vin', icon: '🍷', color: 'bg-vin', hex: '#a33447', degrees: [11, 12, 12.5, 13, 14] },
  { key: 'fort', label: 'Fort', icon: '🥃', color: 'bg-fort', hex: '#6f93ad', degrees: [18, 25, 35, 40, 45, 50] },
  { key: 'cocktail', label: 'Cocktail', icon: '🍹', color: 'bg-cocktail', hex: '#739b4f', degrees: [6, 8, 10, 12, 15] },
  { key: 'autre', label: 'Autre', icon: '🍾', color: 'bg-autre', hex: '#9277a8', degrees: [4, 5, 6, 8, 12] },
]
export const catOf = (key) => CATS.find((c) => c.key === key) ?? CATS.at(-1)

// Formats proposés : on choisit le contenant, puis l'appli demande le degré (abv = valeur par défaut).
export const FORMATS = [
  { name: 'Demi', cat: 'biere', cl: 25, abv: 5 },
  { name: 'Bouteille', cat: 'biere', cl: 33, abv: 5 },
  { name: 'Pinte', cat: 'biere', cl: 50, abv: 5 },
  { name: 'Verre de vin', cat: 'vin', cl: 12, abv: 12.5 },
  { name: 'Coupe', cat: 'vin', cl: 12, abv: 12 },
  { name: 'Shot', cat: 'fort', cl: 4, abv: 40 },
  { name: 'Cocktail', cat: 'cocktail', cl: 20, abv: 10 },
  { name: 'Cidre', cat: 'autre', cl: 25, abv: 5 },
]
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
export const fmtDrink = (d) => `${num(d.cl)} cl · ${num(d.abv)}°`
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
