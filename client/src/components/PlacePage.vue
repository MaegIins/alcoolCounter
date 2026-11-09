<script setup>
// Page d'un lieu, comme celles des boissons et des profils : où c'est (carte OpenStreetMap si la position
// est connue), qui l'a ajouté, s'il est privé, les chiffres, ce qu'on y boit, qui y boit, les dernières consos.
import { ref, computed, watch } from 'vue'
import { api, catOf, num, dayLabel, photoUrl } from '../api'
import { ui, goBack, openUser, openProduct, openLog } from '../nav'
import Avatar from './Avatar.vue'
import Poster from './Poster.vue'
import Stars from './Stars.vue'
import LogCard from './LogCard.vue'
import Icon from './Icon.vue'
import PlaceEditForm from './PlaceEditForm.vue'
import PlacesMap from './PlacesMap.vue'

const props = defineProps({ placeId: Number, me: Object, colors: Object })

const p = ref(null)
const groups = ref([])
const error = ref('')
const editing = ref(false)
const nearby = ref([]) // les lieux que je peux voir : affichés autour de celui-ci sur la carte
async function load() {
  try {
    const [place, g, all] = await Promise.all([api(`/places/${props.placeId}`), api('/groups').catch(() => []), api('/places').catch(() => [])])
    p.value = place
    groups.value = g
    nearby.value = all
    error.value = ''
  } catch (e) {
    error.value = e.message
  }
}
watch(() => [props.placeId, ui.refresh], load, { immediate: true })

const hasPos = computed(() => p.value?.lat != null && p.value?.lng != null)
// Ce lieu (avec ses chiffres à jour) + les autres lieux visibles, pour la carte
const mapPlaces = computed(() => (p.value ? [p.value, ...nearby.value.filter((x) => x.id !== p.value.id)] : []))
const osm = computed(() => (hasPos.value ? `https://www.openstreetmap.org/?mlat=${p.value.lat}&mlon=${p.value.lng}#map=17/${p.value.lat}/${p.value.lng}` : ''))
// Modifier : le créateur ; compléter : les autres, tant qu'il manque quelque chose (pas sur un « Chez X »)
const missing = computed(() => p.value && !p.value.home && (!hasPos.value || !p.value.address || !p.value.description || !p.value.photo_key))
const canEdit = computed(() => p.value && (p.value.mine || props.me.is_admin || missing.value))
const zoom = ref(false)
const descOpen = ref(false)
const visibility = computed(() => {
  const x = p.value
  if (!x) return ''
  if (!x.private) return 'Public'
  if (!x.mine) return 'Privé · partagé avec ta bande'
  return `Privé · ${x.groups.length ? x.groups.map((g) => g.name).join(', ') : 'toi seul'}`
})
// « ＋ J'y bois un verre » : le + avec ce lieu déjà rempli
const drinkHere = () => openLog({ place: p.value.name })
</script>

