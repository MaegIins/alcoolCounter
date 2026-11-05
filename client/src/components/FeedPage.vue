<script setup>
// Activité : les dernières consos de la bande (ou les miennes en solo), notes, avis et photos.
import { ref, watch } from 'vue'
import { api } from '../api'
import { ui, openLog } from '../nav'
import LogCard from './LogCard.vue'

const props = defineProps({ me: Object, colors: Object, solo: Boolean })
const emit = defineEmits(['groups'])

const items = ref([])
const next = ref(null)
const loaded = ref(false)
const loadingMore = ref(false)

async function load() {
  const feed = await api('/feed?limit=20').catch(() => null)
  if (feed) {
    items.value = feed.items
    next.value = feed.next
  }
  loaded.value = true
}
watch(() => ui.refresh, load, { immediate: true })

async function more() {
  loadingMore.value = true
  try {
    const feed = await api(`/feed?limit=20&before=${next.value}`)
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
      <h2 class="font-display text-2xl">{{ solo ? 'Mon activité' : 'Activité de la bande' }}</h2>
      <p class="mt-1 mb-2 text-sm text-muted">Les derniers verres, avec les notes, les avis et les photos. Touche une boisson pour sa fiche.</p>
      <div v-if="loaded && !items.length" class="py-12 text-center">
        <p class="text-muted">Rien pour l'instant.</p>
        <button class="mt-3 font-semibold text-hi hover:underline" @click="openLog()">Ajoute ton premier verre</button>
      </div>
      <TransitionGroup tag="div" name="item" class="divide-y divide-white/5">
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
