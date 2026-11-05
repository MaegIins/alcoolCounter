<script setup>
// Vignette d'une boisson. Avec une photo : une affiche (format 2:3). Sans photo, pas de grosse carte vide :
// une petite pastille carrée à la couleur de la catégorie, avec son icône.
import { computed } from 'vue'
import { catOf, photoUrl } from '../api'

const props = defineProps({
  drink: { type: Object, default: null }, // { name, cat, cl, abv, photo_key? } ; null = place vide
  photo: { type: String, default: '' }, // URL prioritaire (aperçu avant envoi)
  width: { type: Number, default: 96 }, // largeur de l'affiche en px
  fluid: Boolean, // prend toute la largeur disponible (grilles)
  icon: { type: Number, default: 48 }, // côté max de la pastille sans photo
})
const cat = computed(() => catOf(props.drink?.cat))
// Une conso (qui a `product_photo_key`) prend la photo de son produit : sa photo à elle est affichée à part
const src = computed(() => {
  const d = props.drink
  return props.photo || photoUrl(d && ('product_photo_key' in d ? d.product_photo_key : d.photo_key))
})
const side = computed(() => Math.min(props.width, props.icon))
defineExpose({ hasPhoto: () => !!src.value })
</script>

<template>
  <div
    v-if="src"
    class="poster relative shrink-0 overflow-hidden rounded"
    :style="fluid ? { width: '100%', aspectRatio: '2 / 3' } : { width: `${width}px`, height: `${width * 1.5}px` }"
  >
    <img :src="src" :alt="drink?.name ?? ''" class="h-full w-full object-cover" loading="lazy" />
  </div>
  <div
    v-else-if="drink"
    class="flex shrink-0 items-center justify-center rounded-lg"
    :style="{
      ...(fluid ? { width: '100%', aspectRatio: '1' } : { width: `${side}px`, height: `${side}px` }),
      background: `${cat.hex}26`,
      boxShadow: `inset 0 0 0 1px ${cat.hex}55`,
      fontSize: fluid ? '1.9rem' : `${side * 0.52}px`,
    }"
    :title="drink.name"
  >
    <i :class="['fa-solid', cat.fa]" :style="{ color: cat.hex, fontSize: fluid ? '1.6rem' : `${side * 0.42}px` }" aria-hidden="true" />
  </div>
  <div v-else class="shrink-0 rounded-lg bg-sunk" :style="fluid ? { width: '100%', aspectRatio: '1' } : { width: `${side}px`, height: `${side}px` }" />
</template>
