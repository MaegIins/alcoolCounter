<script setup>
import { ref, computed, watch } from 'vue'
import { api, CATS as ALL_CATS, ALCO_CATS, PALETTE, num, today, addDays, dayLabel } from '../api'
import Avatar from './Avatar.vue'
import LineChart from './LineChart.vue'
import StackedBars from './StackedBars.vue'

const props = defineProps({ users: Array, colors: Object, me: Object, refreshKey: Number })

const span = ref(7)
const showTable = ref(false)
const entries = ref([])
const search = ref('')

const days = computed(() => Array.from({ length: span.value }, (_, i) => addDays(today(), i - span.value + 1)))

let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  const data = await api(`/series?from=${days.value[0]}&to=${days.value.at(-1)}`).catch(() => null)
  if (seq === loadSeq && data) entries.value = data
}
watch([span, () => props.refreshKey], load, { immediate: true })

const byUser = computed(() => {
  const m = {}
  for (const e of entries.value) (m[e.user_id] ??= {})[e.day] = e
  return m
})

// La course : en cumul (chacun part de 0, la courbe monte à chaque soirée, l'ordre en bout de ligne = le classement
// de la période) ou soirée par soirée (les soirées sans verre cassent la ligne). Choix retenu sur l'appareil.
const raceMode = ref((() => { try { return localStorage.getItem('race-mode') || 'cumul' } catch { return 'cumul' } })())
watch(raceMode, (v) => { try { localStorage.setItem('race-mode', v) } catch {} })
const cumulative = computed(() => raceMode.value === 'cumul')

// Toutes les personnes ayant saisi sur la période, triées par total décroissant
const participants = computed(() =>
  props.users
    .filter((u) => byUser.value[u.id])
    .map((u) => {
      const nightly = days.value.map((d) => byUser.value[u.id][d]?.total ?? null)
      let acc = 0
      const values = cumulative.value ? nightly.map((v) => Math.round((acc += v || 0) * 10) / 10) : nightly
      return { ...u, values, sum: nightly.reduce((s, v) => s + (v || 0), 0) }
    })
    .filter((p) => p.sum > 0) // que du sans alcool : pas de courbe (0 verre), mais visible dans le détail
    .sort((a, b) => b.sum - a.sum)
)

// --- Sélection --------------------------------------------------------------
// auto   : toi + le top, jusqu'à 4 courbes
// custom : 1re touche = isoler la personne, touches suivantes = ajouter / retirer
// Une couleur est attribuée à l'ajout et ne bouge plus tant que la personne reste affichée.
const AUTO_COUNT = 4
const STORE = 'alcool-stats-selection'
const saved = (() => {
  try { return JSON.parse(localStorage.getItem(STORE)) || {} } catch { return {} }
})()
const mode = ref(saved.mode === 'custom' ? 'custom' : 'auto')
const picked = ref(Array.isArray(saved.picked) ? saved.picked : [])
const slots = ref(saved.slots || {})
watch([mode, picked, slots], () => {
  try { localStorage.setItem(STORE, JSON.stringify({ mode: mode.value, picked: picked.value, slots: slots.value })) } catch {}
}, { deep: true })

const autoIds = computed(() => {
  const ids = participants.value.map((p) => p.id)
  const mine = ids.includes(props.me.id) ? [props.me.id] : []
  return [...mine, ...ids.filter((id) => id !== props.me.id)].slice(0, AUTO_COUNT)
})
const present = computed(() => new Set(participants.value.map((p) => p.id)))
const selectedIds = computed(() =>
  mode.value === 'auto' ? autoIds.value : picked.value.filter((id) => present.value.has(id))
)
const colorOf = (id) =>
  PALETTE[(mode.value === 'auto' ? autoIds.value.indexOf(id) : slots.value[id] ?? 0) % PALETTE.length]

const freeSlot = (taken) => {
  let s = 0
  while (taken.has(s)) s++
  return s
}

