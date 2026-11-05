// Badges : calculés à partir de l'historique d'une personne (fonction pure, testée unitairement).
const units = (d) => d.cl * d.abv * 0.008

export const BADGES = [
  { key: 'premiere', icon: '🍺', label: 'Premier verre', desc: 'Un premier verre' },
  { key: 'tournee', icon: '🍻', label: 'Enchaînement', desc: '5 verres en moins d’une heure' },
  { key: 'belge', icon: '🇧🇪', label: 'Bières fortes', desc: '10 bières à 8° ou plus' },
  { key: 'sommelier', icon: '🍷', label: 'Œnologue', desc: '5 vins différents' },
  { key: 'arcenciel', icon: '🌈', label: 'Mélange', desc: '4 catégories dans la même soirée' },
  { key: 'gosier', icon: '🥃', label: 'Shots', desc: '3 alcools forts dans la même soirée' },
  { key: 'couchetard', icon: '🦉', label: 'After', desc: 'Un verre entre 3h et 6h du matin' },
  { key: 'apero', icon: '☀️', label: 'En avance', desc: 'Un verre avant 17h' },
  { key: 'pilier', icon: '🪑', label: 'Habitué', desc: '10 soirées' },
  { key: 'serie', icon: '🔥', label: '3 soirs de suite', desc: '3 soirées consécutives' },
  { key: 'explorateur', icon: '🧭', label: 'Curieux', desc: '15 boissons différentes' },
  { key: 'suspect', icon: '🚨', label: 'Suspect', desc: 'Plus de 30 verres standard en une soirée' },
  { key: 'chameau', icon: '💧', label: 'Hydraté', desc: '10 verres d’eau' },
  { key: 'sage', icon: '😇', label: 'Raisonnable', desc: 'Autant d’eau que d’alcool dans une soirée (3 verres min.)' },
  { key: 'cendrier', icon: '🚬', label: 'Fumeur', desc: '20 clopes' },
  { key: 'poumon', icon: '🫁', label: 'Un paquet', desc: '10 clopes dans la même soirée' },
  { key: 'roi', icon: '👑', label: 'Victoire', desc: 'Gagner une soirée' },
  { key: 'dynastie', icon: '🏰', label: '10 victoires', desc: '10 soirées gagnées' },
]

/** Heure locale (0-23) d'un instant dans un fuseau */
export const hourIn = (ms, tz) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms)))

/**
 * @param {{ drinks: {day, at, name, cat, cl, abv}[], extras?: {day, at, kind}[], wins?: number, tz?: string }} h
 * @returns {Set<string>} clés des badges obtenus
 */
export function computeBadges({ drinks, extras = [], wins = 0, tz = 'Europe/Paris' }) {
  const got = new Set()
  const byDay = new Map()
  for (const d of drinks) (byDay.get(d.day) ?? byDay.set(d.day, []).get(d.day)).push(d)
  const water = extras.filter((e) => e.kind === 'eau')
  const smokes = extras.filter((e) => e.kind === 'clope')
  const count = (list, day) => list.filter((e) => e.day === day).length

  if (drinks.length) got.add('premiere')
  const times = drinks.map((d) => d.at).sort((a, b) => a - b)
  for (let i = 4; i < times.length; i++) if (times[i] - times[i - 4] <= 3600e3) got.add('tournee')
  if (drinks.filter((d) => d.cat === 'biere' && d.abv >= 8).length >= 10) got.add('belge')
  if (new Set(drinks.filter((d) => d.cat === 'vin').map((d) => d.name.toLowerCase())).size >= 5) got.add('sommelier')
  if (new Set(drinks.map((d) => `${d.name.toLowerCase()}|${d.cl}|${d.abv}`)).size >= 15) got.add('explorateur')
  for (const d of drinks) {
    const h = hourIn(d.at, tz)
    if (h >= 3 && h < 6) got.add('couchetard')
    if (h >= 6 && h < 17) got.add('apero')
  }
  for (const [day, list] of byDay) {
    if (new Set(list.map((d) => d.cat)).size >= 4) got.add('arcenciel')
    if (list.filter((d) => d.cat === 'fort').length >= 3) got.add('gosier')
    const u = list.reduce((s, d) => s + units(d), 0)
    if (u > 30) got.add('suspect')
    if (list.length >= 3 && count(water, day) >= list.length) got.add('sage')
  }
  if (byDay.size >= 10) got.add('pilier')
  const days = [...byDay.keys()].sort()
  const dayNum = (s) => Date.UTC(...s.split('-').map((n, i) => (i === 1 ? n - 1 : +n))) / 864e5
  for (let i = 2; i < days.length; i++) if (dayNum(days[i]) - dayNum(days[i - 2]) === 2) got.add('serie')
  if (water.length >= 10) got.add('chameau')
  if (smokes.length >= 20) got.add('cendrier')
  if ([...new Set(smokes.map((e) => e.day))].some((day) => count(smokes, day) >= 10)) got.add('poumon')
  if (wins >= 1) got.add('roi')
  if (wins >= 10) got.add('dynastie')
  return got
}
