// Badges : calculés à partir de l'historique d'une personne (fonction pure, testée unitairement).
// group = rubrique de l'onglet Badges ; secret = description cachée tant qu'on ne l'a pas.
const units = (d) => d.cl * d.abv * 0.008

export const GROUPS = [
  { key: 'debut', label: 'Les débuts' },
  { key: 'volume', label: 'Grosses journées' },
  { key: 'regulier', label: 'Régularité' },
  { key: 'horaire', label: 'Horaires' },
  { key: 'calendrier', label: 'Calendrier' },
  { key: 'biere', label: 'Bière' },
  { key: 'vin', label: 'Vin et bulles' },
  { key: 'fort', label: 'Forts et cocktails' },
  { key: 'sans', label: 'Sans alcool' },
  { key: 'lieux', label: 'Lieux' },
  { key: 'critique', label: 'Critique' },
  { key: 'extras', label: 'Eau et clopes' },
  { key: 'social', label: 'Social' },
  { key: 'compet', label: 'Compet' },
  { key: 'secret', label: 'Secrets' },
]

export const BADGES = [
  // Les débuts
  { key: 'premiere', group: 'debut', icon: '🍺', label: 'Premier verre', desc: 'Un premier verre' },
  { key: 'explorateur', group: 'debut', icon: '🧭', label: 'Curieux', desc: '15 boissons différentes' },
  { key: 'aventurier', group: 'debut', icon: '🗺️', label: 'Aventurier', desc: '40 boissons différentes' },
  { key: 'cent', group: 'debut', icon: '🤝', label: 'Bon client', desc: '100 verres standard au total' },
  { key: 'cinqcents', group: 'debut', icon: '🫀', label: 'Foie d’acier', desc: '500 verres standard au total' },
  { key: 'mille', group: 'debut', icon: '🎖️', label: 'Membre d’honneur', desc: '1 000 verres standard au total' },
  { key: 'tonneau', group: 'debut', icon: '🛢️', label: 'Tonneau', desc: '100 litres d’alcool bus (boissons, pas alcool pur)' },
  // Grosses journées
  { key: 'tournee', group: 'volume', icon: '🍻', label: 'Enchaînement', desc: '5 verres en moins d’une heure' },
  { key: 'arcenciel', group: 'volume', icon: '🌈', label: 'Mélange', desc: '4 catégories dans la même journée' },
  { key: 'grossejournee', group: 'volume', icon: '🎉', label: 'Grosse journée', desc: '10 verres standard dans la même journée' },
  { key: 'marathon', group: 'volume', icon: '🏃', label: 'Marathon', desc: '8 heures entre le premier et le dernier verre d’une journée' },
  { key: 'suspect', group: 'volume', icon: '🚨', label: 'Suspect', desc: 'Plus de 30 verres standard en une journée' },
  // Régularité
  { key: 'pilier', group: 'regulier', icon: '🪑', label: 'Habitué', desc: '10 jours de verres' },
  { key: 'abonne', group: 'regulier', icon: '🛋️', label: 'Meuble', desc: '50 jours de verres' },
  { key: 'centjours', group: 'regulier', icon: '🏛️', label: 'Institution', desc: '100 jours de verres' },
  { key: 'serie', group: 'regulier', icon: '🔥', label: '3 jours de suite', desc: '3 jours consécutifs' },
  { key: 'semaine', group: 'regulier', icon: '📆', label: 'Semaine pleine', desc: '7 jours de suite' },
  { key: 'weekend', group: 'regulier', icon: '🕺', label: 'Week-end complet', desc: 'Vendredi, samedi et dimanche du même week-end' },
  { key: 'septjours', group: 'regulier', icon: '🗓️', label: 'Tous les jours', desc: 'Au moins une fois chaque jour de la semaine (lundi… dimanche)' },
  { key: 'cure', group: 'regulier', icon: '🧘', label: 'Retour de cure', desc: 'Reprendre après 30 jours sans alcool' },
  // Horaires
  { key: 'apero', group: 'horaire', icon: '☀️', label: 'En avance', desc: 'Un verre avant 17h' },
  { key: 'petitdej', group: 'horaire', icon: '🥐', label: 'Petit-déj', desc: 'Un verre entre 6h et 10h du matin' },
  { key: 'pausedej', group: 'horaire', icon: '🥪', label: 'Pause déj', desc: 'Un verre entre midi et 14h, un jour de semaine' },
  { key: 'couchetard', group: 'horaire', icon: '🦉', label: 'After', desc: 'Un verre entre 3h et 6h du matin' },
  { key: 'lundi', group: 'horaire', icon: '😵', label: 'Lundi difficile', desc: '5 verres standard un lundi' },
  // Calendrier
  { key: 'annee', group: 'calendrier', icon: '🎡', label: 'Toute l’année', desc: 'Au moins un verre dans chacun des 12 mois' },
  { key: 'reveillon', group: 'calendrier', icon: '🎆', label: 'Réveillon', desc: 'Un verre le 31 décembre' },
  { key: 'noel', group: 'calendrier', icon: '🎄', label: 'Vin chaud', desc: 'Un verre le 24 ou le 25 décembre' },
  { key: 'patrick', group: 'calendrier', icon: '☘️', label: 'Saint-Patrick', desc: 'Une bière le 17 mars' },
  { key: 'juillet', group: 'calendrier', icon: '🎇', label: '14 Juillet', desc: 'Un verre le jour de la fête nationale' },
  { key: 'musique', group: 'calendrier', icon: '🎸', label: 'Fête de la musique', desc: 'Un verre le 21 juin' },
  { key: 'beaujolais', group: 'calendrier', icon: '🍇', label: 'Beaujolais nouveau', desc: 'Du vin le 3e jeudi de novembre' },
  { key: 'dryjanuary', group: 'calendrier', icon: '🧊', label: 'Janvier sec', desc: 'Aucun verre d’alcool de tout le mois de janvier (en ayant bu avant et après)' },
  // Bière
  { key: 'brasseur', group: 'biere', icon: '🍺', label: 'Brasseur', desc: '100 bières' },
  { key: 'tourdesbieres', group: 'biere', icon: '🌍', label: 'Tour des bières', desc: '10 bières différentes' },
  { key: 'pression', group: 'biere', icon: '🚰', label: 'Pression', desc: '50 pintes (50 cl ou plus)' },
  { key: 'belge', group: 'biere', icon: '🇧🇪', label: 'Bières fortes', desc: '10 bières à 8° ou plus' },
  { key: 'triple', group: 'biere', icon: '💪', label: 'Costaud', desc: 'Une bière à 10° ou plus' },
  // Vin et bulles
  { key: 'sommelier', group: 'vin', icon: '🍷', label: 'Œnologue', desc: '5 vins différents' },
  { key: 'cave', group: 'vin', icon: '🍾', label: 'Cave à vin', desc: '50 verres de vin' },
  { key: 'bouteille', group: 'vin', icon: '🫗', label: 'La bouteille', desc: '6 verres de vin dans la même journée' },
  { key: 'bulles', group: 'vin', icon: '🥂', label: 'Bulles', desc: 'Champagne, crémant ou prosecco' },
  // Forts et cocktails
  { key: 'gosier', group: 'fort', icon: '🥃', label: 'Shots', desc: '3 alcools forts dans la même journée' },
  { key: 'distillerie', group: 'fort', icon: '⚗️', label: 'Distillerie', desc: '50 alcools forts' },
  { key: 'mixologue', group: 'fort', icon: '🍹', label: 'Mixologue', desc: '10 cocktails différents' },
  { key: 'happyhour', group: 'fort', icon: '🍸', label: 'Happy hour', desc: '5 cocktails dans la même journée' },
  { key: 'pirate', group: 'fort', icon: '🏴‍☠️', label: 'Pirate', desc: '10 rhums (rhum, ti’punch, mojito…)' },
  { key: 'sudiste', group: 'fort', icon: '🌞', label: 'Sudiste', desc: '10 pastis' },
  // Sans alcool
  { key: 'cafeine', group: 'sans', icon: '☕', label: 'Caféiné', desc: '50 cafés ou thés' },
  { key: 'survolte', group: 'sans', icon: '⚡', label: 'Survolté', desc: '25 énergisants' },
  { key: 'insomnie', group: 'sans', icon: '🫨', label: 'Insomnie', desc: '3 énergisants dans la même journée' },
  { key: 'capitaine', group: 'sans', icon: '🚗', label: 'Capitaine de soirée', desc: 'Une journée à 3 boissons ou plus, toutes sans alcool' },
  { key: 'sansbiere', group: 'sans', icon: '🫧', label: 'Zéro degré', desc: 'Une bière sans alcool' },
  // Lieux
  { key: 'sortie', group: 'lieux', icon: '📍', label: 'De sortie', desc: '5 lieux différents' },
  { key: 'nomade', group: 'lieux', icon: '🧳', label: 'Nomade', desc: '15 lieux différents' },
  { key: 'tourneebars', group: 'lieux', icon: '🚶', label: 'Tournée des bars', desc: '3 lieux dans la même journée' },
  { key: 'qg', group: 'lieux', icon: '🏴', label: 'QG', desc: '20 journées dans le même lieu (hors chez soi)' },
  { key: 'casanier', group: 'lieux', icon: '🏠', label: 'Casanier', desc: '30 verres chez soi' },
  // Critique
  { key: 'critique', group: 'critique', icon: '📝', label: 'Critique', desc: '10 boissons notées' },
  { key: 'jury', group: 'critique', icon: '⚖️', label: 'Jury', desc: '50 boissons notées' },
  { key: 'plume', group: 'critique', icon: '🖋️', label: 'Plume', desc: '10 avis écrits' },
  { key: 'coupdecoeur', group: 'critique', icon: '💘', label: 'Coup de cœur', desc: 'Mettre 10/10' },
  { key: 'severe', group: 'critique', icon: '🤮', label: 'Sans pitié', desc: 'Mettre 1/10' },
  { key: 'photographe', group: 'critique', icon: '📸', label: 'Photographe', desc: '10 consos avec photo' },
  // Eau et clopes
  { key: 'chameau', group: 'extras', icon: '💧', label: 'Hydraté', desc: '10 verres d’eau' },
  { key: 'oasis', group: 'extras', icon: '🌊', label: 'Oasis', desc: '100 verres d’eau' },
  { key: 'sage', group: 'extras', icon: '😇', label: 'Raisonnable', desc: 'Autant d’eau que d’alcool dans une journée (3 verres min.)' },
  { key: 'cendrier', group: 'extras', icon: '🚬', label: 'Fumeur', desc: '20 clopes' },
  { key: 'cheminee', group: 'extras', icon: '🏭', label: 'Cheminée', desc: '200 clopes' },
  { key: 'poumon', group: 'extras', icon: '🫁', label: 'Un paquet', desc: '10 clopes dans la même journée' },
  // Social
  { key: 'bavard', group: 'social', icon: '💬', label: 'Bavard', desc: '10 commentaires écrits' },
  { key: 'populaire', group: 'social', icon: '❤️', label: 'Populaire', desc: '10 likes reçus' },
  { key: 'star', group: 'social', icon: '🌟', label: 'Star', desc: '100 likes reçus' },
  { key: 'influence', group: 'social', icon: '📣', label: 'Influenceur', desc: '10 abonnés' },
  // Compet
  { key: 'roi', group: 'compet', icon: '👑', label: 'Victoire', desc: 'Gagner une journée' },
  { key: 'dynastie', group: 'compet', icon: '🏰', label: '10 victoires', desc: '10 journées gagnées' },
  { key: 'empire', group: 'compet', icon: '🐉', label: 'Empire', desc: '50 journées gagnées' },
  // Secrets
  { key: 'minuit', group: 'secret', icon: '🕛', label: 'Douze coups', desc: 'Un verre noté pile à minuit', secret: true },
  { key: 'vendredi13', group: 'secret', icon: '🐈‍⬛', label: 'Vendredi 13', desc: 'Un verre un vendredi 13', secret: true },
  { key: 'pilepoil', group: 'secret', icon: '🎯', label: 'Pile-poil', desc: 'Une journée à exactement 10 verres standard', secret: true },
  { key: 'irish', group: 'secret', icon: '☘️', label: 'Irish coffee', desc: 'Un café et un alcool fort à moins de 10 minutes d’écart', secret: true },
  { key: 'fidele', group: 'secret', icon: '💍', label: 'Monogame', desc: '50 fois la même boisson', secret: true },
]

