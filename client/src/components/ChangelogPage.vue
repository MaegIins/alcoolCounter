<script setup>
// Nouveautés (Réglages › Nouveautés) : ce qui a changé dans l'appli, du plus récent au plus ancien.
// L'ouvrir éteint le point « nouveau » (les entrées pas encore vues restent marquées le temps de la visite).
import { onMounted } from 'vue'
import { CHANGELOG, seenAtStart as seenBefore, markSeen } from '../changelog'
import { goBack } from '../nav'
import Icon from './Icon.vue'

onMounted(markSeen)
const dateLabel = (d) => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <button class="mb-4 text-sm font-semibold text-muted hover:text-hi" @click="goBack"><Icon name="back" /> Retour</button>
    <h2 class="font-display text-2xl">Nouveautés</h2>
    <p class="mt-1 text-sm text-muted">Ce qui a changé dans L’Ardoise.</p>
    <ol class="mt-6 space-y-8">
      <li v-for="e in CHANGELOG" :key="e.date" class="relative border-l-2 pl-5" :class="e.date > seenBefore ? 'border-hi' : 'border-line'">
        <span class="absolute top-1.5 -left-[7px] h-3 w-3 rounded-full" :class="e.date > seenBefore ? 'bg-hi' : 'bg-line'" />
        <div class="flex flex-wrap items-baseline gap-x-3">
          <h3 class="text-lg font-bold">{{ e.title }}</h3>
          <span class="text-sm text-faint first-letter:uppercase">{{ dateLabel(e.date) }}</span>
          <span v-if="e.date > seenBefore" class="rounded-full bg-hi px-2 text-xs font-bold text-paper uppercase">nouveau</span>
        </div>
        <ul class="mt-2 space-y-1.5 text-sm">
          <li v-for="(it, i) in e.items" :key="i" class="flex gap-2"><span class="text-hi">•</span><span>{{ it }}</span></li>
        </ul>
      </li>
    </ol>
  </div>
</template>
