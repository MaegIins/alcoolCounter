<script setup>
import { ref, computed, watch } from 'vue'
import { api, ALCO_CATS as CATS, SUSPECT_UNITS, fmt, num, prettyDay, today, addDays, mondayOf, monthBounds } from '../api'
import Avatar from './Avatar.vue'
import { confetti, toast, vibrate } from '../juice'

const props = defineProps({ day: String, me: Object, colors: Object, refreshKey: Number })
const emit = defineEmits(['open']) // clic sur quelqu'un : ouvrir sa fiche

const period = ref('day')
const periods = [
  { k: 'day', l: 'Soirée' },
  { k: 'week', l: 'Semaine' },
  { k: 'month', l: 'Mois' },
  { k: 'all', l: 'Tout' },
]
const rows = ref([])
const loading = ref(false)

const range = computed(() => {
  const d = props.day
  if (period.value === 'day') return [d, d]
  if (period.value === 'week') return [mondayOf(d), addDays(mondayOf(d), 6)]
  if (period.value === 'month') return monthBounds(d)
  return ['2000-01-01', today()]
})

const title = computed(() => {
  if (period.value === 'day') return prettyDay(props.day)
  if (period.value === 'week') {
    const [y, m, d] = range.value[0].split('-').map(Number)
    return `Semaine du ${new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
  }
  if (period.value === 'month') {
    const [y, m] = props.day.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  }
  return 'Depuis le début'
})

const max = computed(() => Math.max(1, ...rows.value.map((r) => r.total)))
// Rang « sportif » : les ex æquo partagent le même rang (1, 2, 2, 4…)
const ranks = computed(() => {
  const m = new Map()
  rows.value.forEach((r, i) => m.set(r.id, i && r.total === rows.value[i - 1].total ? m.get(rows.value[i - 1].id) : i + 1))
  return m
})
const drinkers = computed(() => rows.value.filter((r) => r.total > 0))
// Podium : les 3 premiers (ex æquo compris dans la limite de 3 places), affichés 2 · 1 · 3
const podium = computed(() => {
  const top = drinkers.value.slice(0, 3)
  return top.length < 2 ? [] : [top[1], top[0], top[2]].filter(Boolean)
})
const STEP = { 1: 'h-24', 2: 'h-16', 3: 'h-11' }

// Avec beaucoup de monde : top 10, le reste à la demande.
// Si je suis plus bas, je prends la 10e ligne avec mon vrai rang.
const TOP = 10
const expanded = ref(false)
const myIndex = computed(() => rows.value.findIndex((r) => r.id === props.me.id))
const shown = computed(() => {
  if (expanded.value || rows.value.length <= TOP) return rows.value
  if (myIndex.value < TOP) return rows.value.slice(0, TOP)
  return [...rows.value.slice(0, TOP - 1), rows.value[myIndex.value]]
})
const hiddenCount = computed(() => rows.value.length - shown.value.length)

let loadSeq = 0
let lastKey = ''
// Je passe devant pendant la soirée en cours : confettis (pas au premier chargement ni en changeant de période)
function celebrate(before, after) {
  const key = `${period.value}|${range.value.join()}`
  const same = key === lastKey
  lastKey = key
  if (!same || !before.length || props.day !== today()) return
  const lead = (rows) => (rows[0]?.total > 0 && rows[0].total > (rows[1]?.total ?? 0) ? rows[0].id : null)
  if (lead(after) === props.me.id && lead(before) !== props.me.id) {
    confetti()
    vibrate([40, 60, 40])
    toast(period.value === 'day' ? 'Premier ce soir' : 'Premier', { kind: 'big', ms: 3000 })
  }
}
async function load() {
  const seq = ++loadSeq
  loading.value = true
  try {
    // Inactif = rien bu dans les 7 jours avant la fin de la période (ou ce soir si elle n'est pas finie)
    const ended = range.value[1] < today()
    const activeSince = addDays(ended ? range.value[1] : today(), -7)
    const data = await api(
      `/leaderboard?from=${range.value[0]}&to=${range.value[1]}&activeSince=${activeSince}&ended=${ended ? 1 : 0}&winsBefore=${today()}`
    )
    if (seq !== loadSeq) return // ignore les réponses arrivées après une plus récente
    celebrate(rows.value, data)
    rows.value = data
  } catch {
    // on garde le dernier classement affiché
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}
watch([() => range.value.join(), () => props.refreshKey], load, { immediate: true })
</script>

<template>
  <section class="space-y-5">
    <div>
      <h2 class="font-display text-2xl">Le classement</h2>
      <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span class="kicker first-letter:uppercase">{{ title }}</span>
        <div class="flex rounded-full bg-white/5 p-1">
          <button v-for="p in periods" :key="p.k" class="seg" :aria-pressed="period === p.k" @click="period = p.k">
            {{ p.l }}
          </button>
        </div>
      </div>
    </div>

    <p v-if="!drinkers.length && !loading" class="py-6 text-center text-muted">Personne n'a encore rien bu.</p>

    <!-- Podium -->
    <div v-if="podium.length" class="flex items-end justify-center gap-3 pt-2">
      <button
        v-for="r in podium"
        :key="r.id"
        class="lift flex w-1/3 max-w-36 flex-col items-center"
        :aria-label="`Voir la fiche de ${r.name}`"
        @click="emit('open', r.id)"
      >
        <Avatar :user="r" :color="colors[r.id]" :size="ranks.get(r.id) === 1 ? 64 : 48" class="rounded-full" />
        <span class="mt-1.5 w-full truncate text-center font-bold" :class="r.id === me.id && 'text-hi'">{{ r.name }}</span>
        <span class="font-display text-xl tabular-nums" :class="ranks.get(r.id) === 1 && 'neon'">{{ num(r.total) }}</span>
        <div
          class="tile mt-2 flex w-full items-start justify-center rounded-b-none pt-1.5 font-display text-3xl"
          :class="[STEP[ranks.get(r.id)] ?? 'h-11', ranks.get(r.id) === 1 ? '!bg-hi/20 text-hi' : 'text-muted']"
        >
          {{ ranks.get(r.id) }}
        </div>
      </button>
    </div>

    <div v-if="rows.length" class="box">
      <TransitionGroup tag="ol" name="rank" class="divide-y divide-white/5">
        <li
          v-for="r in shown"
          :key="r.id"
          class="flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/5"
          :class="r.id === me.id && 'bg-hi/10'"
          role="button"
          tabindex="0"
          :aria-label="`Voir la fiche de ${r.name}`"
          @click="emit('open', r.id)"
          @keydown.enter="emit('open', r.id)"
        >
          <span class="w-7 text-center font-display text-lg tabular-nums" :class="!r.total && 'text-muted/40'">
            {{ r.total ? ranks.get(r.id) : '–' }}
          </span>
          <Avatar :user="r" :color="colors[r.id]" :size="40" class="rounded-full" />
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-2">
              <span class="truncate text-lg font-bold">{{ r.name }}</span>
              <span v-if="r.id === me.id" class="text-sm font-semibold text-hi">toi</span>
              <span
                v-if="r.suspect_days"
                class="shrink-0 rounded-full bg-neon px-2 text-xs font-bold text-paper"
                :title="`${r.suspect_days} soirée(s) à plus de ${SUSPECT_UNITS} verres`"
              >
                suspect{{ period !== 'day' && r.suspect_days > 1 ? ` ×${r.suspect_days}` : '' }}
              </span>
            </span>
            <span class="block text-sm text-muted">
              {{ r.count }} conso{{ r.count > 1 ? 's' : '' }}<template v-if="r.wins"> · ♛ {{ r.wins }}</template><template v-if="r.eau"> · 💧{{ r.eau }}</template><template v-if="r.clope"> · 🚬{{ r.clope }}</template>
            </span>
            <span v-if="r.total" class="mt-1.5 flex h-1.5 gap-px overflow-hidden rounded-full bg-white/5">
              <span
                v-for="c in CATS"
                :key="c.key"
                :class="c.color"
                class="h-full transition-all duration-300"
                :style="{ width: `${(r[c.key] / max) * 100}%` }"
                :title="`${c.label} : ${fmt(r[c.key])}`"
              />
            </span>
          </span>
          <span class="text-right">
            <span class="block font-display text-xl leading-none tabular-nums">{{ num(r.total) }}</span>
            <span class="text-xs text-muted">verre{{ r.total >= 2 ? 's' : '' }}</span>
          </span>
        </li>
      </TransitionGroup>
      <button
        v-if="hiddenCount || (expanded && rows.length > TOP)"
        class="w-full border-t border-white/5 py-3 text-sm font-semibold text-muted hover:text-hi"
        @click="expanded = !expanded"
      >
        {{ expanded ? 'Réduire' : `Voir les ${hiddenCount} autres` }}
      </button>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
      <span class="flex flex-wrap gap-x-3 gap-y-1">
        <span v-for="c in CATS" :key="c.key" class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full" :class="c.color" />{{ c.label }}
        </span>
      </span>
      <span>Touche quelqu'un pour sa fiche</span>
    </div>
  </section>
</template>