<template>
  <div>
    <button class="mb-4 text-sm font-semibold text-muted hover:text-hi" @click="goBack"><Icon name="back" /> Retour</button>

    <p v-if="error && !p" class="rounded-xl bg-alert px-4 py-2.5 text-sm font-semibold text-white">{{ error }}</p>
    <div v-else-if="!p" class="py-20 text-center text-muted">Chargement…</div>

    <template v-else>
      <!-- En-tête -->
      <header class="flex items-start gap-4">
        <button v-if="p.photo_key" class="cursor-zoom-in shrink-0" aria-label="Agrandir la photo" @click="zoom = true">
          <img :src="photoUrl(p.photo_key)" alt="" class="h-20 w-20 rounded-2xl object-cover ring-1 ring-black/50" />
        </button>
        <span v-else class="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-hi/15 text-3xl text-hi">
          <Icon :name="p.home ? 'fa-house' : p.private ? 'lock' : 'fa-location-dot'" />
        </span>
        <div class="min-w-0 flex-1 pt-1">
          <h1 class="font-display text-3xl leading-[1.05] break-words">{{ p.name }}</h1>
          <p class="mt-1 text-sm text-muted">
            <Icon :name="p.private ? 'lock' : 'fa-globe'" /> {{ visibility }}
          </p>
          <p v-if="p.owner" class="text-sm text-muted">
            Chez <button class="font-semibold text-ink hover:text-hi hover:underline" @click="openUser(p.owner.id)">{{ p.owner.id === me.id ? 'toi' : p.owner.name }}</button>
          </p>
          <p v-else-if="p.creator" class="text-xs text-faint">Ajouté par {{ p.mine ? 'toi' : p.creator }}</p>
          <p v-if="p.address" class="mt-1 text-sm">
            <a :href="`https://www.openstreetmap.org/search?query=${encodeURIComponent(p.address)}`" target="_blank" rel="noopener" class="hover:text-hi hover:underline">
              <Icon name="fa-map-pin" class="text-hi" /> {{ p.address }}
            </a>
          </p>
        </div>
      </header>

      <!-- Le plus bu ici -->
      <button
        v-if="p.drinks.length"
        class="mt-4 flex w-full items-center gap-3 rounded-xl bg-hi/10 p-3 text-left"
        :class="p.drinks[0].product_id && 'hover:bg-hi/15'"
        @click="p.drinks[0].product_id && openProduct(p.drinks[0].product_id)"
      >
        <Poster :drink="p.drinks[0]" :width="40" :icon="40" />
        <span class="min-w-0 flex-1">
          <span class="kicker block text-hi">Le plus bu ici</span>
          <span class="block truncate font-bold">{{ p.drinks[0].name }}</span>
        </span>
        <span class="shrink-0 font-display text-xl leading-none text-hi">×{{ p.drinks[0].count }}</span>
      </button>

      <!-- Description -->
      <div v-if="p.description" class="mt-4">
        <p class="whitespace-pre-line text-ink/90" :class="p.description.length > 300 && !descOpen && 'line-clamp-5'">{{ p.description }}</p>
        <button v-if="p.description.length > 300" class="mt-1 text-sm font-semibold text-muted hover:text-ink" @click="descOpen = !descOpen">{{ descOpen ? 'Moins' : 'Lire la suite' }}</button>
      </div>

      <!-- Où c'est -->
      <section class="mt-6">
        <div v-if="hasPos" class="box overflow-hidden">
          <PlacesMap :places="mapPlaces" :focus-id="p.id" />
          <a :href="osm" target="_blank" rel="noopener" class="block px-4 py-2.5 text-sm font-semibold text-hi hover:underline">
            <Icon name="fa-map-location-dot" /> Ouvrir dans OpenStreetMap
          </a>
        </div>
        <p v-else class="rounded-xl bg-white/5 px-4 py-3 text-sm text-muted">
          <Icon name="fa-map-location-dot" /> Pas encore de position.
          <button v-if="canEdit" class="font-semibold text-hi hover:underline" @click="editing = true">L'ajouter</button>
        </p>
      </section>

      <!-- Actions -->
      <div class="mt-4 flex flex-wrap gap-2">
        <button class="btn btn-hi flex-1 py-2.5 font-bold" @click="drinkHere"><Icon name="plus" /> J'y bois un verre</button>
        <button v-if="canEdit" class="btn btn-ghost px-4 py-2.5 font-semibold" @click="editing = !editing">
          <Icon name="edit" /> {{ p.mine || me.is_admin ? 'Modifier' : 'Compléter' }}
        </button>
      </div>
      <PlaceEditForm v-if="editing" class="mt-4" :place="p" :me="me" :groups="groups" @done="editing = false" />

      <!-- Chiffres -->
      <section class="mt-8 grid grid-cols-4 gap-2 text-center">
        <div class="rounded-xl bg-white/5 py-3"><div class="font-display text-2xl text-hi">{{ p.logs }}</div><div class="text-xs font-semibold text-muted">consos</div></div>
        <div class="rounded-xl bg-white/5 py-3"><div class="font-display text-2xl text-hi">{{ p.drinkers }}</div><div class="text-xs font-semibold text-muted">buveurs</div></div>
        <div class="rounded-xl bg-white/5 py-3"><div class="font-display text-2xl text-hi">{{ p.my_logs }}</div><div class="text-xs font-semibold text-muted">de toi</div></div>
        <div class="rounded-xl bg-white/5 py-3"><div class="font-display text-2xl text-hi">{{ p.rating ? num(p.rating / 2) : '–' }}</div><div class="text-xs font-semibold text-muted">note moy.</div></div>
      </section>
      <p v-if="p.first_day" class="mt-2 text-sm text-muted">
        Premier verre noté ici {{ dayLabel(p.first_day, true) }}<template v-if="p.units"> · {{ num(p.units) }} verres standard bus en tout</template>.
      </p>

      <!-- Ce qu'on y boit -->
      <section v-if="p.drinks.length" class="mt-8">
        <h2 class="mb-1 border-b border-white/5 pb-2 text-lg font-bold">Ce qu'on y boit</h2>
        <ul class="divide-y divide-white/5">
          <li v-for="d in p.drinks" :key="`${d.product_id}|${d.name}`">
            <component
              :is="d.product_id ? 'button' : 'div'"
              class="flex w-full items-center gap-3 py-2.5 text-left"
              :class="d.product_id && 'hover:text-hi'"
              @click="d.product_id && openProduct(d.product_id)"
            >
              <Poster :drink="d" :width="40" :icon="40" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-bold">{{ d.name }}</span>
                <span class="flex items-center gap-2 text-sm text-muted">
                  <Icon :name="catOf(d.cat).fa" /> {{ catOf(d.cat).label }}
                  <Stars v-if="d.rating" :value="Math.round(d.rating)" :size="11" />
                </span>
              </span>
              <span class="shrink-0 text-right">
                <span class="block font-display text-xl leading-none text-hi">×{{ d.count }}</span>
                <span class="text-xs text-muted">{{ d.drinkers }} buveur{{ d.drinkers > 1 ? 's' : '' }}</span>
              </span>
            </component>
          </li>
        </ul>
      </section>

      <!-- Qui y boit -->
      <section v-if="p.people.length" class="mt-8">
        <h2 class="mb-3 border-b border-white/5 pb-2 text-lg font-bold">Les habitués</h2>
        <div class="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1">
          <button v-for="u in p.people" :key="u.id" class="flex w-16 shrink-0 flex-col items-center text-center" @click="openUser(u.id)">
            <Avatar :user="u" :color="colors[u.id]" :size="48" class="rounded-full" />
            <span class="mt-1 w-full truncate text-xs font-semibold">{{ u.id === me.id ? 'Toi' : u.name }}</span>
            <span class="text-[10px] text-muted">×{{ u.count }}</span>
          </button>
        </div>
      </section>

      <!-- Dernières consos -->
      <section class="mt-8">
        <h2 class="border-b border-white/5 pb-2 text-lg font-bold">Dernières consos ici</h2>
        <p v-if="!p.recent.length" class="py-8 text-center text-sm text-muted">
          Personne n'a encore rien noté ici. <button class="font-semibold text-hi hover:underline" @click="drinkHere">Sois le premier</button>
        </p>
        <div class="divide-y divide-white/5">
          <LogCard v-for="l in p.recent" :key="l.id" :log="l" :me="me" :colors="colors" />
        </div>
      </section>
    </template>

    <Teleport to="body">
      <div v-if="zoom" class="fixed inset-0 z-[90] flex cursor-zoom-out items-center justify-center bg-black/90 p-4" @click="zoom = false">
        <img :src="photoUrl(p.photo_key)" alt="" class="max-h-full max-w-full rounded-lg" />
      </div>
    </Teleport>
  </div>
</template>
