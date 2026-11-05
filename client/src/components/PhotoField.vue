<script setup>
// Choisir une photo (réduite dans le navigateur). v-model : undefined = inchangée, null = retirée, data URL = nouvelle.
// `current` = URL de la photo déjà en place (affichée tant qu'on n'y touche pas).
import { ref, computed } from 'vue'
import { resizePhoto } from '../api'
import Icon from './Icon.vue'

const photo = defineModel({ type: [String, null], default: undefined })
const props = defineProps({ current: { type: String, default: '' }, label: { type: String, default: 'Photo' } })
const error = ref('')
const input = ref(null)
const shown = computed(() => (photo.value === undefined ? props.current : photo.value || ''))

async function onFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  error.value = ''
  try {
    photo.value = await resizePhoto(file, 600)
  } catch (err) {
    error.value = err.message || 'Image illisible'
  }
}
</script>

<template>
  <div>
    <div class="flex items-center gap-3">
      <img v-if="shown" :src="shown" alt="" class="h-20 w-14 rounded object-cover ring-1 ring-black/50" />
      <button type="button" class="btn btn-ghost px-3 py-2 text-sm font-semibold" @click="input.click()">
        <Icon name="camera" /> {{ shown ? 'Changer la photo' : label }}
      </button>
      <button v-if="shown" type="button" class="text-sm font-semibold text-muted hover:text-alert" @click="photo = props.current ? null : undefined">
        Retirer
      </button>
      <input ref="input" type="file" accept="image/*" class="hidden" @change="onFile" />
    </div>
    <p v-if="error" class="mt-2 text-sm font-semibold text-alert">{{ error }}</p>
  </div>
</template>
