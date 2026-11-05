<script setup>
// Fiche d'un joueur, en panneau qui monte du bas : stats depuis le début, sa soirée, ses boissons préférées.
// « Moi aussi » ajoute la même boisson à ma soirée.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { api, CATS, SUSPECT_UNITS, catOf, num, fmt, fmtDrink, prettyDay, dayLabel, today } from '../api'
import Avatar from './Avatar.vue'
import { burst, centerOf, vibrate, toast, celebrateBadges } from '../juice'

const props = defineProps({ userId: Number, day: String, me: Object, color: String })
const emit = defineEmits(['close', 'saved'])

const data = ref(null)
const error = ref('')
let seq = 0
async function load() {
  const s = ++seq
  error.value = ''
  try {
    const d = await api(`/users/${props.userId}/stats?day=${props.day}&winsBefore=${today()}`)
    if (s === seq) data.value = d
  } catch (e) {
    if (s === seq) error.value = e.message
  }
}
watch(() => [props.userId, props.day], load, { immediate: true })

const isMe = computed(() => props.userId === props.me.id)
const tonight = computed(() => (data.value?.drinks ?? []).reduce((s, d) => s + d.units, 0))
const catTotal = computed(() => Math.max(0.1, ...[CATS.reduce((s, c) => s + (data.value?.byCat[c.key] ?? 0), 0)]))
const recentMax = computed(() => Math.max(1, ...(data.value?.recent ?? []).map((n) => n.units)))
// Dernières soirées, de la plus ancienne à la plus récente (lecture gauche → droite)
const recent = computed(() => [...(data.value?.recent ?? [])].reverse())
const since = computed(() => {
  const c = data.value?.user.created_at
  return c ? new Date(`${c.replace(' ', 'T')}Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : ''
})
const time = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

async function same(d, e) {
  const [x, y] = centerOf(e)
  try {
    const row = await api('/drinks', { method: 'POST', body: { day: today(), name: d.name, cat: d.cat, cl: d.cl, abv: d.abv } })
    burst(x, y, { text: `+${num(row.units)}`, color: catOf(d.cat).hex })
    vibrate(30)
    toast(`${catOf(d.cat).icon} ${d.name} +${num(row.units)}`, {
      action: { label: 'Annuler', run: () => api(`/drinks/${row.id}`, { method: 'DELETE' }).then(() => emit('saved')).catch(() => {}) },
    })
    celebrateBadges(row.badges)
    emit('saved')
    if (isMe.value) load()
  } catch (err) {
    toast(err.message)
  }
}

const onKey = (e) => e.key === 'Escape' && emit('close')
onMounted(() => {
  document.addEventListener('keydown', onKey)
  document.body.style.overflow = 'hidden'
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" @click.self="emit('close')">
    <div
      class="sheet-panel box relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-b-none sm:rounded-b-2xl"
      role="dialog"
      aria-modal="true"
      :aria-label="data ? `Fiche de ${data.user.name}` : 'Fiche joueur'"
    >
      <div class="sticky top-0 z-10 flex justify-center bg-panel pt-2 sm:hidden">
        <span class="h-1 w-10 rounded-full bg-line" />
      </div>
      <button class="absolute top-3 right-3 z-20 h-9 w-9 rounded-full text-muted hover:bg-sunk hover:text-ink" aria-label="Fermer" @click="emit('close')">✕</button>

      <p v-if="error" class="m-5 rounded-xl bg-alert px-4 py-2.5 text-sm font-semibold text-white">{{ error }}</p>
      <div v-else-if="!data" class="px-4 py-16 text-center text-muted">Chargement…</div>

      <template v-else>
        <!-- En-tête -->
        <div class="flex items-center gap-4 px-6 pt-5 pb-6">
          <Avatar :user="data.user" :color="color" :size="72" class="rounded-full ring-2 ring-hi/60" />
          <div class="min-w-0">
            <div class="truncate font-display text-2xl">
              {{ data.user.name }}<span v-if="isMe" class="ml-2 font-sans text-base font-semibold text-hi">toi</span>
            </div>
            <div class="text-sm text-muted">Inscrit en {{ since }}</div>
            <div v-if="data.wins" class="mt-1.5 inline-block rounded-full bg-hi/15 px-2.5 py-0.5 text-sm font-bold text-hi">
              ♛ {{ data.wins }} soirée{{ data.wins > 1 ? 's' : '' }} gagnée{{ data.wins > 1 ? 's' : '' }}
            </div>
          </div>
        </div>

        <!-- Chiffres -->
        <div class="mx-5 grid grid-cols-4 gap-2 text-center">
          <div v-for="s in [
            { l: 'Soirées', v: data.nights },
            { l: 'Verres', v: num(data.units) },
            { l: 'Moyenne', v: num(data.avg) },
            { l: 'Consos', v: data.count },
          ]" :key="s.l" class="rounded-2xl bg-white/5 px-1 py-3">
            <div class="font-display text-2xl text-hi">{{ s.v }}</div>
            <div class="text-xs font-semibold text-muted">{{ s.l }}</div>
          </div>
        </div>
        <div v-if="data.record" class="mx-5 mt-2 flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-sm">
          <span class="font-semibold text-muted">🏆 Record</span>
          <span><b class="neon">{{ fmt(data.record.units) }}</b> <span class="text-muted">· {{ dayLabel(data.record.day, true) }}</span></span>
        </div>
        <div v-if="data.eau || data.clope" class="mx-5 mt-2 flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-sm">
          <span class="font-semibold text-muted">Hors score</span>
          <span>💧 <b>{{ data.eau }}</b> verre{{ data.eau > 1 ? 's' : '' }} d'eau · 🚬 <b>{{ data.clope }}</b> clope{{ data.clope > 1 ? 's' : '' }}</span>
        </div>

        <!-- Sa soirée -->
        <section class="px-6 pt-7">
          <div class="mb-3 flex items-baseline justify-between">
            <h3 class="text-lg font-bold first-letter:uppercase">{{ prettyDay(day) }}</h3>
            <span class="font-bold" :class="tonight > SUSPECT_UNITS ? 'neon-pink' : 'text-hi'">
              {{ fmt(tonight) }}<span v-if="data.tonight?.eau || data.tonight?.clope" class="ml-2 font-normal text-muted">💧{{ data.tonight.eau }} 🚬{{ data.tonight.clope }}</span>
            </span>
          </div>
          <p v-if="!data.drinks.length" class="text-muted">Rien ce soir-là.</p>
          <ul v-else class="divide-y divide-white/5">
            <li v-for="d in data.drinks" :key="d.id" class="flex items-center gap-3 py-2">
              <span class="w-12 text-sm text-muted tabular-nums">{{ time(d.at) }}</span>
              <span class="text-xl">{{ catOf(d.cat).icon }}</span>
              <span class="min-w-0 flex-1 truncate font-bold">{{ d.name }} <span class="text-sm font-normal text-muted">{{ fmtDrink(d) }}</span></span>
              <span class="font-semibold" :style="{ color: catOf(d.cat).hex }">+{{ num(d.units) }}</span>
            </li>
          </ul>
        </section>

        <!-- Dernières soirées -->
        <section v-if="recent.length" class="px-6 pt-7">
          <h3 class="mb-3 text-lg font-bold">Dernières soirées</h3>
          <div class="flex h-20 items-end gap-1">
            <div v-for="n in recent" :key="n.day" class="flex flex-1 flex-col items-center gap-1" :title="`${dayLabel(n.day, true)} : ${fmt(n.units)}`">
              <div
                class="w-full max-w-6 rounded-t"
                :class="n.day === day ? 'bg-hi shadow-[0_0_10px_rgb(212_188_53/0.4)]' : n.units > SUSPECT_UNITS ? 'bg-neon' : 'bg-hi/40'"
                :style="{ height: `${Math.max(4, (n.units / recentMax) * 64)}px` }"
              />
              <span class="text-xs text-muted">{{ n.day.slice(8) }}</span>
            </div>
          </div>
        </section>

        <!-- Préférences -->
        <section v-if="data.top.length" class="px-6 pt-7">
          <h3 class="mb-3 text-lg font-bold">Ce qu'il boit le plus</h3>
          <div class="mb-4 flex h-2 gap-px overflow-hidden rounded-full bg-white/5">
            <div
              v-for="c in CATS"
              :key="c.key"
              :class="c.color"
              :style="{ width: `${(data.byCat[c.key] / catTotal) * 100}%` }"
              :title="`${c.label} : ${fmt(data.byCat[c.key])}`"
            />
          </div>
          <ul class="space-y-3">
            <li v-for="(d, i) in data.top" :key="i" class="flex items-center gap-3">
              <span class="w-5 text-center font-bold text-muted">{{ i + 1 }}</span>
              <span class="text-2xl">{{ catOf(d.cat).icon }}</span>
              <span class="min-w-0 flex-1 leading-tight">
                <span class="block truncate font-bold">{{ d.name }}</span>
                <span class="text-sm text-muted">{{ fmtDrink(d) }} · {{ d.count }} fois</span>
              </span>
              <button class="btn btn-hi shrink-0 px-3 py-1.5 text-sm font-bold" @click="same(d, $event)">
                {{ isMe ? '+1' : 'Moi aussi' }}
              </button>
            </li>
          </ul>
        </section>

        <!-- Badges -->
        <section class="px-6 pt-7 pb-8">
          <h3 class="mb-3 text-lg font-bold">
            Badges <span class="font-normal text-muted">· {{ data.badges.filter((b) => b.got).length }}/{{ data.badges.length }}</span>
          </h3>
          <div class="grid grid-cols-3 gap-2">
            <div
              v-for="b in data.badges"
              :key="b.key"
              class="rounded-2xl p-2.5 text-center"
              :class="b.got ? 'bg-hi/15 ring-1 ring-hi/40' : 'bg-white/[.03] opacity-50'"
              :title="b.desc"
            >
              <div class="text-3xl" :class="!b.got && 'grayscale'">{{ b.got ? b.icon : '❔' }}</div>
              <div class="mt-1 text-sm leading-tight font-bold">{{ b.label }}</div>
              <div class="mt-0.5 text-xs leading-tight text-muted">{{ b.desc }}</div>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>
