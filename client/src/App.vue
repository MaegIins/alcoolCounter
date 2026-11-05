<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import {
  api, setToken, hasToken, today, colorMap, setUnauthorizedHandler, currentGroup, setGroup, setNoGroupHandler,
} from './api'
import AuthCard from './components/AuthCard.vue'
import Avatar from './components/Avatar.vue'
import EntryForm from './components/EntryForm.vue'
import Leaderboard from './components/Leaderboard.vue'
import Stats from './components/Stats.vue'
import ProfilePage from './components/ProfilePage.vue'
import CartePage from './components/CartePage.vue'
import PlayerSheet from './components/PlayerSheet.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import SoloNudge from './components/SoloNudge.vue'
import { toasts, dismiss, ask, toast } from './juice'
import Grime from './components/Grime.vue'

const me = ref(null)
const ready = ref(false)
const view = ref('home') // 'home' | 'carte' | 'profile'
const day = ref(today())
const refreshKey = ref(0)
const users = ref([])
const groups = ref([])
const player = ref(null) // id du joueur dont la fiche est ouverte
const colors = computed(() => colorMap(users.value))
const group = computed(() => groups.value.find((g) => g.id === currentGroup.value) ?? null)
const groupMenu = ref(false)
// Mode solo : connecté mais dans aucune bande. On peut boire et voir sa fiche ; le reste attend une bande.
const solo = computed(() => !!me.value && !groups.value.length)
const nudge = ref(null)
async function focusNudge() {
  goto('home')
  await new Promise((r) => setTimeout(r, 250)) // le temps que la page s'affiche
  window.scrollTo({ top: 0, behavior: 'smooth' })
  nudge.value?.focus()
}

// Lien d'invitation : /?bande=CODE (rejoint direct si connecté, sinon pré-remplit l'inscription)
const inviteCode = new URLSearchParams(window.location.search).get('bande')?.toUpperCase() ?? ''
if (inviteCode) history.replaceState(null, '', window.location.pathname)


// Session expirée ou révoquée (PIN changé ailleurs) : retour à l'écran de connexion
setUnauthorizedHandler(() => {
  me.value = null
  view.value = 'home'
})
// Plus dans la bande courante (quittée ailleurs…) : on recharge la liste
setNoGroupHandler(() => loadGroups())

// Nouvelle soirée (6h du matin), l'appli ouverte : on suit et on recharge
watch(today, (now, before) => {
  if (day.value === before) day.value = now
  refreshKey.value++
})

async function loadGroups() {
  groups.value = await api('/groups').catch(() => groups.value)
  if (!groups.value.some((g) => g.id === currentGroup.value)) setGroup(groups.value[0]?.id ?? null)
}

async function onLogged(user) {
  me.value = user
  if (inviteCode) await api('/groups/join', { method: 'POST', body: { code: inviteCode } }).then((g) => {
    setGroup(g.id)
    toast(`Tu as rejoint « ${g.name} »`, { kind: 'big' })
  }).catch(() => {})
  await loadGroups()
}

onMounted(async () => {
  if (hasToken()) {
    const user = (await api('/me').catch(() => ({}))).user
    if (user) await onLogged(user)
  }
  ready.value = true
})

async function loadUsers() {
  users.value = await api('/users').catch(() => [])
}
watch(
  [() => me.value?.id, currentGroup, refreshKey],
  () => {
    if (me.value && currentGroup.value) loadUsers()
    else if (me.value) users.value = [me.value] // solo : juste moi (pour la couleur de mon avatar)
  },
  { immediate: true }
)

function onProfileUpdate(user) {
  me.value = user
  refreshKey.value++
}

function goto(v) {
  view.value = v
  groupMenu.value = false
  window.scrollTo({ top: 0 })
}
function pickGroup(id) {
  setGroup(id)
  groupMenu.value = false
  player.value = null
}
const TABS = [
  { k: 'home', l: 'Ma soirée', icon: '🍺' },
  { k: 'carte', l: 'La carte', icon: '📜' },
  { k: 'profile', l: 'Profil', icon: '👤' },
]

async function logout() {
  if (!(await ask({ title: 'Se déconnecter ?', message: 'Il faudra retaper ton PIN.', confirm: 'Se déconnecter' }))) return
  await api('/logout', { method: 'POST' }).catch(() => {})
  setToken('')
  me.value = null
  groups.value = []
  view.value = 'home'
}
</script>

