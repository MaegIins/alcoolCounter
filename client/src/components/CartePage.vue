<script setup>
// La carte : produits partagés que tout le monde peut compléter. ★ = raccourci sur l'accueil.
import { ref, computed, watch, onMounted } from 'vue'
import { api, CATS, MAX_CL, catOf, num, fmtDrink, unitsOf, today } from '../api'
import DrinkFields from './DrinkFields.vue'
import Pager from './Pager.vue'
import { burst, centerOf, vibrate, toast, ask, celebrateBadges } from '../juice'

const props = defineProps({ me: Object, group: Object })
const emit = defineEmits(['back', 'saved'])

const products = ref([])
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

const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const shown = computed(() => {
  const q = norm(search.value.trim())
  return products.value.filter(
    (p) => (!q || norm(p.name).includes(q)) && (!cat.value || p.cat === cat.value) && (!onlyFavs.value || p.fav)
  )
})
const favCount = computed(() => products.value.filter((p) => p.fav).length)
// Modifier / retirer : l'auteur du produit, le patron de la bande, ou un admin
const canRemove = (p) => p.created_by === props.me.id || props.group?.owner_id === props.me.id || props.me.is_admin

// --- Modifier un produit (corriger un degré…) ----------------------------------
const editing = ref(null) // { id, name, cat, cl, abv }
const editValid = computed(() => {
  const d = editing.value
  return d && d.name.trim() && d.cl > 0 && d.cl <= MAX_CL && d.abv > 0 && d.abv <= 100
})
async function saveEdit() {
  if (!editValid.value) return
  const d = editing.value
  error.value = ''
  try {
    replace(await api(`/products/${d.id}`, { method: 'PATCH', body: { name: d.name.trim(), cat: d.cat, cl: Number(d.cl), abv: Number(d.abv) } }))
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
      burst(x, y, { text: '★', color: '#d4bc35', bubbles: 6 })
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

async function drinkNow(p, e) {
  error.value = ''
  const [x, y] = centerOf(e)
  try {
    const row = await api('/drinks', { method: 'POST', body: { day: today(), name: p.name, cat: p.cat, cl: p.cl, abv: p.abv } })
    emit('saved')
    burst(x, y, { text: `+${num(p.units)}`, color: catOf(p.cat).hex })
    vibrate(30)
    toast(`${catOf(p.cat).icon} ${p.name} +${num(p.units)}`, { action: { label: 'Annuler', run: () => undo(row) } })
    celebrateBadges(row.badges)
  } catch (e) {
    error.value = e.message
  }
}

async function removeProduct(p) {
  const mine = p.created_by === props.me.id
  const ok = await ask({
    icon: catOf(p.cat).icon,
    title: `Retirer « ${p.name} » ?`,
    message: mine
      ? 'Il disparaîtra de la carte et des raccourcis de tout le monde. Les verres déjà bus restent comptés.'
      : `Ajouté par ${p.created_by_name ?? 'quelqu’un'}. Tu le retires pour toute la bande. Les verres déjà bus restent comptés.`,
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
  return d && d.name.trim() && d.cl > 0 && d.cl <= MAX_CL && d.abv > 0 && d.abv <= 100
})
const draftUnits = computed(() => (draft.value?.cl > 0 && draft.value?.abv > 0 ? unitsOf(draft.value) : 0))
async function create() {
  if (!draftValid.value) return
  error.value = ''
  try {
    const p = await api('/products', {
      method: 'POST',
      body: { name: draft.value.name.trim(), cat: draft.value.cat, cl: Number(draft.value.cl), abv: Number(draft.value.abv) },
    })
    products.value = [p, ...products.value]
    draft.value = null
    say(`${p.name} ajouté à la carte et à tes raccourcis`)
  } catch (e) {
    error.value = e.message
  }
}
</script>

<template>
  <div class="space-y-8">
    <div>
      <div class="flex items-center justify-between">
        <h2 class="font-display text-2xl">La carte</h2>
        <button class="text-sm font-semibold text-muted hover:text-hi" @click="emit('back')">← Retour</button>
      </div>
      <p class="mt-2 text-muted">
        Les boissons de <b class="text-ink">{{ group?.name ?? 'la bande' }}</b>, remplies par tout le monde. Mets-en en favori <span class="text-hi">★</span>
        pour les retrouver en raccourci sur l'accueil.
      </p>
    </div>

    <!-- Ajouter -->
    <button
      v-if="!draft"
      class="btn tile lift flex w-full items-center gap-4 border-dashed !border-hi/50 px-5 py-4 text-left"
      @click="draft = { name: search.trim(), cat: cat || 'biere', cl: 33, abv: 5 }"
    >
      <span class="text-3xl text-hi">＋</span>
      <span>
        <span class="block text-lg font-bold text-hi">Ajouter un produit</span>
        <span class="text-sm text-muted">Bière, vin, alcool fort, cocktail…</span>
      </span>
    </button>
    <form v-else class="box space-y-5 p-5" @submit.prevent="create">
      <div class="flex items-center justify-between">
        <span class="text-xl font-bold">Nouveau produit</span>
        <button type="button" class="text-sm font-semibold text-muted hover:text-ink" @click="draft = null">Annuler</button>
      </div>
      <DrinkFields v-model="draft" name-placeholder="Nom : Chouffe, Leffe Ruby, Ricard…" />
      <button :disabled="!draftValid" class="btn btn-hi w-full py-3 text-lg font-bold disabled:opacity-40">
        Mettre à la carte · {{ num(draftUnits) }} verre{{ draftUnits >= 2 ? 's' : '' }}
      </button>
    </form>

    <p v-if="flash" class="rounded-xl bg-hi/10 px-4 py-2.5 text-sm font-semibold text-hi">{{ flash }}</p>
    <p v-if="error" class="rounded-xl bg-alert px-4 py-2.5 text-sm font-semibold text-white">{{ error }}</p>

    <!-- Filtres + liste -->
    <div ref="listTop" class="scroll-mt-4 space-y-4">
      <input v-model="search" type="search" placeholder="🔍  Chercher une boisson…" class="field w-full px-4 py-3 text-base" />
      <div class="-mx-4 flex gap-2 overflow-x-auto px-4 text-sm font-semibold">
        <button
          class="shrink-0 rounded-full px-3 py-1.5"
          :class="onlyFavs ? 'bg-hi text-paper' : 'bg-white/5 text-muted hover:bg-white/10'"
          @click="onlyFavs = !onlyFavs"
        >
          ★ Mes favoris · {{ favCount }}
        </button>
        <button
          v-for="c in CATS"
          :key="c.key"
          class="shrink-0 rounded-full px-3 py-1.5"
          :class="cat === c.key ? 'text-paper' : 'bg-white/5 text-muted hover:bg-white/10'"
          :style="cat === c.key ? { background: c.hex } : {}"
          @click="cat = cat === c.key ? '' : c.key"
        >
          {{ c.icon }} {{ c.label }}
        </button>
      </div>

      <p v-if="loaded && !products.length" class="py-8 text-center text-muted">
        La carte est vide. Sois le premier à y mettre ta bière préférée.
      </p>
      <p v-else-if="loaded && !shown.length" class="py-8 text-center text-muted">
        Rien ne correspond.
        <button v-if="search.trim()" class="font-semibold text-hi hover:underline" @click="draft = { name: search.trim(), cat: cat || 'biere', cl: 33, abv: 5 }">
          Ajouter « {{ search.trim() }} » ?
        </button>
      </p>
      <p v-if="loaded && shown.length" class="text-sm text-muted">
        {{ shown.length }} boisson{{ shown.length > 1 ? 's' : '' }}<template v-if="pages > 1"> · page {{ page }} sur {{ pages }}</template>
      </p>
      <ul v-if="shown.length" class="box divide-y divide-white/5">
        <li v-for="p in paged" :key="p.id">
          <!-- Mode édition -->
          <form v-if="editing?.id === p.id" class="space-y-5 bg-white/[.03] p-5" @submit.prevent="saveEdit">
            <div class="flex items-center justify-between">
              <span class="text-lg font-bold">Modifier « {{ p.name }} »</span>
              <button type="button" class="text-sm font-semibold text-muted hover:text-ink" @click="editing = null">Annuler</button>
            </div>
            <DrinkFields v-model="editing" name-placeholder="Nom" />
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
            {{ p.fav ? '★' : '☆' }}
          </button>
          <span class="text-2xl">{{ catOf(p.cat).icon }}</span>
          <span class="min-w-0 flex-1 leading-tight">
            <span class="block truncate text-lg font-bold">{{ p.name }}</span>
            <span class="text-sm text-muted">
              {{ fmtDrink(p) }}
              <template v-if="p.created_by === me.id"> · par toi</template>
              <template v-else-if="p.created_by_name"> · par {{ p.created_by_name }}</template>
            </span>
          </span>
          <button
            v-if="canRemove(p)"
            class="h-9 w-9 shrink-0 rounded-full text-muted hover:bg-white/10 hover:text-ink"
            :aria-label="`Modifier ${p.name}`"
            title="Modifier"
            @click="editing = { id: p.id, name: p.name, cat: p.cat, cl: p.cl, abv: p.abv }"
          >
            ✎
          </button>
          <button
            v-if="canRemove(p)"
            class="h-9 w-9 shrink-0 rounded-full text-muted hover:bg-alert hover:text-white"
            :title="p.created_by === me.id ? 'Retirer de la carte' : 'Retirer (patron / admin)'"
            :aria-label="`Retirer ${p.name} de la carte`"
            @click="removeProduct(p)"
          >
            ✕
          </button>
          <button class="btn btn-hi shrink-0 px-3 py-2 font-bold" :aria-label="`Je bois un ${p.name}`" @click="drinkNow(p, $event)">
            +{{ num(p.units) }}
          </button>
          </div>
        </li>
      </ul>

      <Pager v-model="page" :pages="pages" label="Pages de la carte" @change="toTop" />
    </div>
  </div>
</template>
