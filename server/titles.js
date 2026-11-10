// Titres cachés : on les débloque en buvant N fois une boisson précise (10 Chouffe = « Mature pour son âge »…).
// Reconnaissance par le nom : il suffit qu'il CONTIENNE le mot (« Kasteel Rouge », « Kasteel Triple » comptent pour Kasteel).
// Personne ne voit la liste : on découvre un titre en le débloquant, et on choisit celui affiché sous son pseudo.
// Une conso compte pour un titre si son nom correspond (sans accents ni casse), ou selon sa catégorie / son degré.
// Pour en ajouter un : une ligne ici (clé stable : elle est enregistrée en base).

const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
// d.f = nom déjà normalisé (computeTitles le calcule une fois par conso, pas une fois par titre)
const named = (re) => (d) => re.test(d.f)

const CHOUFFE = named(/chouffe/)
const PICON = named(/picon/)
const GUINNESS = named(/guinn?ess/)

// how = comment on l'a eu (montré une fois débloqué)
export const TITLES = [
  { key: 'chouffe10', label: 'Mature pour son âge', how: '10 Chouffe', n: 10, match: CHOUFFE },
  { key: 'chouffe20', label: 'Gros nounours', how: '20 Chouffe', n: 20, match: CHOUFFE },
  { key: 'chouffe30', label: 'Chouffin', how: '30 Chouffe', n: 30, match: CHOUFFE },
  { key: 'perroquet', label: 'Drôle d’oiseau', how: '5 perroquets', n: 5, match: named(/perroquet/) },
  { key: 'perroquetexplosif', label: 'Ni aigle ni pigeon', how: 'Un perroquet explosif', n: 1, match: named(/perroquet explosif/) },
  { key: 'coca', label: 'Soldat de l’IDF', how: '5 Coca', n: 5, match: named(/coca|\bcoke\b/) },
  { key: 'monsterwhite', label: 'Résident d’Agartha', how: '20 Monster White', n: 20, match: named(/monster.*white|white.*monster/) },
  { key: 'russeblanc', label: 'Le Duc', how: '5 russes blancs', n: 5, match: named(/russe blanc|white russian/) },
  { key: 'russenoir', label: 'Loïc', how: '5 russes noirs', n: 5, match: named(/russe noir|black russian/) },
  { key: 'martiniblanc', label: '007', how: '5 Martini blanc', n: 5, match: named(/martini (blanc|bianco)/) },
  { key: 'ricard', label: 'Vietcong', how: '10 Ricard', n: 10, match: named(/ricard/) },
  { key: 'madeleine', label: 'Proust', how: '3 Madeleine', n: 3, match: named(/madeleine/) },
  { key: 'orgasme', label: 'Gooner', how: '4 orgasmes', n: 4, match: named(/orgasm/) },
  { key: 'picon5', label: 'Vrai sudiste', how: '5 Picon', n: 5, match: PICON },
  { key: 'picon20', label: 'Métisse', how: '20 Picon', n: 20, match: PICON },
  { key: 'picon50', label: 'Pied noir', how: '50 Picon', n: 50, match: PICON },
  { key: 'huitsix', label: 'Castagne', how: '3 86', n: 3, match: named(/(^|[^\d.,])8[.,]?6($|[^\d])/) },
  { key: 'megademon', label: 'El Diablo', how: 'Une Méga Démon', n: 1, match: named(/mega ?demon/) },
  { key: 'pilseur', label: 'Pilseur', how: '30 bières à 5°', n: 30, match: (d) => d.cat === 'biere' && d.abv === 5 },
  { key: 'monaco', label: 'Petit joueur', how: '3 Monaco', n: 3, match: named(/monaco/) },
  { key: 'kasteel', label: 'F word', how: '5 Kasteel', n: 5, match: named(/kaste+l/) },
  { key: 'vodkarb', label: 'Étudiant', how: '5 vodka Red Bull', n: 5, match: named(/vodka.*(red ?bull|\brb\b)|(red ?bull).*vodka/) },
  { key: 'rouge', label: 'Villageois', how: '3 verres de rouge', n: 3, match: (d) => d.cat === 'vin' && /rouge/.test(d.f) },
  { key: 'guinness', label: 'Chanceux', how: '4 Guinness', n: 4, match: GUINNESS },
  { key: 'topg', label: 'Top G', how: '10 Guinness', n: 10, match: GUINNESS },
  { key: 'trolls', label: 'Trolleur', how: '3 Cuvée des Trolls', n: 3, match: named(/troll/) },
  { key: 'long', label: 'Crusoé', how: '5 Long Island', n: 5, match: named(/long island|^long\b/) },
]

/** Titres débloqués d'après toutes les consos d'une personne ({ name, cat, abv }) : Set de clés */
export function computeTitles({ drinks = [] }) {
  const list = drinks.map((d) => ({ cat: d.cat, abv: d.abv, f: fold(d.name) }))
  const got = new Set()
  for (const t of TITLES) {
    let n = 0
    for (const d of list) if (t.match(d) && ++n >= t.n) break
    if (n >= t.n) got.add(t.key)
  }
  return got
}
