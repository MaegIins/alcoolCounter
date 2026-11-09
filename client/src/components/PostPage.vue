<script setup>
// Page d'une conso (/conso/:id) : qui, quoi, la note, l'avis en entier, la photo en grand, les likes et les commentaires.
import { ref, computed, watch } from 'vue'
import { api, catOf, num, fmtDrink, prettyDay, timeAgo, photoUrl } from '../api'
import { ui, goBack, openUser, openProduct, openPlace, openLog } from '../nav'
import Avatar from './Avatar.vue'
import Poster from './Poster.vue'
import Stars from './Stars.vue'
import Icon from './Icon.vue'
import LikeButton from './LikeButton.vue'
import Comments from './Comments.vue'

const props = defineProps({
  postId: { type: Number, required: true },
  me: Object,
  colors: { type: Object, default: () => ({}) },
})
const p = ref(null)
const error = ref('')
const zoom = ref(false)
const mine = computed(() => p.value?.user_id === props.me?.id)
const cat = computed(() => catOf(p.value?.cat))
const time = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

async function load() {
  try {
    p.value = await api(`/drinks/${props.postId}`)
    error.value = ''
  } catch (e) {
    error.value = e.status === 404 ? 'Cette conso n’existe plus.' : e.message
  }
}
watch(() => [props.postId, ui.refresh], load, { immediate: true }) // rechargée après une modif (crayon)

// Like : la liste « aimé par » suit
function onLike({ likes, liked }) {
  const others = p.value.likers.filter((u) => u.id !== props.me.id)
  p.value = { ...p.value, likes, liked, likers: liked ? [{ id: props.me.id, name: props.me.name, avatar_v: props.me.avatar_v }, ...others] : others }
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <button class="mb-4 text-sm font-semibold text-muted hover:text-hi" @click="goBack"><Icon name="back" /> Retour</button>

    <p v-if="error" class="rounded-xl bg-alert px-4 py-2.5 text-sm font-semibold text-white">{{ error }}</p>
    <div v-else-if="!p" class="py-20 text-center text-muted">Chargement…</div>

    <article v-else>
      <!-- Qui, quand -->
      <header class="flex items-center gap-3">
        <button class="shrink-0" :aria-label="`Profil de ${p.user_name}`" @click="openUser(p.user_id)">
          <Avatar :user="{ id: p.user_id, name: p.user_name, avatar_v: p.avatar_v }" :color="colors[p.user_id]" :size="44" />
        </button>
        <div class="min-w-0 flex-1">
          <button class="block truncate font-bold hover:text-hi" @click="openUser(p.user_id)">{{ mine ? 'Toi' : p.user_name }}</button>
          <span class="text-sm text-faint"><span class="first-letter:uppercase">{{ prettyDay(p.day) }}</span> · {{ time(p.at) }} · {{ timeAgo(p.at) }}</span>
        </div>
        <button v-if="mine" class="btn btn-ghost flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm font-semibold" @click="openLog({ edit: p })">
          <Icon name="edit" :size="14" /> Modifier
        </button>
      </header>

      <!-- La boisson -->
      <section class="mt-6 flex gap-4">
        <button class="shrink-0 self-start" :class="p.product_id ? 'lift' : 'cursor-default'" :tabindex="p.product_id ? 0 : -1" @click="p.product_id && openProduct(p.product_id)">
          <Poster :drink="p" :width="96" :icon="64" />
        </button>
        <div class="min-w-0 flex-1">
          <h1 class="font-display text-3xl leading-tight break-words">
            <button v-if="p.product_id" class="text-left hover:text-hi" @click="openProduct(p.product_id)">{{ p.name }}</button>
            <template v-else>{{ p.name }}</template>
          </h1>
          <p class="mt-1 text-muted">
            <Icon :name="cat.fa" :style="{ color: cat.hex }" /> {{ fmtDrink(p) }}<template v-if="p.maker"> · {{ p.maker }}</template>
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Stars v-if="p.rating" :value="p.rating" :size="20" />
            <span v-if="p.units" class="font-semibold" :style="{ color: cat.hex }">+{{ num(p.units) }} verre{{ p.units >= 2 ? 's' : '' }}</span>
          </div>
          <button v-if="p.place" class="mt-1 text-sm text-faint hover:text-hi hover:underline" @click="openPlace(p.place_id)">
            <Icon name="fa-location-dot" /> {{ p.place }}
          </button>
        </div>
      </section>

      <!-- L'avis -->
      <p v-if="p.review" class="mt-6 text-lg leading-relaxed whitespace-pre-line break-words text-ink/90">{{ p.review }}</p>
      <p v-else-if="mine && !p.photo_key" class="mt-6 text-sm text-faint">
        Pas d'avis.
        <button class="font-semibold text-hi hover:underline" @click="openLog({ edit: p })">En écrire un</button>
      </p>

      <button v-if="p.photo_key" class="cursor-zoom-in mt-6 block w-full" aria-label="Agrandir la photo" @click="zoom = true">
        <img :src="photoUrl(p.photo_key)" alt="" class="max-h-[32rem] w-full rounded-lg object-cover" />
      </button>

      <!-- Likes -->
      <section class="mt-6 flex items-center gap-4 border-y border-line py-3">
        <LikeButton :log="p" big @change="onLike" />
        <div v-if="p.likers.length" class="flex min-w-0 items-center gap-2 text-sm text-muted">
          <div class="flex -space-x-2">
            <button v-for="u in p.likers.slice(0, 6)" :key="u.id" class="rounded-full ring-2 ring-paper" :title="u.name" @click="openUser(u.id)">
              <Avatar :user="u" :color="colors[u.id]" :size="24" />
            </button>
          </div>
          <span class="truncate">
            {{ p.likers.slice(0, 2).map((u) => (u.id === me?.id ? 'toi' : u.name)).join(', ') }}<template v-if="p.likers.length > 2"> et {{ p.likers.length - 2 }} autre{{ p.likers.length > 3 ? 's' : '' }}</template>
          </span>
        </div>
        <span v-else class="text-sm text-faint">Personne n'a encore liké.</span>
      </section>

      <!-- Commentaires -->
      <section class="mt-6">
        <h2 class="kicker mb-1">Commentaires</h2>
        <Comments :log="p" :me="me" :colors="colors" :autofocus="false" />
      </section>
    </article>

    <Teleport to="body">
      <div v-if="zoom" class="fixed inset-0 z-[90] flex cursor-zoom-out items-center justify-center bg-black/90 p-4" @click="zoom = false">
        <img :src="photoUrl(p.photo_key)" alt="" class="max-h-full max-w-full rounded-md" />
      </div>
    </Teleport>
  </div>
</template>
