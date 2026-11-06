<script setup>
import { ref, onMounted } from 'vue'
import { api, setToken } from '../api'

const props = defineProps({ invite: { type: String, default: '' } }) // code de bande reçu par lien
const emit = defineEmits(['logged'])
// Arrivé par un lien d'invitation : probablement nouveau, on ouvre l'inscription
const mode = ref(props.invite ? 'register' : 'login')
const groupCode = ref(props.invite)
const name = ref('')
const pin = ref('')
const invite = ref('')
const inviteRequired = ref(false)
const error = ref('')
const loading = ref(false)

onMounted(async () => {
  inviteRequired.value = (await api('/config').catch(() => ({}))).inviteRequired
})

async function submit() {
  error.value = ''
  loading.value = true
  try {
    const { token, user } = await api(`/${mode.value}`, {
      method: 'POST',
      body: { name: name.value, pin: pin.value, invite: invite.value, ...(mode.value === 'register' && groupCode.value ? { group: groupCode.value } : {}) },
    })
    setToken(token)
    emit('logged', user, { registered: mode.value === 'register' })
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="box p-6">
    <div class="mb-6 flex gap-5 font-display text-lg">
      <button
        v-for="m in [{ k: 'login', l: 'Connexion' }, { k: 'register', l: 'Inscription' }]"
        :key="m.k"
        :class="mode === m.k ? 'neon' : 'text-muted/60'"
        @click="mode = m.k; error = ''"
      >
        {{ m.l }}
      </button>
    </div>

    <form class="space-y-4" @submit.prevent="submit">
      <label class="block">
        <span class="kicker">Pseudo</span>
        <input v-model="name" autocomplete="username" class="field mt-1.5 w-full px-4 py-3 text-lg" />
      </label>
      <label class="block">
        <span class="kicker">PIN <span v-if="mode === 'register'" class="font-normal">(6 à 8 chiffres)</span></span>
        <input
          v-model="pin"
          v-digits
          type="password"
          inputmode="numeric"
          maxlength="8"
          :minlength="mode === 'register' ? 6 : undefined"
          :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
          class="field mt-1.5 w-full px-4 py-3 font-mono text-lg tracking-[.4em]"
        />
      </label>
      <!-- Pas de champ « code de bande » à l'inscription (ça perdait les gens) : on rejoint une bande plus tard,
           ou directement si on arrive par un lien d'invitation -->
      <p v-if="mode === 'register' && groupCode" class="rounded-xl bg-raised px-4 py-2.5 text-sm text-muted">
        Tu as un lien d'invitation : tu rejoindras la bande dès ton compte créé.
      </p>
      <label v-if="mode === 'register' && inviteRequired" class="block">
        <span class="kicker">Code d'invitation</span>
        <input v-model="invite" class="field mt-1.5 w-full px-4 py-3 text-lg" />
      </label>
      <p v-if="error" class="rounded-xl bg-alert px-4 py-2.5 text-sm font-semibold text-white">{{ error }}</p>
      <button :disabled="loading || (mode === 'register' && pin.length < 6)" class="btn btn-hi w-full py-3 text-lg font-bold disabled:opacity-50">
        {{ mode === 'login' ? 'Se connecter' : 'Créer mon compte' }}
      </button>
    </form>
  </div>
</template>
