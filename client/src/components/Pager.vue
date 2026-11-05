<script setup>
// Pagination : ‹ 1 … 4 5 6 … 12 ›. v-model = page courante (à partir de 1).
import { computed } from 'vue'
import Icon from './Icon.vue'

const page = defineModel({ type: Number, required: true })
const props = defineProps({ pages: { type: Number, required: true }, label: { type: String, default: 'Pages' } })
const emit = defineEmits(['change'])

const go = (n) => {
  page.value = Math.min(props.pages, Math.max(1, n))
  emit('change', page.value)
}
const nums = computed(() => {
  const n = props.pages
  const c = page.value
  const set = [...new Set([1, c - 1, c, c + 1, n])].filter((x) => x >= 1 && x <= n).sort((a, b) => a - b)
  return set.flatMap((x, i) => (i && x - set[i - 1] > 1 ? ['…', x] : [x]))
})
</script>

<template>
  <nav v-if="pages > 1" class="flex items-center justify-center gap-1.5" :aria-label="label">
    <button class="h-10 w-10 rounded-full bg-white/5 text-lg font-bold hover:bg-white/10 disabled:opacity-30" :disabled="page === 1" aria-label="Page précédente" @click="go(page - 1)"><Icon name="prev" /></button>
    <template v-for="(n, i) in nums" :key="i">
      <span v-if="n === '…'" class="w-6 text-center text-muted">…</span>
      <button
        v-else
        class="h-10 min-w-10 rounded-full px-2 font-bold tabular-nums"
        :class="n === page ? 'bg-hi text-[#17140a]' : 'bg-white/5 hover:bg-white/10'"
        :aria-current="n === page ? 'page' : undefined"
        @click="go(n)"
      >
        {{ n }}
      </button>
    </template>
    <button class="h-10 w-10 rounded-full bg-white/5 text-lg font-bold hover:bg-white/10 disabled:opacity-30" :disabled="page === pages" aria-label="Page suivante" @click="go(page + 1)"><Icon name="more" /></button>
  </nav>
</template>
