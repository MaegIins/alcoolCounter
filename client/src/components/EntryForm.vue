<script setup>
// « Ma soirée » : le compteur, eau et clopes, et l'addition.
// On ajoute un verre avec le « + » (barre du bas) ; ici on suit la soirée.
// Chaque conso a son volume et son degré : le score est calculé sur l'alcool pur.
import { ref, computed, watch } from 'vue'
import {
  api, SUSPECT_UNITS, catOf, unitsOf, round1,
  num, fmtDrink, prettyDay, today, addDays, photoUrl,
} from '../api'
import AnimatedNumber from './AnimatedNumber.vue'
import Pager from './Pager.vue'
import Stars from './Stars.vue'
import Poster from './Poster.vue'
import Icon from './Icon.vue'
import { burst, centerOf, vibrate, toast, milestoneBetween, celebrateBadges, smokeLine, waterLine } from '../juice'
import { ui, openLog, openProduct } from '../nav'

const day = defineModel('day', { required: true })
const props = defineProps({ solo: Boolean }) // sans bande : on rappelle de temps en temps d'en rejoindre une
const emit = defineEmits(['saved', 'carte', 'bandes'])

const drinks = ref([]) // consos de la soirée, plus récente en premier
const extras = ref([]) // eau et clopes de la soirée
const loading = ref(true)
const loadFailed = ref(false)
const error = ref('')
const wobble = ref(false)
let loadSeq = 0

const units = computed(() => round1(drinks.value.reduce((s, d) => s + unitsOf(d), 0)))
const grams = computed(() => Math.round(units.value * 10))
const isToday = computed(() => day.value === today())
// Verre qui se remplit : plein à 10 verres standard, déborde (mousse rose) au-delà
const fill = computed(() => Math.min(1, units.value / 10))
const waters = computed(() => extras.value.filter((x) => x.kind === 'eau').length)
const smokes = computed(() => extras.value.filter((x) => x.kind === 'clope').length)
// L'addition : verres, eau et clopes mélangés, du plus récent au plus ancien
const timeline = computed(() =>
  [...drinks.value.map((d) => ({ ...d, type: 'drink' })), ...extras.value.map((x) => ({ ...x, type: x.kind }))].sort(
    (a, b) => b.at - a.at || b.id - a.id
  )
)
// L'addition paginée : 10 lignes par page, retour en page 1 quand on change de soirée ou qu'on ajoute
// Lignes par page : 4 par défaut, réglable (retenu sur cet appareil). 0 = tout afficher.
const PER_PAGE_CHOICES = [4, 10, 25, 0]
const readPerPage = () => {
  try {
    const n = Number(localStorage.getItem('addition-per-page'))
    return PER_PAGE_CHOICES.includes(n) && localStorage.getItem('addition-per-page') !== null ? n : 4
  } catch {
    return 4
  }
}
const perPage = ref(readPerPage())
watch(perPage, (n) => {
  page.value = 1
  try { localStorage.setItem('addition-per-page', String(n)) } catch {}
})
const PER_PAGE = computed(() => perPage.value || Infinity)
const page = ref(1)
const pages = computed(() => Math.max(1, Math.ceil(timeline.value.length / PER_PAGE.value)))
const pagedTimeline = computed(() => timeline.value.slice((page.value - 1) * PER_PAGE.value, page.value * PER_PAGE.value))
watch(() => timeline.value[0]?.at, () => (page.value = 1))
watch(day, () => (page.value = 1))
watch(pages, (n) => page.value > n && (page.value = n))
const additionTop = ref(null)
const toAddition = () => additionTop.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
// Verres d'affilée depuis le dernier verre d'eau (pour le rappel)
const sinceWater = computed(() => {
  const lastWater = Math.max(0, ...extras.value.filter((x) => x.kind === 'eau').map((x) => x.at))
  return drinks.value.filter((d) => d.at > lastWater).length
})

