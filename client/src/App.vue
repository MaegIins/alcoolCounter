<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import {
  api, setToken, hasToken, today, colorMap, setUnauthorizedHandler, currentGroup, setGroup, setNoGroupHandler,
} from './api'
import { ui, go, openUser, openLog, bump } from './nav'
import { toasts, dismiss, ask, toast } from './juice'
import AuthCard from './components/AuthCard.vue'
import Avatar from './components/Avatar.vue'
import EntryForm from './components/EntryForm.vue'
import Leaderboard from './components/Leaderboard.vue'
import Stats from './components/Stats.vue'
import FeedPage from './components/FeedPage.vue'
import CartePage from './components/CartePage.vue'
import UserPage from './components/UserPage.vue'
import ProfilePage from './components/ProfilePage.vue'
import LogSheet from './components/LogSheet.vue'
import ProductPage from './components/ProductPage.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import SoloNudge from './components/SoloNudge.vue'
import Grime from './components/Grime.vue'
import Icon from './components/Icon.vue'
import SearchSheet from './components/SearchSheet.vue'

const me = ref(null)
const ready = ref(false)
const day = ref(today())
const users = ref([])
const groups = ref([])
const colors = computed(() => colorMap(users.value))
const group = computed(() => groups.value.find((g) => g.id === currentGroup.value) ?? null)
const groupMenu = ref(false)
const searching = ref(false) // recherche de personnes et de boissons (loupe de l'en-tête)
// Mode solo : connecté mais dans aucune bande. On peut boire, noter, avoir son profil ; le reste attend une bande.
const solo = computed(() => !!me.value && !groups.value.length)
const nudge = ref(null)
async function focusNudge() {
  go('home')
  await new Promise((r) => setTimeout(r, 250)) // le temps que la page s'affiche
  window.scrollTo({ top: 0, behavior: 'smooth' })
  nudge.value?.focus()
}

// Lien d'invitation : /?bande=CODE (rejoint direct si connecté, sinon pré-remplit l'inscription)
const inviteCode = new URLSearchParams(window.location.search).get('bande')?.toUpperCase() ?? ''
if (inviteCode) history.replaceState(history.state, '', window.location.pathname) // on retire ?bande= de l'URL

// Session expirée ou révoquée (PIN changé ailleurs) : retour à l'écran de connexion
setUnauthorizedHandler(() => {
  me.value = null
  go('home')
})
// Plus dans la bande courante (quittée ailleurs…) : on recharge la liste
setNoGroupHandler(() => loadGroups())

