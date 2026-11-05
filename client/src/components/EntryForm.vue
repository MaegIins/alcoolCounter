<script setup>
// « Ma soirée » : on choisit un format (pinte, shot…) puis son degré ; les raccourcis s'ajoutent en un tap.
// Raccourcis = mes favoris de la carte (★) + ce que je bois le plus.
// Chaque conso a son volume et son degré : le score est calculé sur l'alcool pur.
import { ref, computed, watch, nextTick } from 'vue'
import {
  api, FORMATS, SUSPECT_UNITS, MAX_CL, catOf, drinkId, unitsOf, round1,
  num, fmtDrink, prettyDay, today, addDays,
} from '../api'
import DrinkFields from './DrinkFields.vue'
import AnimatedNumber from './AnimatedNumber.vue'
import Pager from './Pager.vue'
import { burst, centerOf, vibrate, toast, milestoneBetween, celebrateBadges, smokeLine, waterLine } from '../juice'

const day = defineModel('day', { required: true })
const props = defineProps({ solo: Boolean }) // sans bande : on rappelle de temps en temps d'en rejoindre une
const emit = defineEmits(['saved', 'carte', 'bandes'])

const drinks = ref([]) // consos de la soirée, plus récente en premier
const extras = ref([]) // eau et clopes de la soirée
const history = ref([]) // ce que je bois le plus (calculé par le serveur)
const stars = ref([]) // mes favoris de la carte
const loading = ref(true)
const loadFailed = ref(false)
const error = ref('')
const busy = ref('') // drinkId en cours d'envoi
const popped = ref('')
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
const PER_PAGE = 10
const page = ref(1)
const pages = computed(() => Math.max(1, Math.ceil(timeline.value.length / PER_PAGE)))
const pagedTimeline = computed(() => timeline.value.slice((page.value - 1) * PER_PAGE, page.value * PER_PAGE))
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

