<script setup>
// La carte : produits partagés que tout le monde peut compléter. ★ = favori (en haut du ＋).
import { ref, computed, watch, onMounted } from 'vue'
import { api, CATS, MAX_CL, FORMATS, catOf, num, unitsOf, today, photoUrl } from '../api'
import DrinkFields from './DrinkFields.vue'
import Pager from './Pager.vue'
import Stars from './Stars.vue'
import Poster from './Poster.vue'
import PhotoField from './PhotoField.vue'
import InfoFields from './InfoFields.vue'
import PlacesList from './PlacesList.vue'
import { burst, centerOf, vibrate, toast, ask, celebrateBadges } from '../juice'
import { ui, openProduct } from '../nav'
import Icon from './Icon.vue'
import DrinkSpec from './DrinkSpec.vue'

const props = defineProps({ me: Object })
const emit = defineEmits(['back', 'saved'])

const products = ref([])
// Rubrique affichée : les boissons ou les lieux (retenue sur l'appareil)
const section = ref((() => { try { return localStorage.getItem('carte-section') || 'boissons' } catch { return 'boissons' } })())
watch(section, (v) => { try { localStorage.setItem('carte-section', v) } catch {} })
const loaded = ref(false)
const error = ref('')
const flash = ref('') // petit message de confirmation
const search = ref('')
const cat = ref('') // filtre catégorie ('' = toutes)
const onlyFavs = ref(false)

async function load() {
  try {
    products.value = await api('/products')
  } catch (e) {
    error.value = e.message
  } finally {
    loaded.value = true
  }
}
onMounted(load)
watch(() => ui.refresh, load) // fiche produit corrigée, favori changé…

const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const shown = computed(() => {
  const q = norm(search.value.trim())
  return products.value.filter(
    (p) => (!q || norm(p.name).includes(q)) && (!cat.value || p.cat === cat.value) && (!onlyFavs.value || p.fav)
  )
})
const favCount = computed(() => products.value.filter((p) => p.fav).length)
// Modifier / retirer : l'auteur du produit, ou un admin
const canRemove = (p) => p.created_by === props.me.id || props.me.is_admin

// --- Modifier un produit (corriger un degré…) ----------------------------------
const editing = ref(null) // { id, name, cat, cl, abv, photo (undefined = inchangée) }
const editValid = computed(() => {
  const d = editing.value
  return d && d.name.trim() && d.cl > 0 && d.cl <= MAX_CL && d.abv >= 0 && d.abv <= 100
})
async function saveEdit() {
  if (!editValid.value) return
  const d = editing.value
  error.value = ''
  try {
    replace(await api(`/products/${d.id}`, {
      method: 'PATCH',
      body: { name: d.name.trim(), cat: d.cat, cl: Number(d.cl), abv: Number(d.abv), caffeine: d.caffeine, ...(d.photo !== undefined ? { photo: d.photo } : {}) },
    }))
    editing.value = null
    toast(`${d.name} modifié`)
  } catch (e) {
    error.value = e.message
  }
}

// Pagination : 12 produits par page, retour en page 1 quand on filtre
const PER_PAGE = 12
const page = ref(1)
const pages = computed(() => Math.max(1, Math.ceil(shown.value.length / PER_PAGE)))
const paged = computed(() => shown.value.slice((page.value - 1) * PER_PAGE, page.value * PER_PAGE))
watch([search, cat, onlyFavs], () => (page.value = 1))
watch(pages, (n) => page.value > n && (page.value = n))
const listTop = ref(null)
const toTop = () => listTop.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })

let flashTimer
function say(msg) {
  flash.value = msg
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (flash.value = ''), 2000)
}
const replace = (p) => (products.value = products.value.map((x) => (x.id === p.id ? p : x)))

async function toggleFav(p, e) {
  error.value = ''
  try {
    const [x, y] = centerOf(e)
    replace(await api(`/products/${p.id}/fav`, { method: p.fav ? 'DELETE' : 'PUT' }))
    if (!p.fav) {
      burst(x, y, { icon: 'fa-star', color: '#d4bc35', bubbles: 6 })
      vibrate(15)
    }
  } catch (e) {
    error.value = e.message
  }
}

async function undo(row) {
  await api(`/drinks/${row.id}`, { method: 'DELETE' }).catch(() => {})
  emit('saved')
  toast(`${row.name} annulé`)
}

