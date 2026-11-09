<script setup>
// Choix de la source d'une photo : appareil photo ou galerie. Remplace un <input type="file"> caché :
//   <PhotoSource ref="input" @change="onFile" />   puis   input.value.click()
// L'événement `change` est celui de l'input (e.target.files, e.target.value = '' marchent pareil).
// Sur PC (pas d'écran tactile) : pas de menu, on ouvre directement le sélecteur de fichiers.
import { ref } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({ facing: { type: String, default: 'environment' } }) // 'user' = caméra frontale (selfie)
const emit = defineEmits(['change'])
const open = ref(false)
const camera = ref(null)
const gallery = ref(null)

const touch = () => window.matchMedia?.('(pointer: coarse)').matches
function click() {
  if (touch()) open.value = true
  else gallery.value.click()
}
function pick(which) {
  open.value = false
  ;(which === 'camera' ? camera : gallery).value.click()
}
defineExpose({ click })
</script>

<template>
  <input ref="camera" type="file" accept="image/*" :capture="props.facing" class="hidden" @change="emit('change', $event)" />
  <input ref="gallery" type="file" accept="image/*" class="hidden" @change="emit('change', $event)" />
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" @click.self="open = false">
      <div class="sheet-panel box w-full max-w-md rounded-b-none p-3 sm:rounded-b-[.6rem]" role="dialog" aria-modal="true" aria-label="Ajouter une photo">
        <button type="button" class="flex w-full items-center gap-3 rounded-lg px-4 py-3.5 text-left font-semibold hover:bg-white/10" @click="pick('camera')">
          <Icon name="camera" :size="20" class="w-6 text-hi" /> Prendre une photo
        </button>
        <button type="button" class="flex w-full items-center gap-3 rounded-lg px-4 py-3.5 text-left font-semibold hover:bg-white/10" @click="pick('gallery')">
          <Icon name="fa-images" :size="20" class="w-6 text-hi" /> Choisir dans la galerie
        </button>
        <button type="button" class="mt-1 w-full rounded-lg px-4 py-3 font-semibold text-muted hover:bg-white/10 hover:text-ink" @click="open = false">Annuler</button>
      </div>
    </div>
  </Teleport>
</template>
