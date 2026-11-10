<script setup>
// Carte des lieux (La carte › Lieux) : les lieux que je peux voir et qui ont une position.
// La liste vient déjà filtrée par le serveur (lieux privés non autorisés absents, position d'un « Chez X » d'un autre
// jamais envoyée) : la carte n'affiche que ce qu'on a le droit de voir.
// Leaflet + tuiles OpenStreetMap assombries. Repères en icônes Font Awesome, taille selon la fréquentation.
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { photoUrl } from '../api'
import { openPlace } from '../nav'
import { toast } from '../juice'
import Icon from './Icon.vue'

const props = defineProps({
  places: { type: Array, required: true },
  // Page d'un lieu : carte plus petite, sans titre, centrée sur ce lieu (mis en avant), les autres autour en discret
  focusId: { type: Number, default: null },
})
const compact = computed(() => props.focusId != null)

const located = computed(() => props.places.filter((p) => p.lat != null && p.lng != null))
const el = ref(null)
let map = null
let layer = null
const markers = new Map() // id du lieu → marqueur

// Texte inséré dans le HTML d'une bulle : on échappe tout ce qui vient des utilisateurs
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const iconOf = (p) => (p.home ? 'fa-house' : p.private ? 'fa-lock' : 'fa-location-dot')
// Fréquentation en couleur, du froid au chaud : cendre bleutée (peu de consos) → jaune → rouille (le QG).
// Par rang (du moins au plus fréquenté des lieux affichés) : les couleurs s'étalent, même quand quelques lieux
// écrasent tout en nombre de consos. À égalité, même couleur.
const HEAT = [[0, [111, 128, 140]], [0.5, [212, 188, 53]], [1, [184, 67, 44]]]
const levels = computed(() => [...new Set(located.value.map((p) => p.logs))].sort((a, b) => a - b))
const heatOf = (logs) => {
  const n = levels.value.length
  const t = n > 1 ? levels.value.indexOf(logs) / (n - 1) : 0.5
  const k = HEAT.findIndex(([at]) => at >= t)
  const [a, ca] = HEAT[Math.max(0, k - 1)]
  const [b, cb] = HEAT[Math.max(0, k)]
  const f = b > a ? (t - a) / (b - a) : 0
  const rgb = ca.map((v, i) => Math.round(v + (cb[i] - v) * f))
  // Texte foncé sur les teintes claires, clair sur les foncées
  const light = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] > 140
  return { bg: `rgb(${rgb.join(',')})`, fg: light ? '#17140a' : '#f0e6cc' }
}
const HEAT_CSS = `linear-gradient(90deg, ${HEAT.map(([at, c]) => `rgb(${c.join(',')}) ${at * 100}%`).join(', ')})`
function markerIcon(p) {
  // Même taille pour tous : la couleur dit la fréquentation
  const focus = p.id === props.focusId
  const dim = compact.value && !focus
  const size = focus ? 44 : dim ? 26 : 34
  const { bg, fg } = heatOf(p.logs)
  return L.divIcon({
    className: 'ardoise-pin',
    html: `<span class="ardoise-pin__dot${p.private ? ' is-private' : ''}${p.my_logs && !compact.value ? ' is-mine' : ''}${focus ? ' is-focus' : ''}${dim ? ' is-dim' : ''}" style="width:${size}px;height:${size}px;background:${bg};color:${fg}">
      <i class="fa-solid ${iconOf(p)}" style="font-size:${Math.round(size * 0.42)}px"></i></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
}
function popupHtml(p) {
  const img = p.photo_key ? `<img src="${photoUrl(p.photo_key)}" alt="" class="ardoise-pop__img">` : ''
  const vis = p.private ? '<i class="fa-solid fa-lock"></i> Privé' : '<i class="fa-solid fa-globe"></i> Public'
  return `<div class="ardoise-pop">${img}
    <div class="ardoise-pop__name">${esc(p.name)}</div>
    ${p.address ? `<div class="ardoise-pop__addr"><i class="fa-solid fa-map-pin"></i> ${esc(p.address)}</div>` : ''}
    <div class="ardoise-pop__meta">${p.logs} conso${p.logs > 1 ? 's' : ''} · ${p.drinkers} buveur${p.drinkers > 1 ? 's' : ''}${p.my_logs ? ` · ${p.my_logs} de toi` : ''}</div>
    <div class="ardoise-pop__meta">${vis}</div>
    <button type="button" class="ardoise-pop__btn" data-place="${p.id}">Voir le lieu <i class="fa-solid fa-arrow-right"></i></button>
  </div>`
}

function draw({ fit = true } = {}) {
  if (!map) return
  layer.clearLayers()
  markers.clear()
  for (const p of located.value) {
    // Pas d'option `title` (infobulle blanche du navigateur) : une étiquette Leaflet aux couleurs de l'appli,
    // au survol seulement, cachée quand la bulle du lieu est ouverte
    const m = L.marker([p.lat, p.lng], { icon: markerIcon(p), alt: p.name, keyboard: true, riseOnHover: true })
      .bindPopup(popupHtml(p), { maxWidth: 240, minWidth: 180, className: 'ardoise-popup' })
      .bindTooltip(esc(p.name), { direction: 'top', offset: [0, -markerIcon(p).options.iconSize[1] / 2], className: 'ardoise-tip', opacity: 1 })
    m.on('popupopen', () => m.closeTooltip())
    m.addTo(layer)
    markers.set(p.id, m)
  }
  // Centré sur moi : on n'en bouge pas quand la liste change (« Tout voir » pour tout recadrer)
  if (fit && !onMe) (compact.value ? centerOnFocus() : fitAll())
}
// Page d'un lieu : centré dessus, au niveau d'une rue, et devant les autres repères
function centerOnFocus() {
  const p = located.value.find((x) => x.id === props.focusId)
  if (!p || !map) return
  map.setView([p.lat, p.lng], 16)
  markers.get(p.id)?.setZIndexOffset(1000)
}
// animate : seulement au bouton « Tout voir » (un cadrage automatique animé pourrait écraser le centrage sur moi)
function fitAll(animate = false) {
  onMe = false
  if (!map || !located.value.length) return
  const b = L.latLngBounds(located.value.map((p) => [p.lat, p.lng]))
  map.fitBounds(b, { padding: [36, 36], maxZoom: 16, animate })
}

onMounted(() => {
  map = L.map(el.value, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, tap: true })
  // Tuiles OpenStreetMap (gratuites, sans clé ; attribution obligatoire), assombries en CSS (.ardoise-map .leaflet-tile-pane)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">contributeurs OpenStreetMap</a>',
  }).addTo(map)
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>')
  layer = L.layerGroup().addTo(map)
  meLayer = L.layerGroup().addTo(map) // à part : le point « Toi » survit aux redessins des lieux
  map.setView([46.6, 2.4], 5) // la France, en attendant les lieux
  // Molette : seulement quand la carte a le focus (on ne la zoome pas en faisant défiler la page)
  map.on('focus', () => map.scrollWheelZoom.enable())
  map.on('blur', () => map.scrollWheelZoom.disable())
  // « Voir le lieu » dans une bulle
  el.value.addEventListener('click', onClick)
  draw()
  // Plan des lieux (pas la page d'un lieu) : centré sur moi, à l'échelle de la ville, si j'accepte de donner ma position
  if (!compact.value) autoLocate()
})
onBeforeUnmount(() => {
  el.value?.removeEventListener('click', onClick)
  map?.remove()
  map = null
})
function onClick(e) {
  const btn = e.target.closest?.('[data-place]')
  if (btn) openPlace(Number(btn.dataset.place))
}
// La liste change (recherche, filtre, rechargement) : on redessine ; on recadre seulement si l'ensemble a changé
let lastIds = ''
watch(located, (list) => {
  const ids = list.map((p) => p.id).join(',')
  draw({ fit: ids !== lastIds })
  lastIds = ids
}, { deep: true })

// Centrer sur un lieu (depuis la liste) et ouvrir sa bulle
async function focus(id) {
  const m = markers.get(id)
  if (!m || !map) return
  el.value.scrollIntoView({ behavior: 'smooth', block: 'center' })
  await nextTick()
  map.setView(m.getLatLng(), Math.max(map.getZoom(), 16), { animate: true })
  m.openPopup()
}
defineExpose({ focus })

// Plein écran : la carte recouvre l'appli (Échap ou ✕ pour sortir). Pas l'API Fullscreen : absente sur iPhone.
const full = ref(false)
async function toggleFull(on = !full.value) {
  full.value = on
  document.body.style.overflow = on ? 'hidden' : ''
  await nextTick()
  map?.invalidateSize()
  if (compact.value) centerOnFocus()
  else if (!onMe) fitAll()
}
const onKey = (e) => e.key === 'Escape' && full.value && toggleFull(false)
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  if (full.value) document.body.style.overflow = ''
})

// Ma position (pour voir les lieux autour de moi)
const CITY_ZOOM = 12 // on voit la ville et ses alentours
let meLayer = null
let onMe = false // la vue est centrée sur moi
const locating = ref(false)
function showMe(pos, zoom) {
  if (!map) return
  const ll = [pos.coords.latitude, pos.coords.longitude]
  onMe = true
  // Un zoom animé en cours finirait par écraser la vue : on attend qu'il se termine
  if (map._animatingZoom) return map.once('zoomend', () => showMe(pos, zoom))
  map.setView(ll, zoom)
  meLayer.clearLayers()
  L.circleMarker(ll, { radius: 7, color: '#e4dcc3', weight: 2, fillColor: '#6f93ad', fillOpacity: 0.9 }).addTo(meLayer).bindTooltip('Toi')
}
// À l'ouverture : sans bruit (pas de message si c'est refusé ; déjà refusé = on ne redemande pas)
async function autoLocate() {
  if (!navigator.geolocation) return
  const state = await navigator.permissions?.query({ name: 'geolocation' }).then((p) => p.state).catch(() => null)
  if (state === 'denied') return
  navigator.geolocation.getCurrentPosition((pos) => showMe(pos, CITY_ZOOM), () => {}, { maximumAge: 10 * 60e3, timeout: 10000 })
}
function locateMe() {
  if (!navigator.geolocation) return toast('Ton navigateur ne donne pas ta position')
  locating.value = true
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locating.value = false
      showMe(pos, Math.max(CITY_ZOOM + 2, map.getZoom()))
    },
    () => {
      locating.value = false
      toast('Position refusée ou introuvable')
    },
    { enableHighAccuracy: true, timeout: 10000 }
  )
}
</script>

<template>
  <section class="space-y-3">
    <div v-if="!compact" class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-lg font-bold"><Icon name="fa-map-location-dot" class="text-hi" /> Le plan</h3>
      <div class="flex gap-2 text-sm">
        <button class="btn btn-ghost px-3 py-1.5 font-semibold" :disabled="!located.length" @click="fitAll(true)"><Icon name="fa-earth-europe" /> Tout voir</button>
        <button class="btn btn-ghost px-3 py-1.5 font-semibold" :disabled="locating" @click="locateMe"><Icon name="fa-location-crosshairs" /> Autour de moi</button>
      </div>
    </div>
    <!-- isolate : les calques Leaflet (z-index 400+) restent sous la barre du bas et les fenêtres de l'appli -->
    <!-- Plein écran : le bloc part dans <body> (un parent animé piégerait le position: fixed) ; Leaflet suit son élément -->
    <Teleport to="body" :disabled="!full">
    <div class="isolate" :class="full ? 'fixed inset-0 z-[95] bg-paper' : 'box relative'">
      <!-- La taille va sur ce conteneur : Vue ne doit jamais réécrire la classe de l'élément de Leaflet (il y ajoute les siennes) -->
      <div :class="full ? 'h-full' : compact ? 'h-60' : 'h-80 sm:h-96'">
        <div ref="el" class="ardoise-map h-full w-full" role="application" :aria-label="compact ? 'Plan du lieu' : 'Plan des lieux'" tabindex="0" />
      </div>
      <button
        class="absolute top-2.5 right-2.5 z-[500] flex h-9 w-9 items-center justify-center rounded-full bg-panel text-hi shadow-lg shadow-black/60 hover:bg-raised"
        :aria-label="full ? 'Quitter le plein écran' : 'Plein écran'"
        @click="toggleFull()"
      >
        <Icon :name="full ? 'fa-xmark' : 'fa-expand'" />
      </button>
      <!-- Page d'un lieu : revenir sur lui après avoir déplacé la carte -->
      <button v-if="compact" class="absolute right-2.5 bottom-7 z-[500] flex h-9 w-9 items-center justify-center rounded-full bg-panel text-hi shadow-lg shadow-black/60 hover:bg-raised" aria-label="Recentrer sur le lieu" @click="centerOnFocus">
        <Icon name="fa-location-crosshairs" />
      </button>
      <!-- Légende de la fréquentation -->
      <div v-if="located.length > 1 && !compact" class="pointer-events-none absolute bottom-2.5 left-2.5 z-[500] rounded-lg bg-paper/85 px-2.5 py-1.5 text-[11px] text-muted shadow-lg shadow-black/60">
        <div class="mb-1 h-1.5 w-32 rounded-full" :style="{ background: HEAT_CSS }" />
        <div class="flex justify-between gap-3"><span>Peu fréquenté</span><span>Le QG</span></div>
      </div>
      <div v-if="!located.length && !compact" class="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center p-6 text-center">
        <p class="rounded-xl bg-paper/90 px-4 py-3 text-sm text-muted">
          Aucun lieu positionné{{ places.length ? ' dans cette liste' : '' }}. Ajoute une position depuis la page d'un lieu
          (« Ma position actuelle » quand tu y es).
        </p>
      </div>
    </div>
    </Teleport>
    <p v-if="!compact" class="text-xs text-faint">
      {{ located.length }} lieu{{ located.length > 1 ? 'x' : '' }} sur {{ places.length }} ont une position.
      Seuls ceux que tu as le droit de voir apparaissent ; la position d'un « Chez … » n'est montrée qu'à son propriétaire.
    </p>
  </section>
</template>

<style>
/* Leaflet aux couleurs de l'appli (non scopé : Leaflet crée ces éléments lui-même) */
.ardoise-map { background: #0c0b07; font-family: inherit; }
/* Fond de carte en mode sombre, teinté vers le jaune de l'appli */
.ardoise-map .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9) saturate(0.35) sepia(0.25); }
.ardoise-map .leaflet-control-zoom a { background: #1a1811; color: #e4dcc3; border-color: #2c281c; }
.ardoise-map .leaflet-control-zoom a:hover { background: #26231a; }
.ardoise-map .leaflet-control-attribution { background: rgb(16 15 10 / 0.75); color: #978e76; }
.ardoise-map .leaflet-control-attribution a { color: #d4bc35; }
.ardoise-pin { background: none; border: none; }
.ardoise-pin__dot {
  display: flex; align-items: center; justify-content: center; border-radius: 9999px;
  background: #d4bc35; color: #17140a; border: 2px solid #17140a;
  box-shadow: 0 3px 10px rgb(0 0 0 / 0.6);
  transition: transform 0.15s;
}
.ardoise-pin__dot.is-private { border-style: dashed; border-color: #f0e6cc; }
.ardoise-pin__dot.is-mine { outline: 3px solid rgb(212 188 53 / 0.35); }
.ardoise-pin__dot.is-focus { outline: 4px solid rgb(212 188 53 / 0.45); box-shadow: 0 0 0 10px rgb(212 188 53 / 0.15), 0 4px 14px rgb(0 0 0 / 0.7); }
.ardoise-pin__dot.is-dim { opacity: 0.65; filter: saturate(0.6); }
.leaflet-marker-icon:hover .ardoise-pin__dot { transform: scale(1.12); }
.ardoise-popup .leaflet-popup-content-wrapper, .ardoise-popup .leaflet-popup-tip { background: #1a1811; color: #e4dcc3; box-shadow: 0 8px 24px rgb(0 0 0 / 0.7); }
.ardoise-popup .leaflet-popup-content { margin: 12px; }
.ardoise-popup a.leaflet-popup-close-button { color: #978e76; }
.ardoise-pop__img { width: 100%; height: 96px; object-fit: cover; border-radius: 8px; margin-bottom: 8px; }
.ardoise-pop__name { font-weight: 700; font-size: 15px; line-height: 1.2; }
.ardoise-pop__addr { margin-top: 2px; font-size: 12px; color: #e4dcc3cc; }
.ardoise-pop__meta { margin-top: 2px; font-size: 12px; color: #978e76; }
.ardoise-pop__btn {
  margin-top: 8px; width: 100%; padding: 6px 10px; border-radius: 8px; font-weight: 700; font-size: 13px;
  background: #d4bc35; color: #17140a; cursor: pointer;
}
.ardoise-pop__btn:hover { filter: brightness(1.08); }
.ardoise-tip { background: #1a1811; color: #e4dcc3; border: 1px solid #2c281c; border-radius: 6px; font-weight: 700; font-size: 12px; padding: 3px 8px; box-shadow: 0 4px 12px rgb(0 0 0 / 0.6); }
.ardoise-tip.leaflet-tooltip-top::before { border-top-color: #1a1811; }
</style>
