<script setup>
// Page d'une boisson, façon page de film : affiche, infos (renseignées par qui l'a mise sur la carte,
// complétables par tous), ma note, les chiffres, la répartition des notes, qui l'a bue, les avis, des boissons du même genre.
import { ref, computed, watch } from 'vue'
import { api, MAX_CL, catOf, num, fmtDrink, photoUrl, resizePhoto, timeAgo, prettyDay } from '../api'
import { ui, goBack, openLog, openUser, openProduct, bump } from '../nav'
import { toast, ask, burst, centerOf, vibrate } from '../juice'
import Avatar from './Avatar.vue'
import Poster from './Poster.vue'
import Stars from './Stars.vue'
import DrinkFields from './DrinkFields.vue'
import InfoFields from './InfoFields.vue'
import PhotoField from './PhotoField.vue'
import Icon from './Icon.vue'

const props = defineProps({ productId: Number, me: Object, colors: Object })

const p = ref(null)
const error = ref('')
async function load() {
  try {
    p.value = await api(`/products/${props.productId}`)
    error.value = ''
  } catch (e) {
    error.value = e.message
  }
}
watch(() => [props.productId, ui.refresh], load, { immediate: true })

const cat = computed(() => catOf(p.value?.cat))
const photo = computed(() => photoUrl(p.value?.photo_key))
const canManage = computed(() => p.value && (p.value.created_by === props.me.id || props.me.is_admin))
const histMax = computed(() => Math.max(1, ...(p.value?.hist ?? [])))
const longDesc = computed(() => (p.value?.description?.length ?? 0) > 320)
const descOpen = ref(false)
const missingInfo = computed(() => p.value && ['maker', 'origin', 'style', 'description'].filter((k) => !p.value[k]))

// --- Actions ---------------------------------------------------------------------------------
async function toggleFav(e) {
  const [x, y] = centerOf(e)
  try {
    const r = await api(`/products/${p.value.id}/fav`, { method: p.value.fav ? 'DELETE' : 'PUT' })
    p.value = { ...p.value, fav: r.fav, favs: r.favs }
    if (r.fav) {
      burst(x, y, { icon: 'fa-star', color: '#d4bc35', bubbles: 6 })
      vibrate(15)
    }
  } catch (err) {
    toast(err.message)
  }
}
const drinkIt = () => openLog({ product: p.value })
// « Déjà bue » : je l'ai bue un jour, sans date ni note (hors score, hors journal)
const marking = ref(false)
async function toggleTried(e) {
  const [x, y] = centerOf(e)
  marking.value = true
  try {
    const r = await api(`/products/${p.value.id}/tried`, { method: p.value.marked ? 'DELETE' : 'PUT' })
    if (r.marked) {
      burst(x, y, { icon: 'fa-check', color: '#d4bc35', bubbles: 6 })
      vibrate(15)
      toast(`${p.value.name} : déjà bue`)
    }
    bump()
  } catch (err) {
    toast(err.message)
  } finally {
    marking.value = false
  }
}

