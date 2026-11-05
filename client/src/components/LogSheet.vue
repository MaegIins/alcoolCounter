<script setup>
// Le « + » : choisir ce qu'on boit (carte, habitudes, format ou sur mesure), puis la date, une note,
// un avis et une photo, tous facultatifs. Sert aussi à compléter ou supprimer une conso (preset.edit).
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  api, FORMATS, MAX_CL, catOf, drinkId, unitsOf, num, fmtDrink, today, addDays, prettyDay, resizePhoto, photoUrl,
} from '../api'
import { ui, bump, openProduct } from '../nav'
import { toast, ask, celebrateBadges, vibrate } from '../juice'
import DrinkFields from './DrinkFields.vue'
import Poster from './Poster.vue'
import Stars from './Stars.vue'
import Icon from './Icon.vue'

const props = defineProps({ preset: { type: Object, default: () => ({}) } })
const close = () => (ui.log = null)

const edit = props.preset.edit ?? null
const step = ref(edit || props.preset.product || props.preset.drink ? 'details' : 'pick')
const sel = ref(
  edit ? { ...edit, mode: 'edit' }
  : props.preset.product ? { ...props.preset.product, product_id: props.preset.product.id, product_photo_key: props.preset.product.photo_key, mode: 'product' }
  : props.preset.drink ? { ...props.preset.drink, mode: 'product' }
  : null
)
const day = ref(edit?.day ?? props.preset.day ?? today())
const rating = ref(edit?.rating ?? null)
const review = ref(edit?.review ?? '')
const place = ref(edit?.place ?? '') // où on l'a bue (facultatif)
const placePrivate = ref(false) // lieu privé : visible seulement par moi et ma bande (réglable dans La carte › Lieux)
const places = ref([]) // mes lieux récents, en suggestion
api('/drinks/places').then((r) => (places.value = r)).catch(() => {})
const photo = ref(null) // data URL choisie (nouvelle photo)
const photoRemoved = ref(false)
const toCarte = ref(false)
const busy = ref(false)
const error = ref('')

// --- Étape 1 : choisir ---------------------------------------------------------------
const query = ref('')
const products = ref([])
const history = ref([])
const searchInput = ref(null)
onMounted(async () => {
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', onKey)
  if (step.value !== 'pick') return
  await nextTick()
  searchInput.value?.focus({ preventScroll: true })
  const [p, h] = await Promise.all([api('/products').catch(() => []), api('/drinks/favorites').catch(() => [])])
  products.value = p
  history.value = h
})
const onKey = (e) => e.key === 'Escape' && close()
onBeforeUnmount(() => {
  document.body.style.overflow = ''
  document.removeEventListener('keydown', onKey)
})

const favs = computed(() => products.value.filter((p) => p.fav))
const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const results = computed(() => {
  const q = norm(query.value.trim())
  if (!q) return []
  const fromCarte = products.value.filter((p) => norm(p.name).includes(q))
  const seen = new Set(fromCarte.map(drinkId))
  const fromHistory = history.value.filter((h) => norm(h.name).includes(q) && !seen.has(drinkId(h)))
  return [...fromCarte.map((p) => ({ ...p, product_id: p.id, product_photo_key: p.photo_key })), ...fromHistory].slice(0, 20)
})
const exact = computed(() => results.value.some((r) => norm(r.name) === norm(query.value.trim())))

function choose(d) {
  sel.value = { name: d.name, cat: d.cat, cl: d.cl, abv: d.abv, product_id: d.product_id ?? null, product_photo_key: d.product_photo_key ?? null, mode: 'product' }
  step.value = 'details'
}
function chooseFormat(f) {
  const usual = history.value.find((x) => x.cat === f.cat && x.cl === f.cl)
  sel.value = { name: '', label: f.name, cat: f.cat, cl: f.cl, abv: usual?.abv ?? f.abv, mode: 'format' }
  step.value = 'details'
}
function chooseCustom() {
  sel.value = { name: query.value.trim(), cat: 'biere', cl: 50, abv: 5, mode: 'custom' }
  step.value = 'details'
}

