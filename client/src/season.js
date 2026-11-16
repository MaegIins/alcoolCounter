// Thèmes saisonniers, qui suivent today() (donc basculent tout seuls à 6h) :
// - Noël : soirées du 24 et du 25 décembre ;
// - Nouvel An : soirée du 31 décembre (du 31 à 6h au 1er à 6h), avec compte à rebours jusqu'à minuit ;
// - Beaujolais nouveau : soirée du 3e jeudi de novembre ;
// - Saint-Patrick : soirée du 17 mars ;
// - Halloween : soirée du 31 octobre ;
// - Fête de la musique : soirée du 21 juin ;
// - Journée de la bière : 1er vendredi d'août ;
// - Oktoberfest : soirée d'ouverture (samedi, fin septembre) ;
// - Saint-Valentin : 14 février ;
// - 1er mai : lutte des classes au comptoir ;
// - 14 juillet : feux d'artifice tricolores ;
// - 1er avril : poisson d'avril (logo mal écrit, fausse règle, poissons en papier) ;
// - Dry January : tout janvier, juste le sous-titre (pas de déco).
// Les thèmes sont une surprise : pas annoncés dans les Nouveautés, et aucun moyen de les voir avant le jour J.
import { computed, ref, watch, watchEffect } from 'vue'
import { today } from './api'
import { seasonOf, addDays } from './utils.js'

/** Thème du moment : voir seasonOf (utils.js), ou null */
export const season = computed(() => seasonOf(today()))
export const noel = computed(() => season.value === 'noel')
export const nouvelAn = computed(() => season.value === 'nouvel-an')

// Attribut sur <html> pour les retouches CSS (style.css, [data-season=…])
watchEffect(() => {
  if (season.value) document.documentElement.dataset.season = season.value
  else delete document.documentElement.dataset.season
})

// Horloge pour le compte à rebours : ne tourne que le soir du Nouvel An
const clock = ref(Date.now())
let timer = null
watch(nouvelAn, (on) => {
  clearInterval(timer)
  if (on) timer = setInterval(() => (clock.value = Date.now()), 1000)
}, { immediate: true })

/** Minuit qui clôt la soirée affichée (le 1er janvier à 0h pour la soirée du 31) */
export const midnight = computed(() => new Date(`${addDays(today(), 1)}T00:00:00`))

/** Phrase d'accroche de l'en-tête selon le thème */
export const tagline = computed(() => {
  if (noel.value) return 'Joyeux Noël. Le plus gros buveur du réveillon gagne.'
  if (nouvelAn.value) {
    const left = midnight.value - clock.value
    if (left <= 0) return `Bonne année ${midnight.value.getFullYear()} ! Le plus gros buveur de la nuit gagne.`
    const s = Math.ceil(left / 1000)
    const [h, m, sec] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    const when = s <= 60 ? `${s} s` : h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min ${String(sec).padStart(2, '0')}`
    return `Minuit dans ${when}. Le plus gros buveur de la Saint-Sylvestre gagne.`
  }
  if (season.value === 'beaujolais') return 'Le Beaujolais nouveau est arrivé. Le plus gros buveur du jour gagne.'
  if (season.value === 'st-patrick') return 'Sláinte ! Le plus gros buveur de la Saint-Patrick gagne.'
  if (season.value === 'halloween') return 'Joyeux Halloween. Le plus gros buveur de la nuit des morts gagne.'
  if (season.value === 'musique') return 'C’est la Fête de la musique. Le plus gros buveur de la soirée gagne.'
  if (season.value === 'biere') return 'Journée internationale de la bière. Le plus gros buveur du jour gagne.'
  if (season.value === 'oktoberfest') return 'O’zapft is ! Le plus gros buveur de l’Oktoberfest gagne.'
  if (season.value === 'valentin') return 'Saint-Valentin. Les amoureux au resto, les autres au comptoir : le plus gros buveur gagne.'
  if (season.value === 'premier-mai') return 'Prolétaires de tous les bars, unissez-vous ! Le plus gros buveur du jour gagne.'
  if (season.value === '14-juillet') return 'Liberté, égalité, ébriété. Le plus gros buveur du jour gagne.'
  if (season.value === 'poisson') return 'Nouvelle règle : à partir d’aujourd’hui, c’est le plus sobre qui gagne.'
  if (season.value === 'dry-january') return 'Dry January ? Le plus gros buveur du jour gagne quand même.'
  return 'Le plus gros buveur du jour gagne.'
})
/** Toute dernière minute avant minuit (le compte à rebours s'affiche en grand) */
export const finalCountdown = computed(() => {
  if (!nouvelAn.value) return null
  const left = midnight.value - clock.value
  return left > 0 && left <= 10e3 ? Math.ceil(left / 1000) : null
})
/** Les 15 secondes juste après minuit (« Bonne année » en grand) */
export const justStruck = computed(() => {
  if (!nouvelAn.value) return false
  const since = clock.value - midnight.value
  return since >= 0 && since < 15e3
})
