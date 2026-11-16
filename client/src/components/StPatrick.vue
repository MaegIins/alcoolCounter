<script setup>
// Thème de la Saint-Patrick (17 mars) : tout vire au vert (voir style.css), des trèfles tombent,
// et un arc-en-ciel délavé passe derrière le logo. Décoratif : aria-hidden, aucun clic.
let seed = 1703
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
const GREENS = ['#8fbf4a', '#5f9a3a', '#3f6b2a', '#a8c86a']
const clovers = Array.from({ length: 22 }, () => ({
  x: rnd() * 100,
  s: 9 + rnd() * 9,
  color: GREENS[Math.floor(rnd() * GREENS.length)],
  o: 0.25 + rnd() * 0.35,
  dur: 10 + rnd() * 9,
  delay: -rnd() * 19,
  drift: (rnd() - 0.5) * 120,
  spin: 180 + rnd() * 540,
  four: rnd() < 0.08, // un trèfle à quatre feuilles de temps en temps
}))
</script>

<template>
  <!-- Arc-en-ciel délavé en haut à gauche, derrière le logo -->
  <svg class="pointer-events-none absolute top-2 left-0 h-28 w-48 opacity-[.1] sm:h-36 sm:w-60" viewBox="0 0 320 192" aria-hidden="true">
    <g fill="none" stroke-width="9">
      <path v-for="(c, i) in ['#c43c2a', '#c4703a', '#d4bc35', '#739b4f', '#6f93ad', '#9277a8']" :key="i" :d="`M${-40 + i * 10},190 A${200 - i * 10},${170 - i * 10} 0 0 1 ${360 - i * 10},190`" :stroke="c" />
    </g>
  </svg>

  <!-- Trèfles qui tombent -->
  <div class="sp-fall pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
    <svg
      v-for="(c, i) in clovers"
      :key="i"
      class="sp-clover absolute"
      :width="c.s"
      :height="c.s"
      viewBox="-12 -12 24 24"
      :style="{ left: `${c.x}%`, opacity: c.o, '--drift': `${c.drift}px`, '--spin': `${c.spin}deg`, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }"
    >
      <g :fill="c.color">
        <template v-if="c.four">
          <circle cx="-4" cy="-4" r="4.3" /><circle cx="4" cy="-4" r="4.3" /><circle cx="-4" cy="4" r="4.3" /><circle cx="4" cy="4" r="4.3" />
        </template>
        <template v-else>
          <circle cx="0" cy="-5" r="4.6" /><circle cx="-5" cy="2" r="4.6" /><circle cx="5" cy="2" r="4.6" />
        </template>
        <path d="M0 2 Q1 8 4 11" fill="none" :stroke="c.color" stroke-width="1.8" stroke-linecap="round" />
      </g>
    </svg>
  </div>
</template>
