<script setup>
import { ref, computed, watch } from 'vue'
import { api, ALCO_CATS as CATS, SUSPECT_UNITS, fmt, num, prettyDay, today, addDays, mondayOf, monthBounds } from '../api'
import Avatar from './Avatar.vue'
import { confetti, toast, vibrate } from '../juice'
import Icon from './Icon.vue'
import { titleFor } from '../ranks'

const props = defineProps({ day: String, me: Object, colors: Object, refreshKey: Number })
const emit = defineEmits(['open']) // clic sur quelqu'un : ouvrir sa fiche

const period = ref('day')
const periods = [
  { k: 'day', l: 'Jour' },
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

// Personne n'a bu d'alcool sur la période : on classe à la caféine (mg), comme le serveur
const byCaf = computed(() => rows.value.every((r) => r.total === 0) && rows.value.some((r) => r.caffeine > 0))
const score = (r) => (byCaf.value ? r.caffeine : r.total)
// Pas d'alcool mais de la caféine : classé sous ceux qui ont bu, à la caféine (en mg)
const cafRow = (r) => !r.total && r.caffeine > 0
const ranked = (r) => r.total > 0 || r.caffeine > 0
const scoreText = (r) => (cafRow(r) ? String(r.caffeine) : num(r.total))
const max = computed(() => Math.max(1, ...rows.value.map((r) => r.total)))
const maxCaf = computed(() => Math.max(1, ...rows.value.filter(cafRow).map((r) => r.caffeine)))
// Rang « sportif » : les ex æquo partagent le même rang (1, 1, 3…), au dixième près comme à l'affichage
const tenths = (n) => Math.round(n * 10)
const rankKey = (r) => (r.total > 0 ? `a${tenths(r.total)}` : `c${r.caffeine}`)
const ranks = computed(() => {
  const m = new Map()
  rows.value.forEach((r, i) => m.set(r.id, i && rankKey(r) === rankKey(rows.value[i - 1]) ? m.get(rows.value[i - 1].id) : i + 1))
  return m
})
const drinkers = computed(() => rows.value.filter((r) => score(r) > 0))
// Séparation avant le premier « que de la caféine », quand d'autres ont bu de l'alcool
const firstCafId = computed(() => (byCaf.value ? null : rows.value.find(cafRow)?.id ?? null))
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
// Lignes affichées, avec la séparation « Que de la caféine » glissée avant la première concernée
const listed = computed(() => shown.value.flatMap((r) => (r.id === firstCafId.value ? [{ sep: true }, r] : [r])))
const hiddenCount = computed(() => rows.value.length - shown.value.length)

let loadSeq = 0
let lastKey = ''
// Je passe devant pendant la soirée en cours : confettis (pas au premier chargement ni en changeant de période)
function celebrate(before, after) {
  const key = `${period.value}|${range.value.join()}`
  const same = key === lastKey
  lastKey = key
  if (!same || !before.length || props.day !== today()) return
  const val = (r) => (r ? (r.total || (rows.every((x) => !x.total) ? r.caffeine / 1000 : 0)) : 0)
  const lead = (rows) => (val(rows[0]) > 0 && val(rows[0]) > val(rows[1]) ? rows[0].id : null)
  if (lead(after) === props.me.id && lead(before) !== props.me.id) {
    confetti()
    vibrate([40, 60, 40])
    toast(period.value === 'day' ? "Premier aujourd'hui" : 'Premier', { kind: 'big', ms: 3000 })
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
    <p v-else-if="byCaf" class="flex items-center gap-2 rounded-xl bg-caf/10 px-4 py-2.5 text-sm text-caf">
      <Icon name="fa-mug-hot" /> Personne n'a bu d'alcool : c'est la caféine qui départage.
    </p>

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
        <span class="font-display text-xl tabular-nums" :class="ranks.get(r.id) === 1 && (byCaf ? 'neon-caf' : 'neon')">{{ scoreText(r) }}<small v-if="cafRow(r)" class="text-xs"> mg</small></span>
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
        <template v-for="r in listed" :key="r.sep ? 'sep' : r.id">
        <li v-if="r.sep" class="flex items-center gap-2 bg-caf/5 px-4 py-1.5 text-xs font-semibold text-caf">
          <Icon name="fa-mug-hot" /> Que de la caféine
        </li>
        <li
          v-else
          class="flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/5"
          :class="r.id === me.id && 'bg-hi/10'"
          role="button"
          tabindex="0"
          :aria-label="`Voir la fiche de ${r.name}`"
          @click="emit('open', r.id)"
          @keydown.enter="emit('open', r.id)"
        >
          <span class="w-7 text-center font-display text-lg tabular-nums" :class="!ranked(r) ? 'text-muted/40' : cafRow(r) && !byCaf && 'text-caf/70'">
            {{ ranked(r) ? ranks.get(r.id) : '–' }}
          </span>
          <Avatar :user="r" :color="colors[r.id]" :size="40" class="rounded-full" />
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-2">
              <span class="truncate text-lg font-bold">{{ r.name }}</span>
              <span v-if="titleFor(r.id)" class="min-w-0 truncate text-xs text-hi/70">{{ titleFor(r.id) }}</span>
              <span v-if="r.id === me.id" class="text-sm font-semibold text-hi">toi</span>
              <span
                v-if="r.suspect_days"
                class="shrink-0 rounded-full bg-neon px-2 text-xs font-bold text-paper"
                :data-tip="`${r.suspect_days} jour(s) à plus de ${SUSPECT_UNITS} verres`"
              >
                suspect{{ period !== 'day' && r.suspect_days > 1 ? ` ×${r.suspect_days}` : '' }}
              </span>
            </span>
            <span class="block text-sm text-muted">
              <template v-if="cafRow(r)">{{ r.caf_count }} boisson{{ r.caf_count > 1 ? 's' : '' }} caféinée{{ r.caf_count > 1 ? 's' : '' }}</template>
              <template v-else>{{ r.count }} conso{{ r.count > 1 ? 's' : '' }}</template><template v-if="r.wins"> · <Icon name="crown" class="text-hi" /> {{ r.wins }}</template><template v-if="r.eau"> · <Icon name="water" class="text-fort" /> {{ r.eau }}</template><template v-if="r.clope"> · <Icon name="smoke" /> {{ r.clope }}</template>
            </span>
            <span v-if="cafRow(r)" class="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-white/5">
              <span class="h-full bg-caf transition-all duration-300" :style="{ width: `${(r.caffeine / maxCaf) * 100}%` }" :data-tip="`${r.caffeine} mg de caféine`" />
            </span>
            <span v-else-if="r.total" class="mt-1.5 flex h-1.5 gap-px overflow-hidden rounded-full bg-white/5">
              <span
                v-for="c in CATS"
                :key="c.key"
                :class="c.color"
                class="h-full transition-all duration-300"
                :style="{ width: `${(r[c.key] / max) * 100}%` }"
                :data-tip="`${c.label} : ${fmt(r[c.key])}`"
              />
            </span>
          </span>
          <span class="text-right">
            <span class="block font-display text-xl leading-none tabular-nums">{{ scoreText(r) }}</span>
            <span class="text-xs text-muted">{{ cafRow(r) ? 'mg' : `verre${r.total >= 2 ? 's' : ''}` }}</span>
          </span>
        </li>
        </template>
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
