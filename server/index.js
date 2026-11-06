import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data')
mkdirSync(DATA_DIR, { recursive: true })

const { app } = createApp({
  dbPath: path.join(DATA_DIR, 'alcool.db'),
  inviteCode: process.env.INVITE_CODE || '', // si défini, requis pour s'inscrire
  admins: (process.env.ADMINS || '').split(','), // pseudos admin, ex. ADMINS=tristan,léa
  tz: process.env.APP_TZ || 'Europe/Paris', // fuseau des soirées
  distDir: path.join(__dirname, '..', 'client', 'dist'),
  // Derrière un reverse proxy (Caddy, Nginx…) : TRUST_PROXY=1, pour que les limites par IP voient la vraie IP
  trustProxy: process.env.TRUST_PROXY ? (Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY) : false,
  sessionDays: Number(process.env.SESSION_DAYS) || 90, // session inutilisée pendant N jours = déconnectée
})

app.listen(PORT, () => console.log(`🍺 L’Ardoise API sur http://localhost:${PORT}`))
