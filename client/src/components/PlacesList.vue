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

// --- Modifier un lieu ----------------------------------------------------------------------------
// Le créateur (ou un admin) : nom, position, visibilité. Les autres : seulement ajouter une position manquante.
const canEdit = (p) => p.mine || props.me.is_admin
const editing = ref(null) // { id, owner, name, private, groups, lat, lng }
const startEdit = (p) =>
  (editing.value = { id: p.id, owner: canEdit(p), name: p.name, private: p.private, groups: p.groups.map((g) => g.id), lat: p.lat ?? '', lng: p.lng ?? '' })
const locating = ref(false)
function locate() {
  if (!navigator.geolocation) return toast("Ton navigateur ne donne pas ta position")
  locating.value = true
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      editing.value.lat = Math.round(pos.coords.latitude * 1e6) / 1e6
      editing.value.lng = Math.round(pos.coords.longitude * 1e6) / 1e6
      locating.value = false
    },
    () => {
      toast('Position refusée ou introuvable')
      locating.value = false
    },
    { enableHighAccuracy: true, timeout: 10000 }
  )
}
async function save() {
  const e = editing.value
  const coords = e.lat === '' && e.lng === '' ? { lat: null, lng: null } : { lat: Number(e.lat), lng: Number(e.lng) }
  const body = e.owner ? { name: e.name, private: e.private, groups: e.private ? e.groups : [], ...coords } : coords
  try {
    await api(`/places/${e.id}`, { method: 'PATCH', body })
    editing.value = null
    toast('Lieu enregistré')
    bump()
  } catch (err) {
    toast(err.message)
  }
}
const osm = (p) => `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`
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
            <a v-if="p.lat != null" :href="osm(p)" target="_blank" rel="noopener" class="text-xs font-semibold text-hi hover:underline">
              <Icon name="fa-map-location-dot" /> Voir sur la carte
            </a>
            <span v-else class="text-xs text-faint">Pas encore de position</span>
          </span>
          <button
            v-if="canEdit(p) || p.lat == null"
            class="h-9 w-9 shrink-0 rounded-full text-muted hover:bg-white/10 hover:text-ink"
            :aria-label="canEdit(p) ? `Modifier ${p.name}` : `Ajouter la position de ${p.name}`"
            @click="editing?.id === p.id ? (editing = null) : startEdit(p)"
          >
            <Icon :name="canEdit(p) ? 'edit' : 'fa-location-crosshairs'" />
          </button>
        </div>

        <!-- Visibilité -->
        <form v-if="editing?.id === p.id" class="mt-3 space-y-4 rounded-xl bg-white/[.03] p-4" @submit.prevent="save">
          <label v-if="editing.owner" class="block">
            <span class="kicker">Nom</span>
            <input v-model="editing.name" maxlength="60" required class="field mt-1 w-full px-3.5 py-2 text-base" />
          </label>
          <div>
            <span class="kicker">Position (pour la carte)</span>
            <div class="mt-1 grid grid-cols-2 gap-2">
              <input v-model="editing.lat" type="number" step="any" min="-90" max="90" placeholder="Latitude" aria-label="Latitude" class="field px-3 py-2 text-base" />
              <input v-model="editing.lng" type="number" step="any" min="-180" max="180" placeholder="Longitude" aria-label="Longitude" class="field px-3 py-2 text-base" />
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <button type="button" class="btn btn-ghost px-3 py-1.5 font-semibold" :disabled="locating" @click="locate">
                <Icon name="fa-location-crosshairs" /> {{ locating ? 'Localisation…' : 'Ma position actuelle' }}
              </button>
              <button v-if="editing.owner && (editing.lat !== '' || editing.lng !== '')" type="button" class="font-semibold text-muted hover:text-alert" @click="editing.lat = ''; editing.lng = ''">
                Effacer
              </button>
            </div>
            <p class="mt-1 text-xs text-faint">Astuce : sur OpenStreetMap ou Google Maps, un appui long sur un point donne ses coordonnées.</p>
          </div>
          <div v-if="editing.owner" class="flex rounded-full bg-white/5 p-1">
            <button type="button" class="seg flex-1" :aria-pressed="!editing.private" @click="editing.private = false"><Icon name="fa-globe" /> Public</button>
            <button type="button" class="seg flex-1" :aria-pressed="editing.private" @click="editing.private = true"><Icon name="lock" /> Privé</button>
          </div>
          <div v-if="editing.owner && editing.private">
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
