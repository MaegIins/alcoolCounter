// Paliers de tout le monde (nombre de succès de chacun) : anneau de couleur autour des avatars, partout dans l'appli ;
// et le titre caché que chacun affiche.
// Chargé à la connexion, puis rechargé seulement quand un succès tombe (toast après une conso, nouvelle notif).
import { reactive } from 'vue'
import { api, hasToken } from './api'
import { rankOf } from './utils.js'

export const ranks = reactive({ total: 0, counts: {}, titles: {} })

export async function refreshRanks() {
  if (!hasToken()) return
  const r = await api('/ranks').catch(() => null)
  if (r) Object.assign(ranks, r)
}
/** Palier d'une personne, ou null si on ne sait pas encore */
export const rankFor = (userId) => (ranks.total ? rankOf(ranks.counts[userId] ?? 0, ranks.total) : null)
/** Titre caché affiché par une personne (libellé), ou null */
export const titleFor = (userId) => ranks.titles?.[userId] ?? null
