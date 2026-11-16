<script setup>
// Thème du Nouvel An (soirée du 31 décembre) : feux d'artifice derrière le contenu, confettis qui tombent,
// et les 10 dernières secondes avant minuit en grand au milieu de l'écran. Décoratif : aria-hidden, aucun clic
// (sauf le décompte final, annoncé aux lecteurs d'écran).
import { finalCountdown, justStruck, midnight } from '../season'
import Fireworks from './Fireworks.vue'

// Pseudo-aléatoire à graine fixe : les mêmes confettis à chaque visite
let seed = 3112
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

const COLORS = ['#d4bc35', '#c43c2a', '#6f93ad', '#739b4f', '#9277a8', '#e4dcc3']
// Bouquets dorés et colorés en alternance
const FIREWORKS = ['#d4bc35', '#c43c2a', '#e4dcc3', '#6f93ad', '#c79a6b', '#739b4f']
const confetti = Array.from({ length: 30 }, () => ({
  x: rnd() * 100,
  w: 3 + rnd() * 3,
  h: 6 + rnd() * 5,
  color: COLORS[Math.floor(rnd() * COLORS.length)],
  o: 0.3 + rnd() * 0.35,
  dur: 8 + rnd() * 9,
  delay: -rnd() * 17,
  drift: (rnd() - 0.5) * 120,
  spin: 360 + rnd() * 720,
}))
</script>

<template>
  <Fireworks :colors="FIREWORKS" />

  <!-- Confettis, au-dessus du contenu mais discrets -->
  <div class="nya-fx pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
    <span
      v-for="(c, i) in confetti"
      :key="i"
      class="nya-confetti absolute"
      :style="{ left: `${c.x}%`, width: `${c.w}px`, height: `${c.h}px`, background: c.color, opacity: c.o, '--drift': `${c.drift}px`, '--spin': `${c.spin}deg`, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }"
    />
  </div>

  <!-- Décompte final, puis « Bonne année » -->
  <div v-if="finalCountdown || justStruck" class="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center" role="status">
    <span v-if="finalCountdown" :key="finalCountdown" class="nya-count font-drip text-[9rem] leading-none text-hi">{{ finalCountdown }}</span>
    <span v-else class="nya-count px-4 text-center font-drip text-6xl leading-tight text-hi sm:text-8xl">Bonne année<br />{{ midnight.getFullYear() }} !</span>
  </div>
</template>
