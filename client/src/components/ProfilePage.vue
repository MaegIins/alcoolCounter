<script setup>
import { ref } from 'vue'
import { api, resizeImage } from '../api'
import { ask } from '../juice'
import Avatar from './Avatar.vue'
import GroupsPanel from './GroupsPanel.vue'
import Icon from './Icon.vue'

const props = defineProps({ me: Object, color: String, groups: Array })
const emit = defineEmits(['update', 'back', 'groups', 'deleted'])

const fileInput = ref(null)
const avatarMsg = ref({})
const name = ref(props.me.name)
const nameMsg = ref({})
const pin = ref({ current: '', next: '', confirm: '' })
const pinMsg = ref({})

async function onAvatar(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  avatarMsg.value = {}
  try {
    const { avatar_v } = await api('/me/avatar', { method: 'PUT', body: { dataUrl: await resizeImage(file) } })
    emit('update', { ...props.me, avatar_v })
    avatarMsg.value = { ok: 'Photo mise à jour' }
  } catch (err) {
    avatarMsg.value = { err: err.message || 'Image illisible' }
  }
}

async function removeAvatar() {
  avatarMsg.value = {}
  try {
    await api('/me/avatar', { method: 'DELETE' })
    emit('update', { ...props.me, avatar_v: 0 })
    avatarMsg.value = { ok: 'Photo supprimée' }
  } catch (e) {
    avatarMsg.value = { err: e.message }
  }
}

async function saveName() {
  nameMsg.value = {}
  try {
    const { user } = await api('/me', { method: 'PATCH', body: { name: name.value } })
    emit('update', { ...props.me, name: user.name })
    nameMsg.value = { ok: 'Pseudo changé' }
  } catch (e) {
    nameMsg.value = { err: e.message }
  }
}

async function savePin() {
  pinMsg.value = {}
  if (pin.value.next !== pin.value.confirm) return (pinMsg.value = { err: 'Les deux PIN ne correspondent pas' })
  try {
    await api('/me/pin', { method: 'PUT', body: { current: pin.value.current, next: pin.value.next } })
    pin.value = { current: '', next: '', confirm: '' }
    pinMsg.value = { ok: 'PIN changé. Tes autres appareils sont déconnectés.' }
  } catch (e) {
    pinMsg.value = { err: e.message }
  }
}

// Supprimer mon compte : avec mon PIN, après confirmation
const delPin = ref('')
const delMsg = ref('')
async function deleteAccount() {
  delMsg.value = ''
  const ok = await ask({
    icon: 'fa-triangle-exclamation',
    title: 'Supprimer ton compte ?',
    message: 'Tous tes verres, notes, photos et ton « chez moi » disparaissent pour de bon. Impossible de revenir en arrière.',
    confirm: 'Supprimer',
    danger: true,
  })
  if (!ok) return
  try {
    await api('/me', { method: 'DELETE', body: { pin: delPin.value } })
    emit('deleted')
  } catch (e) {
    delMsg.value = e.message
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="font-display text-2xl">Mon profil</h2>
      <button class="text-sm font-semibold text-muted hover:text-hi" @click="emit('back')"><Icon name="back" /> Mon profil</button>
    </div>

    <section>
      <h3 class="mb-3 text-lg font-bold">Mes bandes</h3>
      <GroupsPanel :groups="groups" :me="me" @changed="emit('groups')" />
    </section>

    <section class="box">
      <div class="px-5 pt-4 font-bold">Photo</div>
      <div class="flex items-center gap-4 p-5">
        <Avatar :user="me" :color="color" :size="88" class="rounded-full" />
        <div class="flex flex-col items-start gap-2">
          <button class="btn btn-hi px-4 py-2 font-bold" @click="fileInput.click()">
            Changer la photo
          </button>
          <button v-if="me.avatar_v" class="text-sm font-semibold text-muted hover:text-ink" @click="removeAvatar">
            supprimer
          </button>
          <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onAvatar" />
        </div>
      </div>
      <p v-if="avatarMsg.ok" class="px-5 pb-4 text-sm font-semibold text-hi">{{ avatarMsg.ok }} <Icon name="check" /></p>
      <p v-if="avatarMsg.err" class="bg-alert px-5 py-2.5 text-sm font-semibold text-white">{{ avatarMsg.err }}</p>
    </section>

    <form class="box" @submit.prevent="saveName">
      <div class="px-5 pt-4 font-bold">Pseudo</div>
      <div class="flex gap-3 p-5">
        <input v-model="name" maxlength="20" autocomplete="username" class="field min-w-0 flex-1 px-3 py-2 text-lg" />
        <button
          :disabled="name.trim() === me.name"
          class="btn btn-hi px-4 font-bold disabled:opacity-30"
        >
          OK
        </button>
      </div>
      <p v-if="nameMsg.ok" class="px-5 pb-4 text-sm font-semibold text-hi">{{ nameMsg.ok }} <Icon name="check" /></p>
      <p v-if="nameMsg.err" class="bg-alert px-5 py-2.5 text-sm font-semibold text-white">{{ nameMsg.err }}</p>
    </form>

    <form class="box" @submit.prevent="savePin">
      <div class="px-5 pt-4 font-bold">Changer de PIN</div>
      <div class="space-y-3 p-5">
        <label v-for="f in [{ k: 'current', l: 'PIN actuel', ac: 'current-password' }, { k: 'next', l: 'Nouveau PIN', ac: 'new-password' }, { k: 'confirm', l: 'Confirme', ac: 'new-password' }]" :key="f.k" class="flex items-center gap-3">
          <span class="w-28 text-sm font-semibold text-muted">{{ f.l }}</span>
          <input
            v-model="pin[f.k]"
            v-digits
            type="password" inputmode="numeric" maxlength="8" :autocomplete="f.ac"
            class="field min-w-0 flex-1 px-3 py-2 font-mono text-lg tracking-[.4em]"
          />
        </label>
        <button
          :disabled="!pin.current || !pin.next"
          class="btn btn-hi w-full py-2 font-bold disabled:opacity-30"
        >
          Changer le PIN
        </button>
      </div>
      <p v-if="pinMsg.ok" class="px-5 pb-4 text-sm font-semibold text-hi">{{ pinMsg.ok }} <Icon name="check" /></p>
      <p v-if="pinMsg.err" class="bg-alert px-5 py-2.5 text-sm font-semibold text-white">{{ pinMsg.err }}</p>
    </form>

    <form class="box" @submit.prevent="deleteAccount">
      <div class="px-5 pt-4 font-bold text-alert">Supprimer mon compte</div>
      <div class="flex items-center gap-3 p-5">
        <input
          v-model="delPin"
          v-digits
          type="password" inputmode="numeric" maxlength="8" autocomplete="current-password"
          placeholder="PIN" aria-label="Ton PIN pour confirmer"
          class="field min-w-0 flex-1 px-3 py-2 font-mono text-lg tracking-[.4em]"
        />
        <button :disabled="delPin.length < 4" class="btn shrink-0 bg-alert px-4 py-2 font-bold text-white disabled:opacity-30">Supprimer</button>
      </div>
      <p v-if="delMsg" class="bg-alert px-5 py-2.5 text-sm font-semibold text-white">{{ delMsg }}</p>
    </form>

  </div>
</template>
