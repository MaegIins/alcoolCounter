<script setup>
// Profil d'une personne : son top 4, son activité récente, ses chiffres ; le journal daté de ses consos ; ses badges.
import { ref, computed, watch } from 'vue'
import { api, ALCO_CATS, SUSPECT_UNITS, catOf, num, fmt, fmtDrink, dayLabel, today } from '../api'
import { ui, goBack, go, openLog, openProduct, bump, setTab } from '../nav'
import { toast, ask } from '../juice'
import Avatar from './Avatar.vue'
import Poster from './Poster.vue'
import Stars from './Stars.vue'
import Icon from './Icon.vue'
import ProductPicker from './ProductPicker.vue'
import FollowList from './FollowList.vue'
import UserDrinks from './UserDrinks.vue'

const props = defineProps({ userId: Number, me: Object, colors: Object })

const data = ref(null)
const error = ref('')
// Onglet courant, gardé dans l'URL (?onglet=…)
const tab = computed({ get: () => ui.tab || 'profil', set: setTab })
const isMe = computed(() => props.userId === props.me.id)

let seq = 0
async function load() {
  const s = ++seq
  error.value = ''
  try {
    const d = await api(`/users/${props.userId}/stats?winsBefore=${today()}`)
    if (s === seq) data.value = d
  } catch (e) {
    if (s === seq) error.value = e.message
  }
}
watch(() => [props.userId, ui.refresh], load, { immediate: true })
watch(() => props.userId, () => {
  diary.value = []
  data.value = null
})

// --- Admin : supprimer ce compte -------------------------------------------------------------
async function deleteUser() {
  const name = data.value.user.name
  const ok = await ask({
    icon: 'fa-user-xmark',
    title: `Supprimer le compte de ${name} ?`,
    message: 'Tous ses verres, notes et photos disparaissent pour de bon. Ses bandes passent au plus ancien membre.',
    confirm: 'Supprimer',
    danger: true,
  })
  if (!ok) return
  try {
    await api(`/users/${props.userId}`, { method: 'DELETE' })
    toast(`Compte de ${name} supprimé`)
    goBack()
    bump()
  } catch (e) {
    toast(e.message)
  }
}

// --- Suivre ---------------------------------------------------------------------------------
const followBusy = ref(false)
const followList = ref(null) // 'followers' | 'following' : liste ouverte
async function toggleFollow() {
  followBusy.value = true
  try {
    const r = await api(`/users/${props.userId}/follow`, { method: data.value.iFollow ? 'DELETE' : 'PUT' })
    data.value = { ...data.value, iFollow: r.iFollow, followers: data.value.followers + (r.iFollow ? 1 : -1) }
    if (r.iFollow) toast(`Tu suis ${data.value.user.name}`)
  } catch (e) {
    toast(e.message)
  } finally {
    followBusy.value = false
  }
}

// --- Journal ----------------------------------------------------------------------------
const diary = ref([])
const diaryMore = ref(false)
const diaryLoading = ref(false)
async function loadDiary(reset = true) {
  diaryLoading.value = true
  try {
    const r = await api(`/users/${props.userId}/diary?limit=40&offset=${reset ? 0 : diary.value.length}`)
    diary.value = reset ? r.items : [...diary.value, ...r.items]
    diaryMore.value = r.more
  } catch (e) {
    error.value = e.message
  } finally {
    diaryLoading.value = false
  }
}
watch(() => [props.userId, ui.refresh], () => loadDiary(true), { immediate: true })
// Groupé par mois : « Novembre 2026 » → consos
const months = computed(() => {
  const out = []
  for (const d of diary.value) {
    const key = d.day.slice(0, 7)
    if (out.at(-1)?.key !== key) {
      const [y, m] = key.split('-').map(Number)
      out.push({ key, label: new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }), items: [] })
    }
    out.at(-1).items.push(d)
  }
  return out
})
const recent = computed(() => diary.value.slice(0, 4))
// Une conso : sa boisson a une page → on y va ; sinon (pas sur la carte) la conso elle-même, si c'est la mienne
const openEntry = (d) => (d.product_id ? openProduct(d.product_id) : isMe.value && openLog({ edit: d }))
// Dans le journal, la ligne ouvre la conso (pour la noter) ; la vignette, la page de la boisson
const openDiary = (d) => (isMe.value ? openLog({ edit: d }) : d.product_id && openProduct(d.product_id))

