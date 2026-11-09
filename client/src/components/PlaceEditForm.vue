<script setup>
// Modifier un lieu (partagé par La carte › Lieux et la page d'un lieu), ou en créer un (place sans id).
// Le créateur (ou un admin) : nom (pas pour un « Chez moi »), position, visibilité.
// Les autres : seulement compléter ce qui manque (position, adresse, description, photo).
import { ref, computed } from 'vue'
import { api, photoUrl } from '../api'
import { bump } from '../nav'
import { toast } from '../juice'
import Icon from './Icon.vue'
import PhotoField from './PhotoField.vue'

const props = defineProps({
  place: { type: Object, required: true }, // { id, name, home, private, groups, lat, lng, mine } ; sans id = nouveau lieu
  me: Object,
  groups: { type: Array, default: () => [] }, // mes bandes
  // 'div' quand le formulaire est déjà dans un autre <form> (le « + ») : pas de formulaire imbriqué,
  // Entrée enregistre le lieu sans envoyer le formulaire parent
  tag: { type: String, default: 'form' },
})
const emit = defineEmits(['done'])

const isNew = props.place.id == null
const owner = isNew || props.place.mine || props.me.is_admin
const e = ref({
  name: props.place.name,
  private: props.place.private,
  groups: props.place.groups.map((g) => g.id),
  lat: props.place.lat ?? '',
  lng: props.place.lng ?? '',
  address: props.place.address ?? '',
  description: props.place.description ?? '',
  photo: undefined, // undefined = inchangée, null = retirée, data URL = nouvelle
})
// Champ modifiable : tout pour le créateur ; pour les autres, seulement s'il est encore vide
const can = (k) => owner || !props.place[k === 'photo' ? 'photo_key' : k]
const canCoords = owner || props.place.lat == null
// Bandes à qui partager un lieu privé : jamais la bande proposée à tous (n'importe qui peut y entrer)
const privateGroups = computed(() => props.groups.filter((g) => !g.is_default))

