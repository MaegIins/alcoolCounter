// Navigation de l'appli, partagée par tous les composants. Pas de routeur : chaque écran a son URL
// (history.pushState), on peut recharger, partager un lien, et le bouton retour du navigateur marche.
//   /                 Ma soirée          /activite          Activité de la bande
//   /carte            La carte           /reglages          Réglages
//   /notifs           Mes notifs
//   /profil/12        Profil (?onglet=boissons|stats|journal|badges)
//   /boisson/34       Page d'une boisson
//   /lieu/5           Page d'un lieu
//   /conso/78         Page d'une conso (avis, photo, likes, commentaires)
import { reactive } from 'vue'
import { urlOf, parseUrl } from './utils.js'

export const ui = reactive({
  view: 'home', // 'home' (ma soirée) | 'feed' (activité) | 'carte' | 'user' | 'product' | 'settings'
  userId: null, // profil affiché (view = 'user')
  productId: null, // page d'une boisson (view = 'product')
  placeId: null, // page d'un lieu (view = 'place')
  postId: null, // page d'une conso (view = 'post')
  tab: null, // onglet du profil
  back: false, // ouvert depuis un autre écran de l'appli : « ← Retour » possible
  log: null, // fenêtre « + » : null = fermée ; {} ; { product } ; { drink } ; { edit: conso }
  refresh: 0, // incrémenté après chaque changement de données : les écrans rechargent
})

const state = () => ({ view: ui.view, userId: ui.userId, productId: ui.productId, placeId: ui.placeId, postId: ui.postId, tab: ui.tab, back: ui.back })
function show(next, { replace = false, back = false } = {}) {
  Object.assign(ui, { userId: null, productId: null, placeId: null, postId: null, tab: null }, next, { back })
  const url = urlOf(ui) + window.location.hash
  if (replace) history.replaceState(state(), '', url)
  else if (url !== window.location.pathname + window.location.search) history.pushState(state(), '', url)
  else history.replaceState(state(), '', url)
  window.scrollTo({ top: 0 })
}

// Au chargement : l'écran de l'URL. Les paramètres de lien d'invitation (?bande=) sont gérés par App.vue.
Object.assign(ui, parseUrl(window.location.pathname, window.location.search), { back: !!history.state?.back })
history.replaceState(state(), '', window.location.href)
// Bouton retour / avant du navigateur
window.addEventListener('popstate', (e) => {
  Object.assign(ui, e.state ?? { ...parseUrl(window.location.pathname, window.location.search), back: false })
  ui.log = null
  window.scrollTo({ top: 0 })
})

/** Onglet (barre du bas, logo…) */
export const go = (view) => show({ view })
/** Profil de quelqu'un ; `fromTab` = ouvert depuis la barre du bas (pas de « Retour ») */
export const openUser = (id, { fromTab = false, tab = null } = {}) => {
  if (ui.view === 'user' && ui.userId === id && (!tab || ui.tab === tab)) return
  show({ view: 'user', userId: id, tab }, { back: !fromTab })
}
/** Page d'une boisson de la carte */
export const openProduct = (id) => {
  if (ui.view === 'product' && ui.productId === id) return
  show({ view: 'product', productId: id }, { back: true })
}
/** Page d'un lieu */
export const openPlace = (id) => {
  if (!id || (ui.view === 'place' && ui.placeId === id)) return
  show({ view: 'place', placeId: id }, { back: true })
}
/** Mes notifs (cloche de l'en-tête) */
export const openNotifs = () => ui.view !== 'notifs' && show({ view: 'notifs' }, { back: true })
/** Page d'une conso (avis, photo, likes, commentaires) */
export const openPost = (id) => {
  if (!id || (ui.view === 'post' && ui.postId === id)) return
  show({ view: 'post', postId: id }, { back: true })
}
/** Onglet du profil, dans l'URL sans nouvelle entrée d'historique */
export function setTab(tab) {
  ui.tab = tab
  history.replaceState(state(), '', urlOf(ui))
}
/** « ← Retour » : l'écran d'avant dans l'appli, sinon Ma journée */
export function goBack() {
  if (ui.back) history.back()
  else go('home')
}
export const openLog = (preset = {}) => (ui.log = preset)
export const bump = () => ui.refresh++
