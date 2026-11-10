<script setup>
// Liste des abonnés ou abonnements d'une personne : toucher quelqu'un ouvre son profil, et on peut le suivre d'ici.
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { api } from '../api'
import { openUser, bump } from '../nav'
import { toast } from '../juice'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'

const props = defineProps({ userId: Number, kind: String, me: Object, colors: Object }) // kind : 'followers' | 'following'
const emit = defineEmits(['close'])
const list = ref(null)

onMounted(async () => {
  document.body.style.overflow = 'hidden'
  list.value = await api(`/users/${props.userId}/${props.kind}`).catch(() => [])
})
onBeforeUnmount(() => (document.body.style.overflow = ''))

function go(id) {
  emit('close')
  openUser(id)
}
async function toggle(u) {
  try {
    const r = await api(`/users/${u.id}/follow`, { method: u.follow === 'none' ? 'PUT' : 'DELETE' })
    u.follow = r.follow
    u.iFollow = r.iFollow
    bump()
  } catch (e) {
    toast(e.message)
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" @click.self="emit('close')">
      <div class="sheet-panel box max-h-[80vh] w-full max-w-md overflow-y-auto rounded-b-none sm:rounded-b-[.6rem]" role="dialog" aria-modal="true">
        <div class="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <h3 class="font-bold">{{ kind === 'followers' ? 'Abonnés' : 'Abonnements' }}</h3>
          <button class="h-9 w-9 rounded-full text-muted hover:bg-white/10 hover:text-ink" aria-label="Fermer" @click="emit('close')"><Icon name="close" /></button>
        </div>
        <p v-if="!list" class="py-10 text-center text-muted">Chargement…</p>
        <p v-else-if="!list.length" class="py-10 text-center text-sm text-muted">Personne pour l'instant.</p>
        <ul v-else class="divide-y divide-white/5 pb-2">
          <li v-for="u in list" :key="u.id" class="flex items-center gap-3 px-5 py-2.5">
            <button class="flex min-w-0 flex-1 items-center gap-3 text-left hover:text-hi" @click="go(u.id)">
              <Avatar :user="u" :color="colors[u.id]" :size="40" class="rounded-full" />
              <span class="truncate font-bold">{{ u.id === me.id ? 'Toi' : u.name }}</span>
            </button>
            <button v-if="u.id !== me.id" class="btn shrink-0 px-3 py-1.5 text-sm font-bold" :class="u.follow === 'none' ? 'btn-hi' : 'btn-ghost'" @click="toggle(u)">
              {{ u.follow === 'yes' ? 'Suivi' : u.follow === 'pending' ? 'Demandé' : u.private ? 'Demander' : 'Suivre' }}
            </button>
          </li>
        </ul>
      </div>
    </div>
  </Teleport>
</template>
