import { createApp } from 'vue'
// Icônes Font Awesome (gratuites, embarquées dans le build : pas de CDN) — styles plein et contour seulement
import '@fortawesome/fontawesome-free/css/fontawesome.min.css'
import '@fortawesome/fontawesome-free/css/solid.min.css'
import '@fortawesome/fontawesome-free/css/regular.min.css'
import './style.css'
import App from './App.vue'
import { vDigits } from './api'

import './install' // capte la proposition d'installation dès le chargement

createApp(App).directive('digits', vDigits).mount('#app')

// Appli installable (Android : « Installer l'appli » / écran d'accueil). Seulement sur le build servi, pas en dev.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
