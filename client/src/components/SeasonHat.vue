<script setup>
// Couvre-chef posé de travers sur le « L » du logo, selon le thème du moment (voir season.js).
// Tailles en em : il suit la taille du logo.
import { season } from '../season'
</script>

<template>
  <!-- Noël : bonnet -->
  <svg v-if="season === 'noel'" class="absolute -top-[.55em] -left-[.3em] h-[.8em] w-[.8em] -rotate-[20deg]" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M6 31 C10 18 18 6 30 5 C33 12 32 22 34 30 Z" fill="#a8372a" />
    <path d="M30 5 C36 8 38 14 37 19" fill="none" stroke="#a8372a" stroke-width="5" stroke-linecap="round" />
    <circle cx="37" cy="21" r="3.6" fill="#e4dcc3" />
    <rect x="3" y="28" width="34" height="8" rx="4" fill="#e4dcc3" />
  </svg>
  <!-- Nouvel An : chapeau pointu de cotillon, rayé, avec son pompon -->
  <svg v-else-if="season === 'nouvel-an'" class="absolute -top-[.62em] -left-[.12em] h-[.8em] w-[.8em] -rotate-[18deg]" viewBox="0 0 40 40" aria-hidden="true">
    <defs>
      <clipPath id="hat-nya"><path d="M20 4 L33 36 L7 36 Z" /></clipPath>
    </defs>
    <g clip-path="url(#hat-nya)">
      <rect width="40" height="40" fill="#6f93ad" />
      <path d="M0 14 L40 6 L40 12 L0 20 Z M0 26 L40 18 L40 24 L0 32 Z" fill="#d4bc35" />
    </g>
    <circle cx="20" cy="4" r="4" fill="#d4bc35" />
    <path d="M7 36 Q20 39 33 36" fill="none" stroke="#e4dcc3" stroke-width="3" stroke-linecap="round" />
  </svg>
  <!-- Beaujolais : béret, avec sa queue -->
  <svg v-else-if="season === 'beaujolais'" class="absolute -top-[.4em] -left-[.12em] h-[.8em] w-[.8em] -rotate-[16deg]" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M19 12 L20 6" stroke="#8a3050" stroke-width="2.5" stroke-linecap="round" />
    <ellipse cx="20" cy="22" rx="18" ry="10" fill="#7a2a46" />
    <ellipse cx="16" cy="19" rx="10" ry="4.5" fill="#a24466" opacity=".7" />
    <path d="M6 27 Q20 33 34 27" fill="none" stroke="#3a1020" stroke-width="2.5" stroke-linecap="round" />
  </svg>
  <!-- Saint-Patrick : haut-de-forme vert à boucle dorée, un trèfle piqué dans le ruban -->
  <svg v-else-if="season === 'st-patrick'" class="absolute -top-[.66em] -left-[.24em] h-[.85em] w-[.85em] -rotate-[14deg]" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M10 6 L30 6 L28 30 L12 30 Z" fill="#3f6b2a" />
    <rect x="11.3" y="22" width="17.4" height="5" fill="#1a1a14" />
    <rect x="17" y="21" width="6" height="7" rx="1" fill="none" stroke="#d4bc35" stroke-width="1.8" />
    <ellipse cx="20" cy="31" rx="17" ry="4" fill="#3f6b2a" />
    <g fill="#8fbf4a" transform="translate(29 17) scale(.5)">
      <circle cx="0" cy="-5" r="4.5" /><circle cx="-5" cy="1" r="4.5" /><circle cx="5" cy="1" r="4.5" />
      <path d="M0 2 L2 12" stroke="#8fbf4a" stroke-width="2" />
    </g>
  </svg>
  <!-- Halloween : chapeau de sorcière cabossé -->
  <svg v-else-if="season === 'halloween'" class="absolute -top-[.7em] -left-[.2em] h-[.9em] w-[.9em] -rotate-[14deg]" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M13 30 L21 4 C23 2 27 3 28 6 L25 9 L28 30 Z" fill="#1e1a24" stroke="#3a3044" stroke-width="1" />
    <rect x="12.5" y="24" width="16" height="4.5" fill="#c4703a" />
    <rect x="18" y="23.2" width="5" height="6" rx="1" fill="none" stroke="#d4bc35" stroke-width="1.4" />
    <ellipse cx="20" cy="31" rx="18" ry="4" fill="#1e1a24" stroke="#3a3044" stroke-width="1" />
  </svg>
  <!-- Fête de la musique : casque audio -->
  <svg v-else-if="season === 'musique'" class="absolute -top-[.48em] -left-[.16em] h-[.8em] w-[.8em] -rotate-[12deg]" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M7 26 C7 10 33 10 33 26" fill="none" stroke="#2a2a30" stroke-width="4.5" stroke-linecap="round" />
    <path d="M7 26 C7 10 33 10 33 26" fill="none" stroke="#9277a8" stroke-width="1.5" stroke-linecap="round" />
    <rect x="2" y="22" width="9" height="13" rx="4" fill="#9277a8" />
    <rect x="29" y="22" width="9" height="13" rx="4" fill="#9277a8" />
  </svg>
  <!-- Journée de la bière : capsule tordue posée sur le « L » -->
  <svg v-else-if="season === 'biere'" class="absolute -top-[.42em] -left-[.14em] h-[.66em] w-[.66em] -rotate-[22deg]" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M20 6 L23 9 L27 7.5 L28.5 11.5 L33 12 L32 16 L35.5 19 L32.5 22 L34 26 L30 27.5 L29.5 32 L25.5 31 L22.5 34.5 L20 31.5 L16.5 34 L14.5 30.5 L10 31 L10 26.5 L6 24.5 L8.5 21 L5.5 17.5 L9.5 15.5 L9 11 L13.5 11 L15.5 7 L19 9 Z" fill="#b8432c" />
    <circle cx="20" cy="20" r="9" fill="none" stroke="#e4dcc3" stroke-width="1.6" opacity=".7" />
    <path d="M15 18 Q20 14 25 18" fill="none" stroke="#e4dcc3" stroke-width="1.6" opacity=".7" />
  </svg>
  <!-- Oktoberfest : chapeau tyrolien vert, avec sa plume -->
  <svg v-else-if="season === 'oktoberfest'" class="absolute -top-[.56em] -left-[.24em] h-[.85em] w-[.85em] -rotate-[14deg]" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M27 22 C30 12 34 6 38 3 C36 10 33 17 29 23 Z" fill="#c4703a" />
    <path d="M28 22 L36 5" stroke="#8a4a24" stroke-width=".8" />
    <path d="M10 26 C10 14 14 10 20 10 C26 10 30 14 30 26 Z" fill="#3f5a2e" />
    <path d="M17 11 Q20 15 23 11" fill="none" stroke="#2a3d1e" stroke-width="1.4" />
    <rect x="10" y="21.5" width="20" height="3.5" fill="#6a4a2a" />
    <path d="M2 28 Q20 22 38 28 Q20 33 2 28 Z" fill="#3f5a2e" />
  </svg>
  <!-- Saint-Valentin : serre-tête à antennes cœurs -->
  <svg v-else-if="season === 'valentin'" class="absolute -top-[.56em] -left-[.14em] h-[.8em] w-[.8em] -rotate-[12deg]" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M6 34 C6 22 34 22 34 34" fill="none" stroke="#2a2a30" stroke-width="3" stroke-linecap="round" />
    <path d="M13 26 Q10 18 11 11 M27 26 Q30 18 29 11" fill="none" stroke="#2a2a30" stroke-width="1.5" />
    <path d="M11 13 C6 9 6 4 9 3 C10.5 2.5 11 4 11 4 C11 4 11.5 2.5 13 3 C16 4 16 9 11 13 Z" fill="#c43c5a" />
    <path d="M29 13 C24 9 24 4 27 3 C28.5 2.5 29 4 29 4 C29 4 29.5 2.5 31 3 C34 4 34 9 29 13 Z" fill="#c43c5a" />
  </svg>
  <!-- 1er mai : chapka à étoile rouge -->
  <svg v-else-if="season === 'premier-mai'" class="absolute -top-[.5em] -left-[.24em] h-[.82em] w-[.82em] -rotate-[14deg]" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M7 24 C7 10 33 10 33 24 Z" fill="#4a4036" />
    <rect x="5" y="20" width="30" height="9" rx="4" fill="#7a6a58" />
    <path d="M5 26 L3 36 L10 34 L10 27 Z M35 26 L37 36 L30 34 L30 27 Z" fill="#7a6a58" />
    <path d="M20 19 L21.6 22.4 L25.3 22.8 L22.5 25.3 L23.3 29 L20 27.1 L16.7 29 L17.5 25.3 L14.7 22.8 L18.4 22.4 Z" fill="#c43c2a" />
  </svg>
  <!-- 14 juillet : bonnet phrygien, avec sa cocarde -->
  <svg v-else-if="season === '14-juillet'" class="absolute -top-[.52em] -left-[.26em] h-[.82em] w-[.82em] -rotate-[12deg]" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M6 32 C5 20 10 9 21 7 C29 6 34 11 31 16 C29 19 25 16 27 13 C22 13 33 22 34 32 Z" fill="#b8302a" />
    <path d="M6 32 Q20 28 34 32 L34 35 Q20 31 6 35 Z" fill="#8a2420" />
    <circle cx="11" cy="27" r="4.4" fill="#3a5a8a" /><circle cx="11" cy="27" r="2.9" fill="#e4dcc3" /><circle cx="11" cy="27" r="1.4" fill="#b8302a" />
  </svg>
  <!-- 1er avril : poisson en papier scotché de travers -->
  <svg v-else-if="season === 'poisson'" class="absolute -top-[.4em] -left-[.3em] h-[.8em] w-[.8em] -rotate-[24deg]" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M4 20 C10 10 24 9 30 18 L38 11 L36 20 L38 29 L30 22 C24 31 10 30 4 20 Z" fill="#6f93ad" stroke="#e4dcc3" stroke-width="1.4" stroke-linejoin="round" />
    <circle cx="11" cy="18" r="1.6" fill="#100f0a" />
    <path d="M17 14 Q20 20 17 26 M22 14 Q25 20 22 26" fill="none" stroke="#e4dcc3" stroke-width="1" opacity=".6" />
    <rect x="14" y="4" width="12" height="5" fill="#efe6c8" opacity=".55" transform="rotate(12 20 6)" />
  </svg>
</template>
