<script setup>
// Recherche (loupe de l'en-tête) : des personnes, même hors de ta bande, et des boissons de la carte.
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { api, catOf, fmtProduct } from '../api'
import { openUser, openProduct, openPlace } from '../nav'
import Avatar from './Avatar.vue'
import Poster from './Poster.vue'
import Stars from './Stars.vue'
import Icon from './Icon.vue'

defineProps({ colors: { type: Object, default: () => ({}) } })
const emit = defineEmits(['close'])

const q = ref('')
const res = ref({ users: [], products: [] })
const loading = ref(false)
const input = ref(null)
let timer, seq = 0
watch(q, (v) => {
  clearTimeout(timer)
  if (!v.trim()) return (res.value = { users: [], products: [] })
  loading.value = true
  timer = setTimeout(async () => {
    const s = ++seq
    const r = await api(`/search?q=${encodeURIComponent(v.trim())}`).catch(() => null)
    if (s !== seq) return
    if (r) res.value = r
    loading.value = false
  }, 200)
})

function goUser(id) {
  emit('close')
  openUser(id)
}
function goPlace(id) {
  emit('close')
  openPlace(id)
}
function goProduct(id) {
  emit('close')
  openProduct(id)
}
const onKey = (e) => e.key === 'Escape' && emit('close')
onMounted(async () => {
  document.addEventListener('keydown', onKey)
  document.body.style.overflow = 'hidden'
  await nextTick()
  input.value?.focus({ preventScroll: true })
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
  clearTimeout(timer)
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 backdrop-blur-sm sm:p-4" @click.self="emit('close')">
      <div class="sheet-panel box flex max-h-[100dvh] w-full max-w-lg flex-col rounded-none sm:mt-12 sm:max-h-[80vh] sm:rounded-[.6rem]" role="dialog" aria-modal="true" aria-label="Recherche">
        <div class="flex items-center gap-2 border-b border-white/5 p-3">
          <label class="relative min-w-0 flex-1">
            <Icon name="search" class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
            <input
              ref="input"
              v-model="q"
              type="search"
              placeholder="Une personne, une boisson…"
              class="field w-full py-3 pr-4 pl-11 text-base"
              aria-label="Rechercher"
            />
          </label>
          <button class="shrink-0 px-2 text-sm font-semibold text-muted hover:text-ink" @click="emit('close')">Fermer</button>
        </div>

        <div class="overflow-y-auto pb-4">
          <p v-if="!q.trim()" class="px-5 py-10 text-center text-sm text-muted">
            Cherche un pote (même hors de ta bande), une boisson (nom ou producteur) ou un lieu.
          </p>
          <template v-else>
            <section v-if="res.users.length">
              <h3 class="kicker px-5 pt-4 pb-1">Personnes</h3>
              <button v-for="u in res.users" :key="u.id" class="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-white/5" @click="goUser(u.id)">
                <Avatar :user="u" :color="colors[u.id]" :size="40" class="rounded-full" />
                <span class="min-w-0 flex-1 truncate font-bold">{{ u.name }}</span>
                <span v-if="u.me" class="text-xs font-semibold text-hi">toi</span>
                <span v-else-if="u.inBand" class="text-xs text-muted">dans ta bande</span>
              </button>
            </section>
            <section v-if="res.places?.length">
              <h3 class="kicker px-5 pt-4 pb-1">Lieux</h3>
              <button v-for="pl in res.places" :key="pl.id" class="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-white/5" @click="goPlace(pl.id)">
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-hi">
                  <Icon :name="pl.home ? 'fa-house' : pl.private ? 'lock' : 'fa-location-dot'" />
                </span>
                <span class="min-w-0 flex-1 truncate font-bold">{{ pl.name }}</span>
                <span class="text-xs text-muted">{{ pl.logs }} conso{{ pl.logs > 1 ? 's' : '' }}</span>
              </button>
            </section>
            <section v-if="res.products.length">
              <h3 class="kicker px-5 pt-4 pb-1">Boissons</h3>
              <button v-for="p in res.products" :key="p.id" class="flex w-full items-center gap-3 px-5 py-2 text-left hover:bg-white/5" @click="goProduct(p.id)">
                <Poster :drink="p" :width="36" :icon="40" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-bold">{{ p.name }}</span>
                  <span class="flex items-center gap-2 text-sm text-muted">
                    <span class="truncate">{{ p.maker || catOf(p.cat).label }} · {{ fmtProduct(p) }}</span>
                    <Stars v-if="p.rating" :value="Math.round(p.rating)" :size="10" />
                  </span>
                </span>
              </button>
            </section>
            <p v-if="!loading && !res.users.length && !res.products.length && !res.places?.length" class="px-5 py-10 text-center text-sm text-muted">
              Personne ni aucune boisson pour « {{ q.trim() }} ».
            </p>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
