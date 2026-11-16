<script setup>
// Journée internationale de la bière (1er vendredi d'août) : une couche de mousse déborde du haut de la page
// et coule, des bulles montent du bas de l'écran. Décoratif : aria-hidden, aucun clic.
let seed = 807
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

// Mousse : rangée de bosses (cercles qui se chevauchent) + quelques coulures, en % de la largeur
const puffs = Array.from({ length: 26 }, (_, i) => ({ x: (i + rnd() * 0.6) * (100 / 25), r: 14 + rnd() * 12, y: rnd() * 8 }))
const drips = Array.from({ length: 6 }, () => ({ x: 4 + rnd() * 92, len: 18 + rnd() * 40, w: 5 + rnd() * 4 }))
const bubbles = Array.from({ length: 26 }, () => ({
  x: rnd() * 100,
  r: 1.5 + rnd() * 3,
  o: 0.2 + rnd() * 0.3,
  dur: 6 + rnd() * 8,
  delay: -rnd() * 14,
  sway: 4 + rnd() * 10,
}))
</script>

<template>
  <!-- Mousse en haut de la page -->
  <div class="pointer-events-none absolute inset-x-0 top-0 h-24 overflow-hidden opacity-[.16]" aria-hidden="true">
    <div class="absolute inset-x-0 top-0 h-3 bg-[#efe6c8]" />
    <span
      v-for="(p, i) in puffs"
      :key="'p' + i"
      class="absolute rounded-full bg-[#efe6c8]"
      :style="{ left: `${p.x}%`, top: `${p.y - p.r * 0.6}px`, width: `${p.r * 2}px`, height: `${p.r * 2}px`, marginLeft: `${-p.r}px` }"
    />
    <span
      v-for="(d, i) in drips"
      :key="'d' + i"
      class="absolute top-4 rounded-b-full bg-[#efe6c8]"
      :style="{ left: `${d.x}%`, width: `${d.w}px`, height: `${d.len}px` }"
    />
  </div>

  <!-- Bulles qui montent -->
  <div class="br-fx pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
    <span
      v-for="(b, i) in bubbles"
      :key="i"
      class="br-bubble absolute rounded-full"
      :style="{ left: `${b.x}%`, width: `${b.r * 2}px`, height: `${b.r * 2}px`, opacity: b.o, '--sway': `${b.sway}px`, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }"
    />
  </div>
</template>