async function load() {
  const seq = ++loadSeq
  const d = day.value
  loading.value = true
  loadFailed.value = false
  error.value = ''
  try {
    const [rows, ex] = await Promise.all([api(`/drinks/me?from=${d}&to=${d}`), api(`/extras/me?from=${d}&to=${d}`)])
    if (seq !== loadSeq) return // on a changé de soirée entre-temps : réponse périmée
    drinks.value = rows
    extras.value = ex
  } catch (e) {
    if (seq !== loadSeq) return
    loadFailed.value = true
    error.value = `Impossible de charger cette soirée (${e.message}). Recharge la page.`
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}
async function loadFavorites() {
  history.value = await api('/drinks/favorites').catch(() => history.value)
}
async function loadStars() {
  stars.value = await api('/products/favorites').catch(() => stars.value)
}
watch(day, load, { immediate: true })
loadFavorites()
loadStars()

// Raccourcis : les favoris de la carte d'abord, complétés par mes habitudes (8 au total au minimum)
const shortcuts = computed(() => {
  const ids = new Set(stars.value.map(drinkId))
  const extra = history.value.filter((h) => !ids.has(drinkId(h))).slice(0, Math.max(0, 8 - stars.value.length))
  return [...stars.value.map((p) => ({ ...p, star: true })), ...extra]
})

async function add(drink, e) {
  if (loadFailed.value || busy.value) return
  const [x, y] = e ? centerOf(e) : centerOf(document.body)
  const before = units.value
  const id = drinkId(drink)
  busy.value = id
  error.value = ''
  const d = day.value
  try {
    const row = await api('/drinks', {
      method: 'POST',
      body: { day: d, name: drink.name, cat: drink.cat, cl: drink.cl, abv: drink.abv },
    })
    if (d === day.value) drinks.value = [row, ...drinks.value]
    popped.value = ''
    wobble.value = false
    requestAnimationFrame(() => {
      popped.value = id
      wobble.value = true
    })
    // Juice : le score s'envole, ça vibre, on trinque (ou on fête un palier)
    burst(x, y, { text: `+${num(row.units)}`, color: catOf(row.cat).hex })
    vibrate(30)
    // Toast avec « Annuler » (fausse manip), puis éventuels palier, rappel d'eau et badges
    toast(`${catOf(row.cat).icon} ${row.name} +${num(row.units)}`, { action: { label: 'Annuler', run: () => remove(row, true) } })
    const step = d === day.value && milestoneBetween(before, round1(before + row.units))
    if (step) toast(step.text, { kind: 'big' })
    if (d === day.value && isToday.value && sinceWater.value >= 3 && sinceWater.value % 3 === 0) {
      toast(`${sinceWater.value} verres sans eau`, {
        ms: 6000,
        action: { label: '+ 💧', run: () => addExtra('eau') },
      })
    }
    celebrateBadges(row.badges)
    // Solo : au 1er verre de la soirée puis tous les 4, petit rappel qu'à plusieurs c'est une compet
    if (props.solo && d === day.value && (drinks.value.length === 1 || drinks.value.length % 4 === 0)) {
      setTimeout(() => toast('Seul au comptoir ? Monte une bande', { ms: 6000, action: { label: 'Bandes', run: () => emit('bandes') } }), 900)
    }
    emit('saved')
    loadFavorites()
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = ''
  }
}

async function remove(drink, undo = false) {
  error.value = ''
  try {
    await api(`/drinks/${drink.id}`, { method: 'DELETE' })
    drinks.value = drinks.value.filter((d) => d.id !== drink.id)
    if (undo) toast(`${drink.name} annulé`)
    emit('saved')
    loadFavorites()
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
    burst(x, y, kind === 'eau' ? { text: '💧', color: '#6f93ad' } : { text: '🚬', color: '#6e6a62', bubbles: 12 })
    vibrate(kind === 'eau' ? 15 : [20, 30, 20])
    toast(kind === 'eau' ? waterLine(row.count) : smokeLine(row.count), { action: { label: 'Annuler', run: () => removeExtra(row) } })
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

// --- Choix du degré (format) ou boisson perso ------------------------------------
const pick = ref(null) // null = panneau fermé ; { mode: 'format' | 'custom', label, name, cat, cl, abv }
const toCarte = ref(false) // ajouter aussi la boisson à la carte commune
const panel = ref(null)
const show = async (p) => {
  pick.value = p
  toCarte.value = false
  await nextTick()
  panel.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}
// Degré pré-rempli : celui que tu prends le plus souvent dans ce format, sinon le classique
function openFormat(f) {
  const usual = history.value.find((x) => x.cat === f.cat && x.cl === f.cl)
  show({ mode: 'format', label: f.name, name: '', cat: f.cat, cl: f.cl, abv: usual?.abv ?? f.abv })
}
function openCustom() {
  show({ mode: 'custom', label: 'Autre chose', name: '', cat: 'biere', cl: 50, abv: 5 })
}
const pickUnits = computed(() => {
  const p = pick.value
  return p && p.cl > 0 && p.abv > 0 ? unitsOf({ cl: Number(p.cl), abv: Number(p.abv) }) : 0
})
const pickValid = computed(() => {
  const p = pick.value
  return p && (p.mode === 'format' || p.name.trim()) && p.cl > 0 && p.cl <= MAX_CL && p.abv > 0 && p.abv <= 100
})
async function addPick(e) {
  if (!pickValid.value) return
  const p = pick.value
  const drink = { name: p.name.trim() || p.label, cat: p.cat, cl: Number(p.cl), abv: Number(p.abv) }
  await add(drink, e.submitter ?? e)
  if (error.value) return
  if (toCarte.value && p.name.trim()) {
    // Déjà sur la carte (409) : pas grave, la conso est enregistrée
    await api('/products', { method: 'POST', body: drink }).catch(() => {})
    loadStars()
  }
  pick.value = null
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
        <button class="h-8 w-8 rounded-full text-lg text-hi hover:bg-white/10" aria-label="Soirée précédente" @click="day = addDays(day, -1)">‹</button>
        <span class="min-w-24 px-1 text-center first-letter:uppercase">{{ prettyDay(day) }}</span>
        <button
          class="h-8 w-8 rounded-full text-lg text-hi hover:bg-white/10 disabled:opacity-20"
          :disabled="isToday"
          aria-label="Soirée suivante"
          @click="day = addDays(day, 1)"
        >
          ›
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
          {{ grams }} g d'alcool<template v-if="waters || smokes"> · 💧{{ waters }} 🚬{{ smokes }}</template> · {{ drinks.length }} conso{{ drinks.length > 1 ? 's' : '' }}<template v-if="sinceLast"> · dernier {{ sinceLast }}</template>
        </div>
      </div>
    </div>

    <!-- Hors score : eau et clopes -->
    <div class="grid grid-cols-2 gap-2.5">
      <button class="btn tile lift flex items-center justify-center gap-2 py-3 font-bold disabled:opacity-40" :disabled="loadFailed" @click="addExtra('eau', $event)">
        <span class="text-2xl">💧</span> Verre d'eau
        <span v-if="waters" class="rounded-full bg-fort/20 px-2 text-sm text-fort">×{{ waters }}</span>
      </button>
      <button class="btn tile lift flex items-center justify-center gap-2 py-3 font-bold disabled:opacity-40" :disabled="loadFailed" @click="addExtra('clope', $event)">
        <span class="text-2xl">🚬</span> Clope
        <span v-if="smokes" class="rounded-full bg-white/10 px-2 text-sm text-muted">×{{ smokes }}</span>
      </button>
    </div>

    <!-- Raccourcis : un tap = un verre -->
    <div>
      <div class="mb-3 flex items-baseline justify-between">
        <h3 class="text-lg font-bold">Raccourcis <span class="kicker font-medium">· un tap = un verre</span></h3>
        <button class="text-sm font-semibold text-hi hover:underline" @click="emit('carte')">La carte →</button>
      </div>
      <div v-if="shortcuts.length" class="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
        <button
          v-for="d in shortcuts"
          :key="drinkId(d)"
          class="btn tile lift relative flex shrink-0 items-center gap-2.5 py-2.5 pr-4 pl-3 text-left disabled:opacity-40"
          :class="[popped === drinkId(d) && 'pop', d.star && 'border-hi/40']"
          :disabled="loadFailed || !!busy"
          @click="add(d, $event)"
          @animationend="popped = ''"
        >
          <span class="text-2xl">{{ catOf(d.cat).icon }}</span>
          <span class="leading-tight">
            <span class="block max-w-32 truncate font-bold">{{ d.name }}<span v-if="d.star" class="ml-1 text-xs text-hi">★</span></span>
            <span class="text-sm text-muted">{{ fmtDrink(d) }}</span>
          </span>
        </button>
      </div>
      <p v-else class="text-sm text-muted">
        Mets des boissons en favori sur <button class="font-semibold text-hi hover:underline" @click="emit('carte')">la carte</button>
        pour les retrouver ici.
      </p>
    </div>

    <!-- Formats : on choisit le contenant, puis le degré -->
    <div>
      <h3 class="mb-3 text-lg font-bold">Je prends…</h3>
      <div class="grid grid-cols-3 gap-2.5">
        <button
          v-for="f in FORMATS"
          :key="f.name"
          class="btn tile lift flex flex-col items-center gap-1 px-1 py-3.5 text-center disabled:opacity-40"
          :class="pick?.mode === 'format' && pick.label === f.name && '!border-hi !bg-hi/15'"
          :disabled="loadFailed"
          @click="openFormat(f)"
        >
          <span class="text-3xl leading-none">{{ catOf(f.cat).icon }}</span>
          <span class="w-full truncate font-bold">{{ f.name }}</span>
          <span class="text-sm leading-none text-muted">{{ num(f.cl) }} cl</span>
        </button>
        <button
          class="btn tile lift flex flex-col items-center justify-center gap-1 border-dashed !border-hi/50 px-1 py-3.5 text-hi"
          :class="pick?.mode === 'custom' && '!border-hi !bg-hi/15'"
          :disabled="loadFailed"
          @click="openCustom()"
        >
          <span class="text-3xl leading-none">＋</span>
          <span class="font-bold">Autre chose</span>
          <span class="text-sm leading-none opacity-80">sur mesure</span>
        </button>
      </div>

      <!-- Étape 2 : le degré (et pour « autre chose », le reste) -->
      <form v-if="pick" ref="panel" class="box mt-6 space-y-5 p-5" @submit.prevent="addPick($event)">
        <div class="flex items-center justify-between">
          <span class="text-xl font-bold">
            {{ catOf(pick.cat).icon }} {{ pick.label }}<span v-if="pick.mode === 'format'" class="font-medium text-muted"> · {{ num(pick.cl) }} cl</span>
          </span>
          <button type="button" class="text-sm font-semibold text-muted hover:text-ink" @click="pick = null">Annuler</button>
        </div>

        <DrinkFields
          v-model="pick"
          :full="pick.mode === 'custom'"
          :name-placeholder="pick.mode === 'format' ? 'Nom (optionnel) : Chouffe, Leffe…' : 'Nom : Ricard, Ti\'punch, Hydromel…'"
        />
        <label v-if="pick.name.trim()" class="flex items-center gap-2.5 text-sm">
          <input v-model="toCarte" type="checkbox" class="h-4 w-4 accent-[#d4bc35]" />
          L'ajouter aussi à la carte, pour tout le monde
        </label>

        <button :disabled="!pickValid || !!busy" class="btn btn-hi w-full py-3 text-lg font-bold disabled:opacity-40">
          Ajouter · +{{ num(pickUnits) }} verre{{ pickUnits >= 2 ? 's' : '' }}
        </button>
      </form>

      <p v-if="error" class="mt-3 rounded-xl bg-alert px-4 py-2.5 text-sm font-semibold text-white">{{ error }}</p>
    </div>

    <!-- L'addition -->
    <div v-if="timeline.length" ref="additionTop" class="scroll-mt-4">
      <h3 class="mb-2 flex items-baseline justify-between text-lg font-bold">
        L'addition
        <span v-if="pages > 1" class="text-sm font-medium text-muted">{{ timeline.length }} lignes · page {{ page }}/{{ pages }}</span>
      </h3>
      <TransitionGroup tag="ul" name="item" class="divide-y divide-white/5">
        <li v-for="d in pagedTimeline" :key="d.type + d.id" class="flex items-center gap-3" :class="d.type === 'drink' ? 'py-2.5' : 'py-2 text-muted'">
          <span class="w-12 text-sm tabular-nums" :class="d.type === 'drink' && 'text-muted'">{{ time(d.at) }}</span>
          <template v-if="d.type === 'drink'">
            <span class="text-2xl">{{ catOf(d.cat).icon }}</span>
            <span class="min-w-0 flex-1 leading-tight">
              <span class="block truncate font-bold">{{ d.name }}</span>
              <span class="text-sm text-muted">{{ fmtDrink(d) }}</span>
            </span>
            <span class="font-semibold tabular-nums" :style="{ color: catOf(d.cat).hex }">+{{ num(d.units) }}</span>
            <button class="h-9 w-9 rounded-full text-muted hover:bg-alert hover:text-white" :aria-label="`Supprimer ${d.name}`" @click="remove(d)">✕</button>
          </template>
          <template v-else>
            <span class="text-2xl">{{ d.type === 'eau' ? '💧' : '🚬' }}</span>
            <span class="flex-1">{{ d.type === 'eau' ? "Verre d'eau" : 'Clope' }}</span>
            <span class="text-sm">hors score</span>
            <button class="h-9 w-9 rounded-full hover:bg-alert hover:text-white" :aria-label="d.type === 'eau' ? 'Supprimer ce verre d’eau' : 'Supprimer cette clope'" @click="removeExtra(d)">✕</button>
          </template>
        </li>
      </TransitionGroup>
      <Pager v-model="page" :pages="pages" label="Pages de l'addition" class="mt-4" @change="toAddition" />
    </div>
    <p v-else-if="!loading && !loadFailed" class="text-center text-sm text-muted">
      Rien {{ isToday ? 'ce soir' : 'cette soirée-là' }}.
    </p>
  </section>
</template>