function pick(id) {
  if (mode.value === 'auto') {
    mode.value = 'custom'
    picked.value = [id]
    slots.value = { [id]: 0 }
    return
  }
  if (picked.value.includes(id)) {
    // Retirer la dernière courbe affichée : on revient à « Moi + top 3 » plutôt qu'à un graphique vide
    if (selectedIds.value.length === 1 && selectedIds.value[0] === id) return reset()
    picked.value = picked.value.filter((x) => x !== id)
    const { [id]: _, ...rest } = slots.value
    slots.value = rest
    return
  }
  // Les places des personnes sélectionnées mais absentes de la période restent réservées
  const slot = freeSlot(new Set(picked.value.map((x) => slots.value[x])))
  picked.value = [...picked.value, id]
  slots.value = { ...slots.value, [id]: slot }
}
function reset() {
  mode.value = 'auto'
  picked.value = []
  slots.value = {}
}
// Tout le monde : on garde les couleurs déjà attribuées, les nouveaux prennent les places libres
function selectAll() {
  const keep = mode.value === 'custom' ? { ...slots.value } : Object.fromEntries(autoIds.value.map((id, i) => [id, i]))
  const taken = new Set(Object.values(keep))
  for (const p of participants.value) {
    if (keep[p.id] != null) continue
    keep[p.id] = freeSlot(taken)
    taken.add(keep[p.id])
  }
  mode.value = 'custom'
  slots.value = keep
  picked.value = participants.value.map((p) => p.id)
}
function selectNone() {
  mode.value = 'custom'
  picked.value = []
  slots.value = {}
}

const selSet = computed(() => new Set(selectedIds.value))
const series = computed(() =>
  selectedIds.value
    .map((id) => participants.value.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => ({ ...p, color: colorOf(p.id) }))
)
const context = computed(() => participants.value.filter((p) => !selSet.value.has(p.id)))

const chips = computed(() => {
  const q = search.value.trim().toLowerCase()
  return participants.value.filter((p) => !q || p.name.toLowerCase().includes(q))
})

// Détail par boisson : la personne isolée, sinon moi
const detailUser = computed(() =>
  mode.value === 'custom' && series.value.length === 1 ? series.value[0] : props.me
)
const detailRows = computed(() => byUser.value[detailUser.value.id] || {})
// Détail en nombre de consos (toutes les catégories, sans alcool compris) ou en verres standard (alcool seulement)
const detailUnit = ref((() => { try { return localStorage.getItem('stats-detail-unit') || 'consos' } catch { return 'consos' } })())
watch(detailUnit, (u) => { try { localStorage.setItem('stats-detail-unit', u) } catch {} })
const detailSegments = computed(() =>
  detailUnit.value === 'consos'
    ? ALL_CATS.map((c) => ({ ...c, key: `n_${c.key}` }))
    : ALCO_CATS
)
</script>

