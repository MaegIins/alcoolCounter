<script setup>
// Commentaires sous une conso : la liste, et un champ pour en ajouter.
// On peut supprimer les siens ; l'auteur de la conso (et un admin) peut supprimer tous ceux de sa conso.
import { ref, onMounted, nextTick } from 'vue'
import { api, timeAgo } from '../api'
import { openUser } from '../nav'
import { toast } from '../juice'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'
import LikeButton from './LikeButton.vue'

const MAX = 500
const props = defineProps({
  log: { type: Object, required: true },
  me: Object,
  colors: { type: Object, default: () => ({}) },
  autofocus: { type: Boolean, default: true },
})
const emit = defineEmits(['count'])
const items = ref(null)
const text = ref('')
const sending = ref(false)
const input = ref(null)

const set = (list) => {
  items.value = list
  emit('count', list.length)
}
onMounted(async () => {
  set(await api(`/drinks/${props.log.id}/comments`).catch(() => []))
  await nextTick()
  if (props.autofocus) input.value?.focus({ preventScroll: true })
})

async function send() {
  const body = text.value.trim()
  if (!body || sending.value) return
  sending.value = true
  try {
    set(await api(`/drinks/${props.log.id}/comments`, { method: 'POST', body: { body } }))
    text.value = ''
  } catch (e) {
    toast(e.message)
  } finally {
    sending.value = false
  }
}
async function remove(c) {
  try {
    set(await api(`/comments/${c.id}`, { method: 'DELETE' }))
  } catch (e) {
    toast(e.message)
  }
}
// Répondre : « @pseudo » au début du champ
async function reply(c) {
  const tag = `@${c.user_name} `
  if (!text.value.startsWith(tag)) text.value = tag + text.value
  await nextTick()
  input.value?.focus()
  input.value?.setSelectionRange(text.value.length, text.value.length)
}
// Le compteur sous le commentaire suit le cœur
const onLike = (c, r) => Object.assign(c, r)
const canDelete = (c) => c.user_id === props.me?.id || props.log.user_id === props.me?.id || props.me?.is_admin
// Entrée envoie, Maj+Entrée va à la ligne
function onKey(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    send()
  }
}
</script>

<template>
  <div class="mt-3 border-l-2 border-line pl-3">
    <p v-if="!items" class="py-1 text-sm text-faint">Chargement…</p>
    <ul v-else-if="items.length" class="space-y-2.5">
      <li v-for="c in items" :key="c.id" class="group flex items-start gap-2 text-sm">
        <button class="mt-0.5 shrink-0" :aria-label="`Profil de ${c.user_name}`" @click="openUser(c.user_id)">
          <Avatar :user="{ id: c.user_id, name: c.user_name, avatar_v: c.avatar_v }" :color="colors[c.user_id]" :size="20" />
        </button>
        <div class="min-w-0 flex-1">
          <p class="break-words whitespace-pre-line text-ink/90">
            <button class="mr-1 font-semibold text-ink hover:text-hi" @click="openUser(c.user_id)">{{ c.user_id === me?.id ? 'Toi' : c.user_name }}</button>{{ c.body }}
          </p>
          <div class="mt-0.5 flex items-center gap-3 text-xs font-medium text-faint">
            <span>{{ timeAgo(c.at) }}</span>
            <span v-if="c.likes">{{ c.likes }} j'aime</span>
            <button class="hover:text-ink" @click="reply(c)">Répondre</button>
            <button v-if="canDelete(c)" class="hover:text-alert" @click="remove(c)">Supprimer</button>
          </div>
        </div>
        <LikeButton :log="c" kind="comments" tiny class="mt-1 shrink-0 px-1" @change="onLike(c, $event)" />
      </li>
    </ul>

    <form class="mt-2.5 flex items-end gap-2" @submit.prevent="send">
      <textarea
        ref="input"
        v-model="text"
        rows="1"
        :maxlength="MAX"
        placeholder="Commenter…"
        aria-label="Ton commentaire"
        class="field-sizing-content max-h-32 min-h-9 min-w-0 flex-1 resize-none rounded-lg bg-sunk px-3 py-1.5 text-sm outline-none placeholder:text-faint focus:ring-1 focus:ring-hi/50"
        @keydown="onKey"
      />
      <button
        type="submit"
        class="btn btn-hi flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        :disabled="!text.trim() || sending"
        aria-label="Envoyer"
      ><Icon name="fa-paper-plane" :size="14" /></button>
    </form>
  </div>
</template>
