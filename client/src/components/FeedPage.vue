<script setup>
// Activité : les dernières consos de la bande (ou les miennes en solo), notes, avis et photos.
import { ref, watch } from 'vue'
import { api } from '../api'
import { ui, openLog } from '../nav'
import LogCard from './LogCard.vue'

const props = defineProps({ me: Object, colors: Object, solo: Boolean })
// Fil de la bande, ou des gens que je suis (retenu sur l'appareil ; en solo, les abonnements)
const scope = ref((() => { try { return localStorage.getItem('feed-scope') || 'band' } catch { return 'band' } })())
if (props.solo) scope.value = 'follow'
const q = () => (scope.value === 'follow' ? '&scope=follow' : '')
const emit = defineEmits(['groups'])

const items = ref([])
const next = ref(null)
const loaded = ref(false)
const loadingMore = ref(false)

async function load() {
  const feed = await api(`/feed?limit=20${q()}`).catch(() => null)
  if (feed) {
    items.value = feed.items
    next.value = feed.next
  }
  loaded.value = true
}
watch(() => ui.refresh, load, { immediate: true })
watch(scope, (v) => {
  try { localStorage.setItem('feed-scope', v) } catch {}
  load()
})

async function more() {
  loadingMore.value = true
  try {
    const feed = await api(`/feed?limit=20&before=${next.value}${q()}`)
    items.value = [...items.value, ...feed.items]
    next.value = feed.next
  } finally {
    loadingMore.value = false
  }
}

</script>

<template>
  <div class="space-y-8">

    <!-- Activité -->
    <section>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-2xl">Activité</h2>
        <div class="flex rounded-full bg-white/5 p-1">
          <button v-if="!solo" class="seg" :aria-pressed="scope === 'band'" @click="scope = 'band'">Ma bande</button>
          <button class="seg" :aria-pressed="scope === 'follow'" @click="scope = 'follow'">Abonnements</button>
        </div>
      </div>
      <p class="mt-1 mb-2 text-sm text-muted">Les derniers verres, avec les notes, les avis et les photos. Touche une boisson pour sa fiche.<template v-if="scope === 'follow'"> Suis des gens depuis la recherche ou leur profil.</template></p>
      <div v-if="loaded && !items.length" class="py-12 text-center">
        <p class="text-muted">Rien pour l'instant.</p>
        <button class="mt-3 font-semibold text-hi hover:underline" @click="openLog()">Ajoute ton premier verre</button>
      </div>
      <TransitionGroup tag="div" name="item" class="divide-y divide-white/5 lg:grid lg:grid-cols-2 lg:gap-x-10 lg:divide-y-0 lg:[&>*]:border-b lg:[&>*]:border-white/5">
        <LogCard v-for="l in items" :key="l.id" :log="l" :me="me" :colors="colors" />
      </TransitionGroup>
      <button v-if="next" class="btn btn-ghost mt-4 w-full py-2.5 text-sm font-medium" :disabled="loadingMore" @click="more">
        {{ loadingMore ? 'Chargement…' : 'Voir plus' }}
      </button>
      <p v-if="solo && items.length" class="mt-6 text-center text-sm text-faint">
        Dans une bande, tu verrais aussi ce que boivent tes potes.
      </p>
    </section>
  </div>
</template>
