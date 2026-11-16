<script setup>
// Ouverture de l'Oktoberfest (samedi, fin septembre) : guirlande de fanions à losanges bleus et blancs
// en haut de la page, et quelques bretzels qui tombent. Décoratif : aria-hidden, aucun clic.

// Fanions le long de festons (y en px, x en %), comme la guirlande de Noël
const SAGS = 3
const TOP = 3
const DIP = 16
const rope = Array.from({ length: SAGS }, (_, k) => {
  const [x0, x1] = [(100 * k) / SAGS, (100 * (k + 1)) / SAGS]
  return `M${x0},${TOP} Q${(x0 + x1) / 2},${TOP + 2 * DIP} ${x1},${TOP}`
}).join(' ')
const PER = 8
const flags = Array.from({ length: SAGS * PER }, (_, i) => {
  const k = Math.floor(i / PER)
  const t = ((i % PER) + 0.5) / PER
  return { x: (100 * (k + t)) / SAGS, y: TOP + 4 * DIP * t * (1 - t), tilt: (0.5 - t) * 40, white: i % 2 === 1 }
})

let seed = 919
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
const pretzels = Array.from({ length: 10 }, () => ({
  x: rnd() * 100,
  s: 16 + rnd() * 10,
  o: 0.25 + rnd() * 0.25,
  dur: 12 + rnd() * 8,
  delay: -rnd() * 20,
  drift: (rnd() - 0.5) * 120,
  spin: 180 + rnd() * 360,
}))
</script>

<template>
  <!-- Fanions bavarois -->
  <div class="pointer-events-none absolute inset-x-0 top-0 h-16 overflow-hidden" aria-hidden="true">
    <svg class="absolute inset-x-0 top-0 h-16 w-full" viewBox="0 0 100 64" preserveAspectRatio="none">
      <path :d="rope" fill="none" stroke="#6a5a40" stroke-width="1.4" vector-effect="non-scaling-stroke" />
    </svg>
    <svg
      v-for="(f, i) in flags"
      :key="i"
      class="absolute opacity-70"
      width="14"
      height="18"
      viewBox="0 0 14 18"
      :style="{ left: `${f.x}%`, top: `${f.y}px`, transform: `translateX(-50%) rotate(${f.tilt}deg)`, transformOrigin: '50% 0' }"
    >
      <defs>
        <pattern :id="`okt-l${i}`" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="#d8dce0" /><rect width="2.5" height="2.5" fill="#4a7aa8" /><rect x="2.5" y="2.5" width="2.5" height="2.5" fill="#4a7aa8" />
        </pattern>
      </defs>
      <path d="M0 0 L14 0 L7 18 Z" :fill="f.white ? '#d8dce0' : `url(#okt-l${i})`" />
    </svg>
  </div>

  <!-- Bretzels qui tombent -->
  <div class="ok-fx pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
    <svg
      v-for="(p, i) in pretzels"
      :key="i"
      class="ok-pretzel absolute"
      :width="p.s"
      :height="p.s"
      viewBox="-12 -12 24 24"
      :style="{ left: `${p.x}%`, opacity: p.o, '--drift': `${p.drift}px`, '--spin': `${p.spin}deg`, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` }"
    >
      <path d="M-4 9 C-14 6 -12 -10 -3 -7 C3 -5 4 4 0 6 C-4 4 -3 -5 3 -7 C12 -10 14 6 4 9" fill="none" stroke="#8a5a2c" stroke-width="3.4" stroke-linecap="round" />
      <circle cx="-6" cy="-4" r=".7" fill="#e4dcc3" /><circle cx="7" cy="-2" r=".7" fill="#e4dcc3" /><circle cx="1" cy="3" r=".7" fill="#e4dcc3" />
    </svg>
  </div>
</template>
