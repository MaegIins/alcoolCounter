// Nouveautés de l'appli, pour les joueurs (Réglages › Nouveautés). La plus récente en premier.
// À chaque mise en ligne qui change quelque chose de visible : une entrée en haut (date du jour, quelques lignes
// simples, sans jargon). Le point « nouveau » s'allume tant que la dernière date n'a pas été vue sur cet appareil.
import { reactive } from 'vue'

export const CHANGELOG = [
  {
    date: '2026-11-12',
    title: 'Au travail',
    items: [
      '« Au travail » a sa mallette : c’est le boulot de chacun, pas un même endroit, donc il ne fait plus de compagnons de verre.',
    ],
  },
  {
    date: '2026-11-10',
    title: 'Caféine, shots et titres cachés',
    items: [
      'Nouvelle catégorie Shot, à part des alcools forts.',
      'La caféine est comptée (cafés, thés, énergisants, sodas…) : fais glisser la pinte de « Ma journée » pour voir ta tasse. Les stats de l’accueil suivent, et l’onglet Stats des profils a un mode Caféine (record du jour, moyenne, heure du premier café…).',
      'Journée sans alcool : c’est le plus caféiné qui gagne. Ceux qui n’ont bu que de la caféine sont classés sous les autres.',
      'Titres cachés : certaines boissons, bues assez souvent, débloquent un titre. À toi de trouver lesquelles. Choisis celui affiché sous ton pseudo dans l’onglet Badges. Les gros consommateurs de caféine ont aussi le leur.',
      'Une rubrique de succès Caféine : grosses doses du jour, série de 7 jours, total en grammes, café avant l’aube… et un nouveau succès secret.',
      'Les paliers de succès n’ont plus de nom : il reste la couleur de l’anneau, plus facile à faire monter (l’or dès 80 % des succès).',
      'Profil privé (Réglages) : seuls tes bandes et tes abonnés voient tes consos. Pour te suivre, il faut te demander.',
      'Le plan des lieux se centre sur toi, et la couleur des points dit si le lieu est très fréquenté.',
      'Les infos qui n’apparaissaient qu’au survol s’affichent aussi au doigt sur téléphone.',
    ],
  },
  {
    date: '2026-11-09',
    title: 'Succès, notifs et appli installable',
    items: [
      '82 succès en 15 rubriques, avec leur progression, leur rareté, et des succès secrets. Ils tombent avec un toast et apparaissent dans l’activité.',
      'Un anneau de couleur autour des avatars selon le nombre de succès débloqués.',
      'L’Ardoise s’installe comme une appli sur ton téléphone (le tuto est dans Réglages), avec un raccourci « Ajouter » sur l’icône.',
      'Notifs sur le téléphone : likes, commentaires, abonnés, succès. À activer dans Réglages.',
      'Prends une photo ou choisis-la dans ta galerie, partout où on peut en mettre une.',
      '« Créer un lieu » directement quand tu notes une boisson.',
      'Une conso notée après coup est marquée « noté après coup » et ne débloque pas les succès liés à l’heure.',
      'Ex æquo : la couronne va à tous les premiers ; à égalité, le plus couronné passe devant au classement.',
      'L’appli se charge plus vite, et une page « Pas de réseau » quand le bar capte mal.',
    ],
  },
  {
    date: '2026-11-07',
    title: 'Likes et commentaires',
    items: [
      'Like les consos de tes potes, et commente-les (avec les réponses et les likes sur les commentaires).',
      'Chaque conso a sa page : la note, l’avis, la photo, qui a liké, les commentaires.',
      'Une cloche pour les notifs : likes, commentaires, réponses, nouveaux abonnés.',
      'Le fil d’activité affiche les likes et les commentaires sous chaque conso.',
    ],
  },
  {
    date: '2026-11-06',
    title: 'Le plan et la version PC',
    items: [
      'Le plan des lieux : chaque lieu sur une carte, avec sa page (photo, adresse, ce qu’on y boit, qui y passe).',
      'Taper « + » sur une bière de la carte demande le format : demi, bouteille, pinte…',
      'Un onglet Stats sur chaque profil : par mois, par jour de la semaine, par heure, compagnons de verre, critique.',
      'Mise en page pour ordinateur : la navigation passe en haut, l’accueil et les listes en colonnes.',
      'Touche la photo d’un profil pour l’agrandir.',
      'On parle de « journée » plutôt que de « soirée » : elle court jusqu’à 6 h du matin.',
    ],
  },
  {
    date: '2026-11-05',
    title: 'L’Ardoise ouvre',
    items: [
      'Note tes verres : le score compte l’alcool pur (une pinte de triple vaut presque deux blondes).',
      'Des bandes pour se mesurer entre potes, avec leur classement ; ou joue en solo.',
      'Une bande proposée à tous à l’inscription, et une modale de bienvenue pour choisir la tienne.',
      'Une carte des boissons commune à tout le monde : une fiche par boisson, des notes, des avis, des photos.',
      'Marque une boisson « déjà bue » sans date ni note, et garde tes favoris.',
      'Les lieux : note où tu bois, « Chez moi », lieux privés partagés avec ta bande.',
      'Suis qui tu veux, bande ou pas, avec un fil « Abonnements ».',
      'Eau et clopes comptées à part, hors score.',
    ],
  },
]

// Vu sur cet appareil (localStorage) ; réactif pour éteindre le point dès qu'on ouvre la page
const KEY = 'changelog-seen'
const read = () => { try { return localStorage.getItem(KEY) || '' } catch { return '' } }
export const changelog = reactive({ seen: read() })
// Ce qui était vu au lancement de l'appli : les entrées plus récentes restent marquées « nouveau » toute la visite
export const seenAtStart = changelog.seen
export const latest = CHANGELOG[0].date
export const hasNews = () => changelog.seen < latest
export function markSeen() {
  changelog.seen = latest
  try { localStorage.setItem(KEY, latest) } catch {}
}