let loadedDay = null
// Un verre vient d'arriver (ajouté par le +) : le verre tangue, et les rappels de la soirée
function react(before, after) {
  const known = new Set(before.map((x) => x.id))
  const fresh = after.filter((x) => !known.has(x.id))
  if (!fresh.length) return
  wobble.value = false
  requestAnimationFrame(() => (wobble.value = true))
  const sum = (list) => round1(list.reduce((t, x) => t + unitsOf(x), 0))
  const step = milestoneBetween(sum(before), sum(after))
  if (step) setTimeout(() => toast(step.text, { kind: 'big' }), 700)
  if (isToday.value && sinceWater.value >= 3 && sinceWater.value % 3 === 0) {
    setTimeout(() => toast(`${sinceWater.value} verres sans eau`, { ms: 6000, icon: 'fa-droplet', action: { label: '+ Eau', run: () => addExtra('eau') } }), 1200)
  }
  // Solo : au 1er verre de la soirée puis tous les 4, petit rappel qu'à plusieurs c'est une compet
  if (props.solo && (after.length === 1 || after.length % 4 === 0)) {
    setTimeout(() => toast('Seul au comptoir ? Monte une bande', { ms: 6000, action: { label: 'Bandes', run: () => emit('bandes') } }), 1600)
  }
}

