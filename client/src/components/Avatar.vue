<script setup>
// Avatar d'une personne, avec un anneau de la couleur de son palier de succès (sauf le premier, et sauf ring = false)
import { computed } from 'vue'
import { rankFor, titleFor } from '../ranks'

const props = defineProps({
  user: { type: Object, required: true },
  color: { type: String, default: '#8a8578' },
  size: { type: Number, default: 36 },
  ring: { type: Boolean, default: true },
})
const rank = computed(() => (props.ring ? rankFor(props.user.id) : null))
const tip = computed(() => (titleFor(props.user.id) ? `${props.user.name} · ${titleFor(props.user.id)}` : undefined))
// Anneau en ombre portée : ne change pas la taille ni la mise en page
const style = computed(() => {
  const w = props.size >= 64 ? 3 : 2
  return {
    width: `${props.size}px`,
    height: `${props.size}px`,
    ...(rank.value?.i > 0 && { boxShadow: `0 0 0 1px var(--color-paper), 0 0 0 ${w + 1}px ${rank.value.color}` }),
  }
})
</script>

<template>
  <img
    v-if="user.avatar_v"
    :src="`/api/avatar/${user.id}?v=${user.avatar_v}`"
    :alt="user.name"
    :title="tip"
    :style="style"
    class="shrink-0 rounded-full border border-line object-cover"
  />
  <span
    v-else
    :title="tip"
    :style="{ ...style, background: color, fontSize: `${size * 0.45}px` }"
    class="flex shrink-0 items-center justify-center rounded-full border border-line font-display text-paper uppercase"
  >
    {{ [...user.name][0] }}
  </span>
</template>