// --- Modifier (auteur ou admin : tout ; les autres : compléter les infos vides) -------------------
const editing = ref(null) // { drink, info, photo }
function startEdit() {
  const x = p.value
  editing.value = {
    drink: { name: x.name, cat: x.cat, cl: x.cl, abv: x.abv },
    info: { maker: x.maker ?? '', origin: x.origin ?? '', style: x.style ?? '', description: x.description ?? '' },
    photo: undefined,
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
const locked = computed(() => (canManage.value || !p.value ? [] : ['maker', 'origin', 'style', 'description'].filter((k) => p.value[k])))
const editValid = computed(() => {
  const d = editing.value?.drink
  return d && d.name.trim() && d.cl > 0 && d.cl <= MAX_CL && d.abv >= 0 && d.abv <= 100
})
async function saveEdit() {
  if (!editValid.value) return
  error.value = ''
  const { drink, info, photo: ph } = editing.value
  try {
    if (canManage.value) {
      await api(`/products/${p.value.id}`, {
        method: 'PATCH',
        body: { name: drink.name.trim(), cat: drink.cat, cl: Number(drink.cl), abv: Number(drink.abv), ...info, ...(ph !== undefined ? { photo: ph } : {}) },
      })
    } else {
      const fill = Object.fromEntries(Object.entries(info).filter(([k, v]) => !locked.value.includes(k) && v.trim()))
      if (Object.keys(fill).length) await api(`/products/${p.value.id}/info`, { method: 'PUT', body: fill })
      if (ph) await api(`/products/${p.value.id}/photo`, { method: 'PUT', body: { photo: ph } })
    }
    editing.value = null
    toast('Fiche mise à jour')
    bump()
  } catch (e) {
    error.value = e.message
  }
}
async function remove() {
  const mine = p.value.created_by === props.me.id
  const ok = await ask({
    icon: cat.value.fa,
    title: `Retirer « ${p.value.name} » de la carte ?`,
    message: mine
      ? 'Elle disparaît de la carte, des favoris et des tops de tout le monde. Les consos restent dans les journaux.'
      : `Ajoutée par ${p.value.created_by_name ?? 'quelqu’un'}. Tu la retires pour tout le monde. Les consos restent dans les journaux.`,
    confirm: 'Retirer',
    danger: true,
  })
  if (!ok) return
  try {
    await api(`/products/${p.value.id}`, { method: 'DELETE' })
    toast(`${p.value.name} retirée de la carte`)
    bump()
    goBack()
  } catch (e) {
    error.value = e.message
  }
}

// Photo ajoutée vite fait (sans ouvrir le formulaire)
const quickInput = ref(null)
const uploading = ref(false)
async function quickPhoto(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  uploading.value = true
  try {
    await api(`/products/${p.value.id}/photo`, { method: 'PUT', body: { photo: await resizePhoto(file, 600) } })
    toast('Photo ajoutée')
    bump()
  } catch (err) {
    error.value = err.message || 'Image illisible'
  } finally {
    uploading.value = false
  }
}

// --- Avis ------------------------------------------------------------------------------------------
const reviewSort = ref('recent')
const REVIEW_SORTS = [
  { k: 'recent', l: 'Récents' },
  { k: 'best', l: 'Mieux notés' },
  { k: 'worst', l: 'Moins bien notés' },
  { k: 'photos', l: 'Avec photo' },
]
const reviews = computed(() => {
  const all = (p.value?.reviews ?? []).filter((r) => r.review || r.photo_key || r.rating)
  if (reviewSort.value === 'photos') return all.filter((r) => r.photo_key)
  if (reviewSort.value === 'best') return [...all].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
  if (reviewSort.value === 'worst') return [...all].sort((a, b) => (a.rating ?? 99) - (b.rating ?? 99))
  return all
})
const reviewLimit = ref(10)
watch(reviewSort, () => (reviewLimit.value = 10))
const zoom = ref('')
</script>

<template>
  <div>
    <button class="mb-4 text-sm font-semibold text-muted hover:text-hi" @click="goBack"><Icon name="back" /> Retour</button>

    <p v-if="error && !p" class="rounded-xl bg-alert px-4 py-2.5 text-sm font-semibold text-white">{{ error }}</p>
    <div v-else-if="!p" class="py-20 text-center text-muted">Chargement…</div>

    <template v-else>
      <!-- Bandeau : la photo floutée derrière, comme l'image de fond d'un film -->
      <div class="relative -mx-4 overflow-hidden">
        <div
          v-if="photo"
          class="absolute inset-0 scale-110 bg-cover bg-center opacity-35 blur-xl"
          :style="{ backgroundImage: `url(${photo})` }"
          aria-hidden="true"
        />
        <div v-else class="absolute inset-0 opacity-25" :style="{ background: `radial-gradient(circle at 25% 30%, ${cat.hex}, transparent 65%)` }" aria-hidden="true" />
        <div class="absolute inset-0 bg-gradient-to-b from-transparent via-paper/40 to-paper" aria-hidden="true" />

        <div class="relative flex gap-4 px-4 pt-4 pb-2">
          <button v-if="photo" class="shrink-0" aria-label="Agrandir la photo" @click="zoom = photo">
            <Poster :drink="p" :width="118" />
          </button>
          <Poster v-else :drink="p" :width="96" :icon="96" />
          <div class="min-w-0 flex-1 pt-1">
            <h1 class="font-display text-3xl leading-[1.05] break-words">{{ p.name }}</h1>
            <p v-if="p.maker" class="mt-1 font-semibold text-ink/90">{{ p.maker }}</p>
            <p class="mt-1 text-sm text-muted">
              <Icon :name="cat.fa" :style="{ color: cat.hex }" /> {{ cat.label }}<template v-if="p.style"> · {{ p.style }}</template><template v-if="p.origin"> · {{ p.origin }}</template>
            </p>
            <p class="text-sm text-muted">{{ fmtDrink(p) }}</p>
            <p class="mt-1 text-sm font-semibold" :class="p.units ? 'text-hi' : 'text-faint'">
              {{ p.units ? `${num(p.units)} verre${p.units >= 2 ? 's' : ''} standard` : 'Hors score' }}
            </p>
          </div>
        </div>
      </div>

      <!-- Description -->
      <div v-if="p.description" class="mt-4">
        <p class="whitespace-pre-line text-ink/90" :class="longDesc && !descOpen && 'line-clamp-5'">{{ p.description }}</p>
        <button v-if="longDesc" class="mt-1 text-sm font-semibold text-muted hover:text-ink" @click="descOpen = !descOpen">{{ descOpen ? 'Moins' : 'Lire la suite' }}</button>
      </div>

      <!-- Panneau d'actions -->
      <section class="box mt-6 divide-y divide-white/5">
        <div class="grid grid-cols-2 gap-2 p-3">
          <button class="btn btn-hi py-2.5 font-bold" @click="drinkIt"><Icon name="plus" /> {{ p.mine ? 'Encore une' : "J'en bois une" }}</button>
          <button class="btn py-2.5 font-bold" :class="p.fav ? 'bg-hi/15 text-hi' : 'btn-ghost'" :aria-pressed="p.fav" @click="toggleFav">
            <Icon name="star" :regular="!p.fav" /> {{ p.fav ? 'En favori' : 'Favori' }}
          </button>
        </div>
        <div class="flex items-center justify-between px-4 py-3 text-sm">
          <span class="text-muted">Ta note</span>
          <span v-if="p.myRating" class="flex items-center gap-2"><Stars :value="p.myRating" :size="16" /></span>
          <button v-else class="font-semibold text-hi hover:underline" @click="drinkIt">Pas encore notée</button>
        </div>
        <div class="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <span class="text-muted">Tu l'as bue</span>
          <span v-if="p.mine" class="font-bold">{{ p.mine }} fois<template v-if="p.marked"> · <Icon name="check" /></template></span>
          <!-- Pas de conso : « déjà bue » sans date ni note -->
          <button
            v-else
            class="btn px-3 py-1.5 font-bold"
            :class="p.marked ? 'bg-hi/15 text-hi' : 'btn-ghost'"
            :aria-pressed="p.marked"
            :disabled="marking"
            @click="toggleTried"
          >
            <Icon :name="p.marked ? 'check' : 'fa-circle-check'" :regular="!p.marked" /> {{ p.marked ? 'Déjà bue' : 'Je l’ai déjà bue' }}
          </button>
        </div>
        <div class="flex flex-wrap gap-2 px-3 py-3">
          <button v-if="canManage || missingInfo.length" class="btn btn-ghost px-3 py-1.5 text-sm font-semibold" @click="startEdit">
            <Icon name="edit" /> {{ canManage ? 'Modifier la fiche' : 'Compléter la fiche' }}
          </button>
          <button v-if="!p.photo_key" class="btn btn-ghost px-3 py-1.5 text-sm font-semibold" :disabled="uploading" @click="quickInput.click()">
            <Icon name="camera" /> {{ uploading ? 'Envoi…' : 'Ajouter une photo' }}
          </button>
          <input ref="quickInput" type="file" accept="image/*" class="hidden" @change="quickPhoto" />
        </div>
      </section>

      <!-- Modifier / compléter -->
      <form v-if="editing" class="box mt-4 space-y-5 p-5" @submit.prevent="saveEdit">
        <div class="flex items-center justify-between">
          <span class="text-lg font-bold">{{ canManage ? 'Modifier la fiche' : 'Compléter la fiche' }}</span>
          <button type="button" class="text-sm font-semibold text-muted hover:text-ink" @click="editing = null">Annuler</button>
        </div>
        <DrinkFields v-if="canManage" v-model="editing.drink" />
        <InfoFields v-model="editing.info" :locked="locked" />
        <p v-if="locked.length" class="text-xs text-faint">Les champs grisés sont déjà remplis : seul {{ p.created_by_name ?? "l'auteur" }} ou un admin peut les changer.</p>
        <PhotoField v-if="canManage || !p.photo_key" v-model="editing.photo" :current="photo" />
        <p v-if="error" class="rounded-xl bg-alert px-4 py-2.5 text-sm font-semibold text-white">{{ error }}</p>
        <button :disabled="!editValid" class="btn btn-hi w-full py-3 font-bold disabled:opacity-40">Enregistrer</button>
        <button v-if="canManage" type="button" class="w-full py-1 text-sm font-semibold text-muted hover:text-alert" @click="remove">Retirer de la carte</button>
      </form>

      <!-- Chiffres -->
      <section class="mt-8 grid grid-cols-3 gap-2 text-center">
        <div class="rounded-xl bg-white/5 py-3"><div class="font-display text-2xl text-hi">{{ p.logs }}</div><div class="text-xs font-semibold text-muted">consos</div></div>
        <div class="rounded-xl bg-white/5 py-3"><div class="font-display text-2xl text-hi">{{ p.drinkers }}</div><div class="text-xs font-semibold text-muted">buveurs</div></div>
        <div class="rounded-xl bg-white/5 py-3"><div class="font-display text-2xl text-hi">{{ p.favs }}</div><div class="text-xs font-semibold text-muted">en favori</div></div>
      </section>

      <!-- Notes -->
      <section class="mt-8">
        <h2 class="mb-3 border-b border-white/5 pb-2 text-lg font-bold">Notes</h2>
        <div class="flex items-end gap-5">
          <div class="flex h-16 flex-1 items-end gap-0.5" aria-hidden="true">
            <div
              v-for="(n, i) in p.hist"
              :key="i"
              class="flex-1 rounded-t-sm"
              :class="n ? 'bg-hi/60' : 'bg-white/5'"
              :style="{ height: `${Math.max(4, (n / histMax) * 64)}px` }"
              :title="`${num((i + 1) / 2)} ★ : ${n}`"
            />
          </div>
          <div class="text-center">
            <div class="font-display text-4xl text-hi">{{ p.rating ? num(p.rating / 2) : '–' }}</div>
            <div class="text-xs text-muted">{{ p.ratings }} note{{ p.ratings > 1 ? 's' : '' }}</div>
          </div>
        </div>
        <div class="mt-1 flex justify-between text-xs text-faint"><span><Icon name="fa-star-half-stroke" /></span><span>5 <Icon name="star" /></span></div>
      </section>

      <!-- Qui l'a bue -->
      <section v-if="p.people.length" class="mt-8">
        <h2 class="mb-3 border-b border-white/5 pb-2 text-lg font-bold">Tes potes l'ont bue</h2>
        <div class="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1">
          <button v-for="u in p.people" :key="u.id" class="flex w-16 shrink-0 flex-col items-center text-center" @click="openUser(u.id)">
            <Avatar :user="u" :color="colors[u.id]" :size="48" class="rounded-full" />
            <span class="mt-1 w-full truncate text-xs font-semibold">{{ u.id === me.id ? 'Toi' : u.name }}</span>
            <Stars v-if="u.rating" :value="Math.round(u.rating)" :size="9" />
            <span class="text-[10px] text-muted">{{ u.count ? `×${u.count}` : 'déjà bue' }}</span>
          </button>
        </div>
      </section>

      <!-- Avis -->
      <section class="mt-8">
        <div class="mb-1 flex items-center justify-between gap-2 border-b border-white/5 pb-2">
          <h2 class="text-lg font-bold">Avis</h2>
          <select v-model="reviewSort" class="field py-1 pr-2 pl-2 text-sm" aria-label="Trier les avis">
            <option v-for="s in REVIEW_SORTS" :key="s.k" :value="s.k">{{ s.l }}</option>
          </select>
        </div>
        <p v-if="!reviews.length" class="py-8 text-center text-sm text-muted">
          Pas encore d'avis. <button class="font-semibold text-hi hover:underline" @click="drinkIt">Note-la en la buvant</button>
        </p>
        <ul class="divide-y divide-white/5">
          <li v-for="r in reviews.slice(0, reviewLimit)" :key="r.id" class="flex gap-3 py-4">
            <button class="shrink-0" @click="openUser(r.user_id)">
              <Avatar :user="{ id: r.user_id, name: r.user_name, avatar_v: r.avatar_v }" :color="colors[r.user_id]" :size="36" class="rounded-full" />
            </button>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-x-2 text-sm">
                <button class="font-bold hover:text-hi" @click="openUser(r.user_id)">{{ r.user_id === me.id ? 'Toi' : r.user_name }}</button>
                <Stars v-if="r.rating" :value="r.rating" :size="12" />
                <span class="text-xs text-faint first-letter:uppercase">{{ prettyDay(r.day) }} · {{ timeAgo(r.at) }}<template v-if="r.place"> · <Icon name="fa-location-dot" /> {{ r.place }}</template></span>
                <button v-if="r.user_id === me.id" class="ml-auto text-xs text-muted hover:text-ink" @click="openLog({ edit: r })"><Icon name="edit" /></button>
              </div>
              <p v-if="r.review" class="mt-1.5 whitespace-pre-line text-ink/90">{{ r.review }}</p>
              <button v-if="r.photo_key" class="mt-2 block" aria-label="Agrandir la photo" @click="zoom = photoUrl(r.photo_key)">
                <img :src="photoUrl(r.photo_key)" alt="" loading="lazy" class="max-h-56 rounded-lg" />
              </button>
            </div>
          </li>
        </ul>
        <button v-if="reviews.length > reviewLimit" class="btn btn-ghost mt-2 w-full py-2.5 text-sm font-semibold" @click="reviewLimit += 10">
          Voir plus d'avis
        </button>
        <p class="mt-2 text-xs text-faint">Avis des membres de tes bandes.</p>
      </section>

      <!-- Même genre -->
      <section v-if="p.similar.length" class="mt-8">
        <h2 class="mb-3 border-b border-white/5 pb-2 text-lg font-bold">Dans le même genre</h2>
        <div class="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
          <button v-for="s in p.similar" :key="s.id" class="lift w-20 shrink-0 text-left" @click="openProduct(s.id)">
            <Poster :drink="s" :width="80" fluid />
            <span class="mt-1 block truncate text-xs font-semibold">{{ s.name }}</span>
            <Stars v-if="s.rating" :value="Math.round(s.rating)" :size="9" />
          </button>
        </div>
      </section>

      <p v-if="p.created_by_name" class="mt-8 text-xs text-faint">Ajoutée à la carte par {{ p.created_by === me.id ? 'toi' : p.created_by_name }}.</p>
    </template>

    <Teleport to="body">
      <div v-if="zoom" class="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4" @click="zoom = ''">
        <img :src="zoom" alt="" class="max-h-full max-w-full rounded-lg" />
      </div>
    </Teleport>
  </div>
</template>