async function load() {
  const seq = ++loadSeq
  const d = day.value
  loading.value = true
  loadFailed.value = false
  error.value = ''
  try {
    const [rows, ex] = await Promise.all([api(`/drinks/me?from=${d}&to=${d}`), api(`/extras/me?from=${d}&to=${d}`)])
    if (seq !== loadSeq) return // on a changé de soirée entre-temps : réponse périmée
    const before = loadedDay === d ? drinks.value : null
    drinks.value = rows
    extras.value = ex
    loadedDay = d
    if (before) react(before, rows)
  } catch (e) {
    if (seq !== loadSeq) return
    loadFailed.value = true
    error.value = `Impossible de charger cette soirée (${e.message}). Recharge la page.`
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}
watch(day, load, { immediate: true })
// Conso complétée ailleurs (note, avis, photo, date) : on recharge la soirée
watch(() => ui.refresh, () => load())
async function remove(drink, undo = false) {
  error.value = ''
  try {
    await api(`/drinks/${drink.id}`, { method: 'DELETE' })
    drinks.value = drinks.value.filter((d) => d.id !== drink.id)
    if (undo) toast(`${drink.name} annulé`)
    emit('saved')
  } catch (e) {
    error.value = e.message
  }
}

// --- Eau et clopes (hors score) ------------------------------------------------------
async function addExtra(kind, e) {
  const [x, y] = e ? centerOf(e) : centerOf(document.body)
  const d = day.value
  try {
    const row = await api('/extras', { method: 'POST', body: { day: d, kind } })
    if (d === day.value) extras.value = [row, ...extras.value]
    burst(x, y, kind === 'eau' ? { icon: 'fa-droplet', color: '#6f93ad' } : { icon: 'fa-smoking', color: '#8a857a', bubbles: 12 })
    vibrate(kind === 'eau' ? 15 : [20, 30, 20])
    toast(kind === 'eau' ? waterLine(row.count) : smokeLine(row.count), { icon: kind === 'eau' ? 'fa-droplet' : 'fa-smoking', action: { label: 'Annuler', run: () => removeExtra(row) } })
    celebrateBadges(row.badges)
    emit('saved')
  } catch (err) {
    error.value = err.message
  }
}
async function removeExtra(row) {
  try {
    await api(`/extras/${row.id}`, { method: 'DELETE' })
    extras.value = extras.value.filter((x) => x.id !== row.id)
    emit('saved')
  } catch (e) {
    error.value = e.message
  }
}

const time = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const sinceLast = computed(() => {
  if (!isToday.value || !drinks.value.length) return ''
  const min = Math.round((Date.now() - drinks.value[0].at) / 60e3)
  return min < 1 ? "à l'instant" : min < 60 ? `il y a ${min} min` : `il y a ${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
})
</script>

<template>
  <section class="space-y-8">
    <div class="flex items-center justify-between gap-3">
      <h2 class="font-display text-2xl">Ma soirée</h2>
      <div class="flex items-center rounded-full bg-white/5 p-1 text-sm font-semibold">
        <button class="h-8 w-8 rounded-full text-lg text-hi hover:bg-white/10" aria-label="Soirée précédente" @click="day = addDays(day, -1)"><Icon name="prev" /></button>
        <span class="min-w-24 px-1 text-center first-letter:uppercase">{{ prettyDay(day) }}</span>
        <button
          class="h-8 w-8 rounded-full text-lg text-hi hover:bg-white/10 disabled:opacity-20"
          :disabled="isToday"
          aria-label="Soirée suivante"
          @click="day = addDays(day, 1)"
        >
          <Icon name="more" />
        </button>
      </div>
    </div>

    <!-- Compteur -->
    <div class="flex items-center gap-6 px-1">
      <svg viewBox="0 0 60 84" class="h-28 w-20 shrink-0 overflow-visible" :class="wobble && 'wobble'" aria-hidden="true" @animationend="wobble = false">
        <defs>
          <clipPath id="glass"><path d="M8 6h44l-5 72a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4z" /></clipPath>
          <linearGradient id="beer" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="#e3cc4a" /><stop offset="1" stop-color="#a88a1c" />
          </linearGradient>
        </defs>
        <g clip-path="url(#glass)">
          <rect x="0" :y="82 - 76 * fill" width="60" :height="76 * fill" fill="url(#beer)" class="transition-all duration-500" />
          <rect v-if="fill > 0" x="0" :y="82 - 76 * fill - 6" width="60" height="7" :fill="units > SUSPECT_UNITS ? '#b8432c' : '#efe6c4'" class="transition-all duration-500" />
          <circle
            v-for="(b, i) in fill > 0.15 ? [[20, 1.8], [34, 1.3], [42, 2], [27, 1.5], [38, 1.2]] : []"
            :key="i" :cx="b[0]" cy="80" :r="b[1]" fill="#efe6c4" class="rise"
            :style="{ animationDelay: `${i * 0.5}s`, '--h': `${70 * fill}px` }"
          />
        </g>
        <path d="M8 6h44l-5 72a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4z" fill="none" stroke="#e4dcc3" stroke-opacity=".6" stroke-width="2" />
      </svg>
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-3">
          <span class="font-display text-6xl leading-none tabular-nums" :class="units > SUSPECT_UNITS ? 'neon-pink' : 'neon'"><AnimatedNumber :value="units" /></span>
          <span v-if="units > SUSPECT_UNITS" class="rounded-full bg-neon px-2 py-0.5 text-xs font-bold text-paper uppercase">suspect</span>
        </div>
        <div class="mt-1 text-lg font-semibold">verre{{ units >= 2 ? 's' : '' }} standard</div>
        <div class="text-sm text-muted">
          {{ grams }} g d'alcool<template v-if="waters || smokes"> · <Icon name="water" class="text-fort" /> {{ waters }} <Icon name="smoke" /> {{ smokes }}</template> · {{ drinks.length }} conso{{ drinks.length > 1 ? 's' : '' }}<template v-if="sinceLast"> · dernier {{ sinceLast }}</template>
        </div>
      </div>
    </div>

    <!-- Hors score : eau et clopes -->
    <div class="grid grid-cols-2 gap-2.5">
      <button class="btn tile lift flex items-center justify-center gap-2 py-3 font-bold disabled:opacity-40" :disabled="loadFailed" @click="addExtra('eau', $event)">
        <Icon name="water" :size="22" class="text-fort" /> Verre d'eau
        <span v-if="waters" class="rounded-full bg-fort/20 px-2 text-sm text-fort">×{{ waters }}</span>
      </button>
      <button class="btn tile lift flex items-center justify-center gap-2 py-3 font-bold disabled:opacity-40" :disabled="loadFailed" @click="addExtra('clope', $event)">
        <Icon name="smoke" :size="22" class="text-muted" /> Clope
        <span v-if="smokes" class="rounded-full bg-white/10 px-2 text-sm text-muted">×{{ smokes }}</span>
      </button>
    </div>

    <p v-if="error" class="rounded-xl bg-alert px-4 py-2.5 text-sm font-semibold text-white">{{ error }}</p>

    <!-- L'addition -->
    <div v-if="timeline.length" ref="additionTop" class="scroll-mt-4">
      <h3 class="mb-2 flex flex-wrap items-center justify-between gap-2 text-lg font-bold">
        L'addition
        <label class="flex items-center gap-2 text-sm font-medium text-muted">
          {{ timeline.length }} ligne{{ timeline.length > 1 ? 's' : '' }} ·
          <select v-model.number="perPage" class="field py-1 pr-2 pl-2 text-sm" aria-label="Lignes par page">
            <option v-for="n in PER_PAGE_CHOICES" :key="n" :value="n">{{ n ? `${n} par page` : 'Tout' }}</option>
          </select>
        </label>
      </h3>
      <TransitionGroup tag="ul" name="item" class="divide-y divide-white/5">
        <li v-for="d in pagedTimeline" :key="d.type + d.id" class="flex items-center gap-3" :class="d.type === 'drink' ? 'py-2.5' : 'py-2 text-muted'">
          <span class="w-12 text-sm tabular-nums" :class="d.type === 'drink' && 'text-muted'">{{ time(d.at) }}</span>
          <template v-if="d.type === 'drink'">
            <!-- Toute la ligne s'ouvre : on y voit la note, l'avis, la photo, et on peut les changer -->
            <!-- La vignette : page de la boisson (si elle est sur la carte) -->
            <button
              class="shrink-0 rounded-lg"
              :class="d.product_id ? 'lift' : 'cursor-default'"
              :aria-label="d.product_id ? `Page de ${d.name}` : undefined"
              :tabindex="d.product_id ? 0 : -1"
              @click="d.product_id ? openProduct(d.product_id) : openLog({ edit: d })"
            >
              <img v-if="d.photo_key" :src="photoUrl(d.photo_key)" alt="" loading="lazy" class="h-11 w-11 rounded-lg object-cover ring-1 ring-black/50" />
              <Poster v-else :drink="d" :width="44" :icon="44" class="!h-11" />
            </button>
            <button class="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left hover:bg-white/5" :aria-label="`Voir ${d.name}`" @click="openLog({ edit: d })">
              <span class="min-w-0 flex-1 leading-tight">
                <span class="block truncate font-bold">{{ d.name }}</span>
                <span class="flex flex-wrap items-center gap-x-2 text-sm text-muted">
                  <span class="whitespace-nowrap">{{ fmtDrink(d) }}</span>
                  <Stars v-if="d.rating" :value="d.rating" :size="11" />
                </span>
                <span v-if="d.review" class="mt-0.5 block truncate text-sm text-ink/70 italic">« {{ d.review }} »</span>
                <span v-else-if="!d.rating" class="mt-0.5 block text-xs font-semibold text-hi/80"><Icon name="star" /> Noter</span>
              </span>
              <span class="shrink-0 font-semibold tabular-nums" :style="{ color: catOf(d.cat).hex }">{{ d.units ? `+${num(d.units)}` : '0' }}</span>
            </button>
            <button class="h-9 w-9 shrink-0 rounded-full text-muted hover:bg-alert hover:text-white" :aria-label="`Supprimer ${d.name}`" @click="remove(d)" ><Icon name="close" /></button>
          </template>
          <template v-else>
            <span class="flex w-11 justify-center"><Icon :name="d.type === 'eau' ? 'water' : 'smoke'" :size="20" :class="d.type === 'eau' ? 'text-fort' : 'text-muted'" /></span>
            <span class="flex-1">{{ d.type === 'eau' ? "Verre d'eau" : 'Clope' }}</span>
            <span class="text-sm">hors score</span>
            <button class="h-9 w-9 rounded-full hover:bg-alert hover:text-white" :aria-label="d.type === 'eau' ? 'Supprimer ce verre d’eau' : 'Supprimer cette clope'" @click="removeExtra(d)" ><Icon name="close" /></button>
          </template>
        </li>
      </TransitionGroup>
      <Pager v-model="page" :pages="pages" label="Pages de l'addition" class="mt-4" @change="toAddition" />
    </div>
    <p v-else-if="!loading && !loadFailed" class="text-center text-sm text-muted">
      Rien {{ isToday ? 'ce soir' : 'cette soirée-là' }}.
      <button class="font-semibold text-hi hover:underline" @click="openLog({ day })"><Icon name="plus" /> Ajouter un verre</button>
    </p>
  </section>
</template>
