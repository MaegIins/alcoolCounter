<script setup>
// La carte › Lieux : les lieux enregistrés que je peux voir (publics, les miens, ceux de mes bandes).
// Ceux que j'ai créés : je choisis s'ils sont publics ou privés, et quelles bandes voient un lieu privé.
// (Les coordonnées lat/lng existent déjà côté serveur : une carte géographique pourra se brancher ici.)
import { ref, computed, watch } from 'vue'
import { api, dayLabel, nightOf } from '../api'
import { ui, bump } from '../nav'
import { toast } from '../juice'
import Icon from './Icon.vue'

const props = defineProps({ me: Object })

const places = ref([])
const groups = ref([])
const loaded = ref(false)
const search = ref('')
const onlyMine = ref(false)
async function load() {
  const [p, g] = await Promise.all([api('/places').catch(() => []), api('/groups').catch(() => [])])
  places.value = p
  groups.value = g
  loaded.value = true
}
watch(() => ui.refresh, load, { immediate: true })

const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const shown = computed(() => {
  const q = norm(search.value.trim())
  return places.value.filter((p) => (!q || norm(p.name).includes(q)) && (!onlyMine.value || p.my_logs))
})

// --- Visibilité d'un de mes lieux ---------------------------------------------------------------
const editing = ref(null) // { id, private, groups: Set }
const startEdit = (p) => (editing.value = { id: p.id, private: p.private, groups: p.groups.map((g) => g.id) })
async function save() {
  const e = editing.value
  try {
    await api(`/places/${e.id}`, { method: 'PATCH', body: { private: e.private, groups: e.private ? e.groups : [] } })
    editing.value = null
    toast('Visibilité du lieu enregistrée')
    bump()
  } catch (err) {
    toast(err.message)
  }
}
const lastLabel = (ms) => (ms ? dayLabel(nightOf(new Date(ms)), true) : '')
</script>

<template>
  <div class="space-y-4">
    <div>
      <h2 class="font-display text-2xl">Les lieux</h2>
      <p class="mt-1 text-sm text-muted">
        Où on a bu. Un lieu privé (<Icon name="lock" />) n'est visible que par son créateur et les bandes qu'il a choisies.
        On ajoute un lieu en notant un verre (« Où ? »).
      </p>
    </div>

    <label class="relative block">
      <Icon name="search" class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
      <input v-model="search" type="search" placeholder="Chercher un lieu…" class="field w-full py-2.5 pr-4 pl-11 text-base" />
    </label>
    <button class="rounded-full px-3 py-1 text-sm font-semibold" :class="onlyMine ? 'bg-hi text-paper' : 'bg-white/5 text-muted hover:bg-white/10'" @click="onlyMine = !onlyMine">
      Où j'ai bu
    </button>

    <p v-if="loaded && !shown.length" class="py-10 text-center text-muted">Aucun lieu pour l'instant.</p>
    <ul v-else class="box divide-y divide-white/5">
      <li v-for="p in shown" :key="p.id" class="px-4 py-3">
        <div class="flex items-center gap-3">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-hi">
            <Icon :name="p.private ? 'lock' : 'fa-location-dot'" />
          </span>
          <span class="min-w-0 flex-1 leading-tight">
            <span class="block truncate font-bold">{{ p.name }}</span>
            <span class="text-sm text-muted">
              {{ p.logs }} conso{{ p.logs > 1 ? 's' : '' }} · {{ p.drinkers }} buveur{{ p.drinkers > 1 ? 's' : '' }}<template v-if="p.my_logs"> · {{ p.my_logs }} de toi</template>
            </span>
            <span class="block text-xs text-faint">
              <template v-if="p.private">Privé · {{ p.mine ? (p.groups.length ? p.groups.map((g) => g.name).join(', ') : 'toi seul') : 'partagé avec ta bande' }}</template>
              <template v-else>Public</template>
              <template v-if="p.last_at"> · dernière fois {{ lastLabel(p.last_at) }}</template>
            </span>
          </span>
          <button v-if="p.mine || me.is_admin" class="h-9 w-9 shrink-0 rounded-full text-muted hover:bg-white/10 hover:text-ink" :aria-label="`Visibilité de ${p.name}`" @click="editing?.id === p.id ? (editing = null) : startEdit(p)">
            <Icon name="fa-sliders" />
          </button>
        </div>

        <!-- Visibilité -->
        <form v-if="editing?.id === p.id" class="mt-3 space-y-3 rounded-xl bg-white/[.03] p-4" @submit.prevent="save">
          <div class="flex rounded-full bg-white/5 p-1">
            <button type="button" class="seg flex-1" :aria-pressed="!editing.private" @click="editing.private = false"><Icon name="fa-globe" /> Public</button>
            <button type="button" class="seg flex-1" :aria-pressed="editing.private" @click="editing.private = true"><Icon name="lock" /> Privé</button>
          </div>
          <div v-if="editing.private">
            <p class="mb-2 text-sm text-muted">Bandes qui le voient (et sa position, quand il y aura la carte) :</p>
            <label v-for="g in groups" :key="g.id" class="flex items-center gap-2.5 py-1">
              <input v-model="editing.groups" type="checkbox" :value="g.id" class="h-4 w-4 accent-[#d4bc35]" />
              {{ g.name }}
            </label>
            <p v-if="!groups.length" class="text-sm text-faint">Tu n'es dans aucune bande : il ne sera visible que par toi.</p>
          </div>
          <button class="btn btn-hi w-full py-2.5 font-bold">Enregistrer</button>
        </form>
      </li>
    </ul>
  </div>
</template>
