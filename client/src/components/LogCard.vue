<script setup>
// Une conso dans un fil : qui, quoi, quand, la note, l'avis, la photo.
// Toucher l'affiche ouvre la fiche du produit ; le nom de la personne, son profil ; le crayon pour compléter les siennes.
import { ref, computed } from 'vue'
import { catOf, num, fmtDrink, prettyDay, timeAgo, photoUrl } from '../api'
import { openUser, openProduct, openLog, openPlace } from '../nav'
import Avatar from './Avatar.vue'
import Poster from './Poster.vue'
import Stars from './Stars.vue'
import Icon from './Icon.vue'

const props = defineProps({
  log: { type: Object, required: true },
  me: Object,
  colors: { type: Object, default: () => ({}) },
  showUser: { type: Boolean, default: true },
  showPoster: { type: Boolean, default: true }, // false sur la fiche d'un produit (déjà en haut)
})
const mine = computed(() => props.log.user_id === props.me?.id)
const long = computed(() => (props.log.review?.length ?? 0) > 280)
const open = ref(false)
const zoom = ref(false)
</script>

<template>
  <article class="flex gap-3.5 py-4">
    <button
      v-if="showPoster"
      class="shrink-0 self-start"
      :class="log.product_id ? 'lift' : 'cursor-default'"
      :aria-label="log.product_id ? `Fiche de ${log.name}` : undefined"
      :tabindex="log.product_id ? 0 : -1"
      @click="log.product_id && openProduct(log.product_id)"
    >
      <Poster :drink="log" :width="64" />
    </button>

    <div class="min-w-0 flex-1">
      <div v-if="showUser" class="mb-1 flex items-center gap-2 text-sm">
        <button class="flex min-w-0 items-center gap-2 hover:text-ink" @click="openUser(log.user_id)">
          <Avatar :user="{ id: log.user_id, name: log.user_name, avatar_v: log.avatar_v }" :color="colors[log.user_id]" :size="20" />
          <span class="truncate font-semibold">{{ mine ? 'Toi' : log.user_name }}</span>
        </button>
        <span class="shrink-0 text-faint">{{ timeAgo(log.at) }}</span>
      </div>

      <div class="flex items-start gap-2">
        <h3 class="min-w-0 flex-1 text-lg leading-snug font-bold break-words">
          <button v-if="log.product_id" class="text-left hover:text-hi hover:underline" @click="openProduct(log.product_id)">{{ log.name }}</button>
          <template v-else>{{ log.name }}</template>
          <span class="ml-1.5 font-sans text-sm font-normal text-muted">{{ fmtDrink(log) }}</span>
        </h3>
        <button v-if="mine" class="-mt-0.5 -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-faint hover:bg-raised hover:text-ink" :aria-label="`Modifier ${log.name}`" @click="openLog({ edit: log })">
          <Icon name="edit" :size="16" />
        </button>
      </div>

      <div class="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted">
        <Stars v-if="log.rating" :value="log.rating" :size="13" />
        <span v-if="log.units" :style="{ color: catOf(log.cat).hex }">+{{ num(log.units) }}</span>
        <span class="text-faint first-letter:uppercase">{{ prettyDay(log.day) }}</span>
        <button v-if="log.place" class="text-faint hover:text-hi hover:underline" @click="openPlace(log.place_id)"><Icon name="fa-location-dot" /> {{ log.place }}</button>
      </div>

      <p v-if="log.review" class="mt-2 whitespace-pre-line text-[0.95rem] text-ink/90" :class="long && !open && 'line-clamp-4'">{{ log.review }}</p>
      <button v-if="long" class="mt-1 text-sm font-medium text-muted hover:text-ink" @click="open = !open">{{ open ? 'Moins' : 'Lire la suite' }}</button>

      <button v-if="log.photo_key" class="mt-2.5 block" aria-label="Agrandir la photo" @click="zoom = true">
        <img :src="photoUrl(log.photo_key)" alt="" loading="lazy" class="max-h-64 rounded-md object-cover" />
      </button>
    </div>

    <Teleport to="body">
      <div v-if="zoom" class="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4" @click="zoom = false">
        <img :src="photoUrl(log.photo_key)" alt="" class="max-h-full max-w-full rounded-md" />
      </div>
    </Teleport>
  </article>
</template>
