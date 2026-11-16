<script setup>
// Thème du Beaujolais nouveau (3e jeudi de novembre) : un sarment de vigne pend en haut de la page avec ses
// grappes, et des feuilles d'automne tombent. Décoratif : aria-hidden, aucun clic.

// Sarment : festons entre des clous (y en px, x en %), comme la guirlande de Noël
const SAGS = 3
const TOP = 2
const DIP = 22
const vine = Array.from({ length: SAGS }, (_, k) => {
  const [x0, x1] = [(100 * k) / SAGS, (100 * (k + 1)) / SAGS]
  return `M${x0},${TOP} Q${(x0 + x1) / 2},${TOP + 2 * DIP} ${x1},${TOP}`
}).join(' ')
const onVine = (k, t) => ({ x: (100 * (k + t)) / SAGS, y: TOP + 4 * DIP * t * (1 - t) })

// Pseudo-aléatoire à graine fixe
let seed = 1119
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

const LEAF = ['#4f6b2f', '#6b7d34', '#8a6a2c', '#7a3a24']
// Le long du sarment : une grappe au creux de chaque feston, des feuilles de part et d'autre
const grapes = Array.from({ length: SAGS }, (_, k) => ({ ...onVine(k, 0.5 + (rnd() - 0.5) * 0.2), dark: k % 2 === 0 }))
const leaves = Array.from({ length: SAGS * 4 }, (_, i) => {
  const k = Math.floor(i / 4)
  const t = [0.14, 0.32, 0.68, 0.86][i % 4]
  return { ...onVine(k, t), color: LEAF[Math.floor(rnd() * 2)], rot: (rnd() - 0.5) * 70 + (t < 0.5 ? -30 : 30) }
})
// Grappe : grains en triangle pointe en bas
const BERRIES = [[-6, 0], [0, 0], [6, 0], [-3, 5.5], [3, 5.5], [9, 5.5], [0, 11], [6, 11], [3, 16.5]]

const falling = Array.from({ length: 16 }, () => ({
  x: rnd() * 100,
  s: 10 + rnd() * 8,
  color: LEAF[Math.floor(rnd() * LEAF.length)],
  o: 0.25 + rnd() * 0.3,
  dur: 11 + rnd() * 9,
  delay: -rnd() * 20,
  drift: (rnd() - 0.5) * 140,
  spin: 180 + rnd() * 540,
}))
const LEAF_PATH = 'M0,-8 C4,-6 7,-2 6,2 C5,5 2,7 0,8 C-2,7 -5,5 -6,2 C-7,-2 -4,-6 0,-8 Z M0,-8 L0,10'
</script>

<template>
  <!-- Sarment en haut de la page -->
  <div class="pointer-events-none absolute inset-x-0 top-0 h-20 overflow-hidden" aria-hidden="true">
    <svg class="absolute inset-x-0 top-0 h-20 w-full" viewBox="0 0 100 80" preserveAspectRatio="none">
      <path :d="vine" fill="none" stroke="#4a3220" stroke-width="2.2" vector-effect="non-scaling-stroke" />
    </svg>
    <svg
      v-for="(l, i) in leaves"
      :key="'l' + i"
      class="absolute"
      width="16"
      height="20"
      viewBox="-8 -10 16 20"
      :style="{ left: `${l.x}%`, top: `${l.y}px`, transform: `translate(-50%, -10%) rotate(${l.rot}deg)`, transformOrigin: '50% 0' }"
    >
      <path :d="LEAF_PATH" :fill="l.color" stroke="#2a3418" stroke-width=".8" />
    </svg>
    <svg
      v-for="(g, i) in grapes"
      :key="'g' + i"
      class="bj-grape absolute"
      width="20"
      height="30"
      viewBox="-10 -6 20 30"
      :style="{ left: `${g.x}%`, top: `${g.y}px`, animationDelay: `${-i * 1.3}s` }"
    >
      <path d="M0,-6 L0,0" stroke="#4a3220" stroke-width="1.5" />
      <circle v-for="([x, y], k) in BERRIES" :key="k" :cx="x" :cy="y + 3" r="3.4" :fill="g.dark ? '#4a1830' : '#6a2440'" stroke="#2a0c18" stroke-width=".6" />
      <circle v-for="([x, y], k) in BERRIES" :key="'h' + k" :cx="x - 1" :cy="y + 2" r=".9" fill="#c9a0b4" opacity=".35" />
    </svg>
  </div>

  <!-- Feuilles qui tombent -->
  <div class="bj-fall pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
    <svg
      v-for="(f, i) in falling"
      :key="i"
      class="bj-leaf absolute"
      :width="f.s"
      :height="f.s * 1.25"
      viewBox="-8 -10 16 20"
      :style="{ left: `${f.x}%`, opacity: f.o, '--drift': `${f.drift}px`, '--spin': `${f.spin}deg`, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s` }"
    >
      <path :d="LEAF_PATH" :fill="f.color" />
    </svg>
  </div>
</template>
