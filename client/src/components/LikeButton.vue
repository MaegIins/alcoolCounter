<script setup>
// ♥ sur une conso (ou un commentaire, kind = 'comments') : bascule tout de suite (optimiste), corrige avec la réponse du serveur.
import { ref, watch } from 'vue'
import { api } from '../api'
import { toast, vibrate } from '../juice'
import Icon from './Icon.vue'

const props = defineProps({
  log: { type: Object, required: true }, // { id, likes, liked }
  kind: { type: String, default: 'drinks' }, // 'drinks' | 'comments'
  big: Boolean,
  tiny: Boolean, // commentaire : juste le cœur, le compteur est affiché à part
})
const emit = defineEmits(['change'])
const likes = ref(props.log.likes ?? 0)
const liked = ref(!!props.log.liked)
watch(() => [props.log.likes, props.log.liked], ([n, l]) => {
  likes.value = n ?? 0
  liked.value = !!l
})
const pop = ref(false)
let busy = false

async function toggle() {
  if (busy) return
  busy = true
  const was = liked.value
  liked.value = !was
  likes.value += was ? -1 : 1
  if (!was) {
    vibrate(15)
    pop.value = true
    setTimeout(() => (pop.value = false), 300)
  }
  try {
    const r = await api(`/${props.kind}/${props.log.id}/like`, { method: was ? 'DELETE' : 'PUT' })
    likes.value = r.likes
    liked.value = r.liked
    emit('change', r)
  } catch (e) {
    liked.value = was
    likes.value += was ? 1 : -1
    toast(e.message)
  } finally {
    busy = false
  }
}
</script>

<template>
  <button
    class="flex items-center gap-1.5 font-medium transition-colors"
    :class="[liked ? 'text-neon' : 'text-faint hover:text-ink', big ? 'text-base' : tiny ? 'text-xs' : 'text-sm']"
    :aria-pressed="liked"
    :aria-label="liked ? 'Retirer mon like' : 'Liker'"
    @click="toggle"
  >
    <Icon name="fa-heart" :regular="!liked" :size="big ? 20 : 0" class="transition-transform duration-200" :class="pop && 'scale-150'" />
    <span v-if="likes && !tiny" class="tabular-nums">{{ likes }}</span>
  </button>
</template>
