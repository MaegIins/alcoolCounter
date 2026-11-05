<script setup>
// Décor de rade glauque, généré (graine fixe : le même à chaque visite) :
// taches qui ont séché (auréole plus foncée sur le bord), éclaboussures avec gouttelettes et traînées,
// coulures, brûlures de clope, cendre. Formes irrégulières, bords rongés par un filtre de bruit.
// Purement décoratif : aria-hidden, aucun clic, derrière le contenu (sauf quelques saletés « sur la vitre »).

// Pseudo-aléatoire à graine (mulberry32)
let seed = 1337
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const between = (a, b) => a + rnd() * (b - a)
const pick = (a) => a[Math.floor(rnd() * a.length)]

// Contour irrégulier fermé autour de (cx, cy), lissé (Catmull-Rom → Bézier)
function blob(cx, cy, r, rough = 0.2, n = 28) {
  const waves = [1, 2, 3].map(() => ({ f: Math.floor(between(2, 8)), p: between(0, 6.28), a: between(0.3, 1) }))
  const pts = Array.from({ length: n }, (_, k) => {
    const t = (k / n) * Math.PI * 2
    const noise = waves.reduce((s, w) => s + w.a * Math.sin(w.f * t + w.p), 0) / 2.3
    const rr = r * (1 + rough * noise + rough * 0.35 * (rnd() - 0.5))
    return [cx + Math.cos(t) * rr, cy + Math.sin(t) * rr]
  })
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let k = 0; k < n; k++) {
    const [p0, p1, p2, p3] = [pts[(k - 1 + n) % n], pts[k], pts[(k + 1) % n], pts[(k + 2) % n]]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d + 'Z'
}

const PISS = '#c9b02e'
const BEER = '#a8781c'
const DARK = '#2e2010' // café, Jäger, crasse
const WINE = '#5c1a22'
const ASH = '#7a766c'

// Éclaboussure : flaque centrale + traînées effilées + gouttelettes projetées (plus petites en s'éloignant)
function splat(color, size) {
  const c = size / 2
  const r = size * 0.16
  const parts = [{ d: blob(c, c, r, 0.45, 36), o: 1 }]
  const rays = Math.floor(between(3, 7))
  for (let i = 0; i < rays; i++) {
    const a = between(0, 6.28)
    const len = r * between(1.5, 2.8)
    const w = r * between(0.12, 0.28)
    const [ex, ey] = [c + Math.cos(a) * len, c + Math.sin(a) * len]
    const [px, py] = [Math.cos(a + 1.57) * w, Math.sin(a + 1.57) * w]
    parts.push({ d: `M${c + px},${c + py} L${ex},${ey} L${c - px},${c - py} Z`, o: 1 })
    parts.push({ d: blob(ex, ey, w * between(0.9, 1.6), 0.2, 12), o: 1 })
  }
  const drops = Math.floor(between(10, 26))
  for (let i = 0; i < drops; i++) {
    const a = between(0, 6.28)
    const dist = r * between(1.3, 3.9)
    const s = r * 0.22 * (1.2 - dist / (r * 4)) * between(0.4, 1.1)
    parts.push({ d: blob(c + Math.cos(a) * dist, c + Math.sin(a) * dist, Math.max(0.8, s), 0.25, 10), o: between(0.7, 1) })
  }
  return { kind: 'splat', size, color, parts }
}
// Tache qui a séché : intérieur pâle, auréole plus foncée sur le bord, parfois une deuxième auréole décalée
function stain(color, size) {
  const c = size / 2
  const r = size * 0.4
  return { kind: 'stain', size, color, d: blob(c, c, r, 0.22, 32), d2: rnd() < 0.6 ? blob(c + between(-8, 8), c + between(-8, 8), r * between(0.55, 0.8), 0.3, 24) : null }
}
// Paquet de coulures : une trace étalée en haut, d'où partent 1 à 4 filets qui s'affinent et finissent en goutte
function drips(color) {
  const width = between(40, 110)
  const h = 160
  const parts = [blob(width / 2, 10, width * 0.45, 0.35, 30).replace(/(\d+\.?\d*),(\d+\.?\d*)/g, (m, x, y) => `${x},${(6 + (y - 10) * 0.1).toFixed(1)}`)]
  const n = Math.floor(between(1, 5))
  for (let i = 0; i < n; i++) {
    const x = between(width * 0.15, width * 0.85)
    const len = between(12, 90)
    const w0 = between(2, 4.5)
    const w1 = w0 * between(0.35, 0.6)
    const b = w1 * between(1.3, 1.9)
    const sway = between(-3, 3)
    parts.push(
      `M${x - w0},4 C${x - w0 * 0.8},${len * 0.3} ${x - w1 + sway},${len * 0.6} ${x - w1 + sway},${len - b}` +
        ` A${b},${b * 1.2} 0 1 0 ${x + w1 + sway},${len - b}` +
        ` C${x + w1 + sway},${len * 0.6} ${x + w0 * 0.8},${len * 0.3} ${x + w0},4 Z`
    )
  }
  return { color, width, h, parts }
}
// Cendre : petit tas gris + poussière + une trace étalée
function ash(size) {
  const c = size / 2
  const dots = Array.from({ length: Math.floor(between(40, 90)) }, () => {
    const a = between(0, 6.28)
    const dist = Math.abs(between(-1, 1) * between(0, 1)) * size * 0.45
    return { x: c + Math.cos(a) * dist * 1.4, y: c + Math.sin(a) * dist * 0.7, r: between(0.4, 1.6), o: between(0.3, 0.9) }
  })
  return { kind: 'ash', size, dots, smear: blob(c + size * 0.12, c, size * 0.2, 0.5, 20), pile: blob(c, c, size * 0.07, 0.6, 16) }
}
// Brûlure de clope : centre noir, halo brun
const burn = (size) => ({ kind: 'burn', size, d: blob(size / 2, size / 2, size * 0.18, 0.35, 20), d2: blob(size / 2, size / 2, size * 0.32, 0.4, 24) })

