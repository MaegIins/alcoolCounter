<script setup>
// Thème de la Fête de la musique (soirée du 21 juin) : un égaliseur qui saute en haut de la page
// et des notes qui montent du bas de l'écran. Décoratif : aria-hidden, aucun clic.
let seed = 2106
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
const COLORS = ['#9277a8', '#6f93ad', '#d4bc35', '#c4703a', '#739b4f']
// Égaliseur : des barres sur toute la largeur, chacune à son rythme
const bars = Array.from({ length: 40 }, (_, i) => ({
  color: COLORS[Math.floor((i / 40) * COLORS.length)],
  dur: 0.5 + rnd() * 0.7,
  delay: -rnd(),
  max: 0.35 + rnd() * 0.65,
}))
const notes = Array.from({ length: 16 }, () => ({
  x: rnd() * 100,
  glyph: ['♪', '♫', '♩', '♬'][Math.floor(rnd() * 4)],
  size: 14 + rnd() * 12,
  color: COLORS[Math.floor(rnd() * COLORS.length)],
  o: 0.3 + rnd() * 0.3,
  dur: 10 + rnd() * 8,
  delay: -rnd() * 18,
  sway: 10 + rnd() * 25,
}))
</script>

<template>
  <!-- Égaliseur en haut de la page -->
  <div class="pointer-events-none absolute inset-x-0 top-0 flex h-7 items-start gap-[3px] px-1 opacity-30" aria-hidden="true">
    <span
      v-for="(b, i) in bars"
      :key="i"
      class="fm-bar h-full flex-1 rounded-b-sm"
      :style="{ background: b.color, '--max': b.max, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }"
    />
  </div>

  <!-- Notes qui montent -->
  <div class="fm-fx pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
    <span
      v-for="(n, i) in notes"
      :key="i"
      class="fm-note absolute font-bold"
      :style="{ left: `${n.x}%`, fontSize: `${n.size}px`, color: n.color, opacity: n.o, '--sway': `${n.sway}px`, animationDuration: `${n.dur}s`, animationDelay: `${n.delay}s` }"
    >{{ n.glyph }}</span>
  </div>
</template>