// « + » : un verre tout de suite. Une bière : d'abord le format (demi, bouteille, pinte…), dans une petite modale.
const sizePick = ref(null) // { p, x, y, sizes }
async function drinkNow(p, e) {
  error.value = ''
  const [x, y] = centerOf(e)
  if (p.cat !== 'biere') return logNow(p, p.cl, x, y)
  const sizes = new Map(FORMATS.filter((f) => f.cat === 'biere').map((f) => [f.cl, f.name]))
  if (!sizes.has(p.cl)) sizes.set(p.cl, null)
  sizePick.value = {
    p, x, y,
    sizes: [...sizes].sort((a, b) => a[0] - b[0]).map(([cl, label]) => ({ cl, label, units: unitsOf({ cl, abv: p.abv }), usual: cl === p.cl, mine: cl === p.my_cl })),
  }
}
async function logNow(p, cl, x, y) {
  sizePick.value = null
  const units = Math.round(unitsOf({ cl, abv: p.abv }) * 10) / 10
  try {
    const row = await api('/drinks', { method: 'POST', body: { day: today(), product_id: p.id, cl } })
    emit('saved')
    burst(x, y, { text: units ? `+${num(units)}` : '', icon: units ? '' : catOf(p.cat).fa, color: catOf(p.cat).hex })
    vibrate(30)
    toast(`${p.name}${p.cat === 'biere' ? ` ${num(cl)} cl` : ''}${units ? ` +${num(units)}` : ''}`, { icon: catOf(p.cat).fa, action: { label: 'Annuler', run: () => undo(row) } })
    celebrateBadges(row.badges)
  } catch (e) {
    error.value = e.message
  }
}

async function removeProduct(p) {
  const mine = p.created_by === props.me.id
  const ok = await ask({
    icon: catOf(p.cat).fa,
    title: `Retirer « ${p.name} » ?`,
    message: mine
      ? 'Il disparaîtra de la carte et des favoris de tout le monde. Les verres déjà bus restent comptés.'
      : `Ajouté par ${p.created_by_name ?? 'quelqu’un'}. Tu le retires pour tout le monde. Les verres déjà bus restent comptés.`,
    confirm: 'Retirer',
    danger: true,
  })
  if (!ok) return
  error.value = ''
  try {
    await api(`/products/${p.id}`, { method: 'DELETE' })
    products.value = products.value.filter((x) => x.id !== p.id)
    toast(`${p.name} retiré de la carte`)
  } catch (e) {
    error.value = e.message
  }
}

// --- Nouveau produit -----------------------------------------------------------
const draft = ref(null)
const draftValid = computed(() => {
  const d = draft.value
  return d && d.name.trim() && d.cl > 0 && d.cl <= MAX_CL && d.abv >= 0 && d.abv <= 100
})
const draftUnits = computed(() => (draft.value?.cat !== 'biere' && draft.value?.cl > 0 && draft.value?.abv > 0 ? unitsOf(draft.value) : 0))
async function create() {
  if (!draftValid.value) return
  error.value = ''
  try {
    const p = await api('/products', {
      method: 'POST',
      body: {
        name: draft.value.name.trim(), cat: draft.value.cat, cl: Number(draft.value.cl), abv: Number(draft.value.abv), caffeine: draft.value.caffeine,
        ...(draft.value.photo ? { photo: draft.value.photo } : {}),
        ...draft.value.info,
      },
    })
    products.value = [p, ...products.value]
    draft.value = null
    say(`${p.name} ajouté à la carte`)
  } catch (e) {
    error.value = e.message
  }
}
</script>

