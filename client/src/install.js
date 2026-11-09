// Installation de l'appli (PWA) : on garde la proposition d'installation de Chrome pour l'afficher au bon moment
// (bouton « Installer » des Réglages) au lieu de la laisser passer au chargement.
import { reactive } from 'vue'

const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
export const install = reactive({
  prompt: null, // événement beforeinstallprompt (Chrome, Edge, Samsung Internet) : installation en un appui
  installed: standalone(),
})
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  install.prompt = e
})
window.addEventListener('appinstalled', () => {
  install.prompt = null
  install.installed = true
})

/** Ouvre la fenêtre d'installation du navigateur ; true si la personne a accepté */
export async function promptInstall() {
  const e = install.prompt
  if (!e) return false
  install.prompt = null // utilisable une seule fois
  e.prompt()
  return (await e.userChoice).outcome === 'accepted'
}

/** 'ios' | 'android' | 'pc', pour montrer le bon tuto d'abord */
export function platform() {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'pc'
}