<template>
  <section class="space-y-5">
    <div>
      <h2 class="font-display text-2xl">Les stats</h2>
      <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div class="flex rounded-full bg-white/5 p-1">
          <button v-for="n in [7, 30]" :key="n" class="seg" :aria-pressed="span === n" @click="span = n">{{ n }} jours</button>
        </div>
        <button class="seg bg-white/5" :aria-pressed="showTable" @click="showTable = !showTable">Tableau</button>
      </div>
    </div>

    <div class="box">
      <div class="px-5 pt-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-bold">La course</h3>
          <div class="flex rounded-full bg-white/5 p-1">
            <button class="seg" :aria-pressed="raceMode === 'cumul'" @click="raceMode = 'cumul'">Cumul</button>
            <button class="seg" :aria-pressed="raceMode === 'nuit'" @click="raceMode = 'nuit'">Par jour</button>
          </div>
        </div>
        <p class="text-sm text-muted">
          {{ cumulative ? `Verres standard cumulés sur ${span} jours : le premier en haut à droite mène` : 'Verres standard de chaque journée' }}
        </p>
      </div>
      <div class="px-3 pt-3 pb-2">
        <p v-if="!participants.length" class="py-8 text-center text-muted">Pas encore de données.</p>
        <!-- Les autres en gris fin : seulement en cumul (par soirée, leurs lignes à trous font des bouts de traits épars) -->
        <LineChart v-else :days="days" :series="series" :context="cumulative ? context : []" :cumulative="cumulative" @pick="pick" />
      </div>

      <!-- Légende interactive -->
      <div v-if="participants.length" class="space-y-3 border-t border-white/5 px-5 py-4">
        <div class="flex items-center justify-between gap-3 text-sm text-muted">
          <span>{{ mode === 'auto' ? 'Touche quelqu\'un pour ne voir que lui' : 'Touche pour ajouter / retirer' }}</span>
          <input v-if="participants.length > 8" v-model="search" placeholder="Chercher…" class="field w-32 px-3 py-1 text-sm" />
        </div>
        <div class="flex flex-wrap gap-2 text-sm font-semibold">
          <button class="rounded-full bg-white/5 px-3 py-1 hover:bg-white/10" @click="selectAll">Tout le monde</button>
          <button class="rounded-full bg-white/5 px-3 py-1 hover:bg-white/10" @click="selectNone">Personne</button>
          <button
            class="rounded-full px-3 py-1"
            :class="mode === 'auto' ? 'bg-hi text-paper' : 'bg-white/5 hover:bg-white/10'"
            @click="reset"
          >
            Moi + top 3
          </button>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="p in chips"
            :key="p.id"
            class="flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 font-semibold transition"
            :class="selSet.has(p.id) ? 'border-transparent bg-white/5' : 'border-dashed border-line text-muted/60'"
            :style="selSet.has(p.id) ? { boxShadow: `inset 0 -3px 0 ${colorOf(p.id)}` } : {}"
            @click="pick(p.id)"
          >
            <Avatar :user="p" :color="colors[p.id]" :size="24" :class="!selSet.has(p.id) && 'opacity-40 grayscale'" />
            {{ p.name }}
          </button>
          <span v-if="!chips.length" class="text-sm text-muted">Personne.</span>
        </div>
      </div>

      <div v-if="showTable && series.length" class="overflow-x-auto border-t border-white/5">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-muted">
              <th class="px-4 py-2 text-left font-semibold">Jour</th>
              <th v-for="s in series" :key="s.id" class="px-4 py-2 text-right font-semibold">{{ s.name }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            <tr v-for="(d, i) in days" :key="d">
              <td class="px-4 py-1.5 first-letter:uppercase">{{ dayLabel(d, true) }}</td>
              <td v-for="s in series" :key="s.id" class="px-4 py-1.5 text-right tabular-nums">
                {{ s.values[i] == null ? '–' : num(s.values[i]) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="box">
      <div class="flex items-center gap-2 px-5 pt-4">
        <Avatar v-if="detailUser.id !== me.id" :user="detailUser" :color="colors[detailUser.id]" :size="24" class="rounded-full" />
        <div>
          <h3 class="font-bold">{{ detailUser.id === me.id ? 'Mon détail' : `Détail de ${detailUser.name}` }}</h3>
          <p class="text-sm text-muted">{{ detailUnit === 'consos' ? 'Consos par catégorie, sans alcool compris' : 'Verres standard par catégorie' }}</p>
        </div>
        <div class="ml-auto flex rounded-full bg-white/5 p-1">
          <button class="seg" :aria-pressed="detailUnit === 'consos'" @click="detailUnit = 'consos'">Consos</button>
          <button class="seg" :aria-pressed="detailUnit === 'verres'" @click="detailUnit = 'verres'">Verres</button>
        </div>
      </div>
      <div class="px-3 pt-3 pb-2">
        <StackedBars :days="days" :segments="detailSegments" :rows="detailRows" :unit="detailUnit" />
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1 px-5 pb-4 text-sm text-muted">
        <span v-for="a in detailSegments" :key="a.key" class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full" :style="{ background: a.hex }" />{{ a.label }}
        </span>
      </div>
    </div>
  </section>
</template>
