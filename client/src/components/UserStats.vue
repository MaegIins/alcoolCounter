<script setup>
// Onglet « Stats » d'un profil. Tout vient de GET /users/:id/insights (+ la fiche déjà chargée pour record/moyenne).
// Barres et calendrier en HTML/CSS (pas de lib) ; bascule Verres standard / Consos (les sans-alcool n'ont que des consos).
import { ref, computed, watch, nextTick } from 'vue'
import { api, catOf, num, dayLabel } from '../api'
import { ui, openUser } from '../nav'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'

const props = defineProps({
  userId: { type: Number, required: true },
  profile: { type: Object, required: true }, // la fiche déjà chargée (record, moyenne, journées gagnées)
  me: { type: Object, required: true },
  colors: { type: Object, default: () => ({}) },
})
const isMe = computed(() => props.userId === props.me.id)

const d = ref(null)
const error = ref('')
const calEl = ref(null)
watch(() => [props.userId, ui.refresh], async () => {
  try {
    d.value = await api(`/users/${props.userId}/insights`)
    error.value = ''
    // Calendrier : on démarre sur les semaines récentes (à droite)
    await nextTick()
    if (calEl.value) calEl.value.scrollLeft = calEl.value.scrollWidth
  } catch (e) {
    error.value = e.message
  }
}, { immediate: true })

const unit = ref('units') // 'units' | 'count'
const val = (o) => o[unit.value]
const fmtVal = (o) => (unit.value === 'units' ? num(val(o)) : val(o))
const maxOf = (list) => Math.max(1e-9, ...list.map(val))
const pct = (o, list) => `${Math.max(val(o) ? 3 : 0, (val(o) / maxOf(list)) * 100)}%`
const plural = (n, w, ws = `${w}s`) => `${num(n)} ${Math.abs(n) >= 2 ? ws : w}`

const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' })
const monthLabel = (m) => MONTH.format(new Date(`${m}-01T00:00:00Z`)).replace('.', '')
const WEEK = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const WEEK_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const hhmm = (m) => (m == null ? '–' : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`)

// Catégories : en verres, seulement l'alcool ; en consos, tout
const cats = computed(() => (d.value?.cats ?? []).filter((c) => val(c) > 0).sort((a, b) => val(b) - val(a)))
const peakOf = (list) => {
  const i = list.reduce((b, x, k) => (val(x) > val(list[b]) ? k : b), 0)
  return list.length && val(list[i]) ? i : null
}
const peakDay = computed(() => (d.value ? peakOf(d.value.weekdays) : null))
const peakHour = computed(() => (d.value ? peakOf(d.value.hours) : null))

// ---- Calendrier de l'année : colonnes = semaines (lundi en haut), 4 niveaux d'intensité ----
const DAY = 864e5
const iso = (t) => new Date(t).toISOString().slice(0, 10)
const calendar = computed(() => {
  if (!d.value) return { weeks: [], months: [] }
  const byDay = new Map(d.value.calendar.map((c) => [c.day, c]))
  const end = Date.parse(`${d.value.today}T12:00:00Z`)
  let t = end - 364 * DAY
  t -= ((new Date(t).getUTCDay() + 6) % 7) * DAY // recule au lundi
  const weeks = []
  const months = []
  for (; t <= end; t += 7 * DAY) {
    const week = Array.from({ length: 7 }, (_, i) => {
      const tt = t + i * DAY
      return tt > end ? null : { day: iso(tt), ...(byDay.get(iso(tt)) ?? { units: 0, count: 0 }) }
    })
    const first = new Date(t).getUTCDate() <= 7
    months.push(first ? monthLabel(iso(t).slice(0, 7)) : '')
    weeks.push(week)
  }
  return { weeks, months }
})
const level = (c) => {
  const v = val(c)
  if (!v) return 0
  const steps = unit.value === 'units' ? [2, 5, 8] : [2, 4, 7]
  return 1 + steps.filter((s) => v >= s).length
}
const LEVEL_CLASS = ['bg-white/[.04]', 'bg-hi/25', 'bg-hi/50', 'bg-hi/75', 'bg-hi']
const calDays = computed(() => d.value?.calendar.length ?? 0)

// ---- Ce mois-ci contre le mois dernier (même nombre de jours) ----
const trendRows = computed(() => {
  const t = d.value?.trend
  if (!t) return []
  return [
    { label: 'Verres standard', now: t.now.units, before: t.before.units, fmt: num },
    { label: 'Consos', now: t.now.count, before: t.before.count, fmt: (n) => n },
    { label: 'Jours bus', now: t.now.days, before: t.before.days, fmt: (n) => n },
  ].map((r) => ({ ...r, delta: r.before ? Math.round(((r.now - r.before) / r.before) * 100) : null }))
})

// ---- Équivalences ----
const fun = computed(() => {
  const v = d.value?.volume
  if (!v) return []
  const out = [
    { icon: 'fa-beer-mug-empty', big: `${num(v.litres)} L`, text: `bus en tout, soit ${plural(Math.round(v.litres * 2), 'pinte')}` },
  ]
  if (v.litres >= 15) out.push({ icon: 'fa-bath', big: `${num(Math.round((v.litres / 150) * 100))} %`, text: "d'une baignoire (150 L)" })
  if (v.pure) out.push({ icon: 'fa-flask', big: `${num(v.pure)} L`, text: `d'alcool pur, soit ${plural(Math.round((v.pure / 0.28) * 10) / 10, 'bouteille')} de vodka` })
  if (v.kcal) {
    out.push({ icon: 'fa-burger', big: `${plural(Math.round(v.kcal / 550), 'burger')}`, text: `≈ ${v.kcal.toLocaleString('fr-FR')} kcal rien que pour l'alcool` })
    out.push({ icon: 'fa-person-running', big: `${num(Math.round(v.kcal / 65))} km`, text: 'de course à pied pour les brûler' })
  }
  return out
})