<template>
  <div class="relative min-h-screen px-4" :class="me ? 'pb-32' : 'pb-16'">
    <Grime />
    <header class="relative mx-auto flex max-w-lg items-center justify-between gap-4 pt-8 pb-2">
      <button class="text-left" @click="goto('home')">
        <h1 class="font-drip text-[2.9rem] leading-[.85] text-hi sm:text-6xl">
          Picole<br /><span class="flicker text-ink/80">Compet</span>
        </h1>
      </button>
      <div v-if="me" class="flex items-center gap-3">
        <div class="text-right text-sm leading-5">
          <div class="font-bold">{{ me.name }}<span v-if="me.is_admin" class="ml-1.5 rounded-full bg-neon/20 px-1.5 py-0.5 text-xs text-neon">admin</span></div>
          <button class="text-muted underline underline-offset-4 hover:text-hi" @click="logout">quitter</button>
        </div>
        <button title="Ma fiche" @click="player = me.id">
          <Avatar :user="me" :color="colors[me.id]" :size="48" class="rounded-full ring-2 ring-hi/60" />
        </button>
      </div>
    </header>

    <div class="relative mx-auto mb-10 flex max-w-lg flex-wrap items-center justify-between gap-2">
      <p class="text-muted">Le plus gros buveur de la soirée gagne.</p>
      <!-- Bande courante -->
      <div v-if="me && group" class="relative">
        <button
          class="flex items-center gap-1.5 rounded-full bg-white/5 py-1.5 pr-3 pl-3 text-sm font-bold hover:bg-white/10"
          :aria-expanded="groupMenu"
          @click="groupMenu = !groupMenu"
        >
          {{ group.name }} <span class="text-muted">▾</span>
        </button>
        <div v-if="groupMenu" class="box absolute right-0 z-30 mt-2 w-60 py-1">
          <button
            v-for="g in groups"
            :key="g.id"
            class="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-white/5"
            @click="pickGroup(g.id)"
          >
            <span class="truncate font-semibold">{{ g.name }}</span>
            <span v-if="g.id === currentGroup" class="text-hi">✓</span>
          </button>
          <button class="w-full border-t border-white/5 px-4 py-2.5 text-left text-sm font-semibold text-hi hover:bg-white/5" @click="goto('profile')">
            Gérer mes bandes →
          </button>
        </div>
      </div>
    </div>

    <main v-if="ready" class="relative mx-auto max-w-lg">
      <AuthCard v-if="!me" :invite="inviteCode" @logged="onLogged" />
      <Transition v-else name="page" mode="out-in">
        <ProfilePage
          v-if="view === 'profile'"
          :key="'p' + currentGroup"
          :me="me"
          :color="colors[me.id]"
          :groups="groups"
          @update="onProfileUpdate"
          @groups="loadGroups"
          @back="goto('home')"
        />
        <!-- La carte est commune à tout le monde, bande ou pas -->
        <CartePage v-else-if="view === 'carte'" key="carte" :me="me" @saved="refreshKey++" @back="goto('home')" />
        <div v-else :key="'h' + currentGroup" class="space-y-16">
          <SoloNudge v-if="solo" ref="nudge" @changed="loadGroups" />
          <EntryForm v-model:day="day" :solo="solo" @saved="refreshKey++" @carte="goto('carte')" @bandes="focusNudge" />
          <SoloNudge v-if="solo" variant="teaser" @focus="focusNudge" />
          <template v-else>
            <Leaderboard :day="day" :me="me" :colors="colors" :refresh-key="refreshKey" @open="player = $event" />
            <Stats :users="users" :colors="colors" :me="me" :refresh-key="refreshKey" />
          </template>
          <p class="text-sm text-muted">
            Score en verres standard : 10 g d'alcool pur, calculé sur le volume et le degré de chaque verre
            (une pinte de triple compte presque double d'une pinte de blonde). La soirée court jusqu'à 6h du matin.
            L'eau et les clopes sont comptées à part.
          </p>
        </div>
      </Transition>
    </main>

    <footer class="relative mx-auto mt-16 max-w-lg border-t border-white/5 pt-4 text-sm text-muted">
      L'abus d'alcool est dangereux pour la santé, fumer tue. Ne prends pas le volant.
      Besoin d'en parler : Alcool Info Service
      <a href="tel:0980980930" class="text-ink underline underline-offset-4">0 980 980 930</a>,
      Tabac Info Service <a href="tel:3989" class="text-ink underline underline-offset-4">39 89</a> (gratuits, anonymes).
    </footer>

    <!-- Onglets en bas d'écran -->
    <nav
      v-if="me"
      class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/85 backdrop-blur-md"
      style="padding-bottom: env(safe-area-inset-bottom)"
    >
      <div class="mx-auto flex max-w-lg gap-2 px-3 py-2">
        <button
          v-for="t in TABS"
          :key="t.k"
          class="btn flex flex-1 flex-col items-center gap-0.5 py-2 text-sm font-bold transition-colors"
          :class="view === t.k ? 'btn-hi' : t.k === 'carte' ? 'bg-hi/10 text-hi' : 'text-muted hover:text-ink'"
          :aria-current="view === t.k ? 'page' : undefined"
          @click="goto(t.k)"
        >
          <span class="text-xl leading-none">{{ t.icon }}</span>
          {{ t.l }}
        </button>
      </div>
    </nav>

    <!-- Fiche joueur -->
    <Transition name="sheet">
      <PlayerSheet
        v-if="player && me"
        :user-id="player"
        :day="day"
        :me="me"
        :color="colors[player]"
        @close="player = null"
        @saved="refreshKey++"
      />
    </Transition>

    <ConfirmDialog />

    <!-- Toasts -->
    <div class="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-4">
      <TransitionGroup name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="receipt pointer-events-auto flex items-center gap-3 px-4 py-2.5 font-mono text-sm font-bold shadow-xl shadow-black/70"
          :class="{
            'bg-[#d9cfae] text-[#2a2414]': !t.kind || t.kind === 'info',
            'bg-hi text-[#17140a]': t.kind === 'badge',
            'bg-neon text-[#f0e6cc]': t.kind === 'big',
          }"
        >
          <span>{{ t.text }}</span>
          <button
            v-if="t.action"
            class="rounded-sm bg-black/15 px-2.5 py-1 text-xs uppercase hover:bg-black/25"
            @click="t.action.run(); dismiss(t.id)"
          >
            {{ t.action.label }}
          </button>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>
