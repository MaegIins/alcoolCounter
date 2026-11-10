<script setup>
// Profil d'une personne : son top 4, son activité récente, ses chiffres ; le journal daté de ses consos ; ses badges.
import { ref, computed, watch } from 'vue'
import { api, ALCO_CATS, SUSPECT_UNITS, catOf, num, fmt, dayLabel, today, photoUrl, rankOf } from '../api'
import { ui, goBack, go, openLog, openProduct, openPlace, openPost, bump, setTab } from '../nav'
import { toast, ask } from '../juice'
import { refreshRanks, rankFor } from '../ranks'
import { hasNews } from '../changelog'
import Avatar from './Avatar.vue'
import Poster from './Poster.vue'
import Stars from './Stars.vue'
import Icon from './Icon.vue'
import DrinkSpec from './DrinkSpec.vue'
import ProductPicker from './ProductPicker.vue'
import FollowList from './FollowList.vue'
import UserDrinks from './UserDrinks.vue'
import UserStats from './UserStats.vue'

const props = defineProps({ userId: Number, me: Object, colors: Object })

const data = ref(null)
const error = ref('')
// Onglet courant, gardé dans l'URL (?onglet=…)
const tab = computed({ get: () => ui.tab || 'profil', set: setTab })
const isMe = computed(() => props.userId === props.me.id)
const zoom = ref(false) // photo de profil en grand

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
// Suivre / ne plus suivre ; profil privé : demander, ou annuler sa demande. Accepté → on recharge (tout devient visible).
async function toggleFollow() {
  followBusy.value = true
  try {
    const before = data.value.follow
    const r = await api(`/users/${props.userId}/follow`, { method: before === 'none' ? 'PUT' : 'DELETE' })
    const delta = (r.follow === 'yes') - (before === 'yes')
    data.value = { ...data.value, follow: r.follow, iFollow: r.iFollow, followers: data.value.followers + delta }
    if (r.follow === 'yes') toast(`Tu suis ${data.value.user.name}`)
    else if (r.follow === 'pending') toast(`Demande envoyée à ${data.value.user.name}`)
    if (data.value.locked && r.follow === 'yes') load()
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
    if (e.status !== 403) error.value = e.message // profil privé : la page le dit déjà
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
const openEntry = (d) => openPost(d.id)
// Dans le journal, la ligne ouvre la page de la conso ; la vignette, la page de la boisson
const openDiary = (d) => openPost(d.id)

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
// Palier selon le % de succès débloqués : la couleur de l'anneau autour de l'avatar
const rank = computed(() => data.value?.badges && rankOf(data.value.badges.filter((b) => b.got).length, data.value.badges.length))
// (profil privé verrouillé : pas ses badges, on prend son palier dans la liste de tout le monde)
const ringStyle = computed(() => {
  const r = rank.value || rankFor(props.userId)
  return { background: !r || r.next ? r?.color ?? 'var(--color-line)' : 'conic-gradient(from 210deg, #d4bc35, #b8432c, #d4bc35, #f3e7a0, #d4bc35)' }
})
// Titres cachés : je choisis celui affiché sous mon pseudo parmi ceux débloqués (ou aucun)
const titleBusy = ref(false)
async function chooseTitle(key) {
  if (!isMe.value || titleBusy.value) return
  titleBusy.value = true
  try {
    const r = await api('/me/title', { method: 'PUT', body: { key } })
    data.value.title = r.title
    for (const t of data.value.titles) t.current = t.key === key
    refreshRanks()
  } catch (e) {
    toast(e.message)
  } finally {
    titleBusy.value = false
  }
}
// Badges rangés par rubrique (obtenus d'abord dans chaque rubrique)
// Tri de l'onglet Badges : par rubrique, ou du plus rare au plus courant (retenu sur cet appareil)
const badgeSort = ref((() => { try { return localStorage.getItem('badge-sort') || 'rubrique' } catch { return 'rubrique' } })())
watch(badgeSort, (v) => { try { localStorage.setItem('badge-sort', v) } catch {} })
const badgeGroups = computed(() => {
  const all = data.value?.badges ?? []
  if (badgeSort.value === 'rarete') {
    const badges = [...all].sort((a, b) => (a.rarity ?? 100) - (b.rarity ?? 100) || b.got - a.got)
    return [{ key: 'rarete', label: 'Du plus rare au plus courant', badges, got: all.filter((b) => b.got).length }]
  }
  const groups = data.value?.badgeGroups ?? [{ key: undefined, label: 'Badges' }]
  return groups
    .map((g) => {
      const badges = all.filter((b) => b.group === g.key || groups.length === 1)
      return { ...g, badges: [...badges].sort((a, b) => b.got - a.got), got: badges.filter((b) => b.got).length }
    })
    .filter((g) => g.badges.length)
})
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
        <span class="relative"><Icon name="gear" :size="18" /><span v-if="hasNews()" class="absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-hi" aria-label="Nouveautés" /></span> Réglages
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
        <!-- Anneau de la couleur de son état -->
        <span class="rounded-full p-[3px]" :style="ringStyle">
          <span class="block rounded-full bg-paper p-[2px]">
            <button v-if="data.user.avatar_v" class="block cursor-zoom-in rounded-full transition-transform hover:scale-105" :aria-label="`Agrandir la photo de ${data.user.name}`" @click="zoom = true">
              <Avatar :user="data.user" :color="colors[data.user.id]" :size="88" :ring="false" />
            </button>
            <Avatar v-else :user="data.user" :color="colors[data.user.id]" :size="88" :ring="false" />
          </span>
        </span>
        <h1 class="mt-3 font-display text-3xl font-bold">{{ data.user.name }}</h1>
        <button
          v-if="data.title"
          class="mb-1 rounded-full border border-hi/40 px-2.5 py-0.5 text-xs font-semibold text-hi hover:bg-hi/10"
          title="Titre caché"
          @click="tab = 'badges'"
        >
          {{ data.title }}
        </button>
        <p class="text-sm text-muted">
          <span v-if="data.user.private" class="mr-1 rounded-full bg-white/5 px-2 py-0.5 text-xs"><Icon name="lock" /> privé</span>
          <span v-if="!isMe && !data.inBand" class="mr-1 rounded-full bg-white/5 px-2 py-0.5 text-xs">pas dans ta bande</span>
          Depuis {{ since }}<template v-if="data.wins"> · <Icon name="crown" class="text-hi" /> {{ data.wins }} journée{{ data.wins > 1 ? 's' : '' }} gagnée{{ data.wins > 1 ? 's' : '' }}</template>
        </p>
        <div v-if="!data.locked" class="mt-5 flex divide-x divide-line">
          <div v-for="s in [
            { l: 'Consos', v: data.count },
            { l: 'Cette année', v: data.thisYear },
            { l: 'Jours', v: data.nights },
            { l: 'Notes', v: data.rated },
          ]" :key="s.l" class="px-4">
            <div class="text-xl font-semibold tabular-nums">{{ s.v }}</div>
            <div class="text-xs text-muted">{{ s.l }}</div>
          </div>
        </div>
        <!-- Abonnements : suivre quelqu'un, bande ou pas -->
        <div class="mt-4 flex items-center gap-4 text-sm text-muted">
          <!-- Profil privé verrouillé : les compteurs, sans les listes -->
          <component :is="data.locked ? 'span' : 'button'" :class="!data.locked && 'hover:text-ink hover:underline'" @click="!data.locked && (followList = 'followers')"><b class="text-ink">{{ data.followers }}</b> abonné{{ data.followers > 1 ? 's' : '' }}</component>
          <component :is="data.locked ? 'span' : 'button'" :class="!data.locked && 'hover:text-ink hover:underline'" @click="!data.locked && (followList = 'following')"><b class="text-ink">{{ data.following }}</b> abonnement{{ data.following > 1 ? 's' : '' }}</component>
          <button
            v-if="!isMe"
            class="btn px-4 py-1.5 font-bold"
            :class="data.follow === 'none' ? 'btn-hi' : 'btn-ghost'"
            :disabled="followBusy"
            @click="toggleFollow"
          >
            <template v-if="data.follow === 'yes'"><Icon name="check" /> Suivi</template>
            <template v-else-if="data.follow === 'pending'"><Icon name="fa-hourglass-half" /> Demandé</template>
            <template v-else-if="data.user.private"><Icon name="fa-user-plus" /> Demander à suivre</template>
            <template v-else><Icon name="fa-user-plus" /> Suivre</template>
          </button>
        </div>
      </header>

      <!-- Profil privé que je ne vois pas -->
      <div v-if="data.locked" class="mt-10 flex flex-col items-center gap-2 border-t border-line pt-10 text-center">
        <span class="flex h-14 w-14 items-center justify-center rounded-full border-2 border-line text-2xl text-muted"><Icon name="lock" /></span>
        <p class="font-bold">Ce profil est privé</p>
        <p class="max-w-xs text-sm text-muted">
          {{ data.follow === 'pending' ? `Demande envoyée : tu verras ses consos quand ${data.user.name} l’aura acceptée.` : 'Abonne-toi pour voir ses consos, ses stats et ses badges.' }}
        </p>
      </div>
      <template v-else>

      <!-- Onglets -->
      <nav class="-mx-4 mt-6 flex justify-center gap-4 overflow-x-auto border-b border-line px-4 sm:gap-6" role="tablist">
        <button v-for="t in [{ k: 'profil', l: 'Profil' }, { k: 'boissons', l: 'Boissons' }, { k: 'stats', l: 'Stats' }, { k: 'journal', l: 'Journal' }, { k: 'badges', l: 'Badges' }]" :key="t.k" class="tab" role="tab" :aria-selected="tab === t.k" @click="tab = t.k">
          {{ t.l }}
        </button>
      </nav>

      <!-- Profil -->
      <div v-if="tab === 'profil'" class="space-y-9 pt-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-12 lg:gap-y-9 lg:space-y-0">
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

        <!-- Ses lieux les plus visités (seulement ceux que je peux voir) -->
        <section v-if="data.places?.length">
          <h2 class="kicker mb-1 border-b border-line pb-2">Ses lieux</h2>
          <ul class="divide-y divide-line">
            <li v-for="pl in data.places" :key="pl.id">
              <button class="flex w-full items-center gap-3 py-2.5 text-left hover:text-hi" @click="openPlace(pl.id)">
                <span class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5 text-hi">
                  <img v-if="pl.photo_key" :src="photoUrl(pl.photo_key)" alt="" loading="lazy" class="h-full w-full object-cover" />
                  <Icon v-else :name="pl.home ? 'fa-house' : pl.private ? 'lock' : 'fa-location-dot'" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-semibold">{{ pl.home && isMe ? 'Chez moi' : pl.name }}</span>
                  <span class="text-sm text-muted">
                    {{ pl.nights }} jour{{ pl.nights > 1 ? 's' : '' }} · {{ pl.count }} conso{{ pl.count > 1 ? 's' : '' }}
                  </span>
                </span>
                <Icon name="more" class="text-faint" />
              </button>
            </li>
          </ul>
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
                  <DrinkSpec :d="d" /> · {{ d.count }} fois
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
            <div class="flex justify-between"><dt class="text-muted">Par jour bu</dt><dd class="font-semibold tabular-nums">{{ num(data.avg) }}</dd></div>
            <div v-if="data.record" class="flex justify-between"><dt class="text-muted">Record</dt><dd class="font-semibold">{{ num(data.record.units) }} <span class="font-normal text-faint">· {{ dayLabel(data.record.day, true) }}</span></dd></div>
            <div class="flex justify-between"><dt class="text-muted">Avis écrits</dt><dd class="font-semibold tabular-nums">{{ data.reviews }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted"><Icon name="water" class="text-fort" /> Eau</dt><dd class="font-semibold tabular-nums">{{ data.eau }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted"><Icon name="smoke" /> Clopes</dt><dd class="font-semibold tabular-nums">{{ data.clope }}</dd></div>
          </dl>
          <div v-if="data.units" class="mt-5">
            <div class="flex h-2 gap-px overflow-hidden rounded-full bg-sunk">
              <div v-for="c in ALCO_CATS" :key="c.key" :class="c.color" :style="{ width: `${(data.byCat[c.key] / catTotal) * 100}%` }" :data-tip="`${c.label} : ${fmt(data.byCat[c.key])}`" />
            </div>
            <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              <span v-for="c in ALCO_CATS.filter((c) => data.byCat[c.key])" :key="c.key" class="flex items-center gap-1.5">
                <span class="h-2 w-2 rounded-full" :class="c.color" />{{ c.label }} {{ Math.round((data.byCat[c.key] / catTotal) * 100) }} %
              </span>
            </div>
          </div>
        </section>

        <section v-if="nights.length">
          <h2 class="kicker mb-3 border-b border-line pb-2">Derniers jours</h2>
          <div class="flex h-24 items-end gap-1">
            <div v-for="n in nights" :key="n.day" class="flex flex-1 flex-col items-center gap-1" :data-tip="`${dayLabel(n.day, true)} : ${fmt(n.units)}`">
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
                    <span class="truncate text-faint"><DrinkSpec :d="d" /></span>
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
      <UserStats v-else-if="tab === 'stats'" :user-id="userId" :profile="data" :me="me" :colors="colors" />

      <!-- Badges, par rubrique -->
      <div v-else class="pt-6">
        <!-- Titres cachés : seulement ceux débloqués, les autres restent secrets -->
        <div class="mb-6 rounded-lg bg-panel p-4">
          <div class="flex items-baseline justify-between gap-3">
            <h3 class="font-display text-xl">Titres cachés</h3>
            <span class="text-sm text-muted tabular-nums">{{ data.titles.length }} / {{ data.titlesTotal }}</span>
          </div>
          <p class="mt-1 text-sm text-muted">
            <template v-if="!data.titles.length">{{ isMe ? 'Aucun pour l’instant. Ils tombent en buvant certaines boissons… à toi de trouver lesquelles.' : 'Aucun titre débloqué pour l’instant.' }}</template>
            <template v-else-if="isMe">Touche un titre pour l’afficher sous ton pseudo. Les {{ data.titlesTotal - data.titles.length }} autres sont à découvrir.</template>
            <template v-else>{{ data.titlesTotal - data.titles.length }} encore cachés.</template>
          </p>
          <div v-if="data.titles.length" class="mt-3 flex flex-wrap gap-2">
            <component
              :is="isMe ? 'button' : 'div'"
              v-for="t in data.titles"
              :key="t.key"
              class="rounded-xl border px-3 py-1.5 text-left"
              :class="[t.current ? 'border-hi bg-hi/10' : 'border-line', isMe && 'hover:border-hi/60']"
              :disabled="isMe ? titleBusy : undefined"
              :aria-pressed="isMe ? t.current : undefined"
              @click="isMe && chooseTitle(t.key)"
            >
              <span class="block font-semibold" :class="t.current && 'text-hi'">{{ t.label }}</span>
              <span class="block text-xs text-muted">{{ t.how }}</span>
            </component>
            <button
              v-if="isMe"
              class="rounded-xl border px-3 py-1.5 text-sm"
              :class="!data.title ? 'border-hi bg-hi/10 text-hi' : 'border-line text-muted hover:border-hi/60'"
              :disabled="titleBusy"
              :aria-pressed="!data.title"
              @click="chooseTitle(null)"
            >
              Aucun titre
            </button>
          </div>
          <div v-if="data.titlesTotal > data.titles.length" class="mt-3 flex flex-wrap gap-1.5" aria-hidden="true">
            <span v-for="n in Math.min(12, data.titlesTotal - data.titles.length)" :key="n" class="rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs text-faint">???</span>
            <span v-if="data.titlesTotal - data.titles.length > 12" class="px-1 text-xs text-faint">…</span>
          </div>
        </div>
        <p class="mb-2 text-sm text-muted">{{ rank.got }} succès sur {{ rank.total }} · {{ Math.floor(rank.pct) }} %</p>
        <div class="mb-4 flex justify-end">
          <div class="flex rounded-full bg-white/5 p-1 text-sm">
            <button class="seg" :aria-pressed="badgeSort === 'rubrique'" @click="badgeSort = 'rubrique'">Par rubrique</button>
            <button class="seg" :aria-pressed="badgeSort === 'rarete'" @click="badgeSort = 'rarete'">Par rareté</button>
          </div>
        </div>
        <section v-for="g in badgeGroups" :key="g.key" class="mb-6">
          <h3 class="mb-2 flex items-baseline justify-between text-sm font-semibold">
            {{ g.label }}
            <span class="text-xs font-normal text-faint">{{ g.got }}/{{ g.badges.length }}</span>
          </h3>
          <div class="grid grid-cols-3 gap-2 lg:grid-cols-5">
            <div
              v-for="b in g.badges"
              :key="b.key"
              class="flex flex-col rounded-md p-3 text-center"
              :class="b.got ? 'bg-panel' : 'bg-panel/40'"
            >
              <div class="text-2xl" :class="!b.got && 'opacity-50 grayscale'">{{ b.got || b.secret ? b.icon : '·' }}</div>
              <div class="mt-1 text-sm leading-tight font-semibold" :class="!b.got && 'text-muted'">{{ b.label }}</div>
              <div class="mt-0.5 text-xs leading-tight text-muted" :class="!b.got && 'opacity-70'">{{ b.desc }}</div>
              <!-- Où on en est (badges chiffrés pas encore obtenus) -->
              <div v-if="b.progress" class="mt-2">
                <div class="h-1 overflow-hidden rounded-full bg-sunk">
                  <div class="h-full rounded-full bg-hi/70" :style="{ width: `${(100 * b.progress[0]) / b.progress[1]}%` }" />
                </div>
                <div class="mt-0.5 text-[11px] text-faint tabular-nums">{{ num(b.progress[0]) }} / {{ num(b.progress[1]) }}</div>
              </div>
              <!-- Rareté : part des joueurs qui l'ont -->
              <div v-if="b.rarity != null" class="mt-auto pt-1.5 text-[10px] leading-tight" :class="b.rarity <= 10 ? 'font-semibold text-neon' : 'text-faint'">
                {{ b.rarity <= 10 ? 'Rare · ' : '' }}{{ b.rarity }} % des joueurs
              </div>
            </div>
          </div>
        </section>
      </div>
      </template>
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
    <Teleport to="body">
      <div v-if="zoom && data?.user.avatar_v" class="fixed inset-0 z-[90] flex cursor-zoom-out items-center justify-center bg-black/90 p-4" @click="zoom = false">
        <img :src="`/api/avatar/${data.user.id}?v=${data.user.avatar_v}`" :alt="data.user.name" class="aspect-square w-72 max-w-full rounded-full object-cover ring-2 ring-white/10" />
      </div>
    </Teleport>
  </div>
</template>