const locating = ref(false)
function locate() {
  if (!navigator.geolocation) return toast('Ton navigateur ne donne pas ta position')
  locating.value = true
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      e.value.lat = Math.round(pos.coords.latitude * 1e6) / 1e6
      e.value.lng = Math.round(pos.coords.longitude * 1e6) / 1e6
      locating.value = false
    },
    () => {
      toast('Position refusée ou introuvable')
      locating.value = false
    },
    { enableHighAccuracy: true, timeout: 10000 }
  )
}
const asForm = props.tag === 'form'
function onEnter(ev) {
  if (asForm || ev.target.tagName === 'TEXTAREA' || ev.target.tagName === 'BUTTON') return
  ev.preventDefault()
  save()
}
const saving = ref(false)
async function save() {
  const v = e.value
  if (saving.value) return
  if (owner && !props.place.home && !v.name?.trim()) return toast('Donne un nom au lieu')
  const coords = v.lat === '' && v.lng === '' ? { lat: null, lng: null } : { lat: Number(v.lat), lng: Number(v.lng) }
  const photo = v.photo !== undefined ? { photo: v.photo } : {}
  const body = owner
    ? {
        ...(props.place.home ? {} : { name: v.name }),
        private: v.private,
        groups: v.private ? v.groups.filter((id) => privateGroups.value.some((g) => g.id === id)) : [],
        ...coords,
        address: v.address,
        description: v.description,
        ...photo,
      }
    : {
        // Les autres n'envoient que ce qu'ils complètent
        ...(canCoords && coords.lat != null ? coords : {}),
        ...(can('address') && v.address.trim() ? { address: v.address } : {}),
        ...(can('description') && v.description.trim() ? { description: v.description } : {}),
        ...(can('photo') && v.photo ? photo : {}),
      }
  if (!owner && !Object.keys(body).length) return emit('done')
  saving.value = true
  try {
    const created = isNew ? await api('/places', { method: 'POST', body }) : null
    if (!isNew) await api(`/places/${props.place.id}`, { method: 'PATCH', body })
    toast(isNew ? `${created.name} ajouté aux lieux` : 'Lieu enregistré')
    bump()
    emit('done', created)
  } catch (err) {
    toast(err.message)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <component :is="tag" class="space-y-4 rounded-xl bg-white/[.03] p-4" @submit.prevent="save" @keydown.enter="onEnter">
    <label v-if="owner && !place.home" class="block">
      <span class="kicker">Nom</span>
      <input v-model="e.name" maxlength="60" :required="asForm" class="field mt-1 w-full px-3.5 py-2 text-base" />
    </label>
    <label v-if="can('address')" class="block">
      <span class="kicker">Adresse</span>
      <input v-model="e.address" maxlength="150" placeholder="12 rue du Bar, Lyon" class="field mt-1 w-full px-3.5 py-2 text-base" />
    </label>
    <label v-if="can('description')" class="block">
      <span class="kicker">Description</span>
      <textarea v-model="e.description" rows="3" maxlength="1000" placeholder="L'ambiance, les prix, l'happy hour…" class="field mt-1 w-full resize-y px-3.5 py-2 text-base" />
    </label>
    <div v-if="can('photo')">
      <span class="kicker">Photo</span>
      <PhotoField v-model="e.photo" class="mt-1" :current="photoUrl(place.photo_key)" label="Ajouter une photo du lieu" />
    </div>
    <div v-if="canCoords">
      <span class="kicker">Position (pour le plan)</span>
      <div class="mt-1 grid grid-cols-2 gap-2">
        <input v-model="e.lat" type="number" step="any" min="-90" max="90" placeholder="Latitude" aria-label="Latitude" class="field px-3 py-2 text-base" />
        <input v-model="e.lng" type="number" step="any" min="-180" max="180" placeholder="Longitude" aria-label="Longitude" class="field px-3 py-2 text-base" />
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <button type="button" class="btn btn-ghost px-3 py-1.5 font-semibold" :disabled="locating" @click="locate">
          <Icon name="fa-location-crosshairs" /> {{ locating ? 'Localisation…' : 'Ma position actuelle' }}
        </button>
        <button v-if="owner && (e.lat !== '' || e.lng !== '')" type="button" class="font-semibold text-muted hover:text-alert" @click="e.lat = ''; e.lng = ''">
          Effacer
        </button>
      </div>
      <p class="mt-1 text-xs text-faint">Astuce : sur OpenStreetMap ou Google Maps, un appui long sur un point donne ses coordonnées.</p>
    </div>
    <div v-if="owner" class="flex rounded-full bg-white/5 p-1">
      <button type="button" class="seg flex-1" :aria-pressed="!e.private" @click="e.private = false"><Icon name="fa-globe" /> Public</button>
      <button type="button" class="seg flex-1" :aria-pressed="e.private" @click="e.private = true"><Icon name="lock" /> Privé</button>
    </div>
    <div v-if="owner && e.private">
      <p class="mb-2 text-sm text-muted">Bandes qui le voient (et sa position) :</p>
      <label v-for="g in privateGroups" :key="g.id" class="flex items-center gap-2.5 py-1">
        <input v-model="e.groups" type="checkbox" :value="g.id" class="h-4 w-4 accent-[#d4bc35]" />
        {{ g.name }}
      </label>
      <p v-if="!privateGroups.length" class="text-sm text-faint">Aucune bande de potes : il ne sera visible que par toi.</p>
      <p v-if="groups.some((g) => g.is_default)" class="mt-1 text-xs text-faint">La bande ouverte à tous ne peut pas voir un lieu privé.</p>
    </div>
    <div class="flex gap-2">
      <button :type="asForm ? 'submit' : 'button'" class="btn btn-hi flex-1 py-2.5 font-bold" :disabled="saving" @click="!asForm && save()">
        {{ isNew ? 'Ajouter le lieu' : 'Enregistrer' }}
      </button>
      <button type="button" class="btn btn-ghost px-4 py-2.5 font-semibold" @click="emit('done')">Annuler</button>
    </div>
  </component>
</template>
