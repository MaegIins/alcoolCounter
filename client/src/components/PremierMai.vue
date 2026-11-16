<script setup>
// 1er mai, version lutte des classes au comptoir : un drapeau rouge flotte en haut à droite, frappé d'une
// faucille et d'une chope (le marteau est resté au boulot), et des étoiles rouges tombent doucement.
// Le jaune de l'appli passe au rouge (style.css). Décoratif : aria-hidden, aucun clic.
let seed = 501
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
const stars = Array.from({ length: 14 }, () => ({
  x: rnd() * 100,
  s: 9 + rnd() * 9,
  o: 0.2 + rnd() * 0.3,
  dur: 12 + rnd() * 9,
  delay: -rnd() * 21,
  drift: (rnd() - 0.5) * 100,
  spin: 90 + rnd() * 270,
}))
const STAR = 'M0,-10 L2.9,-4 L9.5,-3.1 L4.7,1.5 L5.9,8.1 L0,5 L-5.9,8.1 L-4.7,1.5 L-9.5,-3.1 L-2.9,-4 Z'
</script>

<template>
  <!-- Drapeau sur sa hampe, en haut à droite (défile avec la page) -->
  <div class="pointer-events-none absolute top-24 right-2 h-28 w-32 opacity-25 sm:right-6 lg:top-28" aria-hidden="true">
    <div class="absolute top-0 left-0 h-full w-[3px] rounded-full bg-[#8a7a62]" />
    <svg class="pm-flag absolute top-1 left-[3px]" width="110" height="70" viewBox="0 0 110 70">
      <path d="M0 0 Q28 -6 55 2 T110 2 L110 62 Q82 68 55 60 T0 60 Z" fill="#b8302a" />
      <!-- Faucille et chope -->
      <g transform="translate(22 30)" fill="#d4bc35">
        <path d="M-9 -12 A13 13 0 1 0 10 6 A10 10 0 1 1 -9 -12 Z" />
        <rect x="-9" y="6" width="3" height="9" rx="1" transform="rotate(-40 -7 10)" />
        <rect x="2" y="-9" width="9" height="13" rx="1.5" />
        <path d="M11 -6 h3 a2.5 2.5 0 0 1 2.5 2.5 v2 a2.5 2.5 0 0 1 -2.5 2.5 h-3" fill="none" stroke="#d4bc35" stroke-width="2" />
        <path d="M1.5 -9 Q4 -13 6.5 -10 Q9 -13 11.5 -9 Z" fill="#efe6c8" />
      </g>
    </svg>
  </div>

  <!-- Étoiles qui tombent -->
  <div class="pm-fx pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden="true">
    <svg
      v-for="(st, i) in stars"
      :key="i"
      class="pm-star absolute"
      :width="st.s"
      :height="st.s"
      viewBox="-11 -11 22 22"
      :style="{ left: `${st.x}%`, opacity: st.o, '--drift': `${st.drift}px`, '--spin': `${st.spin}deg`, animationDuration: `${st.dur}s`, animationDelay: `${st.delay}s` }"
    >
      <path :d="STAR" fill="#c43c2a" />
    </svg>
  </div>
</template>