/** Heure locale (0-23) d'un instant dans un fuseau */
export const hourIn = (ms, tz) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms)))

const BULLES = /champ|cr[ée]mant|prosecco|cava\b|p[ée]tillant/i
const RHUM = /rhum|rum\b|ti.?punch|mojito|daiquiri|pi[ñn]a/i
const PASTIS = /pastis|ricard|\b51\b|pernod/i

/**
 * @param {{
 *   drinks: {day, at, name, cat, cl, abv, rating?, review?, photo?, place_id?, home?}[],
 *   extras?: {day, at, kind}[], wins?: number, tz?: string,
 *   social?: { comments?: number, likes?: number, followers?: number },
 * }} h  drinks = toutes les consos (avec ou sans alcool)
 * @returns {Set<string>} clés des badges obtenus
 */
export function computeBadges({ drinks: all, extras = [], wins = 0, tz = 'Europe/Paris', social = {} }) {
  const got = new Set()
  const add = (key, ok) => ok && got.add(key)
  const drinks = all.filter((d) => d.abv > 0)
  const byDay = new Map()
  for (const d of drinks) (byDay.get(d.day) ?? byDay.set(d.day, []).get(d.day)).push(d)
  const water = extras.filter((e) => e.kind === 'eau')
  const smokes = extras.filter((e) => e.kind === 'clope')
  const count = (list, day) => list.filter((e) => e.day === day).length
  const of = (cat) => drinks.filter((d) => d.cat === cat)
  const distinct = (list) => new Set(list.map((d) => d.name.toLowerCase())).size
  const dayNum = (s) => Date.UTC(...s.split('-').map((n, i) => (i === 1 ? n - 1 : +n))) / 864e5
  const weekday = (s) => (new Date(dayNum(s) * 864e5).getUTCDay() + 6) % 7 // lundi = 0
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

  // Les débuts
  add('premiere', drinks.length)
  const kinds = new Set(drinks.map((d) => `${d.name.toLowerCase()}|${d.cl}|${d.abv}`)).size
  add('explorateur', kinds >= 15)
  add('aventurier', kinds >= 40)
  const total = drinks.reduce((s, d) => s + units(d), 0)
  add('cent', total >= 100)
  add('cinqcents', total >= 500)
  add('mille', total >= 1000)
  add('tonneau', drinks.reduce((s, d) => s + d.cl, 0) >= 10000)

  // Horaires (heure locale)
  for (const d of drinks) {
    const h = hourIn(d.at, tz)
    add('couchetard', h >= 3 && h < 6)
    add('apero', h >= 6 && h < 17)
    add('petitdej', h >= 6 && h < 10)
    add('pausedej', h >= 12 && h < 14 && weekday(d.day) < 5)
    add('minuit', hm.format(d.at) === '00:00')
  }
  const times = drinks.map((d) => d.at).sort((a, b) => a - b)
  for (let i = 4; i < times.length; i++) if (times[i] - times[i - 4] <= 3600e3) got.add('tournee')

  // Par journée
  for (const [day, list] of byDay) {
    const u = list.reduce((s, d) => s + units(d), 0)
    add('arcenciel', new Set(list.map((d) => d.cat)).size >= 4)
    add('gosier', list.filter((d) => d.cat === 'fort').length >= 3)
    add('happyhour', list.filter((d) => d.cat === 'cocktail').length >= 5)
    add('bouteille', list.filter((d) => d.cat === 'vin').length >= 6)
    add('grossejournee', u >= 10)
    add('suspect', u > 30)
    add('pilepoil', Math.round(u * 10) === 100)
    add('lundi', weekday(day) === 0 && u >= 5)
    const ats = list.map((d) => d.at)
    add('marathon', Math.max(...ats) - Math.min(...ats) >= 8 * 3600e3)
    add('sage', list.length >= 3 && count(water, day) >= list.length)
    add('tourneebars', new Set(list.map((d) => d.place_id).filter(Boolean)).size >= 3)
    const [, m, dom] = day.split('-').map(Number)
    add('reveillon', m === 12 && dom === 31)
    add('noel', m === 12 && (dom === 24 || dom === 25))
    add('patrick', m === 3 && dom === 17 && list.some((d) => d.cat === 'biere'))
    add('juillet', m === 7 && dom === 14)
    add('musique', m === 6 && dom === 21)
    add('beaujolais', m === 11 && weekday(day) === 3 && dom >= 15 && dom <= 21 && list.some((d) => d.cat === 'vin'))
    add('vendredi13', weekday(day) === 4 && dom === 13)
  }

  // Régularité
  const days = [...byDay.keys()].sort()
  add('pilier', days.length >= 10)
  add('abonne', days.length >= 50)
  add('centjours', days.length >= 100)
  let run = 1, best = days.length ? 1 : 0
  for (let i = 1; i < days.length; i++) {
    const gap = dayNum(days[i]) - dayNum(days[i - 1])
    run = gap === 1 ? run + 1 : 1
    best = Math.max(best, run)
    add('cure', gap > 30)
  }
  add('serie', best >= 3)
  add('semaine', best >= 7)
  const has = new Set(days)
  add('weekend', days.some((d) => weekday(d) === 4 && has.has(new Date((dayNum(d) + 1) * 864e5).toISOString().slice(0, 10)) && has.has(new Date((dayNum(d) + 2) * 864e5).toISOString().slice(0, 10))))
  add('septjours', new Set(days.map(weekday)).size === 7)
  add('annee', new Set(days.map((d) => d.slice(5, 7))).size === 12)
  if (days.length) {
    const [first, last] = [days[0], days.at(-1)]
    for (let y = Number(first.slice(0, 4)); y <= Number(last.slice(0, 4)); y++) {
      add('dryjanuary', first < `${y}-01-01` && last > `${y}-01-31` && !days.some((d) => d.startsWith(`${y}-01-`)))
    }
  }

  // Bière
  const bieres = of('biere')
  add('brasseur', bieres.length >= 100)
  add('tourdesbieres', distinct(bieres) >= 10)
  add('pression', bieres.filter((d) => d.cl >= 50).length >= 50)
  add('belge', bieres.filter((d) => d.abv >= 8).length >= 10)
  add('triple', bieres.some((d) => d.abv >= 10))
  add('sansbiere', all.some((d) => d.cat === 'biere' && d.abv === 0))
  // Vin et bulles
  add('sommelier', distinct(of('vin')) >= 5)
  add('cave', of('vin').length >= 50)
  add('bulles', drinks.some((d) => BULLES.test(d.name)))
  // Forts et cocktails
  add('distillerie', of('fort').length >= 50)
  add('mixologue', distinct(of('cocktail')) >= 10)
  add('pirate', drinks.filter((d) => RHUM.test(d.name)).length >= 10)
  add('sudiste', drinks.filter((d) => PASTIS.test(d.name)).length >= 10)
  // Sans alcool
  add('cafeine', all.filter((d) => d.cat === 'chaud').length >= 50)
  const energy = all.filter((d) => d.cat === 'energy')
  add('survolte', energy.length >= 25)
  add('insomnie', [...new Set(energy.map((d) => d.day))].some((day) => count(energy, day) >= 3))
  const softDays = new Map()
  for (const d of all) softDays.set(d.day, (softDays.get(d.day) ?? 0) + 1)
  add('capitaine', [...softDays].some(([day, n]) => n >= 3 && !byDay.has(day)))

  // Lieux
  const places = new Set(drinks.map((d) => d.place_id).filter(Boolean))
  add('sortie', places.size >= 5)
  add('nomade', places.size >= 15)
  const daysAt = new Map()
  for (const d of drinks) if (d.place_id && !d.home) (daysAt.get(d.place_id) ?? daysAt.set(d.place_id, new Set()).get(d.place_id)).add(d.day)
  add('qg', [...daysAt.values()].some((s) => s.size >= 20))
  add('casanier', drinks.filter((d) => d.home).length >= 30)

  // Critique
  const rated = all.filter((d) => d.rating != null)
  add('critique', rated.length >= 10)
  add('jury', rated.length >= 50)
  add('plume', all.filter((d) => d.review).length >= 10)
  add('coupdecoeur', rated.some((d) => d.rating === 10))
  add('severe', rated.some((d) => d.rating === 1))
  add('photographe', all.filter((d) => d.photo).length >= 10)

  // Eau et clopes
  add('chameau', water.length >= 10)
  add('oasis', water.length >= 100)
  add('cendrier', smokes.length >= 20)
  add('cheminee', smokes.length >= 200)
  add('poumon', [...new Set(smokes.map((e) => e.day))].some((day) => count(smokes, day) >= 10))

  // Social, compet
  add('bavard', (social.comments ?? 0) >= 10)
  add('populaire', (social.likes ?? 0) >= 10)
  add('star', (social.likes ?? 0) >= 100)
  add('influence', (social.followers ?? 0) >= 10)
  add('roi', wins >= 1)
  add('dynastie', wins >= 10)
  add('empire', wins >= 50)

  // Secrets
  const cafes = all.filter((d) => d.cat === 'chaud')
  add('irish', of('fort').some((f) => cafes.some((c) => Math.abs(c.at - f.at) <= 10 * 60e3)))
  const same = new Map()
  for (const d of drinks) same.set(d.name.toLowerCase(), (same.get(d.name.toLowerCase()) ?? 0) + 1)
  add('fidele', [...same.values()].some((n) => n >= 50))
  return got
}
