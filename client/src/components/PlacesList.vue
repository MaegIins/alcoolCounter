<script setup>
// La carte › Lieux : les lieux enregistrés que je peux voir (publics, les miens, ceux de mes bandes).
// Ceux que j'ai créés : je choisis s'ils sont publics ou privés, et quelles bandes voient un lieu privé.
// (Les coordonnées lat/lng existent déjà côté serveur : une carte géographique pourra se brancher ici.)
import { ref, computed, watch } from 'vue'
import { api, dayLabel, nightOf, photoUrl } from '../api'
import { ui, openPlace } from '../nav'
import Icon from './Icon.vue'
import PlaceEditForm from './PlaceEditForm.vue'
import PlacesMap from './PlacesMap.vue'
import Pager from './Pager.vue'

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

// --- Modifier un lieu (formulaire partagé avec la page du lieu) ----------------------------------
const canEdit = (p) => p.mine || props.me.is_admin
const editing = ref(null) // id du lieu en cours de modification
// Liste paginée à 4 (la carte, elle, montre tous les lieux filtrés)
const PER_PAGE = 4
const page = ref(1)
const pages = computed(() => Math.max(1, Math.ceil(shown.value.length / PER_PAGE)))
const paged = computed(() => shown.value.slice((page.value - 1) * PER_PAGE, page.value * PER_PAGE))
watch([search, onlyMine], () => (page.value = 1))
watch(pages, (n) => page.value > n && (page.value = n))
const listTop = ref(null)
const toTop = () => listTop.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
const mapRef = ref(null) // « Voir sur la carte » : centre la carte sur le lieu et ouvre sa bulle
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

    <label ref="listTop" class="relative block scroll-mt-4">
      <Icon name="search" class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
      <input v-model="search" type="search" placeholder="Chercher un lieu…" class="field w-full py-2.5 pr-4 pl-11 text-base" />
    </label>
    <button class="rounded-full px-3 py-1 text-sm font-semibold" :class="onlyMine ? 'bg-hi text-paper' : 'bg-white/5 text-muted hover:bg-white/10'" @click="onlyMine = !onlyMine">
      Où j'ai bu
    </button>

    <p v-if="loaded && !shown.length" class="py-10 text-center text-muted">Aucun lieu pour l'instant.</p>
    <ul v-else class="box divide-y divide-white/5">
      <li v-for="p in paged" :key="p.id" class="px-4 py-3">
        <div class="flex items-center gap-3">
          <button class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5 text-hi hover:bg-white/10" :aria-label="`Page de ${p.name}`" @click="openPlace(p.id)">
            <img v-if="p.photo_key" :src="photoUrl(p.photo_key)" alt="" loading="lazy" class="h-full w-full object-cover" />
            <Icon v-else :name="p.home ? 'fa-house' : p.private ? 'lock' : 'fa-location-dot'" />
          </button>
          <span class="min-w-0 flex-1 leading-tight">
            <button class="block max-w-full truncate text-left font-bold hover:text-hi hover:underline" @click="openPlace(p.id)">{{ p.name }}</button>
            <span class="text-sm text-muted">
              {{ p.logs }} conso{{ p.logs > 1 ? 's' : '' }} · {{ p.drinkers }} buveur{{ p.drinkers > 1 ? 's' : '' }}<template v-if="p.my_logs"> · {{ p.my_logs }} de toi</template>
            </span>
            <span class="block text-xs text-faint">
              <template v-if="p.private">Privé · {{ p.mine ? (p.groups.length ? p.groups.map((g) => g.name).join(', ') : 'toi seul') : 'partagé avec ta bande' }}</template>
              <template v-else>Public</template>
              <template v-if="p.last_at"> · dernière fois {{ lastLabel(p.last_at) }}</template>
            </span>
            <button v-if="p.lat != null" class="text-xs font-semibold text-hi hover:underline" @click="mapRef?.focus(p.id)">
              <Icon name="fa-map-location-dot" /> Voir sur la carte
            </button>
            <span v-else class="text-xs text-faint">Pas encore de position</span>
          </span>
          <button
            v-if="canEdit(p) || p.lat == null"
            class="h-9 w-9 shrink-0 rounded-full text-muted hover:bg-white/10 hover:text-ink"
            :aria-label="canEdit(p) ? `Modifier ${p.name}` : `Ajouter la position de ${p.name}`"
            @click="editing = editing === p.id ? null : p.id"
          >
            <Icon :name="canEdit(p) ? 'edit' : 'fa-location-crosshairs'" />
          </button>
        </div>

        <PlaceEditForm v-if="editing === p.id" class="mt-3" :place="p" :me="me" :groups="groups" @done="editing = null" />
      </li>
    </ul>

    <Pager v-model="page" :pages="pages" label="Pages des lieux" @change="toTop" />

    <!-- La carte : mêmes lieux que la liste (recherche et filtre compris) -->
    <PlacesMap v-if="loaded" ref="mapRef" class="pt-4" :places="shown" />
  </div>
</template>
