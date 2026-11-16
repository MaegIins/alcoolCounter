<script setup>
// 1er avril : quelques poissons en papier traversent l'écran lentement, derrière le contenu
// (le logo mal écrit et la fausse règle sont dans App.vue et season.js). Décoratif : aria-hidden, aucun clic.
let seed = 401
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
const COLORS = ['#6f93ad', '#c4703a', '#739b4f', '#d4bc35']
const fish = Array.from({ length: 4 }, (_, i) => ({
  y: 15 + rnd() * 65,
  s: 34 + rnd() * 18,
  color: COLORS[i % COLORS.length],
  dur: 22 + rnd() * 12,
  delay: -(i * 7 + rnd() * 4),
  rev: i % 2 === 1,
}))
</script>

<template>
  <div class="ps-fx pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
    <div
      v-for="(f, i) in fish"
      :key="i"
      class="hw-bat absolute opacity-25"
      :class="{ 'hw-rev': f.rev }"
      :style="{ top: `${f.y}%`, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s` }"
    >
      <svg :width="f.s" :height="f.s / 2" viewBox="0 8 40 24" :style="{ transform: f.rev ? 'none' : 'scaleX(-1)' }">
        <path d="M4 20 C10 10 24 9 30 18 L38 11 L36 20 L38 29 L30 22 C24 31 10 30 4 20 Z" :fill="f.color" stroke="#e4dcc3" stroke-width="1.2" stroke-linejoin="round" />
        <circle cx="11" cy="18" r="1.6" fill="#100f0a" />
      </svg>
    </div>
  </div>
</template>