// Placement (left en %, top en % de la hauteur de la page)
const items = []
const place = (it, x, y, o, rot = between(0, 360)) => items.push({ ...it, x, y, o, rot, id: items.length })
for (let i = 0; i < 9; i++) place(stain(pick([PISS, PISS, BEER, DARK, WINE]), between(160, 340)), between(-12, 88), between(0, 96), between(0.35, 0.6))
for (let i = 0; i < 12; i++) place(splat(pick([PISS, PISS, BEER, DARK, WINE, PISS]), between(120, 300)), between(-8, 90), between(2, 98), between(0.28, 0.5))
for (let i = 0; i < 6; i++) place(ash(between(60, 130)), between(-2, 94), between(5, 97), between(0.5, 0.85))
for (let i = 0; i < 5; i++) place(burn(between(26, 44)), between(1, 95), between(4, 97), between(0.5, 0.8))
// Coulures qui pendent du haut de la page (fuite du plafond), par paquets irréguliers
const dripGroups = [between(-4, 12), between(28, 40), between(55, 66), between(80, 94)].map((x) => ({ ...drips(pick([PISS, PISS, BEER, DARK])), x, o: between(0.3, 0.5) }))
// Saletés « sur la vitre », au-dessus du contenu : quelques gouttelettes et grains de cendre, très discrets
const specks = Array.from({ length: 26 }, () => ({
  x: between(0, 100), y: between(0, 100), r: between(1, 3.2), c: pick([PISS, ASH, ASH, BEER]), o: between(0.12, 0.3),
}))
</script>

<template>
  <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
    <svg width="0" height="0" class="absolute">
      <defs>
        <!-- Bords rongés : le contour est déformé par du bruit -->
        <filter id="grime-rough" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="3" seed="4" />
          <feDisplacementMap in="SourceGraphic" scale="7" />
        </filter>
        <radialGradient id="grime-burn">
          <stop offset="0" stop-color="#050403" />
          <stop offset=".45" stop-color="#1c1208" />
          <stop offset="1" stop-color="#3b2510" stop-opacity="0" />
        </radialGradient>
      </defs>
    </svg>

    <svg
      v-for="it in items"
      :key="it.id"
      class="absolute"
      :style="{ left: `${it.x}%`, top: `${it.y}%`, width: `${it.size}px`, height: `${it.size}px`, opacity: it.o, transform: `translate(-50%, -50%) rotate(${it.rot}deg)` }"
      :viewBox="`0 0 ${it.size} ${it.size}`"
    >
      <g filter="url(#grime-rough)">
        <template v-if="it.kind === 'stain'">
          <path :d="it.d" :fill="it.color" fill-opacity=".18" :stroke="it.color" stroke-opacity=".75" stroke-width="2.5" />
          <path v-if="it.d2" :d="it.d2" fill="none" :stroke="it.color" stroke-opacity=".5" stroke-width="1.5" />
        </template>
        <template v-else-if="it.kind === 'splat'">
          <path v-for="(p, k) in it.parts" :key="k" :d="p.d" :fill="it.color" :fill-opacity="p.o" />
        </template>
        <template v-else-if="it.kind === 'ash'">
          <path :d="it.smear" fill="#7a766c" fill-opacity=".22" />
          <path :d="it.pile" fill="#8f8a7f" fill-opacity=".8" />
          <circle v-for="(d, k) in it.dots" :key="k" :cx="d.x" :cy="d.y" :r="d.r" fill="#8f8a7f" :fill-opacity="d.o" />
        </template>
        <template v-else-if="it.kind === 'burn'">
          <path :d="it.d2" fill="url(#grime-burn)" />
          <path :d="it.d" fill="#060504" fill-opacity=".9" />
        </template>
      </g>
    </svg>

    <!-- Coulures du haut de la page -->
    <svg v-for="(g, i) in dripGroups" :key="'d' + i" class="absolute top-0" :style="{ left: `${g.x}%`, opacity: g.o }" :width="g.width" :height="g.h" :viewBox="`0 0 ${g.width} ${g.h}`">
      <g filter="url(#grime-rough)">
        <path v-for="(p, k) in g.parts" :key="k" :d="p" :fill="g.color" />
      </g>
    </svg>
  </div>

  <!-- Saletés sur la vitre (au-dessus du contenu, très légères) -->
  <div class="pointer-events-none fixed inset-0 z-30" aria-hidden="true">
    <span
      v-for="(s, i) in specks"
      :key="i"
      class="absolute rounded-full"
      :style="{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.r * 2}px`, height: `${s.r * 2.3}px`, background: s.c, opacity: s.o }"
    />
  </div>
</template>
