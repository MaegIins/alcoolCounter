<script setup>
// Mes notifs : likes, commentaires, réponses, nouveaux abonnés, succès débloqués. Ouvrir la page les marque comme lues
// (les nouvelles restent surlignées le temps de la visite).
import { ref, onMounted } from 'vue'
import { api, catOf, timeAgo } from '../api'
import { goBack, openPost, openUser } from '../nav'
import { notifs } from '../notifs'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'
import PushCard from './PushCard.vue'

defineProps({ colors: { type: Object, default: () => ({}) }, me: { type: Object, default: null } })
const items = ref(null)
const next = ref(null)
const loading = ref(false)

async function load(more = false) {
  loading.value = true
  try {
    const r = await api(`/notifications${more && next.value ? `?before=${next.value}` : ''}`)
    items.value = more ? [...items.value, ...r.items] : r.items
    next.value = r.next
  } catch {
    items.value ??= []
  } finally {
    loading.value = false
  }
}
onMounted(async () => {
  await load()
  if (items.value.some((n) => !n.read)) await api('/notifications/read', { method: 'POST' }).catch(() => {})
  notifs.unread = 0
})

const KINDS = {
  like: { icon: 'fa-heart', color: 'text-neon', text: 'a liké ta conso' },
  comment: { icon: 'fa-comment', color: 'text-hi', text: 'a commenté ta conso' },
  reply: { icon: 'fa-comments', color: 'text-fort', text: 'a aussi commenté' },
  comment_like: { icon: 'fa-heart', color: 'text-neon', text: 'a liké ton commentaire' },
  follow: { icon: 'fa-user-plus', color: 'text-cocktail', text: 'te suit' },
  badge: { icon: 'fa-trophy', color: 'text-hi', text: '' },
}
const kindOf = (n) => KINDS[n.kind] ?? { icon: 'fa-bell', color: 'text-muted', text: '' }
const open = (n) => (n.kind === 'badge' ? openUser(n.actor_id, { tab: 'badges' }) : n.drink_id ? openPost(n.drink_id) : openUser(n.actor_id))
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <button class="mb-4 text-sm font-semibold text-muted hover:text-hi" @click="goBack"><Icon name="back" /> Retour</button>
    <h2 class="font-display text-2xl">Notifs</h2>
    <PushCard v-if="me" :me="me" compact />

    <div v-if="!items" class="py-20 text-center text-muted">Chargement…</div>
    <p v-else-if="!items.length" class="py-16 text-center text-muted">
      Rien pour l'instant. Les likes, commentaires, nouveaux abonnés et succès débloqués arriveront ici.
    </p>
    <ul v-else class="mt-3 divide-y divide-white/5">
      <li v-for="n in items" :key="n.id">
        <button
          class="flex w-full items-start gap-3 rounded-lg px-2 py-3 text-left hover:bg-white/5"
          :class="!n.read && 'bg-hi/[.06]'"
          @click="open(n)"
        >
          <span class="relative shrink-0">
            <span v-if="n.kind === 'badge'" class="flex h-9 w-9 items-center justify-center rounded-full bg-hi/15 text-xl">{{ n.badge?.icon ?? '🏅' }}</span>
            <Avatar v-else :user="{ id: n.actor_id, name: n.actor_name, avatar_v: n.actor_avatar_v }" :color="colors[n.actor_id]" :size="36" />
            <span class="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-panel text-[11px]" :class="kindOf(n).color">
              <Icon :name="kindOf(n).icon" />
            </span>
          </span>
          <span class="min-w-0 flex-1">
            <span v-if="n.kind === 'badge'" class="block">
              Succès débloqué : <b class="text-hi">{{ n.badge?.label ?? '?' }}</b>
              <span v-if="n.badge?.desc" class="block text-sm text-muted">{{ n.badge.desc }}</span>
            </span>
            <span v-else class="block">
              <b>{{ n.actor_name }}</b> {{ kindOf(n).text }}
              <template v-if="n.drink_name">
                : <span class="font-semibold" :style="{ color: catOf(n.drink_cat).hex }">{{ n.drink_name }}</span>
              </template>
            </span>
            <span v-if="n.comment" class="mt-0.5 line-clamp-2 block text-sm text-ink/80">« {{ n.comment }} »</span>
            <span class="text-xs text-faint">{{ timeAgo(n.at) }}</span>
          </span>
          <span v-if="!n.read" class="mt-2 h-2 w-2 shrink-0 rounded-full bg-hi" aria-label="Nouvelle" />
        </button>
      </li>
    </ul>
    <button v-if="next" class="btn btn-ghost mt-4 w-full py-2.5 text-sm font-medium" :disabled="loading" @click="load(true)">
      {{ loading ? 'Chargement…' : 'Plus ancien' }}
    </button>
  </div>
</template>
