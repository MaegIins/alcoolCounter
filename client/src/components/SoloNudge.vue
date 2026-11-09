<script setup>
// Mode solo (aucune bande) : pousser à rejoindre ou créer une bande.
// variant="banner" : encart avec code + création en ligne. Fermable (retenu sur l'appareil) : le bouton du classement
// verrouillé le rouvre.
// variant="teaser" : faux classement flouté, verrouillé, qui renvoie vers l'encart.
import { ref, onMounted, nextTick } from 'vue'
import { api, setGroup } from '../api'
import { toast, confetti } from '../juice'
import Icon from './Icon.vue'

const props = defineProps({ variant: { type: String, default: 'banner' } })
const emit = defineEmits(['changed', 'focus'])

// Bande proposée à tous (choisie par un admin) : la rejoindre en un tap, sans code
const suggested = ref(null)
onMounted(async () => {
  if (props.variant === 'banner') suggested.value = await api('/groups/suggested').catch(() => null)
})
async function joinSuggested() {
  error.value = ''
  try {
    const g = await api('/groups/join', { method: 'POST', body: { suggested: true } })
    setGroup(g.id)
    toast(`Bienvenue dans « ${g.name} »`, { kind: 'big' })
    emit('changed')
  } catch (e) {
    error.value = e.message
  }
}

const code = ref('')
const name = ref('')
const creating = ref(false)
const error = ref('')
const codeInput = ref(null)
// Encart fermé : retenu sur cet appareil (try : stockage parfois indisponible)
const hidden = ref((() => { try { return localStorage.getItem('solo-nudge-hidden') === '1' } catch { return false } })())
function hide(v) {
  hidden.value = v
  try { v ? localStorage.setItem('solo-nudge-hidden', '1') : localStorage.removeItem('solo-nudge-hidden') } catch {}
}
defineExpose({
  focus: async () => {
    hide(false)
    await nextTick()
    codeInput.value?.focus()
  },
})

async function join() {
  error.value = ''
  try {
    const g = await api('/groups/join', { method: 'POST', body: { code: code.value } })
    setGroup(g.id)
    toast(`Tu as rejoint « ${g.name} »`, { kind: 'big' })
    emit('changed')
  } catch (e) {
    error.value = e.message
  }
}
async function create() {
  error.value = ''
  try {
    const g = await api('/groups', { method: 'POST', body: { name: name.value } })
    setGroup(g.id)
    confetti(40)
    toast(`« ${g.name} » créée · code ${g.code}`, { kind: 'big', ms: 4000 })
    emit('changed')
  } catch (e) {
    error.value = e.message
  }
}

// Faux classement pour le teaser (flouté, rien de réel)
const FAKE = [
  { w: 92, n: 7 }, { w: 74, n: 5 }, { w: 61, n: 9 }, { w: 40, n: 6 }, { w: 22, n: 4 },
]
</script>

<template>
  <!-- Encart -->
  <section v-if="variant === 'banner' && !hidden" class="box relative border-hi/30 p-5">
    <button
      class="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full text-faint hover:bg-white/5 hover:text-ink"
      aria-label="Fermer"
      title="Fermer (tu peux rejoindre une bande depuis le classement)"
      @click="hide(true)"
    >
      <Icon name="close" :size="16" />
    </button>
    <div class="flex items-start gap-3 pr-6">
      <Icon name="chair" :size="28" class="text-hi" />
      <div>
        <h3 class="font-display text-xl">Tu bois seul.</h3>
        <p class="mt-1 text-sm text-muted">
          Tes verres comptent déjà. Rejoins une bande pour avoir le classement et les victoires.
        </p>
      </div>
    </div>

    <button v-if="suggested" class="btn btn-hi mt-4 flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left" @click="joinSuggested">
      <span>
        <span class="block font-bold">Rejoindre « {{ suggested.name }} »</span>
        <span class="text-sm opacity-80">La bande de tout le monde · {{ suggested.members }} membre{{ suggested.members > 1 ? 's' : '' }}</span>
      </span>
      <Icon name="next" />
    </button>

    <form v-if="!creating" class="mt-4 flex gap-2" @submit.prevent="join">
      <input
        ref="codeInput"
        v-model="code"
        maxlength="6"
        placeholder="CODE"
        autocapitalize="characters"
        aria-label="Code de la bande"
        class="field min-w-0 flex-1 px-4 py-2.5 text-lg font-bold tracking-[.3em] uppercase"
      />
      <button :disabled="code.trim().length < 6" class="btn btn-hi px-5 font-bold disabled:opacity-40">Rejoindre</button>
    </form>
    <form v-else class="mt-4 flex gap-2" @submit.prevent="create">
      <input v-model="name" maxlength="30" placeholder="Nom de la bande" aria-label="Nom de la bande" class="field min-w-0 flex-1 px-4 py-2.5" />
      <button :disabled="name.trim().length < 2" class="btn btn-hi px-5 font-bold disabled:opacity-40">Créer</button>
    </form>
    <button class="mt-3 text-sm font-semibold text-hi hover:underline" @click="creating = !creating; error = ''">
      {{ creating ? 'J’ai un code' : 'Pas de code ? Crée ta bande et invite tes potes' }}
    </button>
    <p v-if="error" class="mt-3 rounded-lg bg-alert px-3 py-2 text-sm font-semibold text-white">{{ error }}</p>
  </section>

  <!-- Classement verrouillé -->
  <section v-else-if="variant !== 'banner'" class="space-y-5">
    <h2 class="font-display text-2xl">Le classement</h2>
    <div class="box relative">
      <ol class="divide-y divide-white/5 blur-[3px] select-none" aria-hidden="true">
        <li v-for="(f, i) in FAKE" :key="i" class="flex items-center gap-3 px-4 py-3.5">
          <span class="w-7 text-center font-display text-lg text-muted">{{ i + 1 }}</span>
          <span class="h-10 w-10 rounded-full bg-white/15" />
          <span class="flex-1">
            <span class="block h-3.5 w-24 rounded bg-white/20" />
            <span class="mt-2 block h-1.5 rounded-full bg-hi/50" :style="{ width: `${f.w}%` }" />
          </span>
          <span class="font-display text-xl text-muted">{{ f.n }},{{ i }}</span>
        </li>
      </ol>
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-paper/50 p-6 text-center">
        <Icon name="lock" :size="28" class="text-hi" />
        <p class="font-bold">Le classement, c'est entre potes.</p>
        <p class="text-sm text-muted">Qui boit le plus aujourd'hui, qui gagne la semaine, qui est suspect : il te faut une bande.</p>
        <button class="btn btn-hi px-5 py-2.5 font-bold" @click="emit('focus')">Rejoindre ou créer une bande</button>
      </div>
    </div>
  </section>
</template>
