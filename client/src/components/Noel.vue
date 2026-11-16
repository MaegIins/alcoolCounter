<script setup>
// Thème de Noël (24 et 25 décembre) : l'appli a sorti sa guirlande du carton, avec une ampoule grillée,
// et il neige un peu (neige jaunie, on reste dans le ton). Purement décoratif : aria-hidden, aucun clic.

// Guirlande : festons qui pendent entre des clous en haut de la page (y en px, x en %)
const SAGS = 4
const TOP = 3
const DIP = 26
const wire = Array.from({ length: SAGS }, (_, k) => {
  const [x0, x1] = [(100 * k) / SAGS, (100 * (k + 1)) / SAGS]
  return `M${x0},${TOP} Q${(x0 + x1) / 2},${TOP + 2 * DIP} ${x1},${TOP}`
}).join(' ')
const COLORS = ['#c43c2a', '#739b4f', '#d4bc35', '#6f93ad']
const PER_SAG = 6
const bulbs = Array.from({ length: SAGS * PER_SAG }, (_, i) => {
  const k = Math.floor(i / PER_SAG)
  const t = ((i % PER_SAG) + 0.5) / PER_SAG
  return {
    x: (100 * (k + t)) / SAGS,
    y: TOP + 4 * DIP * t * (1 - t), // même courbe que le fil (Bézier quadratique, contrôle à 2 × DIP)
    tilt: (0.5 - t) * 50, // l'ampoule pend perpendiculaire au fil, à peu près
    color: COLORS[i % COLORS.length],
    dead: i === 9, // grillée depuis 2009
    flaky: i === 17, // faux contact
    delay: `${(i % 3) * 0.8}s`,
  }
})

// Neige : flocons qui tombent en boucle, graine fixe (même tombée à chaque visite)
let seed = 2512
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
const flakes = Array.from({ length: 34 }, () => ({
  x: rnd() * 100,
  r: 1 + rnd() * 2.2,
  o: 0.25 + rnd() * 0.4,
  dur: 9 + rnd() * 10,
  delay: -rnd() * 19,
  drift: (rnd() - 0.5) * 80,
}))
</script>

<template>
  <!-- Guirlande en haut de la page (défile avec elle) -->
  <div class="pointer-events-none absolute inset-x-0 top-0 h-16 overflow-hidden" aria-hidden="true">
    <svg class="absolute inset-x-0 top-0 h-16 w-full" viewBox="0 0 100 64" preserveAspectRatio="none">
      <path :d="wire" fill="none" stroke="#1d2a17" stroke-width="1.6" vector-effect="non-scaling-stroke" />
    </svg>
    <span
      v-for="(b, i) in bulbs"
      :key="i"
      class="noel-bulb absolute"
      :class="{ 'noel-dead': b.dead, 'noel-flaky': b.flaky }"
      :style="{ left: `${b.x}%`, top: `${b.y}px`, '--c': b.color, '--tilt': `${b.tilt}deg`, animationDelay: b.delay }"
    />
  </div>

  <!-- Neige, au-dessus du contenu mais très légère -->
  <div class="noel-snow pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
    <span
      v-for="(f, i) in flakes"
      :key="i"
      class="noel-flake absolute rounded-full"
      :style="{ left: `${f.x}%`, width: `${f.r * 2}px`, height: `${f.r * 2}px`, opacity: f.o, '--drift': `${f.drift}px`, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s` }"
    />
  </div>
</template>
