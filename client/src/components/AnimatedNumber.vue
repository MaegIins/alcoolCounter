<script setup>
// Nombre qui défile jusqu'à sa nouvelle valeur (compteur de bar).
import { ref, watch, onBeforeUnmount } from 'vue'
import { num } from '../api'

const props = defineProps({ value: { type: Number, required: true }, duration: { type: Number, default: 600 }, int: Boolean })
const shown = ref(props.value)
let raf = 0
watch(() => props.value, (to) => {
  cancelAnimationFrame(raf)
  const from = shown.value
  const t0 = performance.now()
  const step = (t) => {
    const k = Math.min(1, (t - t0) / props.duration)
    shown.value = from + (to - from) * (1 - (1 - k) ** 3)
    if (k < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
})
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <span>{{ int ? Math.round(shown) : num(shown) }}</span>
</template>
