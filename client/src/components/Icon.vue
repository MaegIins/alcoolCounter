<script setup>
// Icône Font Awesome par nom court (ou directement une classe « fa-… »), taille en px, couleur = currentColor.
//   <Icon name="search" />   <Icon name="fa-wine-glass" :size="18" />   <Icon name="star" regular />
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 0 }, // 0 = taille du texte autour
  regular: Boolean, // style « contour » (étoile vide…)
})
const NAMES = {
  feed: 'fa-newspaper',
  rank: 'fa-trophy',
  plus: 'fa-plus',
  carte: 'fa-scroll',
  home: 'fa-beer-mug-empty',
  user: 'fa-user',
  close: 'fa-xmark',
  back: 'fa-arrow-left',
  next: 'fa-arrow-right',
  prev: 'fa-chevron-left',
  more: 'fa-chevron-right',
  search: 'fa-magnifying-glass',
  camera: 'fa-camera',
  gear: 'fa-gear',
  edit: 'fa-pen',
  review: 'fa-comment',
  calendar: 'fa-calendar-days',
  trash: 'fa-trash',
  star: 'fa-star',
  check: 'fa-check',
  water: 'fa-droplet',
  smoke: 'fa-smoking',
  crown: 'fa-crown',
  lock: 'fa-lock',
  chair: 'fa-chair',
  door: 'fa-door-open',
  logout: 'fa-right-from-bracket',
  share: 'fa-share-nodes',
}
const cls = computed(() => [props.regular ? 'fa-regular' : 'fa-solid', props.name.startsWith('fa-') ? props.name : NAMES[props.name] ?? 'fa-circle'])
</script>

<template>
  <i :class="cls" :style="size ? { fontSize: `${size}px` } : undefined" aria-hidden="true" />
</template>
