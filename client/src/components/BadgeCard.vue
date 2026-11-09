<script setup>
// Dans le fil : quelqu'un a débloqué un ou plusieurs succès (au même moment). Toucher ouvre ses badges.
import { computed } from 'vue'
import { timeAgo } from '../api'
import { openUser } from '../nav'
import Avatar from './Avatar.vue'

const props = defineProps({
  item: { type: Object, required: true },
  me: Object,
  colors: { type: Object, default: () => ({}) },
})
const mine = computed(() => props.item.user_id === props.me?.id)
const open = () => openUser(props.item.user_id, { tab: 'badges' })
</script>

<template>
  <article class="flex gap-3.5 py-4">
    <button class="flex h-16 w-16 shrink-0 items-center justify-center self-start rounded-md bg-hi/10 text-3xl" :aria-label="`Badges de ${item.user_name}`" @click="open">
      {{ item.badges[0].icon }}
    </button>
    <div class="min-w-0 flex-1">
      <div class="mb-1 flex items-center gap-2 text-sm">
        <button class="flex min-w-0 items-center gap-2 hover:text-ink" @click="openUser(item.user_id)">
          <Avatar :user="{ id: item.user_id, name: item.user_name, avatar_v: item.avatar_v }" :color="colors[item.user_id]" :size="20" />
          <span class="truncate font-semibold">{{ mine ? 'Toi' : item.user_name }}</span>
        </button>
        <span class="shrink-0 text-faint">{{ timeAgo(item.at) }}</span>
      </div>
      <p class="text-sm text-muted">
        {{ mine ? 'as débloqué' : 'a débloqué' }} {{ item.badges.length > 1 ? `${item.badges.length} succès` : 'un succès' }}
      </p>
      <ul class="mt-1 space-y-1">
        <li v-for="b in item.badges.slice(0, 4)" :key="b.key">
          <button class="text-left hover:underline" @click="open">
            <span class="font-bold text-hi">{{ b.icon }} {{ b.label }}</span>
            <span class="ml-1.5 text-sm text-muted">{{ b.desc }}</span>
          </button>
        </li>
        <li v-if="item.badges.length > 4">
          <button class="text-sm font-semibold text-muted hover:text-ink hover:underline" @click="open">+ {{ item.badges.length - 4 }} autres succès</button>
        </li>
      </ul>
    </div>
  </article>
</template>
