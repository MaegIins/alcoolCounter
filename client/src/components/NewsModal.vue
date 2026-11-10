<script setup>
// « Quoi de neuf ? » à l'arrivée : les nouveautés pas encore vues sur cet appareil (la dernière seulement si on
// n'a jamais rien vu, pour ne pas déverser tout l'historique). Fermer = vu ; tout l'historique reste dans Réglages.
import { computed } from 'vue'
import { CHANGELOG, seenAtStart, markSeen } from '../changelog'
import { go } from '../nav'
import Icon from './Icon.vue'

const emit = defineEmits(['close'])
const entries = computed(() => (seenAtStart ? CHANGELOG.filter((e) => e.date > seenAtStart) : CHANGELOG.slice(0, 1)))
const dateLabel = (d) => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}
function close() {
  markSeen()
  emit('close')
}
function all() {
  close()
  go('nouveautes')
}
</script>

<template>
  <div class="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center" @click.self="close">
    <div class="box flex max-h-full w-full max-w-md flex-col p-6" role="dialog" aria-modal="true" aria-labelledby="news-title">
      <h2 id="news-title" class="font-display text-2xl"><Icon name="fa-wand-magic-sparkles" class="text-hi" /> Quoi de neuf ?</h2>
      <div class="mt-4 min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
        <section v-for="e in entries" :key="e.date">
          <h3 class="font-bold">{{ e.title }} <span class="text-sm font-normal text-faint">· {{ dateLabel(e.date) }}</span></h3>
          <ul class="mt-2 space-y-1.5 text-sm">
            <li v-for="(it, i) in e.items" :key="i" class="flex gap-2"><span class="text-hi">•</span><span>{{ it }}</span></li>
          </ul>
        </section>
      </div>
      <button class="btn btn-hi mt-6 w-full py-3 font-bold" @click="close">C’est noté</button>
      <button class="mt-2 w-full py-2 text-sm font-semibold text-muted hover:text-ink" @click="all">Tout l’historique</button>
    </div>
  </div>
</template>