// Hors score : eau et clopes, un tap
async function addExtra(kind) {
  try {
    const row = await api('/extras', { method: 'POST', body: { day: today(), kind } })
    vibrate(15)
    toast(kind === 'eau' ? `Verre d'eau n°${row.count}` : `Clope n°${row.count}`, {
      icon: kind === 'eau' ? 'fa-droplet' : 'fa-smoking',
      action: { label: 'Annuler', run: () => api(`/extras/${row.id}`, { method: 'DELETE' }).then(bump).catch(() => {}) },
    })
    celebrateBadges(row.badges)
    bump()
  } catch (e) {
    error.value = e.message
  }
}

// --- Étape 2 : détails ----------------------------------------------------------------
const free = computed(() => sel.value && (sel.value.mode === 'format' || sel.value.mode === 'custom'))
const name = computed(() => sel.value?.name?.trim() || sel.value?.label || '')
const units = computed(() => (sel.value && sel.value.cl > 0 && sel.value.abv > 0 ? unitsOf(sel.value) : 0))
const valid = computed(() => {
  const d = sel.value
  if (!d) return false
  if (!free.value) return true
  return !!name.value && d.cl > 0 && d.cl <= MAX_CL && d.abv >= 0 && d.abv <= 100
})
const yesterday = computed(() => addDays(today(), -1))
const currentPhoto = computed(() => photo.value || (!photoRemoved.value && edit?.photo_key ? photoUrl(edit.photo_key) : ''))
const fileInput = ref(null)
async function onPhoto(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  try {
    photo.value = await resizePhoto(file)
    photoRemoved.value = false
  } catch (err) {
    error.value = err.message || 'Image illisible'
  }
}
function removePhoto() {
  photo.value = null
  photoRemoved.value = true
}

