<script setup>
// Mes bandes : chacune sa compet et sa carte. Créer, rejoindre avec un code, partager, choisir, quitter.
import { ref } from 'vue'
import { api, currentGroup, setGroup } from '../api'
import { ask, toast, confetti } from '../juice'

const props = defineProps({ groups: Array, me: Object, intro: Boolean })
const emit = defineEmits(['changed'])

const newName = ref('')
const code = ref('')
const error = ref('')

const inviteLink = (g) => `${window.location.origin}/?bande=${g.code}`

async function create() {
  error.value = ''
  try {
    const g = await api('/groups', { method: 'POST', body: { name: newName.value } })
    newName.value = ''
    setGroup(g.id)
    confetti(50)
    toast(`« ${g.name} » créée · code ${g.code}`, { kind: 'big', ms: 4000 })
    emit('changed')
  } catch (e) {
    error.value = e.message
  }
}

async function join() {
  error.value = ''
  try {
    const g = await api('/groups/join', { method: 'POST', body: { code: code.value } })
    code.value = ''
    setGroup(g.id)
    toast(`Tu as rejoint « ${g.name} »`, { kind: 'big' })
    emit('changed')
  } catch (e) {
    error.value = e.message
  }
}

async function share(g) {
  const text = `Rejoins « ${g.name} » sur Picole Compet ! Code : ${g.code}`
  try {
    if (navigator.share) return await navigator.share({ title: 'Picole Compet', text, url: inviteLink(g) })
    await navigator.clipboard.writeText(`${text}\n${inviteLink(g)}`)
    toast('Invitation copiée')
  } catch (e) {
    if (e?.name !== 'AbortError') toast(`Code : ${g.code}`)
  }
}

async function leave(g) {
  const last = g.members === 1
  const ok = await ask({
    icon: '🚪',
    title: `Quitter « ${g.name} » ?`,
    message: last
      ? 'Tu es le dernier : la bande sera supprimée. Tes verres restent à toi.'
      : `Tu disparais de son classement. Tes verres restent à toi.${g.owner_id === props.me.id ? ' Le plus ancien membre devient patron.' : ''}`,
    confirm: 'Quitter',
    danger: true,
  })
  if (!ok) return
  try {
    await api(`/groups/${g.id}/members/me`, { method: 'DELETE' })
    if (currentGroup.value === g.id) setGroup(null)
    emit('changed')
  } catch (e) {
    error.value = e.message
  }
}
</script>

<template>
  <div class="space-y-6">
    <div v-if="intro" class="text-center">
      <h2 class="font-display text-2xl">Rejoins une bande</h2>
      <p class="mt-1 text-muted">Chaque bande a son classement. Entre le code d’un pote, ou crée la tienne.</p>
    </div>

    <ul v-if="groups.length" class="box divide-y divide-white/5">
      <li v-for="g in groups" :key="g.id" class="flex items-center gap-3 px-4 py-3">
        <button
          class="flex min-w-0 flex-1 items-center gap-3 text-left"
          :aria-pressed="currentGroup === g.id"
          @click="setGroup(g.id); emit('changed')"
        >
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2" :class="currentGroup === g.id ? 'border-hi bg-hi' : 'border-line'">
            <span v-if="currentGroup === g.id" class="text-xs text-paper">✓</span>
          </span>
          <span class="min-w-0">
            <span class="block truncate font-bold">{{ g.name }}</span>
            <span class="text-sm text-muted">
              {{ g.members }} membre{{ g.members > 1 ? 's' : '' }}<template v-if="g.owner_id === me.id"> · 👑 patron</template>
              · code <b class="tracking-wider text-ink">{{ g.code }}</b>
            </span>
          </span>
        </button>
        <button class="btn shrink-0 rounded-full bg-white/5 px-3 py-1.5 text-sm font-bold hover:bg-white/10" @click="share(g)">Inviter</button>
        <button class="h-9 w-9 shrink-0 rounded-full text-muted hover:bg-alert hover:text-white" :aria-label="`Quitter ${g.name}`" @click="leave(g)">🚪</button>
      </li>
    </ul>

    <form class="box space-y-3 p-5" @submit.prevent="join">
      <span class="font-bold">Rejoindre une bande</span>
      <div class="flex gap-2">
        <input v-model="code" maxlength="6" placeholder="CODE" autocapitalize="characters" class="field min-w-0 flex-1 px-4 py-3 text-lg font-bold tracking-[.3em] uppercase" />
        <button :disabled="code.trim().length < 6" class="btn btn-hi px-5 font-bold disabled:opacity-40">Entrer</button>
      </div>
    </form>

    <form class="box space-y-3 p-5" @submit.prevent="create">
      <span class="font-bold">Créer une bande</span>
      <div class="flex gap-2">
        <input v-model="newName" maxlength="30" placeholder="Nom de la bande" class="field min-w-0 flex-1 px-4 py-3" />
        <button :disabled="newName.trim().length < 2" class="btn btn-hi px-5 font-bold disabled:opacity-40">Créer</button>
      </div>
    </form>

    <p v-if="error" class="rounded-xl bg-alert px-4 py-2.5 text-sm font-semibold text-white">{{ error }}</p>
  </div>
</template>