<template>
  <div class="space-y-8">
    <!-- Boissons ou lieux enregistrés -->
    <div class="flex rounded-full bg-white/5 p-1">
      <button class="seg flex-1" :aria-pressed="section === 'boissons'" @click="section = 'boissons'"><Icon name="carte" /> Boissons</button>
      <button class="seg flex-1" :aria-pressed="section === 'lieux'" @click="section = 'lieux'"><Icon name="fa-location-dot" /> Lieux</button>
    </div>
    <PlacesList v-if="section === 'lieux'" :me="me" />
    <template v-else>
    <div>
      <div class="flex items-center justify-between">
        <h2 class="font-display text-2xl">La carte</h2>
        <button class="text-sm font-semibold text-muted hover:text-hi" @click="emit('back')"><Icon name="back" /> Retour</button>
      </div>
      <p class="mt-2 text-muted">
        Les boissons de tout le monde, toutes bandes confondues. Mets-en en favori <Icon name="star" class="text-hi" />
        pour les retrouver en haut du <Icon name="plus" />.
      </p>
    </div>

    <!-- Ajouter -->
    <button
      v-if="!draft"
      class="btn tile lift flex w-full items-center gap-4 border-dashed !border-hi/50 px-5 py-4 text-left"
      @click="draft = { name: search.trim(), cat: cat || 'biere', cl: 33, abv: 5, info: { maker: '', origin: '', style: '', description: '' } }"
    >
      <Icon name="plus" :size="26" class="text-hi" />
      <span>
        <span class="block text-lg font-bold text-hi">Ajouter un produit</span>
        <span class="text-sm text-muted">Bière, vin, alcool fort, cocktail, Monster, soda…</span>
      </span>
    </button>
    <form v-else class="box space-y-5 p-5" @submit.prevent="create">
      <div class="flex items-center justify-between">
        <span class="text-xl font-bold">Nouveau produit</span>
        <button type="button" class="text-sm font-semibold text-muted hover:text-ink" @click="draft = null">Annuler</button>
      </div>
      <DrinkFields v-model="draft" carte name-placeholder="Nom : Chouffe, Leffe Ruby, Ricard…" />
      <PhotoField v-model="draft.photo" label="Ajouter une photo (canette, bouteille…)" />
      <details class="rounded-xl bg-white/[.03] px-4 py-3">
        <summary class="cursor-pointer text-sm font-semibold text-muted"><Icon name="plus" /> Infos : producteur, origine, style, description</summary>
        <InfoFields v-model="draft.info" class="mt-3" />
      </details>
      <button :disabled="!draftValid" class="btn btn-hi w-full py-3 text-lg font-bold disabled:opacity-40">
        Mettre à la carte<template v-if="draftUnits"> · {{ num(draftUnits) }} verre{{ draftUnits >= 2 ? 's' : '' }}</template>
      </button>
    </form>

    <p v-if="flash" class="rounded-xl bg-hi/10 px-4 py-2.5 text-sm font-semibold text-hi">{{ flash }}</p>
    <p v-if="error" class="rounded-xl bg-alert px-4 py-2.5 text-sm font-semibold text-white">{{ error }}</p>

    <!-- Filtres + liste -->
    <div ref="listTop" class="scroll-mt-4 space-y-4">
      <label class="relative block">
        <Icon name="search" class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
        <input v-model="search" type="search" placeholder="Chercher une boisson…" class="field w-full py-3 pr-4 pl-11 text-base" />
      </label>
      <div class="-mx-4 flex gap-2 overflow-x-auto px-4 text-sm font-semibold">
        <button
          class="shrink-0 rounded-full px-3 py-1.5"
          :class="onlyFavs ? 'bg-hi text-paper' : 'bg-white/5 text-muted hover:bg-white/10'"
          @click="onlyFavs = !onlyFavs"
        >
          <Icon name="star" /> Mes favoris · {{ favCount }}
        </button>
        <button
          v-for="c in CATS"
          :key="c.key"
          class="shrink-0 rounded-full px-3 py-1.5"
          :class="cat === c.key ? 'text-paper' : 'bg-white/5 text-muted hover:bg-white/10'"
          :style="cat === c.key ? { background: c.hex } : {}"
          @click="cat = cat === c.key ? '' : c.key"
        >
          <Icon :name="c.fa" /> {{ c.label }}
        </button>
      </div>

      <p v-if="loaded && !products.length" class="py-8 text-center text-muted">
        La carte est vide. Sois le premier à y mettre ta bière préférée.
      </p>
      <p v-else-if="loaded && !shown.length" class="py-8 text-center text-muted">
        Rien ne correspond.
        <button v-if="search.trim()" class="font-semibold text-hi hover:underline" @click="draft = { name: search.trim(), cat: cat || 'biere', cl: 33, abv: 5, info: { maker: '', origin: '', style: '', description: '' } }">
          Ajouter « {{ search.trim() }} » ?
        </button>
      </p>
      <p v-if="loaded && shown.length" class="text-sm text-muted">
        {{ shown.length }} boisson{{ shown.length > 1 ? 's' : '' }}<template v-if="pages > 1"> · page {{ page }} sur {{ pages }}</template>
      </p>
      <ul v-if="shown.length" class="box divide-y divide-white/5 lg:grid lg:grid-cols-2 lg:divide-y-0">
        <li v-for="p in paged" :key="p.id" class="lg:border-b lg:border-white/5 lg:odd:border-r">
          <!-- Mode édition -->
          <form v-if="editing?.id === p.id" class="space-y-5 bg-white/[.03] p-5" @submit.prevent="saveEdit">
            <div class="flex items-center justify-between">
              <span class="text-lg font-bold">Modifier « {{ p.name }} »</span>
              <button type="button" class="text-sm font-semibold text-muted hover:text-ink" @click="editing = null">Annuler</button>
            </div>
            <DrinkFields v-model="editing" carte name-placeholder="Nom" />
            <PhotoField v-model="editing.photo" :current="photoUrl(p.photo_key)" />
            <p class="text-sm text-muted">Les verres déjà bus ne changent pas : seule la carte est corrigée.</p>
            <button :disabled="!editValid" class="btn btn-hi w-full py-3 font-bold disabled:opacity-40">Enregistrer · {{ num(unitsOf(editing)) }} verre{{ unitsOf(editing) >= 2 ? 's' : '' }}</button>
          </form>
          <div v-else class="flex items-center gap-3 py-3 pr-4 pl-2">
          <button
            class="h-10 w-10 shrink-0 rounded-full text-2xl"
            :class="p.fav ? 'text-hi' : 'text-muted/40 hover:text-hi'"
            :aria-label="p.fav ? `Retirer ${p.name} des favoris` : `Mettre ${p.name} en favori`"
            :aria-pressed="p.fav"
            @click="toggleFav(p, $event)"
          >
            <Icon name="star" :regular="!p.fav" :size="20" />
          </button>
          <button class="shrink-0" :aria-label="`Fiche de ${p.name}`" @click="openProduct(p.id)">
            <Poster :drink="p" :width="36" :icon="40" />
          </button>
          <span class="min-w-0 flex-1 leading-tight">
            <button class="block max-w-full truncate text-left text-lg font-bold hover:text-hi hover:underline" @click="openProduct(p.id)">
              {{ p.name }}<Icon v-if="p.tried" name="check" class="ml-1.5 text-sm text-hi" title="Tu l'as déjà bue" />
            </button>
            <span v-if="p.rating" class="flex items-center gap-1.5 text-xs text-muted"><Stars :value="Math.round(p.rating)" :size="11" /> {{ p.ratings }} note{{ p.ratings > 1 ? 's' : '' }}</span>
            <span class="text-sm text-muted">
              <DrinkSpec :d="p" product />
              <template v-if="p.created_by === me.id"> · par toi</template>
              <template v-else-if="p.created_by_name"> · par {{ p.created_by_name }}</template>
            </span>
          </span>
          <button
            v-if="canRemove(p)"
            class="h-9 w-9 shrink-0 rounded-full text-muted hover:bg-white/10 hover:text-ink"
            :aria-label="`Modifier ${p.name}`"
            title="Modifier"
            @click="editing = { id: p.id, name: p.name, cat: p.cat, cl: p.default_cl ?? p.cl, abv: p.abv, caffeine: p.caffeine }"
          >
            <Icon name="edit" />
          </button>
          <button
            v-if="canRemove(p)"
            class="h-9 w-9 shrink-0 rounded-full text-muted hover:bg-alert hover:text-white"
            :title="p.created_by === me.id ? 'Retirer de la carte' : 'Retirer (admin)'"
            :aria-label="`Retirer ${p.name} de la carte`"
            @click="removeProduct(p)"
          >
            <Icon name="close" />
          </button>
          <button class="btn btn-hi shrink-0 px-3 py-2 font-bold" :aria-label="`Je bois un ${p.name}`" @click="drinkNow(p, $event)">
            <template v-if="p.cat === 'biere'"><Icon name="plus" /></template>
            <template v-else>{{ p.units ? `+${num(p.units)}` : '+1' }}</template>
          </button>
          </div>
        </li>
      </ul>

      <Pager v-model="page" :pages="pages" label="Pages de la carte" @change="toTop" />
    </div>
    </template>

    <!-- Format d'une bière, avant de l'ajouter -->
    <Transition name="sheet">
      <div v-if="sizePick" class="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center" @click.self="sizePick = null">
        <div class="sheet-panel box w-full max-w-sm p-6" role="dialog" aria-modal="true" :aria-label="`Format de ${sizePick.p.name}`">
          <h2 class="text-center text-xl font-bold">{{ sizePick.p.name }}</h2>
          <p class="mt-1 text-center text-sm text-muted">Quel format ?</p>
          <div class="mt-5 grid gap-2">
            <button
              v-for="z in sizePick.sizes"
              :key="z.cl"
              class="btn flex items-center justify-between px-4 py-3 font-bold"
              :class="z.usual ? 'btn-hi' : 'bg-white/5 hover:bg-white/10'"
              @click="logNow(sizePick.p, z.cl, sizePick.x, sizePick.y)"
            >
              <span>{{ z.label ?? 'Format de la fiche' }} · {{ num(z.cl) }} cl<span v-if="z.mine" class="ml-1.5 text-xs font-semibold opacity-80">habituel</span></span>
              <span class="tabular-nums">+{{ num(Math.round(z.units * 10) / 10) }}</span>
            </button>
          </div>
          <button class="btn mt-3 w-full bg-white/5 py-2.5 font-bold hover:bg-white/10" @click="sizePick = null">Annuler</button>
        </div>
      </div>
    </Transition>
  </div>
</template>