// ---- Le critique ----
const critic = computed(() => {
  const c = d.value?.critic
  if (!c?.count) return null
  let verdict = null
  if (c.compared >= 3) {
    if (c.diff <= -1) verdict = { icon: 'fa-face-frown', text: 'Critique sévère', sub: `${num(Math.abs(c.diff) / 2)} étoile${Math.abs(c.diff) >= 4 ? 's' : ''} sous les autres en moyenne` }
    else if (c.diff >= 1) verdict = { icon: 'fa-face-grin-hearts', text: 'Note généreuse', sub: `${num(c.diff / 2)} étoile${c.diff >= 4 ? 's' : ''} au-dessus des autres en moyenne` }
    else verdict = { icon: 'fa-scale-balanced', text: 'Dans la moyenne', sub: 'note comme tout le monde' }
  }
  return { ...c, verdict, max: Math.max(1, ...c.hist) }
})

// ---- Explorateur ou fidèle ----
const explorer = computed(() => {
  const e = d.value?.explore
  if (!e) return null
  // Fidèle : une boisson fait au moins 40 % de l'alcool bu ; explorateur : beaucoup de boissons, aucune ne domine
  const kind = e.favShare >= 40 ? { icon: 'fa-heart', text: 'Fidèle' } : e.distinct >= 10 && e.favShare < 25 ? { icon: 'fa-compass', text: 'Explorateur' } : { icon: 'fa-magnifying-glass', text: 'Curieux' }
  return { ...e, kind, max: Math.max(1, ...e.newByMonth.map((m) => m.count)) }
})

// ---- Lieux ----
const placeSplit = computed(() => {
  const p = d.value?.places
  if (!p) return []
  const total = p.home + p.out + p.none || 1
  return [
    { k: 'home', label: isMe.value ? 'Chez moi' : 'Chez soi', n: p.home, cls: 'bg-hi', icon: 'fa-house' },
    { k: 'out', label: 'Dehors', n: p.out, cls: 'bg-neon', icon: 'fa-location-dot' },
    { k: 'none', label: 'Sans lieu', n: p.none, cls: 'bg-white/15', icon: 'fa-question' },
  ].map((x) => ({ ...x, pct: Math.round((x.n / total) * 100) }))
})
</script>

