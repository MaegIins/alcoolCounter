<script setup>
// Fenêtre de confirmation de l'appli (pilotée par ask() dans juice.js).
import { watch, nextTick, ref } from 'vue'
import { dialog, answer } from '../juice'

const okBtn = ref(null)
const onKey = (e) => {
  if (e.key === 'Escape') answer(false)
}
watch(
  () => dialog.open,
  async (open) => {
    if (open) {
      document.addEventListener('keydown', onKey)
      await nextTick()
      okBtn.value?.focus()
    } else document.removeEventListener('keydown', onKey)
  }
)
</script>

<template>
  <Transition name="sheet">
    <div
      v-if="dialog.open"
      class="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      @click.self="answer(false)"
    >
      <div class="sheet-panel box w-full max-w-sm p-6 text-center" role="alertdialog" aria-modal="true" :aria-label="dialog.title">
        <div v-if="dialog.icon" class="mb-2 text-4xl">{{ dialog.icon }}</div>
        <h2 class="text-xl font-bold">{{ dialog.title }}</h2>
        <p v-if="dialog.message" class="mt-2 text-muted">{{ dialog.message }}</p>
        <div class="mt-6 flex gap-3">
          <button class="btn flex-1 bg-white/5 py-3 font-bold hover:bg-white/10" @click="answer(false)">{{ dialog.cancel }}</button>
          <button
            ref="okBtn"
            class="btn flex-1 py-3 font-bold"
            :class="dialog.danger ? 'bg-alert text-white' : 'btn-hi'"
            @click="answer(true)"
          >
            {{ dialog.confirm }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
