<script setup>
// Mes bandes : chacune sa compet et sa carte. Créer, rejoindre avec un code, partager, choisir, quitter.
import { ref } from 'vue'
import { api, currentGroup, setGroup } from '../api'
import { ask, toast, confetti } from '../juice'
import Icon from './Icon.vue'

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
  const text = `Rejoins « ${g.name} » sur L’Ardoise ! Code : ${g.code}`
  try {
    if (navigator.share) return await navigator.share({ title: 'L’Ardoise', text, url: inviteLink(g) })
    await navigator.clipboard.writeText(`${text}\n${inviteLink(g)}`)
    toast('Invitation copiée')
  } catch (e) {
    if (e?.name !== 'AbortError') toast(`Code : ${g.code}`)
  }
}

// --- Gestion (patron de la bande, ou admin) ---
const canManage = (g) => g.owner_id === props.me.id || props.me.is_admin
const managing = ref(null) // id de la bande dont le panneau de gestion est ouvert
const members = ref([])
const rename = ref('')
async function toggleManage(g) {
  error.value = ''
  if (managing.value === g.id) return (managing.value = null)
  managing.value = g.id
  rename.value = g.name
  members.value = []
  try {
    members.value = await api(`/groups/${g.id}/members`)
  } catch (e) {
    error.value = e.message
  }
}
async function manage(g, path, opts, done) {
  error.value = ''
  try {
    const out = await api(`/groups/${g.id}${path}`, opts)
    if (done) toast(done)
    emit('changed')
    return out
  } catch (e) {
    error.value = e.message
  }
}
const saveName = (g) => manage(g, '', { method: 'PATCH', body: { name: rename.value } }, 'Bande renommée')
async function newCode(g) {
  const ok = await ask({
    icon: 'fa-rotate',
    title: 'Changer le code ?',
    message: 'L’ancien code et les liens d’invitation déjà envoyés ne marcheront plus. Les membres restent.',
    confirm: 'Changer',
  })
  if (ok) manage(g, '/code', { method: 'POST' }, 'Nouveau code')
}
async function kick(g, m) {
  const ok = await ask({
    icon: 'fa-user-xmark',
    title: `Exclure ${m.name} ?`,
    message: `${m.name} disparaît du classement de « ${g.name} ». Ses verres restent à lui. Change le code s’il ne doit pas revenir.`,
    confirm: 'Exclure',
    danger: true,
  })
  if (!ok) return
  if (await manage(g, `/members/${m.id}`, { method: 'DELETE' }, `${m.name} exclu`)) members.value = members.value.filter((x) => x.id !== m.id)
}
async function makeOwner(g, m) {
  const ok = await ask({
    icon: 'fa-crown',
    title: `${m.name} patron ?`,
    message: `${m.name} devient patron de « ${g.name} ».${props.me.is_admin ? '' : ' Tu ne pourras plus gérer la bande.'}`,
    confirm: 'Passer la main',
  })
  if (!ok) return
  if (await manage(g, '', { method: 'PATCH', body: { owner_id: m.id } }, `${m.name} est patron`) && !props.me.is_admin) managing.value = null
}
const setDefault = (g, on) =>
  manage(g, '', { method: 'PATCH', body: { is_default: on } }, on ? `« ${g.name} » est proposée à tous` : 'Plus de bande proposée')

async function leave(g) {
  const last = g.members === 1
  const ok = await ask({
    icon: 'fa-door-open',
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
      <li v-for="g in groups" :key="g.id" class="px-4 py-3">
        <div class="flex items-center gap-3">
        <button
          class="flex min-w-0 flex-1 items-center gap-3 text-left"
          :aria-pressed="currentGroup === g.id"
          @click="setGroup(g.id); emit('changed')"
        >
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2" :class="currentGroup === g.id ? 'border-hi bg-hi' : 'border-line'">
            <Icon v-if="currentGroup === g.id" name="check" class="text-xs text-paper" />
          </span>
          <span class="min-w-0">
            <span class="block truncate font-bold">{{ g.name }}</span>
            <span class="text-sm text-muted">
              {{ g.members }} membre{{ g.members > 1 ? 's' : '' }}<template v-if="g.owner_id === me.id"> · <Icon name="crown" class="text-hi" /> patron</template>
              <template v-if="g.is_default"> · proposée à tous</template>
              · code <b class="tracking-wider text-ink">{{ g.code }}</b>
            </span>
          </span>
        </button>
        <button class="btn shrink-0 rounded-full bg-white/5 px-3 py-1.5 text-sm font-bold hover:bg-white/10" @click="share(g)">Inviter</button>
        <button
          v-if="canManage(g)"
          class="h-9 w-9 shrink-0 rounded-full text-muted hover:bg-white/10 hover:text-ink"
          :class="managing === g.id && 'bg-white/10 text-ink'"
          :aria-label="`Gérer ${g.name}`"
          :aria-expanded="managing === g.id"
          @click="toggleManage(g)"
        >
          <Icon name="gear" />
        </button>
        <button class="h-9 w-9 shrink-0 rounded-full text-muted hover:bg-alert hover:text-white" :aria-label="`Quitter ${g.name}`" @click="leave(g)"><Icon name="door" /></button>
        </div>

        <!-- Gestion : renommer, nouveau code, bande par défaut (admin), membres -->
        <div v-if="managing === g.id" class="mt-3 space-y-4 rounded-xl bg-white/5 p-4">
          <form class="flex gap-2" @submit.prevent="saveName(g)">
            <input v-model="rename" maxlength="30" aria-label="Nom de la bande" class="field min-w-0 flex-1 px-3 py-2" />
            <button :disabled="rename.trim().length < 2 || rename.trim() === g.name" class="btn btn-hi px-4 text-sm font-bold disabled:opacity-40">Renommer</button>
          </form>
          <div class="flex flex-wrap gap-2">
            <button class="btn rounded-full bg-white/5 px-3 py-1.5 text-sm font-bold hover:bg-white/10" @click="newCode(g)">
              <Icon name="fa-rotate" /> Nouveau code
            </button>
            <button
              v-if="me.is_admin"
              class="btn rounded-full px-3 py-1.5 text-sm font-bold"
              :class="g.is_default ? 'bg-hi text-paper' : 'bg-white/5 hover:bg-white/10'"
              @click="setDefault(g, !g.is_default)"
            >
              <Icon name="check" v-if="g.is_default" /> Proposée à tous (sans code)
            </button>
          </div>
          <ul class="divide-y divide-white/5">
            <li v-for="m in members" :key="m.id" class="flex items-center gap-2 py-2">
              <span class="min-w-0 flex-1 truncate">
                {{ m.name }}<Icon v-if="m.id === g.owner_id" name="crown" class="ml-1.5 text-hi" />
              </span>
              <template v-if="m.id !== g.owner_id">
                <button class="rounded-full px-2.5 py-1 text-sm text-muted hover:bg-white/10 hover:text-ink" @click="makeOwner(g, m)">Patron</button>
                <button v-if="m.id !== me.id" class="rounded-full px-2.5 py-1 text-sm text-muted hover:bg-alert hover:text-white" @click="kick(g, m)">Exclure</button>
              </template>
            </li>
          </ul>
        </div>
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
