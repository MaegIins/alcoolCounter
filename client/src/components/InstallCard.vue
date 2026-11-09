<script setup>
// Réglages : installer l'appli sur l'écran d'accueil. Un bouton quand le navigateur le permet (Chrome, Edge…),
// sinon le tuto pas à pas. Rien du tout quand on est déjà dans l'appli installée.
import { ref } from 'vue'
import { install, promptInstall, platform } from '../install'
import { toast } from '../juice'
import Icon from './Icon.vue'

const os = ref(platform())
const showSteps = ref(false) // tuto déplié sous le bouton (pour aider quelqu'un sur un autre téléphone)
const TABS = [{ k: 'android', l: 'Android' }, { k: 'ios', l: 'iPhone' }, { k: 'pc', l: 'Ordi' }]
const STEPS = {
  android: [
    ['fa-ellipsis-vertical', 'Ouvre le site dans <b>Chrome</b>, puis le menu <b>⋮</b> en haut à droite'],
    ['fa-mobile-screen-button', 'Touche <b>Installer l’application</b> (ou <b>Ajouter à l’écran d’accueil</b>)'],
    ['fa-check', 'Confirme : L’Ardoise arrive avec tes applis, en plein écran'],
  ],
  ios: [
    ['fa-compass', 'Ouvre le site dans <b>Safari</b> (pas depuis Instagram ou WhatsApp)'],
    ['fa-arrow-up-from-bracket', 'Touche <b>Partager</b>, le carré avec la flèche, en bas de l’écran'],
    ['fa-square-plus', 'Descends et touche <b>Sur l’écran d’accueil</b>, puis <b>Ajouter</b>'],
  ],
  pc: [
    ['fa-desktop', 'Dans <b>Chrome</b> ou <b>Edge</b>, l’icône d’installation au bout de la barre d’adresse'],
    ['fa-check', 'Clique sur <b>Installer</b> : L’Ardoise s’ouvre dans sa propre fenêtre'],
  ],
}

async function installNow() {
  if (await promptInstall()) toast('L’Ardoise est installée', { kind: 'big' })
}
</script>

<template>
  <section v-if="!install.installed" class="box">
    <div class="px-5 pt-4 font-bold">Installer l’appli</div>
    <p class="px-5 pt-1 text-sm text-muted">Une icône sur ton écran d’accueil, en plein écran, sans barre d’adresse. Rien à télécharger depuis un store.</p>
    <div class="p-5">
      <button v-if="install.prompt" class="btn btn-hi flex w-full items-center justify-center gap-2 py-2.5 font-bold" @click="installNow">
        <Icon name="fa-download" /> Installer L’Ardoise
      </button>
      <button v-if="install.prompt && !showSteps" type="button" class="mt-3 w-full text-center text-sm font-semibold text-muted hover:text-ink" @click="showSteps = true">
        Comment faire sur un autre téléphone ?
      </button>
      <div v-if="!install.prompt || showSteps" :class="install.prompt && 'mt-5'">
        <div class="mb-4 flex gap-2" role="tablist" aria-label="Ton appareil">
          <button
            v-for="t in TABS" :key="t.k" type="button" role="tab" :aria-selected="os === t.k"
            class="btn flex-1 py-1.5 text-sm font-bold" :class="os === t.k ? 'btn-hi' : 'btn-ghost'"
            @click="os = t.k"
          >
            {{ t.l }}
          </button>
        </div>
        <ol class="space-y-3">
          <li v-for="([icon, text], i) in STEPS[os]" :key="os + i" class="flex items-start gap-3">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-raised text-hi"><Icon :name="icon" /></span>
            <!-- eslint-disable-next-line vue/no-v-html : textes fixes ci-dessus -->
            <span class="pt-1 text-sm" v-html="`${i + 1}. ${text}`" />
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>
