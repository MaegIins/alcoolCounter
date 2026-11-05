<script setup>
// Onglet « Boissons » d'un profil : toutes les boissons différentes bues, avec tris et filtres.
// Toucher une boisson : combien de fois, quand, la note moyenne, et toutes les consos avec leurs avis et photos.
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { api, CATS, catOf, num, fmtDrink, dayLabel, photoUrl } from '../api'
import { ui, openLog, openProduct } from '../nav'
import Poster from './Poster.vue'
import Stars from './Stars.vue'

const props = defineProps({ userId: Number, isMe: Boolean })

const list = ref([])
const loaded = ref(false)
async function load() {
  list.value = await api(`/users/${props.userId}/drinks`).catch(() => list.value)
  loaded.value = true
}
watch(() => [props.userId, ui.refresh], load, { immediate: true })

// --- Filtres et tris ------------------------------------------------------------------------
const search = ref('')
const cat = ref('')
const onlyReviews = ref(false)
const sort = ref('count')
const SORTS = [
  { k: 'count', l: 'Les plus bues' },
  { k: 'rating', l: 'Mieux notées' },
  { k: 'worst', l: 'Moins bien notées' },
  { k: 'recent', l: 'Bues récemment' },
  { k: 'old', l: 'Pas bues depuis longtemps' },
  { k: 'units', l: "Le plus d'alcool" },
  { k: 'name', l: 'A → Z' },
]
const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const presentCats = computed(() => CATS.filter((c) => list.value.some((d) => d.cat === c.key)))
const shown = computed(() => {
  const q = norm(search.value.trim())
  const rows = list.value.filter(
    (d) => (!q || norm(d.name).includes(q)) && (!cat.value || d.cat === cat.value) && (!onlyReviews.value || d.reviews)
  )
  const by = {
    count: (a, b) => b.count - a.count || b.last_at - a.last_at,
    rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.count - a.count,
    worst: (a, b) => (a.rating ?? 99) - (b.rating ?? 99) || b.count - a.count,
    recent: (a, b) => b.last_at - a.last_at,
    old: (a, b) => a.last_at - b.last_at,
    units: (a, b) => b.units - a.units,
    name: (a, b) => a.name.localeCompare(b.name),
  }[sort.value]
  return [...rows].sort(by)
})
const total = computed(() => list.value.reduce((s, d) => s + d.count, 0))
const thumb = (d) => (d.last_photo_key ? photoUrl(d.last_photo_key) : '')

// Affichage par paquets de 20
const limit = ref(20)
watch([search, cat, onlyReviews, sort], () => (limit.value = 20))

// --- Détail d'une boisson ---------------------------------------------------------------------
const open = ref(null) // la boisson (ligne de la liste)
const logs = ref([])
const logSort = ref('recent')
async function show(d) {
  open.value = d
  logs.value = []
  document.body.style.overflow = 'hidden'
  logs.value = await api(`/users/${props.userId}/drinks/logs?name=${encodeURIComponent(d.name)}&cl=${d.cl}&abv=${d.abv}`).catch(() => [])
}
function close() {
  open.value = null
  document.body.style.overflow = ''
}
onBeforeUnmount(() => (document.body.style.overflow = ''))
// Après une modif (note…) dans le +, on garde la fiche à jour
watch(() => ui.refresh, () => open.value && show(list.value.find((d) => d.name === open.value.name && d.cl === open.value.cl && d.abv === open.value.abv) ?? open.value))
const sortedLogs = computed(() => {
  const l = logSort.value === 'reviews' ? logs.value.filter((x) => x.review || x.photo_key) : [...logs.value]
  if (logSort.value === 'old') l.reverse()
  if (logSort.value === 'best') l.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
  return l
})
const longDate = (day) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
}
function again() {
  const d = open.value
  close()
  openLog({ drink: d })
}
function toProduct() {
  const id = open.value.product_id
  close()
  openProduct(id)
}
const chip = 'shrink-0 rounded-full px-3 py-1 text-sm font-semibold'
</script>

