<script setup>
// Note en demi-étoiles (valeur 1 à 10, 0/null = pas de note).
// Lecture seule par défaut ; avec `editable`, chaque étoile a deux moitiés cliquables, et retaper la même note l'efface.
import { computed } from 'vue'

const model = defineModel({ type: Number, default: null })
const props = defineProps({
  value: { type: Number, default: null }, // lecture seule : prioritaire sur v-model
  editable: Boolean,
  size: { type: Number, default: 14 },
  color: { type: String, default: '#d4bc35' },
})
const v = computed(() => (props.editable ? model.value : props.value ?? model.value) || 0)
const fillOf = (i) => Math.max(0, Math.min(1, (v.value - i * 2) / 2)) // 0, 0,5 ou 1 pour l'étoile i
const set = (n) => (model.value = model.value === n ? null : n)
const STAR = 'M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.3l6.6-.8z'
</script>

<template>
  <span class="inline-flex items-center" :class="editable ? 'gap-1' : 'gap-px'" :aria-label="v ? `${v / 2} sur 5` : 'Pas de note'" role="img">
    <span v-for="i in editable ? 5 : Math.ceil(v / 2)" :key="i" class="relative inline-block" :style="{ width: `${size}px`, height: `${size}px` }">
      <svg :width="size" :height="size" viewBox="0 0 24 24" class="absolute inset-0">
        <path :d="STAR" :fill="editable ? '#2c281c' : 'none'" />
      </svg>
      <svg :width="size" :height="size" viewBox="0 0 24 24" class="absolute inset-0" :style="{ clipPath: `inset(0 ${(1 - fillOf(i - 1)) * 100}% 0 0)` }">
        <path :d="STAR" :fill="color" />
      </svg>
      <template v-if="editable">
        <button type="button" class="absolute inset-y-0 left-0 w-1/2" :aria-label="`${i - 0.5} étoiles`" @click="set(i * 2 - 1)" />
        <button type="button" class="absolute inset-y-0 right-0 w-1/2" :aria-label="`${i} étoile${i > 1 ? 's' : ''}`" @click="set(i * 2)" />
      </template>
    </span>
  </span>
</template>