// --- Top 4 --------------------------------------------------------------------------------
const picking = ref(null) // place en cours de choix
async function setTop(slot, product) {
  const ids = data.value.tops.map((t) => t?.id ?? null)
  ids[slot] = product?.id ?? null
  picking.value = null
  try {
    await api('/me/tops', { method: 'PUT', body: { slots: ids } })
    bump()
  } catch (e) {
    toast(e.message)
  }
}

// --- Chiffres -------------------------------------------------------------------------------
const since = computed(() => {
  const c = data.value?.user.created_at
  return c ? new Date(`${c.replace(' ', 'T')}Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : ''
})
const catTotal = computed(() => Math.max(0.1, ALCO_CATS.reduce((s, c) => s + (data.value?.byCat[c.key] ?? 0), 0)))
const nights = computed(() => [...(data.value?.recent ?? [])].reverse())
const nightsMax = computed(() => Math.max(1, ...nights.value.map((n) => n.units)))
const dayNum = (day) => Number(day.slice(8))
</script>

<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <button v-if="ui.back" class="flex items-center gap-1 text-sm font-medium text-muted hover:text-ink" @click="goBack">
        <Icon name="back" :size="18" /> Retour
      </button>
      <span v-else />
      <button v-if="isMe" class="flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink" @click="go('settings')">
        <Icon name="gear" :size="18" /> Réglages
      </button>
      <button v-else-if="me.is_admin && data" class="flex items-center gap-1.5 text-sm font-medium text-muted hover:text-alert" @click="deleteUser">
        <Icon name="trash" :size="16" /> Supprimer le compte
      </button>
    </div>

    <p v-if="error && !data" class="rounded-md bg-alert/15 px-4 py-3 text-sm text-alert">{{ error }}</p>
    <div v-else-if="!data" class="py-20 text-center text-muted">Chargement…</div>

    <template v-else>
      <!-- En-tête -->
      <header class="flex flex-col items-center text-center">
        <Avatar :user="data.user" :color="colors[data.user.id]" :size="88" />
        <h1 class="mt-3 font-display text-3xl font-bold">{{ data.user.name }}</h1>
        <p class="text-sm text-muted">
          <span v-if="!isMe && !data.inBand" class="mr-1 rounded-full bg-white/5 px-2 py-0.5 text-xs">pas dans ta bande</span>
          Depuis {{ since }}<template v-if="data.wins"> · <Icon name="crown" class="text-hi" /> {{ data.wins }} soirée{{ data.wins > 1 ? 's' : '' }} gagnée{{ data.wins > 1 ? 's' : '' }}</template>
        </p>
        <div class="mt-5 flex divide-x divide-line">
          <div v-for="s in [
            { l: 'Consos', v: data.count },
            { l: 'Cette année', v: data.thisYear },
            { l: 'Soirées', v: data.nights },
            { l: 'Notes', v: data.rated },
          ]" :key="s.l" class="px-4">
            <div class="text-xl font-semibold tabular-nums">{{ s.v }}</div>
            <div class="text-xs text-muted">{{ s.l }}</div>
          </div>
        </div>
        <!-- Abonnements : suivre quelqu'un, bande ou pas -->
        <div class="mt-4 flex items-center gap-4 text-sm text-muted">
          <button class="hover:text-ink hover:underline" @click="followList = 'followers'"><b class="text-ink">{{ data.followers }}</b> abonné{{ data.followers > 1 ? 's' : '' }}</button>
          <button class="hover:text-ink hover:underline" @click="followList = 'following'"><b class="text-ink">{{ data.following }}</b> abonnement{{ data.following > 1 ? 's' : '' }}</button>
          <button
            v-if="!isMe"
            class="btn px-4 py-1.5 font-bold"
            :class="data.iFollow ? 'btn-ghost' : 'btn-hi'"
            :disabled="followBusy"
            @click="toggleFollow"
          >
            <Icon :name="data.iFollow ? 'check' : 'fa-user-plus'" /> {{ data.iFollow ? 'Suivi' : 'Suivre' }}
          </button>
        </div>
      </header>

      <!-- Onglets -->
      <nav class="mt-6 flex justify-center gap-6 border-b border-line" role="tablist">
        <button v-for="t in [{ k: 'profil', l: 'Profil' }, { k: 'boissons', l: 'Boissons' }, { k: 'journal', l: 'Journal' }, { k: 'badges', l: 'Badges' }]" :key="t.k" class="tab" role="tab" :aria-selected="tab === t.k" @click="tab = t.k">
          {{ t.l }}
        </button>
      </nav>

      <!-- Profil -->
      <div v-if="tab === 'profil'" class="space-y-9 pt-6">
        <section>
          <h2 class="kicker mb-3 border-b border-line pb-2">Top 4</h2>
          <div class="grid grid-cols-4 items-start gap-2.5">
            <template v-for="(t, i) in data.tops" :key="i">
              <div v-if="t" class="relative">
                <button class="lift block w-full text-left" :aria-label="`Page de ${t.name}`" @click="openProduct(t.id)">
                  <Poster :drink="t" :width="80" fluid />
                  <span class="mt-1 block truncate text-xs font-semibold">{{ t.name }}</span>
                </button>
                <button
                  v-if="isMe"
                  class="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-ink hover:bg-black"
                  :aria-label="`Changer la boisson n°${i + 1}`"
                  @click="picking = i"
                ><Icon name="edit" /></button>
              </div>
              <button
                v-else-if="isMe"
                class="flex aspect-square items-center justify-center rounded border border-dashed border-line text-faint hover:border-muted hover:text-ink"
                :aria-label="`Choisir la boisson n°${i + 1}`"
                @click="picking = i"
              >
                <Icon name="plus" :size="22" />
              </button>
              <div v-else class="aspect-square rounded-lg bg-sunk" />
            </template>
          </div>
          <p v-if="isMe && !data.tops.some(Boolean)" class="mt-2 text-sm text-faint">Tes 4 boissons préférées, prises sur la carte.</p>
        </section>

        <section v-if="recent.length">
          <h2 class="kicker mb-3 flex items-center justify-between border-b border-line pb-2">
            Activité récente
            <button class="font-medium normal-case tracking-normal text-muted hover:text-ink" @click="tab = 'journal'">Journal <Icon name="next" /></button>
          </h2>
          <div class="grid grid-cols-4 items-start gap-2.5">
            <button v-for="d in recent" :key="d.id" class="text-left" @click="openEntry(d)">
              <Poster :drink="d" :width="80" fluid />
              <span class="mt-1 block truncate text-xs font-semibold">{{ d.name }}</span>
              <div class="mt-1 flex items-center gap-1">
                <Stars v-if="d.rating" :value="d.rating" :size="10" />
                <Icon v-if="d.review" name="review" :size="12" class="text-faint" />
              </div>
            </button>
          </div>
        </section>

        <section v-if="data.top.length">
          <h2 class="kicker mb-1 flex items-center justify-between border-b border-line pb-2">
            Les plus bues
            <button class="font-medium normal-case tracking-normal text-muted hover:text-ink" @click="tab = 'boissons'">Toutes <Icon name="next" /></button>
          </h2>
          <ul class="divide-y divide-line">
            <li v-for="(d, i) in data.top" :key="i" class="flex items-center gap-3 py-2.5">
              <span class="w-4 text-center text-sm text-faint">{{ i + 1 }}</span>
              <button class="min-w-0 flex-1 text-left" :class="d.product_id && 'hover:text-hi'" @click="d.product_id && openProduct(d.product_id)">
                <span class="block truncate font-semibold"><Icon :name="catOf(d.cat).fa" :style="{ color: catOf(d.cat).hex }" /> {{ d.name }}</span>
                <span class="flex items-center gap-2 text-sm text-muted">
                  {{ fmtDrink(d) }} · {{ d.count }} fois
                  <Stars v-if="d.rating" :value="Math.round(d.rating)" :size="11" />
                </span>
              </button>
              <button class="btn btn-ghost shrink-0 px-3 py-1.5 text-sm font-medium" @click="openLog({ drink: d })">
                {{ isMe ? 'Encore' : 'Moi aussi' }}
              </button>
            </li>
          </ul>
        </section>

        <section>
          <h2 class="kicker mb-3 border-b border-line pb-2">Chiffres</h2>
          <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div class="flex justify-between"><dt class="text-muted">Verres standard</dt><dd class="font-semibold tabular-nums">{{ num(data.units) }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">Par soirée</dt><dd class="font-semibold tabular-nums">{{ num(data.avg) }}</dd></div>
            <div v-if="data.record" class="flex justify-between"><dt class="text-muted">Record</dt><dd class="font-semibold">{{ num(data.record.units) }} <span class="font-normal text-faint">· {{ dayLabel(data.record.day, true) }}</span></dd></div>
            <div class="flex justify-between"><dt class="text-muted">Avis écrits</dt><dd class="font-semibold tabular-nums">{{ data.reviews }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted"><Icon name="water" class="text-fort" /> Eau</dt><dd class="font-semibold tabular-nums">{{ data.eau }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted"><Icon name="smoke" /> Clopes</dt><dd class="font-semibold tabular-nums">{{ data.clope }}</dd></div>
          </dl>
          <div v-if="data.units" class="mt-5">
            <div class="flex h-2 gap-px overflow-hidden rounded-full bg-sunk">
              <div v-for="c in ALCO_CATS" :key="c.key" :class="c.color" :style="{ width: `${(data.byCat[c.key] / catTotal) * 100}%` }" :title="`${c.label} : ${fmt(data.byCat[c.key])}`" />
            </div>
            <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              <span v-for="c in ALCO_CATS.filter((c) => data.byCat[c.key])" :key="c.key" class="flex items-center gap-1.5">
                <span class="h-2 w-2 rounded-full" :class="c.color" />{{ c.label }} {{ Math.round((data.byCat[c.key] / catTotal) * 100) }} %
              </span>
            </div>
          </div>
        </section>

        <section v-if="nights.length">
          <h2 class="kicker mb-3 border-b border-line pb-2">Dernières soirées</h2>
          <div class="flex h-24 items-end gap-1">
            <div v-for="n in nights" :key="n.day" class="flex flex-1 flex-col items-center gap-1" :title="`${dayLabel(n.day, true)} : ${fmt(n.units)}`">
              <div
                class="w-full max-w-6 rounded-sm"
                :class="n.units > SUSPECT_UNITS ? 'bg-neon' : 'bg-hi/70'"
                :style="{ height: `${Math.max(3, (n.units / nightsMax) * 72)}px` }"
              />
              <span class="text-[10px] text-faint">{{ dayNum(n.day) }}</span>
            </div>
          </div>
        </section>
      </div>

      <!-- Journal -->
      <div v-else-if="tab === 'journal'" class="pt-4">
        <p v-if="!diaryLoading && !diary.length" class="py-12 text-center text-muted">Journal vide.</p>
        <section v-for="m in months" :key="m.key" class="mb-6">
          <h2 class="kicker sticky top-0 z-10 bg-paper py-2 first-letter:uppercase">{{ m.label }}</h2>
          <ul class="divide-y divide-line">
            <li v-for="(d, i) in m.items" :key="d.id">
              <div class="flex w-full items-center gap-3 py-2.5 text-left hover:bg-panel/60" role="button" tabindex="0" @click="openDiary(d)" @keydown.enter="openDiary(d)">
                <span class="w-9 shrink-0 text-center">
                  <template v-if="i === 0 || m.items[i - 1].day !== d.day">
                    <span class="block text-xl leading-none font-semibold tabular-nums">{{ dayNum(d.day) }}</span>
                    <span class="text-[10px] text-faint uppercase">{{ dayLabel(d.day) }}</span>
                  </template>
                </span>
                <button
                  class="shrink-0"
                  :aria-label="d.product_id ? `Page de ${d.name}` : undefined"
                  @click.stop="d.product_id ? openProduct(d.product_id) : openDiary(d)"
                >
                  <Poster :drink="d" :width="32" />
                </button>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-semibold">{{ d.name }}</span>
                  <span class="flex items-center gap-2 text-sm text-muted">
                    <Stars v-if="d.rating" :value="d.rating" :size="11" />
                    <Icon v-if="d.review" name="review" :size="13" class="text-faint" />
                    <Icon v-if="d.photo_key" name="camera" :size="13" class="text-faint" />
                    <span class="truncate text-faint">{{ fmtDrink(d) }}</span>
                  </span>
                </span>
                <span class="text-sm tabular-nums" :style="{ color: d.units ? catOf(d.cat).hex : undefined }" :class="!d.units && 'text-faint'">
                  {{ d.units ? `+${num(d.units)}` : '0' }}
                </span>
              </div>
            </li>
          </ul>
        </section>
        <button v-if="diaryMore" class="btn btn-ghost w-full py-2.5 text-sm font-medium" :disabled="diaryLoading" @click="loadDiary(false)">
          {{ diaryLoading ? 'Chargement…' : 'Plus ancien' }}
        </button>
      </div>

      <!-- Toutes ses boissons -->
      <UserDrinks v-else-if="tab === 'boissons'" :user-id="userId" :is-me="isMe" />

      <!-- Badges -->
      <div v-else class="pt-6">
        <p class="mb-4 text-sm text-muted">{{ data.badges.filter((b) => b.got).length }} sur {{ data.badges.length }}</p>
        <div class="grid grid-cols-3 gap-2">
          <div
            v-for="b in data.badges"
            :key="b.key"
            class="rounded-md p-3 text-center"
            :class="b.got ? 'bg-panel' : 'bg-panel/40 opacity-50'"
            :title="b.desc"
          >
            <div class="text-2xl" :class="!b.got && 'grayscale'">{{ b.got ? b.icon : '·' }}</div>
            <div class="mt-1 text-sm leading-tight font-semibold">{{ b.label }}</div>
            <div class="mt-0.5 text-xs leading-tight text-muted">{{ b.desc }}</div>
          </div>
        </div>
      </div>
    </template>

    <ProductPicker
      v-if="picking !== null"
      :title="`Top 4 · n°${picking + 1}`"
      :exclude="data.tops.filter(Boolean).map((t) => t.id)"
      @pick="setTop(picking, $event)"
      @close="picking = null"
    />
    <div v-if="picking !== null && data.tops[picking]" class="fixed inset-x-0 bottom-6 z-[70] flex justify-center">
      <button class="btn bg-alert px-4 py-2 text-sm font-semibold text-white" @click="setTop(picking, null)">Vider la place n°{{ picking + 1 }}</button>
    </div>
    <FollowList v-if="followList" :user-id="userId" :kind="followList" :me="me" :colors="colors" @close="followList = null" />
  </div>
</template>
