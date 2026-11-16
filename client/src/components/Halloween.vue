<script setup>
// Thème d'Halloween (soirée du 31 octobre) : toiles d'araignée dans les coins (avec leur occupante),
// chauves-souris qui traversent, lueur orange, néon du logo qui grésille encore plus (style.css).
// Décoratif : aria-hidden, aucun clic.

// Toile en coin : rayons depuis le coin, fils qui les relient en festons
const R = 150
const RAYS = 6
const RINGS = [0.28, 0.46, 0.64, 0.82, 1]
const angles = Array.from({ length: RAYS }, (_, i) => (Math.PI / 2) * (i / (RAYS - 1)))
const pt = (a, r) => [Math.cos(a) * r, Math.sin(a) * r]
const web = [
  ...angles.map((a) => `M0,0 L${pt(a, R).join(',')}`),
  ...RINGS.map((k) => {
    let d = `M${pt(angles[0], R * k).join(',')}`
    for (let i = 1; i < RAYS; i++) {
      const mid = pt((angles[i - 1] + angles[i]) / 2, R * k * 0.86) // le fil pend un peu vers le coin
      d += ` Q${mid.join(',')} ${pt(angles[i], R * k).join(',')}`
    }
    return d
  }),
].join(' ')

let seed = 3110
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
const bats = Array.from({ length: 5 }, (_, i) => ({
  y: 6 + rnd() * 40,
  s: 18 + rnd() * 14,
  dur: 9 + rnd() * 8,
  delay: -(i * 3.5 + rnd() * 2),
  rev: i % 2 === 1, // une sur deux traverse de droite à gauche
}))
</script>

<template>
  <!-- Toiles en haut à gauche et à droite (défilent avec la page) -->
  <div class="pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden" aria-hidden="true">
    <svg class="absolute top-0 left-0 opacity-30" :width="R" :height="R" :viewBox="`0 0 ${R} ${R}`">
      <path :d="web" fill="none" stroke="#e4dcc3" stroke-width=".8" />
    </svg>
    <svg class="absolute top-0 right-0 -scale-x-100 opacity-30" :width="R * 0.8" :height="R * 0.8" :viewBox="`0 0 ${R} ${R}`">
      <path :d="web" fill="none" stroke="#e4dcc3" stroke-width="1" />
    </svg>
    <!-- Araignée qui descend au bout de son fil, à droite -->
    <div class="hw-spider absolute top-0 right-16">
      <div class="mx-auto h-full w-px bg-[#e4dcc3]/30" />
      <svg class="absolute -bottom-3 -left-[9px]" width="19" height="16" viewBox="-10 -8 20 16">
        <g stroke="#0d0b0e" stroke-width="1.3" fill="none" stroke-linecap="round">
          <path d="M-2,-1 L-7,-6 L-9,-2 M-2,0 L-8,-2 L-10,2 M-2,1 L-8,3 L-9,7 M-2,2 L-6,6 L-6,8" />
          <path d="M2,-1 L7,-6 L9,-2 M2,0 L8,-2 L10,2 M2,1 L8,3 L9,7 M2,2 L6,6 L6,8" />
        </g>
        <ellipse cx="0" cy="1" rx="3.4" ry="4" fill="#0d0b0e" />
        <circle cx="0" cy="-3.6" r="2.2" fill="#0d0b0e" />
        <circle cx="-.8" cy="-4" r=".5" fill="#c43c2a" /><circle cx=".8" cy="-4" r=".5" fill="#c43c2a" />
      </svg>
    </div>
  </div>

  <!-- Chauves-souris qui traversent l'écran, derrière le contenu -->
  <div class="hw-fx pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
    <div
      v-for="(b, i) in bats"
      :key="i"
      class="hw-bat absolute"
      :class="{ 'hw-rev': b.rev }"
      :style="{ top: `${b.y}%`, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }"
    >
      <svg class="hw-flap" :width="b.s" :height="b.s / 2" viewBox="-20 -8 40 20">
        <path d="M0,-2 C-4,-8 -10,-8 -14,-4 C-16,-6 -18,-6 -20,-4 C-16,0 -12,2 -9,6 C-7,3 -4,3 -2,5 L0,3 L2,5 C4,3 7,3 9,6 C12,2 16,0 20,-4 C18,-6 16,-6 14,-4 C10,-8 4,-8 0,-2 Z" fill="#0b090c" />
        <circle cx="-1.2" cy="-1" r=".7" fill="#c4703a" /><circle cx="1.2" cy="-1" r=".7" fill="#c4703a" />
      </svg>
    </div>
  </div>
</template>