<template>
  <div class="space-y-9 pt-6">
    <p v-if="error" class="rounded-md bg-alert/15 px-4 py-3 text-sm text-alert">{{ error }}</p>
    <div v-else-if="!d" class="py-16 text-center text-muted">Chargement…</div>
    <p v-else-if="!d.total" class="py-16 text-center text-muted">Rien de noté pour l'instant.</p>

    <template v-else>
      <div class="flex rounded-full bg-white/5 p-1 text-sm">
        <button class="seg flex-1" :aria-pressed="unit === 'units'" @click="unit = 'units'">Verres standard</button>
        <button class="seg flex-1" :aria-pressed="unit === 'count'" @click="unit = 'count'">Consos</button>
      </div>
      <p class="-mt-6 text-center text-xs text-faint">
        <template v-if="unit === 'units'">Verre standard = 10 g d'alcool (une pinte à 5 % = 2). C'est ce qui compte pour la compet.</template>
        <template v-else>Conso = une boisson notée, quelle qu'elle soit (une pinte, un shot ou un café = 1).</template>
      </p>

      <!-- Records -->
      <section class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div class="rounded-xl bg-white/5 px-3 py-3 text-center">
          <div class="font-display text-2xl text-hi">{{ profile.record ? num(profile.record.units) : '–' }}</div>
          <div class="text-xs font-semibold text-muted">meilleure journée</div>
          <div class="text-[11px] text-faint">verres standard<template v-if="profile.record"> · {{ dayLabel(profile.record.day, true) }}</template></div>
        </div>
        <div class="rounded-xl bg-white/5 px-3 py-3 text-center">
          <div class="font-display text-2xl text-hi">{{ d.streak }}</div>
          <div class="text-xs font-semibold text-muted">jours de suite</div>
          <div class="text-[11px] text-faint">{{ d.curStreak > 1 ? `série en cours : ${d.curStreak}` : 'record de série' }}</div>
        </div>
        <div class="rounded-xl bg-white/5 px-3 py-3 text-center">
          <div class="font-display text-2xl text-hi">{{ d.pause.days }}</div>
          <div class="text-xs font-semibold text-muted">jours de pause</div>
          <div class="text-[11px] text-faint">{{ d.pause.current ? 'en cours' : d.pause.from ? `dès ${dayLabel(d.pause.from, true)}` : 'record sans alcool' }}</div>
        </div>
        <div class="rounded-xl bg-white/5 px-3 py-3 text-center">
          <div class="font-display text-2xl text-hi">{{ num(profile.avg) }}</div>
          <div class="text-xs font-semibold text-muted">verres standard</div>
          <div class="text-[11px] text-faint">par jour bu, en moyenne</div>
        </div>
        <div class="rounded-xl bg-white/5 px-3 py-3 text-center">
          <div class="font-display text-2xl text-hi">{{ num(d.rhythm.perDay) }}</div>
          <div class="text-xs font-semibold text-muted">consos d'alcool</div>
          <div class="text-[11px] text-faint">par jour bu, en moyenne</div>
        </div>
        <div class="rounded-xl bg-white/5 px-3 py-3 text-center">
          <div class="font-display text-2xl text-hi">{{ profile.wins }}</div>
          <div class="text-xs font-semibold text-muted">journées gagnées</div>
          <div class="text-[11px] text-faint">dans la bande</div>
        </div>
      </section>

      <!-- Ce mois-ci contre le mois dernier -->
      <section>
        <h2 class="kicker mb-3 flex items-baseline justify-between border-b border-line pb-2">
          Ce mois-ci
          <span class="font-medium normal-case tracking-normal text-muted">face aux {{ d.trend.dom }} premiers jours du mois dernier</span>
        </h2>
        <div class="grid grid-cols-3 gap-2 text-center">
          <div v-for="r in trendRows" :key="r.label" class="rounded-xl bg-white/5 px-2 py-3">
            <div class="font-display text-2xl text-ink">{{ r.fmt(r.now) }}</div>
            <div class="text-xs font-semibold text-muted">{{ r.label }}</div>
            <div class="mt-1 text-xs font-bold tabular-nums" :class="r.delta == null ? 'text-faint' : r.delta > 0 ? 'text-neon' : r.delta < 0 ? 'text-hi' : 'text-muted'">
              <template v-if="r.delta == null">{{ r.now ? 'nouveau' : '=' }}</template>
              <template v-else><Icon :name="r.delta > 0 ? 'fa-caret-up' : r.delta < 0 ? 'fa-caret-down' : 'fa-equals'" /> {{ Math.abs(r.delta) }} %</template>
              <span class="font-normal text-faint"> ({{ r.fmt(r.before) }})</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Calendrier de l'année -->
      <section>
        <h2 class="kicker mb-3 flex items-baseline justify-between border-b border-line pb-2">
          L'année
          <span class="font-medium normal-case tracking-normal text-muted">{{ calDays }} jour{{ calDays > 1 ? 's' : '' }} sur 365</span>
        </h2>
        <div ref="calEl" class="-mx-4 overflow-x-auto px-4 pb-1">
          <div class="inline-flex flex-col gap-1">
            <div class="flex gap-[3px] pl-7 text-[10px] text-faint">
              <span v-for="(m, i) in calendar.months" :key="i" class="w-[11px] shrink-0 overflow-visible whitespace-nowrap">{{ m }}</span>
            </div>
            <div class="flex gap-[3px]">
              <div class="flex w-6 shrink-0 flex-col gap-[3px] text-[9px] leading-[11px] text-faint">
                <span v-for="(l, i) in WEEK" :key="l">{{ i % 2 === 0 ? l : '' }}</span>
              </div>
              <div v-for="(w, i) in calendar.weeks" :key="i" class="flex flex-col gap-[3px]">
                <span
                  v-for="(c, j) in w"
                  :key="j"
                  class="h-[11px] w-[11px] rounded-[2px]"
                  :class="c ? LEVEL_CLASS[level(c)] : ''"
                  :title="c ? `${dayLabel(c.day, true)} : ${val(c) ? fmtVal(c) : 'rien'}` : ''"
                />
              </div>
            </div>
          </div>
        </div>
        <div class="mt-2 flex items-center justify-end gap-1 text-[10px] text-faint">
          Moins <span v-for="(c, i) in LEVEL_CLASS" :key="i" class="h-[11px] w-[11px] rounded-[2px]" :class="c" /> Plus
        </div>
      </section>

      <!-- Par mois -->
      <section>
        <h2 class="kicker mb-3 border-b border-line pb-2">Les 12 derniers mois</h2>
        <div class="flex h-40 items-end gap-1">
          <div v-for="m in d.months" :key="m.month" class="group flex h-full flex-1 flex-col items-center justify-end" :title="`${monthLabel(m.month)} : ${fmtVal(m)}`">
            <span class="mb-1 text-[10px] text-muted tabular-nums opacity-0 transition-opacity group-hover:opacity-100">{{ val(m) ? fmtVal(m) : '' }}</span>
            <div class="w-full rounded-t bg-hi/80 transition-[height] group-hover:bg-hi" :style="{ height: pct(m, d.months) }" />
          </div>
        </div>
        <div class="mt-1 flex gap-1">
          <span v-for="m in d.months" :key="m.month" class="flex-1 text-center text-[10px] text-faint">{{ monthLabel(m.month) }}</span>
        </div>
      </section>

      <!-- Face à la bande -->
      <section v-if="d.band">
        <h2 class="kicker mb-3 flex items-baseline justify-between border-b border-line pb-2">
          Face à la bande
          <span class="max-w-[50%] truncate font-medium normal-case tracking-normal text-muted">{{ d.band.name }}</span>
        </h2>
        <div class="flex items-center gap-4 rounded-xl bg-white/5 p-4">
          <div class="text-center">
            <div class="font-display text-4xl text-hi">{{ d.band.rank ?? '–' }}<span v-if="d.band.rank" class="text-lg">{{ d.band.rank === 1 ? 'er' : 'e' }}</span></div>
            <div class="text-xs text-muted">sur {{ d.band.ranked }}</div>
          </div>
          <div class="min-w-0 flex-1 space-y-2 text-sm">
            <div class="flex items-center gap-2">
              <span class="w-20 shrink-0 text-muted">{{ isMe ? 'Toi' : profile.user.name }}</span>
              <span class="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5"><span class="block h-full rounded-full bg-hi" :style="{ width: `${(d.band.avg / Math.max(d.band.avg, d.band.bandAvg, 1e-9)) * 100}%` }" /></span>
              <span class="w-10 text-right tabular-nums">{{ num(d.band.avg) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-20 shrink-0 text-muted">La bande</span>
              <span class="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5"><span class="block h-full rounded-full bg-white/40" :style="{ width: `${(d.band.bandAvg / Math.max(d.band.avg, d.band.bandAvg, 1e-9)) * 100}%` }" /></span>
              <span class="w-10 text-right tabular-nums">{{ num(d.band.bandAvg) }}</span>
            </div>
            <p class="text-xs text-faint">Verres standard par jour bu, en moyenne. Rang : au total depuis le début.</p>
          </div>
        </div>
        <div v-if="d.band.cats.length" class="mt-3 flex flex-wrap gap-2">
          <span v-for="c in d.band.cats" :key="c.cat" class="rounded-full bg-white/5 px-3 py-1 text-sm" :class="c.rank === 1 && '!bg-hi/15 text-hi'">
            <Icon :name="c.rank === 1 ? 'crown' : catOf(c.cat).fa" :style="c.rank !== 1 ? { color: catOf(c.cat).hex } : {}" />
            {{ c.rank }}{{ c.rank === 1 ? 'er' : 'e' }} {{ catOf(c.cat).label.toLowerCase() }}
            <span class="text-faint">/ {{ c.of }}</span>
          </span>
        </div>
      </section>

      <!-- Par catégorie -->
      <section v-if="cats.length">
        <h2 class="kicker mb-3 border-b border-line pb-2">Par catégorie</h2>
        <ul class="space-y-2">
          <li v-for="c in cats" :key="c.cat" class="flex items-center gap-3">
            <span class="w-28 shrink-0 truncate text-sm"><Icon :name="catOf(c.cat).fa" :style="{ color: catOf(c.cat).hex }" /> {{ catOf(c.cat).label }}</span>
            <span class="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
              <span class="block h-full rounded-full" :style="{ width: pct(c, cats), background: catOf(c.cat).hex }" />
            </span>
            <span class="w-12 shrink-0 text-right text-sm tabular-nums">{{ fmtVal(c) }}</span>
          </li>
        </ul>
        <p v-if="unit === 'units' && d.cats.some((c) => !c.units)" class="mt-2 text-xs text-faint">Les sans-alcool n'apparaissent qu'en consos.</p>
      </section>

      <!-- Jour de la semaine -->
      <section>
        <h2 class="kicker mb-3 flex items-baseline justify-between border-b border-line pb-2">
          Jour de la semaine
          <span v-if="peakDay != null" class="font-medium normal-case tracking-normal text-muted">surtout le {{ WEEK_LONG[peakDay] }}</span>
        </h2>
        <div class="flex h-28 items-end gap-2">
          <div v-for="(w, i) in d.weekdays" :key="i" class="group flex h-full flex-1 flex-col items-center justify-end" :title="`${WEEK_LONG[i]} : ${fmtVal(w)}`">
            <span class="mb-1 text-[10px] text-muted tabular-nums">{{ val(w) ? fmtVal(w) : '' }}</span>
            <div class="w-full rounded-t bg-hi/80 group-hover:bg-hi" :style="{ height: pct(w, d.weekdays) }" />
          </div>
        </div>
        <div class="mt-1 flex gap-2">
          <span v-for="(l, i) in WEEK" :key="i" class="flex-1 text-center text-[11px] text-faint">{{ l }}</span>
        </div>
      </section>

      <!-- Heure + rythme -->
      <section>
        <h2 class="kicker mb-3 flex items-baseline justify-between border-b border-line pb-2">
          Heure
          <span v-if="peakHour != null" class="font-medium normal-case tracking-normal text-muted">pic vers {{ peakHour }}h</span>
        </h2>
        <div class="flex h-24 items-end gap-[2px]">
          <div v-for="(h, i) in d.hours" :key="i" class="group flex h-full flex-1 items-end" :title="`${i}h : ${fmtVal(h)}`">
            <div class="w-full rounded-t-sm bg-hi/70 group-hover:bg-hi" :style="{ height: pct(h, d.hours) }" />
          </div>
        </div>
        <div class="mt-1 flex justify-between text-[10px] text-faint">
          <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
        </div>
        <div v-if="d.rhythm.first != null" class="mt-4 grid grid-cols-2 gap-2 text-center">
          <div class="rounded-xl bg-white/5 py-3">
            <div class="font-display text-2xl text-hi">{{ hhmm(d.rhythm.first) }}</div>
            <div class="text-xs font-semibold text-muted"><Icon name="fa-hourglass-start" /> premier verre, en moyenne</div>
          </div>
          <div class="rounded-xl bg-white/5 py-3">
            <div class="font-display text-2xl text-hi">{{ hhmm(d.rhythm.last) }}</div>
            <div class="text-xs font-semibold text-muted"><Icon name="fa-hourglass-end" /> dernier verre, en moyenne</div>
          </div>
        </div>
      </section>

      <!-- Compagnons de verre -->
      <section v-if="d.buddies.length">
        <h2 class="kicker mb-1 border-b border-line pb-2">Compagnons de verre</h2>
        <ul class="divide-y divide-line">
          <li v-for="(b, i) in d.buddies" :key="b.id">
            <button class="flex w-full items-center gap-3 py-2.5 text-left hover:text-hi" @click="openUser(b.id)">
              <Avatar :user="b" :color="colors[b.id]" :size="40" class="rounded-full" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-semibold">{{ b.id === me.id ? 'Toi' : b.name }} <Icon v-if="i === 0" name="fa-handshake" class="text-hi" /></span>
                <span class="text-sm text-muted">{{ b.days }} journée{{ b.days > 1 ? 's' : '' }} au même endroit</span>
              </span>
            </button>
          </li>
        </ul>
        <p class="mt-1 text-xs text-faint">Le même jour, au même lieu (seulement les lieux que tu peux voir).</p>
      </section>

      <!-- Le critique -->
      <section v-if="critic">
        <h2 class="kicker mb-3 flex items-baseline justify-between border-b border-line pb-2">
          Le critique
          <span class="font-medium normal-case tracking-normal text-muted">{{ critic.count }} note{{ critic.count > 1 ? 's' : '' }}</span>
        </h2>
        <div class="flex items-center gap-4">
          <div class="shrink-0 text-center">
            <div class="font-display text-4xl text-hi">{{ num(critic.avg / 2) }}</div>
            <div class="text-xs text-muted"><Icon name="star" /> en moyenne</div>
          </div>
          <div class="flex h-16 flex-1 items-end gap-[3px]">
            <div v-for="(n, i) in critic.hist" :key="i" class="flex-1 rounded-t-sm" :class="n ? 'bg-hi/80' : 'bg-white/5'" :style="{ height: `${Math.max(6, (n / critic.max) * 100)}%` }" :title="`${num((i + 1) / 2)} étoile${i ? 's' : ''} : ${n}`" />
          </div>
        </div>
        <div class="mt-1 flex justify-between pl-[4.5rem] text-[10px] text-faint"><span>½</span><span>5 <Icon name="star" /></span></div>
        <p v-if="critic.verdict" class="mt-3 rounded-xl bg-white/5 px-4 py-3 text-sm">
          <Icon :name="critic.verdict.icon" class="text-hi" /> <b>{{ critic.verdict.text }}</b>
          <span class="text-muted"> · {{ critic.verdict.sub }} (sur {{ critic.compared }} notes comparées)</span>
        </p>
      </section>

      <!-- Explorateur ou fidèle -->
      <section v-if="explorer">
        <h2 class="kicker mb-3 flex items-baseline justify-between border-b border-line pb-2">
          Découvertes
          <span class="font-medium normal-case tracking-normal text-hi"><Icon :name="explorer.kind.icon" /> {{ explorer.kind.text }}</span>
        </h2>
        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="rounded-xl bg-white/5 py-3"><div class="font-display text-2xl text-hi">{{ explorer.distinct }}</div><div class="text-xs font-semibold text-muted">boissons différentes</div></div>
          <div class="rounded-xl bg-white/5 px-1 py-3"><div class="font-display text-2xl text-hi">{{ explorer.favShare }} %</div><div class="truncate text-xs font-semibold text-muted" :title="explorer.fav">{{ explorer.fav ?? 'la préférée' }}</div></div>
          <div class="rounded-xl bg-white/5 py-3"><div class="font-display text-2xl text-hi">{{ explorer.triedOnly }}</div><div class="text-xs font-semibold text-muted">« déjà bues »</div></div>
        </div>
        <p class="mt-3 mb-1 text-xs font-semibold text-muted">Premières fois par mois</p>
        <div class="flex h-12 items-end gap-1">
          <div v-for="m in explorer.newByMonth" :key="m.month" class="flex-1 rounded-t-sm" :class="m.count ? 'bg-soft' : 'bg-white/5'" :style="{ height: `${Math.max(6, (m.count / explorer.max) * 100)}%` }" :title="`${monthLabel(m.month)} : ${m.count}`" />
        </div>
        <div class="mt-1 flex gap-1">
          <span v-for="m in explorer.newByMonth" :key="m.month" class="flex-1 text-center text-[10px] text-faint">{{ monthLabel(m.month) }}</span>
        </div>
      </section>

      <!-- Lieux -->
      <section>
        <h2 class="kicker mb-3 flex items-baseline justify-between border-b border-line pb-2">
          Lieux
          <span class="font-medium normal-case tracking-normal text-muted">{{ d.places.distinct }} lieu{{ d.places.distinct > 1 ? 'x' : '' }} différent{{ d.places.distinct > 1 ? 's' : '' }}</span>
        </h2>
        <div class="flex h-3 overflow-hidden rounded-full bg-white/5">
          <span v-for="p in placeSplit" :key="p.k" :class="p.cls" :style="{ width: `${p.pct}%` }" />
        </div>
        <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span v-for="p in placeSplit" :key="p.k" class="text-muted">
            <span class="mr-1 inline-block h-2.5 w-2.5 rounded-full" :class="p.cls" /> {{ p.label }} <b class="text-ink">{{ p.pct }} %</b>
          </span>
        </div>
      </section>

      <!-- En équivalences -->
      <section v-if="fun.length">
        <h2 class="kicker mb-3 border-b border-line pb-2">En équivalences</h2>
        <ul class="grid gap-2 sm:grid-cols-2">
          <li v-for="f in fun" :key="f.icon" class="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3">
            <Icon :name="f.icon" class="w-7 shrink-0 text-center text-2xl text-hi" />
            <span class="min-w-0">
              <span class="block font-display text-xl leading-tight">{{ f.big }}</span>
              <span class="text-sm text-muted">{{ f.text }}</span>
            </span>
          </li>
        </ul>
        <p class="mt-1 text-xs text-faint">Ordres de grandeur pour rire : 70 kcal par verre standard, un burger ≈ 550 kcal, ≈ 65 kcal par km.</p>
      </section>

      <!-- Eau et clopes -->
      <section v-if="d.extras.eau || d.extras.clope">
        <h2 class="kicker mb-3 border-b border-line pb-2">Eau et clopes</h2>
        <div class="grid grid-cols-2 gap-2 text-center">
          <div class="rounded-xl bg-white/5 py-3">
            <div class="font-display text-2xl text-hi"><Icon name="fa-droplet" class="text-lg" /> {{ num(d.extras.eauPerDrink) }}</div>
            <div class="text-xs font-semibold text-muted">verre d'eau par verre d'alcool</div>
            <div class="text-[11px] text-faint">{{ d.extras.eau }} en tout</div>
          </div>
          <div class="rounded-xl bg-white/5 py-3">
            <div class="font-display text-2xl text-hi"><Icon name="fa-smoking" class="text-lg" /> {{ num(d.extras.clopePerDay) }}</div>
            <div class="text-xs font-semibold text-muted">clopes par jour fumé</div>
            <div class="text-[11px] text-faint">{{ d.extras.clope }} en tout</div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