<template>
  <div class="space-y-4 pt-5">
    <p class="text-sm text-muted">
      <b class="text-ink">{{ list.length }}</b> boisson{{ list.length > 1 ? 's' : '' }} différente{{ list.length > 1 ? 's' : '' }}
      · {{ total }} conso{{ total > 1 ? 's' : '' }}
    </p>

    <input v-model="search" type="search" placeholder="🔍  Chercher une boisson…" class="field w-full px-4 py-2.5 text-base" />
    <div class="-mx-4 flex gap-2 overflow-x-auto px-4">
      <button :class="[chip, onlyReviews ? 'bg-hi text-paper' : 'bg-white/5 text-muted hover:bg-white/10']" @click="onlyReviews = !onlyReviews">💬 Avec avis</button>
      <button
        v-for="c in presentCats"
        :key="c.key"
        :class="[chip, cat === c.key ? 'text-paper' : 'bg-white/5 text-muted hover:bg-white/10']"
        :style="cat === c.key ? { background: c.hex } : {}"
        @click="cat = cat === c.key ? '' : c.key"
      >
        {{ c.icon }} {{ c.label }}
      </button>
    </div>
    <label class="flex items-center justify-between gap-2 text-sm text-muted">
      {{ shown.length }} résultat{{ shown.length > 1 ? 's' : '' }}
      <select v-model="sort" class="field py-1.5 pr-2 pl-2 text-sm" aria-label="Trier">
        <option v-for="s in SORTS" :key="s.k" :value="s.k">{{ s.l }}</option>
      </select>
    </label>

    <p v-if="loaded && !list.length" class="py-10 text-center text-muted">Rien bu pour l'instant.</p>
    <p v-else-if="loaded && !shown.length" class="py-10 text-center text-muted">Rien ne correspond.</p>
    <ul class="box divide-y divide-white/5">
      <li v-for="d in shown.slice(0, limit)" :key="`${d.name}|${d.cl}|${d.abv}`">
        <button class="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5" @click="show(d)">
          <img v-if="thumb(d)" :src="thumb(d)" alt="" loading="lazy" class="h-11 w-11 shrink-0 rounded-lg object-cover ring-1 ring-black/50" />
          <Poster v-else :drink="d" :width="44" :icon="44" class="!h-11" />
          <span class="min-w-0 flex-1 leading-tight">
            <span class="block truncate font-bold">{{ d.name }}</span>
            <span class="flex flex-wrap items-center gap-x-2 text-sm text-muted">
              <span class="whitespace-nowrap">{{ fmtDrink(d) }}</span>
              <Stars v-if="d.rating" :value="Math.round(d.rating)" :size="11" />
              <span v-if="d.reviews" class="text-xs">💬{{ d.reviews }}</span>
            </span>
            <span class="text-xs text-faint">dernière : {{ dayLabel(d.last_day, true) }}</span>
          </span>
          <span class="shrink-0 text-right">
            <span class="block font-display text-xl leading-none text-hi">×{{ d.count }}</span>
            <span v-if="d.units" class="text-xs text-muted">{{ num(d.units) }} verres</span>
          </span>
        </button>
      </li>
    </ul>
    <button v-if="shown.length > limit" class="btn btn-ghost w-full py-2.5 text-sm font-semibold" @click="limit += 20">
      Voir {{ Math.min(20, shown.length - limit) }} de plus
    </button>

    <!-- Fiche d'une boisson -->
    <Teleport to="body">
      <Transition name="sheet">
        <div v-if="open" class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" @click.self="close">
          <div class="sheet-panel box max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-b-none sm:rounded-b-[.6rem]" role="dialog" aria-modal="true" :aria-label="open.name">
            <div class="flex items-start gap-4 p-5">
              <img v-if="thumb(open)" :src="thumb(open)" alt="" class="h-20 w-20 shrink-0 rounded-lg object-cover ring-1 ring-black/50" />
              <Poster v-else :drink="open" :width="80" :icon="72" />
              <div class="min-w-0 flex-1">
                <h3 class="text-2xl leading-tight font-bold break-words">
                  <button v-if="open.product_id" class="text-left hover:text-hi hover:underline" @click="toProduct">{{ open.name }}</button>
                  <template v-else>{{ open.name }}</template>
                </h3>
                <p class="text-sm text-muted">{{ catOf(open.cat).icon }} {{ catOf(open.cat).label }} · {{ fmtDrink(open) }}</p>
                <div v-if="open.rating" class="mt-1 flex items-center gap-2 text-sm text-muted">
                  <Stars :value="Math.round(open.rating)" :size="14" /> {{ num(open.rating / 2) }}/5 · {{ open.ratings }} note{{ open.ratings > 1 ? 's' : '' }}
                </div>
              </div>
              <button class="h-9 w-9 shrink-0 rounded-full text-muted hover:bg-white/10 hover:text-ink" aria-label="Fermer" @click="close">✕</button>
            </div>

            <div class="mx-5 grid grid-cols-3 gap-2 text-center">
              <div class="rounded-xl bg-white/5 px-1 py-2.5">
                <div class="font-display text-2xl text-hi">×{{ open.count }}</div>
                <div class="text-xs font-semibold text-muted">fois</div>
              </div>
              <div class="rounded-xl bg-white/5 px-1 py-2.5">
                <div class="font-display text-2xl text-hi">{{ open.units ? num(open.units) : '–' }}</div>
                <div class="text-xs font-semibold text-muted">verres std</div>
              </div>
              <div class="rounded-xl bg-white/5 px-1 py-2.5">
                <div class="font-display text-2xl text-hi">{{ open.reviews }}</div>
                <div class="text-xs font-semibold text-muted">avis</div>
              </div>
            </div>
            <p class="mx-5 mt-3 text-sm text-muted">
              Première fois {{ longDate(open.first_day) }}<template v-if="open.count > 1">, dernière {{ longDate(open.last_day) }}</template>.
            </p>

            <div class="mx-5 mt-4 flex gap-2">
              <button class="btn btn-hi flex-1 py-2.5 font-bold" @click="again">{{ isMe ? '＋ Encore une' : '＋ Moi aussi' }}</button>
              <button v-if="open.product_id" class="btn btn-ghost px-4 py-2.5 text-sm font-semibold" @click="toProduct">Fiche de la carte</button>
            </div>

            <section class="px-5 pt-6 pb-6">
              <div class="mb-2 flex items-center justify-between gap-2">
                <h4 class="font-bold">Toutes les fois</h4>
                <select v-model="logSort" class="field py-1 pr-2 pl-2 text-sm" aria-label="Trier les consos">
                  <option value="recent">Plus récentes</option>
                  <option value="old">Plus anciennes</option>
                  <option value="best">Mieux notées</option>
                  <option value="reviews">Avec avis ou photo</option>
                </select>
              </div>
              <p v-if="!sortedLogs.length" class="py-6 text-center text-sm text-muted">{{ logs.length ? 'Aucun avis ni photo.' : 'Chargement…' }}</p>
              <ul class="divide-y divide-white/5">
                <li v-for="l in sortedLogs" :key="l.id">
                  <component
                    :is="isMe ? 'button' : 'div'"
                    class="flex w-full gap-3 py-3 text-left"
                    :class="isMe && 'rounded-lg hover:bg-white/5'"
                    @click="isMe && (close(), openLog({ edit: l }))"
                  >
                    <span class="w-24 shrink-0 text-sm text-muted first-letter:uppercase">{{ dayLabel(l.day, true) }}</span>
                    <span class="min-w-0 flex-1">
                      <Stars v-if="l.rating" :value="l.rating" :size="13" />
                      <span v-else class="text-xs text-faint">pas de note</span>
                      <span v-if="l.review" class="mt-1 block text-sm whitespace-pre-line text-ink/90">« {{ l.review }} »</span>
                      <img v-if="l.photo_key" :src="photoUrl(l.photo_key)" alt="" loading="lazy" class="mt-2 max-h-48 rounded-lg" />
                    </span>
                    <span v-if="isMe" class="shrink-0 text-sm text-muted">✎</span>
                  </component>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