// Nouvelle soirée (6h du matin), l'appli ouverte : on suit et on recharge
watch(today, (now, before) => {
  if (day.value === before) day.value = now
  bump()
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

watch(
  [() => me.value?.id, currentGroup, () => ui.refresh],
  async () => {
    if (me.value && currentGroup.value) users.value = await api('/users').catch(() => users.value)
    else if (me.value) users.value = [me.value] // solo : juste moi (pour la couleur de mon avatar)
  },
  { immediate: true }
)

function onProfileUpdate(user) {
  me.value = user
  bump()
}
function pickGroup(id) {
  setGroup(id)
  groupMenu.value = false
  if (ui.view === 'user' && ui.userId !== me.value.id) go('home')
}
function myProfile() {
  openUser(me.value.id, { fromTab: true })
}

const TABS = [
  { k: 'home', l: 'Ma soirée', icon: 'home' },
  { k: 'feed', l: 'Activité', icon: 'feed' },
  { k: 'plus' },
  { k: 'carte', l: 'La carte', icon: 'carte' },
  { k: 'me', l: 'Profil', icon: 'user' },
]
const active = (k) => (k === 'me' ? (ui.view === 'user' && ui.userId === me.value?.id) || ui.view === 'settings' : ui.view === k)
function tap(k) {
  groupMenu.value = false
  if (k === 'plus') return openLog(ui.view === 'home' ? { day: day.value } : {}) // sur Ma soirée : la soirée affichée
  if (k === 'me') return myProfile()
  go(k)
}

async function logout() {
  if (!(await ask({ title: 'Se déconnecter ?', message: 'Il faudra retaper ton PIN.', confirm: 'Se déconnecter' }))) return
  await api('/logout', { method: 'POST' }).catch(() => {})
  setToken('')
  me.value = null
  groups.value = []
  go('home')
}
</script>

<template>
  <div class="relative min-h-screen px-4" :class="me ? 'pb-32' : 'pb-16'">
    <Grime />
    <header class="relative mx-auto flex max-w-lg items-center justify-between gap-4 pt-8 pb-2">
      <button class="text-left" @click="go('home')">
        <h1 class="font-drip text-[2.9rem] leading-[.85] text-hi sm:text-6xl">
          L’<span class="flicker text-ink/80">Ardoise</span>
        </h1>
      </button>
      <!-- Le profil est dans la barre du bas ; ici, juste la recherche -->
      <button
        v-if="me"
        class="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-xl hover:bg-white/10"
        title="Chercher une personne ou une boisson"
        aria-label="Rechercher"
        @click="searching = true"
      ><Icon name="search" :size="19" /></button>
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
            <Icon v-if="g.id === currentGroup" name="check" class="text-hi" />
          </button>
          <button class="w-full border-t border-white/5 px-4 py-2.5 text-left text-sm font-semibold text-hi hover:bg-white/5" @click="groupMenu = false; go('settings')">
            Gérer mes bandes →
          </button>
        </div>
      </div>
    </div>

    <main v-if="ready" class="relative mx-auto max-w-lg">
      <AuthCard v-if="!me" :invite="inviteCode" @logged="onLogged" />
      <Transition v-else name="page" mode="out-in">
        <div v-if="ui.view === 'settings'" key="s" class="space-y-8">
          <ProfilePage :me="me" :color="colors[me.id]" :groups="groups" @update="onProfileUpdate" @groups="loadGroups" @back="myProfile" />
          <section class="box flex items-center justify-between gap-3 p-5">
            <span class="text-sm text-muted">
              Connecté en tant que <b class="text-ink">{{ me.name }}</b>
              <span v-if="me.is_admin" class="ml-1 rounded-full bg-neon/20 px-1.5 py-0.5 text-xs font-semibold text-neon">admin</span>
            </span>
            <button class="btn btn-ghost shrink-0 px-4 py-2 font-bold" @click="logout">Se déconnecter</button>
          </section>
        </div>
        <FeedPage v-else-if="ui.view === 'feed'" :key="'f' + currentGroup" :me="me" :colors="colors" :solo="solo" />
        <!-- La carte est commune à tout le monde, bande ou pas -->
        <CartePage v-else-if="ui.view === 'carte'" key="carte" :me="me" @saved="bump" @back="go('home')" />
        <ProductPage v-else-if="ui.view === 'product'" :key="'p' + ui.productId" :product-id="ui.productId" :me="me" :colors="colors" />
        <UserPage v-else-if="ui.view === 'user'" :key="'u' + ui.userId + '-' + currentGroup" :user-id="ui.userId" :me="me" :colors="colors" />
        <div v-else :key="'h' + currentGroup" class="space-y-16">
          <SoloNudge v-if="solo" ref="nudge" @changed="loadGroups" />
          <EntryForm v-model:day="day" :solo="solo" @saved="bump" @carte="go('carte')" @bandes="focusNudge" />
          <SoloNudge v-if="solo" variant="teaser" @focus="focusNudge" />
          <template v-else>
            <Leaderboard :day="day" :me="me" :colors="colors" :refresh-key="ui.refresh" @open="openUser" />
            <Stats :users="users" :colors="colors" :me="me" :refresh-key="ui.refresh" />
          </template>
          <p class="text-sm text-muted">
            Score en verres standard : 10 g d'alcool pur, calculé sur le volume et le degré de chaque verre
            (une pinte de triple compte presque double d'une pinte de blonde). La soirée court jusqu'à 6h du matin.
            L'eau, les clopes et le sans alcool (Monster, sodas…) sont comptés à part.
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

    <!-- Onglets en bas d'écran, avec le « + » au milieu -->
    <nav
      v-if="me"
      class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/85 backdrop-blur-md"
      style="padding-bottom: env(safe-area-inset-bottom)"
    >
      <div class="mx-auto flex max-w-lg items-center gap-1.5 px-2 py-2">
        <template v-for="t in TABS" :key="t.k">
          <button
            v-if="t.k === 'plus'"
            class="btn btn-hi mx-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
            aria-label="Ajouter une conso (date, note, avis, photo)"
            @click="tap('plus')"
          >
            <Icon name="plus" :size="24" />
          </button>
          <button
            v-else
            class="btn flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-xs font-bold transition-colors"
            :class="active(t.k) ? 'btn-hi' : 'text-muted hover:text-ink'"
            :aria-current="active(t.k) ? 'page' : undefined"
            @click="tap(t.k)"
          >
            <Avatar v-if="t.k === 'me'" :user="me" :color="colors[me.id]" :size="22" class="rounded-full" />
            <Icon v-else :name="t.icon" :size="19" class="h-[22px] leading-[22px]" />
            <span class="w-full truncate">{{ t.l }}</span>
          </button>
        </template>
      </div>
    </nav>

    <Transition name="sheet">
      <LogSheet v-if="ui.log && me" :preset="ui.log" />
    </Transition>
    <SearchSheet v-if="searching && me" :colors="colors" @close="searching = false" />
    <ConfirmDialog />

    <!-- Toasts -->
    <div class="pointer-events-none fixed inset-x-0 top-3 z-[95] flex flex-col items-center gap-2 px-4">
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
          <span><i v-if="t.icon" :class="['fa-solid', t.icon, 'mr-1.5']" aria-hidden="true" />{{ t.text }}</span>
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
