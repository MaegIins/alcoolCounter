<script setup>
// Modale d'arrivée, juste après l'inscription (une seule fois) : personne n'est mis d'office dans une bande.
// On propose la bande commune (choisie par un admin) en un tap, un code, ou créer la sienne ; rester solo est un choix.
// Arrivé par un lien d'invitation : on est déjà dans cette bande, la modale ne fait que le dire.
import { ref, onMounted } from 'vue'
import { api, setGroup } from '../api'
import { toast, confetti } from '../juice'
import Icon from './Icon.vue'

const props = defineProps({ groups: Array })
const emit = defineEmits(['changed', 'close'])

const suggested = ref(null)
const code = ref('')
const name = ref('')
const error = ref('')
const busy = ref(false)

onMounted(async () => {
  if (!props.groups.length) suggested.value = await api('/groups/suggested').catch(() => null)
})

async function act(fn) {
  error.value = ''
  busy.value = true
  try {
    const g = await fn()
    setGroup(g.id)
    emit('changed')
    emit('close')
    return g
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
const joinSuggested = () =>
  act(() => api('/groups/join', { method: 'POST', body: { suggested: true } })).then((g) => g && toast(`Bienvenue dans « ${g.name} »`, { kind: 'big' }))
const join = () =>
  act(() => api('/groups/join', { method: 'POST', body: { code: code.value } })).then((g) => g && toast(`Tu as rejoint « ${g.name} »`, { kind: 'big' }))
const create = () =>
  act(() => api('/groups', { method: 'POST', body: { name: name.value } })).then((g) => {
    if (!g) return
    confetti(50)
    toast(`« ${g.name} » créée · code ${g.code}`, { kind: 'big', ms: 4000 })
  })
</script>

<template>
  <div class="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
    <div class="box max-h-full w-full max-w-sm overflow-y-auto p-6" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <h2 id="welcome-title" class="font-display text-2xl">Bienvenue sur L’Ardoise <Icon name="fa-beer-mug-empty" class="text-hi" /></h2>

      <!-- Déjà dans une bande (lien d'invitation) -->
      <template v-if="groups.length">
        <p class="mt-2 text-muted">Tu es dans <b class="text-ink">{{ groups[0].name }}</b>. Ton premier verre t’attend.</p>
        <button class="btn btn-hi mt-6 w-full py-3 font-bold" @click="emit('close')">C’est parti</button>
      </template>

      <template v-else>
        <p class="mt-2 text-sm text-muted">
          Une bande, c’est un classement : ses membres voient tes verres. Tu choisis avec qui tu joues, ou personne.
        </p>

        <button
          v-if="suggested"
          :disabled="busy"
          class="btn btn-hi mt-5 flex w-full items-center justify-between gap-3 px-4 py-3 text-left disabled:opacity-50"
          @click="joinSuggested"
        >
          <span>
            <span class="block font-bold">Rejoindre « {{ suggested.name }} »</span>
            <span class="text-sm opacity-80">La bande de tout le monde · {{ suggested.members }} membre{{ suggested.members > 1 ? 's' : '' }}</span>
          </span>
          <Icon name="next" />
        </button>

        <form class="mt-5" @submit.prevent="join">
          <span class="kicker">Le code d’une bande de potes</span>
          <div class="mt-1.5 flex gap-2">
            <input v-model="code" maxlength="6" placeholder="CODE" autocapitalize="characters" aria-label="Code de la bande" class="field min-w-0 flex-1 px-4 py-2.5 text-lg font-bold tracking-[.3em] uppercase" />
            <button :disabled="busy || code.trim().length < 6" class="btn bg-white/10 px-4 font-bold hover:bg-white/15 disabled:opacity-40">Rejoindre</button>
          </div>
        </form>

        <form class="mt-4" @submit.prevent="create">
          <span class="kicker">Ou crée la tienne</span>
          <div class="mt-1.5 flex gap-2">
            <input v-model="name" maxlength="30" placeholder="Nom de la bande" aria-label="Nom de la nouvelle bande" class="field min-w-0 flex-1 px-4 py-2.5" />
            <button :disabled="busy || name.trim().length < 2" class="btn bg-white/10 px-4 font-bold hover:bg-white/15 disabled:opacity-40">Créer</button>
          </div>
        </form>

        <p v-if="error" class="mt-4 rounded-lg bg-alert px-3 py-2 text-sm font-semibold text-white">{{ error }}</p>

        <button class="mt-5 w-full py-2 text-sm font-semibold text-muted hover:text-ink" @click="emit('close')">
          Rester solo pour l’instant
        </button>
      </template>
    </div>
  </div>
</template>
