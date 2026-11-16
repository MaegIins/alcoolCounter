<script setup>
// Feux d'artifice en boucle, fixes derrière le contenu (Nouvel An, 14 juillet). Décoratif : aria-hidden, aucun clic.
// colors : couleurs des bouquets, tirées tour à tour ; seed : pour que deux thèmes n'aient pas les mêmes tirs.
const props = defineProps({
  colors: { type: Array, required: true },
  seed: { type: Number, default: 3112 },
  count: { type: Number, default: 6 },
})

// Pseudo-aléatoire à graine fixe : les mêmes feux à chaque visite
let seed = props.seed
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

// Bouquets : position (% de l'écran), couleur, rayon, décalage dans la boucle
const bursts = Array.from({ length: props.count }, (_, i) => {
  const color = props.colors[(i + Math.floor(rnd() * 2)) % props.colors.length]
  const n = 14 + Math.floor(rnd() * 8)
  return {
    x: 8 + rnd() * 84,
    y: 8 + rnd() * 34,
    r: 50 + rnd() * 50,
    delay: -(i * 1.1 + rnd() * 0.6),
    dur: 5.5 + rnd() * 1.5,
    sparks: Array.from({ length: n }, (_, k) => ({ a: (360 * k) / n + rnd() * 8, color: rnd() < 0.2 ? '#e4dcc3' : color })),
  }
})
</script>

<template>
  <div class="nya-fx pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
    <div
      v-for="(b, i) in bursts"
      :key="i"
      class="nya-burst absolute"
      :style="{ left: `${b.x}%`, top: `${b.y}%`, '--r': `${b.r}px`, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }"
    >
      <span
        v-for="(s, k) in b.sparks"
        :key="k"
        class="nya-spark absolute"
        :style="{ '--a': `${s.a}deg`, background: s.color, color: s.color, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }"
      />
    </div>
  </div>
</template>
