<script setup>
// Notifs sur le téléphone (push). `compact` : bandeau en haut de la page Notifs, masquable ; sinon carte des Réglages.
import { ref, computed } from 'vue'
import { push, enablePush, disablePush, testPush } from '../push'
import { install, platform } from '../install'
import { toast } from '../juice'
import Icon from './Icon.vue'

const props = defineProps({ me: Object, compact: Boolean })
const busy = ref(false)
const msg = ref('')
const HIDE = 'push-nudge-hidden'
const hidden = ref((() => { try { return !!localStorage.getItem(HIDE) } catch { return false } })())
const hide = () => {
  hidden.value = true
  try { localStorage.setItem(HIDE, '1') } catch { /* stockage bloqué */ }
}
// iPhone : les notifs ne marchent que dans l'appli installée sur l'écran d'accueil
const iosNotInstalled = computed(() => platform() === 'ios' && !install.installed)
const shown = computed(() => {
  if (!push.ready) return false
  if (props.compact) return push.available && !push.subscribed && push.permission !== 'denied' && !hidden.value
  return push.available || iosNotInstalled.value
})

async function enable() {
  busy.value = true
  msg.value = await enablePush(props.me.id)
  busy.value = false
  if (push.subscribed) toast('Notifs activées sur ce téléphone', { icon: 'fa-bell' })
}
async function disable() {
  busy.value = true
  await disablePush()
  busy.value = false
  toast('Notifs coupées sur ce téléphone')
}
async function test() {
  const r = await testPush().catch((e) => ({ error: e.message }))
  toast(r.error ?? (r.sent ? 'Notif envoyée, regarde ton téléphone' : 'Patiente 30 s avant de réessayer'))
}
</script>

<template>
  <!-- Page Notifs : petit bandeau -->
  <div v-if="compact && shown" class="box relative mt-3 flex items-center gap-3 p-3 pr-10">
    <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-hi/15 text-hi"><Icon name="fa-bell" /></span>
    <span class="min-w-0 flex-1 text-sm">Reçois-les aussi sur ton téléphone, appli fermée.</span>
    <button class="btn btn-hi shrink-0 px-3 py-1.5 text-sm font-bold" :disabled="busy" @click="enable">Activer</button>
    <button class="absolute top-1 right-1 flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-ink" aria-label="Masquer" @click="hide">
      <Icon name="close" />
    </button>
  </div>

  <!-- Réglages -->
  <section v-else-if="!compact && shown" class="box">
    <div class="px-5 pt-4 font-bold">Notifs sur le téléphone</div>
    <div class="p-5 pt-2">
      <p v-if="iosNotInstalled && !push.available" class="text-sm text-muted">
        Sur iPhone, les notifs ne marchent que dans l’appli : installe-la d’abord (ci-dessus), ouvre-la depuis l’écran d’accueil, puis reviens ici.
      </p>
      <template v-else-if="push.subscribed">
        <p class="text-sm"><Icon name="check" class="text-hi" /> Activées sur ce téléphone : likes, commentaires, abonnés, succès.</p>
        <div class="mt-3 flex gap-2">
          <button class="btn btn-ghost flex-1 py-2 text-sm font-bold" @click="test">Tester</button>
          <button class="btn btn-ghost flex-1 py-2 text-sm font-bold" :disabled="busy" @click="disable">Couper</button>
        </div>
      </template>
      <p v-else-if="push.permission === 'denied'" class="text-sm text-muted">
        Bloquées pour ce site. Pour les réactiver : appui long sur l’icône de l’appli › <b>Infos sur l’appli</b> › <b>Notifications</b>
        (ou le cadenas à gauche de l’adresse, dans Chrome).
      </p>
      <template v-else>
        <p class="text-sm text-muted">Likes, commentaires, nouveaux abonnés et succès arrivent sur ton téléphone, même appli fermée.</p>
        <button class="btn btn-hi mt-3 flex w-full items-center justify-center gap-2 py-2.5 font-bold" :disabled="busy" @click="enable">
          <Icon name="fa-bell" /> Activer les notifs
        </button>
      </template>
      <p v-if="msg" class="mt-2 text-sm font-semibold text-alert">{{ msg }}</p>
    </div>
  </section>
</template>
