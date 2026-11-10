<script setup>
// Choisir un produit de la carte (pour le top 4). Émet pick(produit) ou close.
import { ref, computed, onMounted, nextTick } from 'vue'
import { api, catOf } from '../api'
import Poster from './Poster.vue'
import Icon from './Icon.vue'
import DrinkSpec from './DrinkSpec.vue'

const props = defineProps({ title: { type: String, default: 'Choisir une boisson' }, exclude: { type: Array, default: () => [] } })
const emit = defineEmits(['pick', 'close'])

const products = ref([])
const query = ref('')
const input = ref(null)
onMounted(async () => {
  await nextTick()
  input.value?.focus({ preventScroll: true })
  products.value = await api('/products').catch(() => [])
})
const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const shown = computed(() => {
  const q = norm(query.value.trim())
  return products.value.filter((p) => !props.exclude.includes(p.id) && (!q || norm(p.name).includes(q))).slice(0, 60)
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 sm:items-center sm:p-4" @click.self="emit('close')">
      <div class="sheet-panel flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-xl bg-panel sm:rounded-xl" role="dialog" aria-modal="true" :aria-label="title">
        <div class="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <button class="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-raised hover:text-ink" aria-label="Fermer" @click="emit('close')">
            <Icon name="close" :size="20" />
          </button>
          <h2 class="flex-1 text-center font-semibold">{{ title }}</h2>
          <span class="w-9" />
        </div>
        <div class="p-3">
          <input ref="input" v-model="query" type="search" placeholder="Chercher sur la carte…" class="field w-full px-3.5 py-2.5" />
        </div>
        <ul class="overflow-y-auto pb-3">
          <li v-for="p in shown" :key="p.id">
            <button class="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-raised" @click="emit('pick', p)">
              <Poster :drink="p" :width="34" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-semibold">{{ p.name }}</span>
                <span class="text-sm text-muted">{{ catOf(p.cat).label }} · <DrinkSpec :d="p" product /></span>
              </span>
            </button>
          </li>
          <li v-if="!shown.length" class="px-4 py-8 text-center text-sm text-muted">
            Rien sur la carte. Ajoute la boisson depuis l'onglet Carte.
          </li>
        </ul>
      </div>
    </div>
  </Teleport>
</template>
