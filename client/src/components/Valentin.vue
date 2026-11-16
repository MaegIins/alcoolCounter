<script setup>
// Saint-Valentin (14 février) : des cœurs tombent, dont quelques-uns brisés (ceux qui sont au comptoir).
// Décoratif : aria-hidden, aucun clic.
let seed = 1402
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
const REDS = ['#c43c5a', '#a33447', '#b8432c', '#d0708a']
const hearts = Array.from({ length: 20 }, () => ({
  x: rnd() * 100,
  s: 10 + rnd() * 10,
  color: REDS[Math.floor(rnd() * REDS.length)],
  o: 0.25 + rnd() * 0.3,
  dur: 10 + rnd() * 9,
  delay: -rnd() * 19,
  drift: (rnd() - 0.5) * 100,
  spin: (rnd() - 0.5) * 120, // ils tanguent, ils ne tournent pas en hélice
  broken: rnd() < 0.25,
}))
const HEART = 'M0 9 C-12 1 -11 -9 -5 -9 C-2 -9 0 -6 0 -6 C0 -6 2 -9 5 -9 C11 -9 12 1 0 9 Z'
</script>

<template>
  <div class="vl-fx pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
    <svg
      v-for="(h, i) in hearts"
      :key="i"
      class="vl-heart absolute"
      :width="h.s"
      :height="h.s"
      viewBox="-12 -11 24 22"
      :style="{ left: `${h.x}%`, opacity: h.o, '--drift': `${h.drift}px`, '--spin': `${h.spin}deg`, animationDuration: `${h.dur}s`, animationDelay: `${h.delay}s` }"
    >
      <path :d="HEART" :fill="h.color" />
      <path v-if="h.broken" d="M0 -6 L-2 -2 L2 1 L-1 4 L0 9" fill="none" stroke="#100f0a" stroke-width="1.6" stroke-linejoin="round" />
    </svg>
  </div>
</template>
