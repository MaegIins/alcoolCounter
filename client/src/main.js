import { createApp } from 'vue'
// Icônes Font Awesome (gratuites, embarquées dans le build : pas de CDN) — styles plein et contour seulement
import '@fortawesome/fontawesome-free/css/fontawesome.min.css'
import '@fortawesome/fontawesome-free/css/solid.min.css'
import '@fortawesome/fontawesome-free/css/regular.min.css'
import './style.css'
import App from './App.vue'
import { vDigits } from './api'

createApp(App).directive('digits', vDigits).mount('#app')