async function save() {
  if (!valid.value || busy.value) return
  busy.value = true
  error.value = ''
  const extra = { day: day.value, rating: rating.value, review: review.value, place: place.value, place_private: placePrivate.value }
  try {
    if (edit) {
      const body = { ...extra }
      if (photo.value) body.photo = photo.value
      else if (photoRemoved.value) body.photo = null
      await api(`/drinks/${edit.id}`, { method: 'PATCH', body })
      toast('Modifié')
    } else {
      const d = sel.value
      const drink = { name: name.value, cat: d.cat, cl: Number(d.cl), abv: Number(d.abv) }
      // Nouvelle boisson à mettre sur la carte : d'abord le produit (déjà là = pas grave), la conso y sera rattachée
      if (toCarte.value && d.mode !== 'product') await api('/products', { method: 'POST', body: drink }).catch(() => {})
      const row = await api('/drinks', {
        method: 'POST',
        body: { ...extra, ...(d.product_id ? { product_id: d.product_id } : drink), ...(photo.value ? { photo: photo.value } : {}) },
      })
      vibrate(30)
      toast(`${row.name}${row.units ? ` · +${num(row.units)}` : ''}`, {
        icon: catOf(row.cat).fa,
        action: { label: 'Annuler', run: () => api(`/drinks/${row.id}`, { method: 'DELETE' }).then(() => (bump(), toast(`${row.name} annulé`))).catch(() => {}) },
      })
      celebrateBadges(row.badges)
    }
    bump()
    close()
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

// Aller sur la page de la boisson (on ferme la fenêtre)
function toPage(id) {
  close()
  openProduct(id)
}
// Conso d'une boisson qui n'est pas sur la carte : on l'y met (ses consos y sont rattachées) et on va sur sa page
async function createPage() {
  busy.value = true
  error.value = ''
  try {
    const p = await api('/products', { method: 'POST', body: { name: edit.name, cat: edit.cat, cl: edit.cl, abv: edit.abv } })
    toast(`${p.name} ajoutée à la carte`)
    bump()
    toPage(p.id)
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (!(await ask({ title: `Supprimer « ${edit.name} » ?`, message: `${prettyDay(edit.day)} · ${fmtDrink(edit)}`, confirm: 'Supprimer', danger: true }))) return
  try {
    await api(`/drinks/${edit.id}`, { method: 'DELETE' })
    toast(`${edit.name} supprimé`)
    bump()
    close()
  } catch (e) {
    error.value = e.message
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4" @click.self="close">
    <div class="sheet-panel flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl bg-panel sm:rounded-xl" role="dialog" aria-modal="true" aria-label="Ajouter une conso">
      <!-- Barre du haut -->
      <div class="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <button
          v-if="step === 'details' && !edit && !preset.product && !preset.drink"
          class="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-raised hover:text-ink"
          aria-label="Retour au choix"
          @click="step = 'pick'"
        >
          <Icon name="back" :size="20" />
        </button>
        <button v-else class="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-raised hover:text-ink" aria-label="Fermer" @click="close">
          <Icon name="close" :size="20" />
        </button>
        <h2 class="flex-1 text-center font-semibold">{{ edit ? 'Ma conso' : step === 'pick' ? 'Qu’est-ce que tu bois ?' : 'J’ai bu…' }}</h2>
        <button
          v-if="step === 'details'"
          class="btn btn-hi px-4 py-1.5 text-sm font-semibold disabled:opacity-40"
          :disabled="!valid || busy"
          @click="save"
        >
          {{ edit ? 'Enregistrer' : 'Ajouter' }}
        </button>
        <span v-else class="w-9" />
      </div>

      <div class="overflow-y-auto">
        <!-- Étape 1 : choisir -->
        <div v-if="step === 'pick'" class="space-y-6 p-4">
          <label class="flex items-center gap-2 rounded-md border border-line bg-sunk px-3 focus-within:border-muted">
            <Icon name="search" :size="18" class="text-faint" />
            <input ref="searchInput" v-model="query" type="search" placeholder="Chouffe, Monster, Ricard…" class="w-full bg-transparent py-2.5 outline-none placeholder:text-faint" />
          </label>

          <!-- Résultats de recherche -->
          <ul v-if="query.trim()" class="-mx-4">
            <li v-for="r in results" :key="drinkId(r)">
              <button class="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-raised" @click="choose(r)">
                <Poster :drink="r" :width="34" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-semibold">{{ r.name }}</span>
                  <span class="text-sm text-muted">{{ catOf(r.cat).label }} · {{ fmtDrink(r) }}</span>
                </span>
                <span v-if="r.product_id" class="text-xs text-faint">carte</span>
              </button>
            </li>
            <li v-if="!exact">
              <button class="flex w-full items-center gap-3 px-4 py-3 text-left text-hi hover:bg-raised" @click="chooseCustom">
                <span class="flex h-[51px] w-[34px] items-center justify-center rounded border border-dashed border-hi/60"><Icon name="plus" :size="16" /></span>
                <span class="font-semibold">Créer « {{ query.trim() }} »</span>
              </button>
            </li>
          </ul>

          <template v-else>
            <section v-if="favs.length">
              <h3 class="kicker mb-2.5">Mes favoris</h3>
              <div class="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
                <button v-for="p in favs" :key="p.id" class="lift w-[72px] shrink-0 text-left" @click="choose({ ...p, product_id: p.id, product_photo_key: p.photo_key })">
                  <Poster :drink="p" :width="72" fluid />
                  <span class="mt-1 block truncate text-xs text-muted">{{ p.name }}</span>
                </button>
              </div>
            </section>

            <section v-if="history.length">
              <h3 class="kicker mb-1">Mes habitudes</h3>
              <ul class="-mx-4">
                <li v-for="h in history.slice(0, 6)" :key="drinkId(h)">
                  <button class="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-raised" @click="choose(h)">
                    <Poster :drink="h" :width="28" />
                    <span class="min-w-0 flex-1 truncate font-medium">{{ h.name }}</span>
                    <span class="text-sm text-muted">{{ fmtDrink(h) }}</span>
                    <span class="w-8 text-right text-xs text-faint">×{{ h.count }}</span>
                  </button>
                </li>
              </ul>
            </section>

            <section>
              <h3 class="kicker mb-2.5">Au format</h3>
              <div class="grid grid-cols-4 gap-2">
                <button
                  v-for="f in FORMATS"
                  :key="f.name"
                  class="tile flex flex-col items-center gap-0.5 px-1 py-2.5 text-center"
                  @click="chooseFormat(f)"
                >
                  <Icon :name="catOf(f.cat).fa" :size="18" :style="{ color: catOf(f.cat).hex }" />
                  <span class="w-full truncate text-sm font-medium">{{ f.name }}</span>
                  <span class="text-xs text-faint">{{ num(f.cl) }} cl</span>
                </button>
                <button class="tile flex flex-col items-center justify-center gap-0.5 border-dashed !border-line px-1 py-2.5 text-muted" @click="chooseCustom">
                  <Icon name="plus" :size="20" />
                  <span class="text-sm font-medium">Sur mesure</span>
                </button>
              </div>
            </section>

            <section class="flex items-center gap-2 border-t border-line pt-4">
              <span class="flex-1 text-sm text-muted">Hors score, ce soir</span>
              <button class="btn btn-ghost px-3 py-1.5 text-sm font-medium" @click="addExtra('eau')"><Icon name="water" class="text-fort" /> Eau</button>
              <button class="btn btn-ghost px-3 py-1.5 text-sm font-medium" @click="addExtra('clope')"><Icon name="smoke" /> Clope</button>
            </section>
          </template>
        </div>

        <!-- Étape 2 : détails -->
        <form v-else class="space-y-6 p-4" @submit.prevent="save">
          <div class="flex gap-4">
            <Poster :drink="sel" :width="84" :icon="64" />
            <div class="min-w-0 flex-1 pt-1">
              <div class="text-2xl leading-tight font-bold break-words">{{ name || 'Nouvelle boisson' }}</div>
              <div class="mt-1 text-sm text-muted">{{ catOf(sel.cat).label }} · {{ fmtDrink(sel) }}</div>
              <div class="mt-1 text-sm" :class="units ? 'text-hi' : 'text-faint'">
                {{ units ? `+${num(units)} verre${units >= 2 ? 's' : ''} standard` : 'Hors score (sans alcool)' }}
              </div>
              <button v-if="sel.product_id" type="button" class="mt-2 text-sm font-semibold text-hi hover:underline" @click="toPage(sel.product_id)">
                Page de la boisson <Icon name="next" />
              </button>
              <button v-else-if="edit" type="button" class="mt-2 text-sm font-semibold text-hi hover:underline" :disabled="busy" @click="createPage">
                <Icon name="plus" /> Lui créer une page sur la carte
              </button>
            </div>
          </div>

          <DrinkFields
            v-if="free"
            v-model="sel"
            :full="sel.mode === 'custom'"
            :name-placeholder="sel.mode === 'format' ? `Nom (facultatif) : ${sel.label}…` : 'Nom de la boisson'"
          />
          <label v-if="free && sel.name.trim()" class="flex items-center gap-2.5 text-sm text-muted">
            <input v-model="toCarte" type="checkbox" class="h-4 w-4 accent-[#d4bc35]" />
            L'ajouter à la carte, pour tout le monde
          </label>

          <!-- Date -->
          <div>
            <span class="kicker">Bu le</span>
            <div class="mt-2 flex flex-wrap items-center gap-1.5">
              <button
                v-for="d in [{ v: today(), l: 'Ce soir' }, { v: yesterday, l: 'Hier soir' }]"
                :key="d.l"
                type="button"
                class="rounded-full px-3 py-1 text-sm font-medium"
                :class="day === d.v ? 'bg-ink text-paper' : 'bg-raised text-muted hover:text-ink'"
                @click="day = d.v"
              >
                {{ d.l }}
              </button>
              <label class="flex items-center gap-2 rounded-full bg-raised py-1 pr-1 pl-3 text-sm text-muted">
                <Icon name="calendar" :size="15" />
                <input v-model="day" type="date" :max="today()" required class="bg-transparent text-ink outline-none" aria-label="Date de la soirée" />
              </label>
            </div>
            <p class="mt-1.5 text-xs text-faint first-letter:uppercase">{{ prettyDay(day) }} · la soirée court jusqu'à 6h du matin</p>
          </div>

          <!-- Note -->
          <div>
            <span class="kicker">Note</span>
            <div class="mt-2 flex items-center gap-3">
              <Stars v-model="rating" editable :size="32" />
              <span class="text-sm text-muted">{{ rating ? `${num(rating / 2)} / 5` : 'facultatif' }}</span>
            </div>
          </div>

          <!-- Lieu -->
          <div>
            <span class="kicker">Où ?</span>
            <label class="relative mt-2 block">
              <Icon name="fa-location-dot" class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
              <input v-model="place" maxlength="60" placeholder="Le bar du coin, chez Max… (facultatif)" class="field w-full py-2.5 pr-3.5 pl-10 text-base" />
            </label>
            <div v-if="places.length" class="mt-2 flex flex-wrap gap-1.5">
              <button
                v-for="p in places"
                :key="p.place"
                type="button"
                class="rounded-full px-3 py-1 text-sm font-medium"
                :class="place === p.place ? 'bg-ink text-paper' : 'bg-raised text-muted hover:text-ink'"
                @click="place === p.place ? (place = '') : ((place = p.place), (placePrivate = !!p.private))"
              >
                <Icon v-if="p.private" name="lock" class="text-xs" /> {{ p.place }}
              </button>
            </div>
            <label v-if="place.trim()" class="mt-2 flex items-center gap-2 text-sm text-muted">
              <input v-model="placePrivate" type="checkbox" class="h-4 w-4 accent-[#d4bc35]" />
              <Icon name="lock" /> Lieu privé : visible seulement par toi et ta bande (chez toi…)
            </label>
          </div>

          <!-- Avis -->
          <div>
            <span class="kicker">Avis</span>
            <textarea
              v-model="review"
              rows="3"
              maxlength="1000"
              placeholder="Bien fraîche, un peu trop sucrée, servie tiède…"
              class="field mt-2 w-full resize-y px-3.5 py-2.5 text-base"
            />
          </div>

          <!-- Photo -->
          <div>
            <span class="kicker">Photo</span>
            <div class="mt-2">
              <div v-if="currentPhoto" class="relative inline-block">
                <img :src="currentPhoto" alt="" class="max-h-56 rounded-md" />
                <button type="button" class="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white" aria-label="Retirer la photo" @click="removePhoto">
                  <Icon name="close" :size="16" />
                </button>
              </div>
              <button v-else type="button" class="btn btn-ghost flex items-center gap-2 px-3 py-2 text-sm font-medium" @click="fileInput.click()">
                <Icon name="camera" :size="18" /> Ajouter une photo
              </button>
              <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onPhoto" />
            </div>
          </div>

          <p v-if="error" class="rounded-md bg-alert/15 px-3.5 py-2.5 text-sm font-medium text-alert">{{ error }}</p>

          <button :disabled="!valid || busy" class="btn btn-hi w-full py-3 font-semibold disabled:opacity-40">
            {{ edit ? 'Enregistrer' : units ? `Ajouter · +${num(units)}` : 'Ajouter' }}
          </button>
          <button v-if="edit" type="button" class="flex w-full items-center justify-center gap-2 py-2 text-sm font-medium text-muted hover:text-alert" @click="remove">
            <Icon name="trash" :size="16" /> Supprimer cette conso
          </button>
        </form>

        <p v-if="error && step === 'pick'" class="mx-4 mb-4 rounded-md bg-alert/15 px-3.5 py-2.5 text-sm font-medium text-alert">{{ error }}</p>
      </div>
    </div>
  </div>
</template>
