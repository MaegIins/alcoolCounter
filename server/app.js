import express from 'express'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { computeBadges, BADGES } from './badges.js'

// Chaque conso est enregistrée avec son volume et son degré : le score vient de l'alcool pur réellement bu.
// 1 verre standard = 10 g d'alcool pur ; grammes = cl × 10 × degré/100 × 0,8 (densité de l'éthanol).
// Catégories = couleurs des graphes ; pour en ajouter une : ici + côté client (utils.js) + style.css.
export const CATS = ['biere', 'vin', 'fort', 'cocktail', 'autre']
export const MAX_CL = 200 // par conso (une bouteille de 1,5 L de vin passe en plusieurs fois)
export const MAX_DRINKS_PER_DAY = 100
export const SUSPECT_UNITS = 30 // au-delà : badge « suspect » (on ne bloque pas, on affiche)
export const EXTRAS = ['eau', 'clope'] // comptés à part, hors score
// Code de bande : 6 caractères sans ambiguïté (pas de 0/O, 1/I/L)
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const newCode = () => Array.from(randomBytes(6), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('')
// Verres standard d'une conso, en SQL (préfixe de table optionnel) et en JS
const UNITS = (p = '') => `(${p}cl * ${p}abv * 0.008)`
export const unitsOf = ({ cl, abv }) => cl * abv * 0.008
const round1 = (n) => Math.round(n * 10) / 10

// --- Fonctions pures (testées unitairement) ----------------------------------
const hashPin = (pin) => {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(pin, salt, 32).toString('hex')}`
}
const checkPin = (pin, stored) => {
  const [salt, hash] = stored.split(':')
  const a = Buffer.from(hash, 'hex')
  const b = scryptSync(pin, salt, 32)
  return a.length === b.length && timingSafeEqual(a, b)
}
// YYYY-MM-DD et date réelle (rejette 2026-13-45, 2026-02-30…)
export const isDay = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}
export const checkName = (name) => {
  if (name.length < 2 || name.length > 20) return 'Pseudo entre 2 et 20 caractères'
  if (/\p{Cc}/u.test(name)) return 'Caractères invisibles interdits dans le pseudo'
  return null
}
// Valide une conso envoyée par le client ; renvoie { drink } ou { error }
export const checkDrink = (b) => {
  const name = String(b.name ?? '').trim()
  const cat = String(b.cat ?? '')
  const cl = Number(b.cl)
  const abv = Number(b.abv)
  if (!name || name.length > 40 || /\p{Cc}/u.test(name)) return { error: 'Nom de boisson entre 1 et 40 caractères' }
  if (!CATS.includes(cat)) return { error: 'Catégorie inconnue' }
  if (!Number.isFinite(cl) || cl <= 0 || cl > MAX_CL) return { error: `Volume entre 0 et ${MAX_CL} cl` }
  if (!Number.isFinite(abv) || abv <= 0 || abv > 100) return { error: 'Degré entre 0 et 100 %' }
  return { drink: { name, cat, cl: round1(cl), abv: round1(abv) } }
}

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg })
const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer /, '')
const lockedMsg = (s) => `Trop d'essais, réessaie dans ${s > 60 ? `${Math.ceil(s / 60)} min` : `${s} s`}`
// Hash factice : la connexion prend le même temps que le pseudo existe ou non
const DUMMY_HASH = hashPin('0000')

/**
 * Crée l'app Express et sa base.
 * @param {object} o
 * @param {string} [o.dbPath]      fichier SQLite (':memory:' pour les tests)
 * @param {string} [o.inviteCode]  si défini, requis pour s'inscrire
 * @param {() => number} [o.now]   horloge en ms, injectable pour les tests
 * @param {string} [o.distDir]     front buildé à servir (prod)
 * @param {string[]} [o.admins]   pseudos admin (peuvent retirer/modifier n'importe quel produit de la carte)
 * @param {string} [o.tz]          fuseau des soirées (badges « couche-tard »…)
 */
export function createApp({ dbPath = ':memory:', inviteCode = '', now = Date.now, distDir, admins = [], tz = 'Europe/Paris' } = {}) {
  const db = new DatabaseSync(dbPath)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      pin_hash TEXT NOT NULL,
      avatar TEXT,
      avatar_v INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS drinks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day TEXT NOT NULL,   -- soirée (YYYY-MM-DD), décidée par le client : jusqu'à 6h on compte la veille
      at INTEGER NOT NULL, -- ms
      name TEXT NOT NULL,
      cat TEXT NOT NULL,
      cl REAL NOT NULL,
      abv REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS drinks_user_day ON drinks(user_id, day);
    CREATE INDEX IF NOT EXISTS drinks_day ON drinks(day);
    -- Eau et clopes : comptées à part, hors score
    CREATE TABLE IF NOT EXISTS extras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      at INTEGER NOT NULL,
      kind TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS extras_user_day ON extras(user_id, day);
    -- Bandes : chacune sa compet et sa carte ; on y entre avec un code
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS group_members (
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (group_id, user_id)
    );
    -- La carte d'une bande : produits remplis par ses membres
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      name TEXT NOT NULL COLLATE NOCASE,
      cat TEXT NOT NULL,
      cl REAL NOT NULL,
      abv REAL NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (group_id, name, cl, abv)
    );
    -- Favoris de chacun : raccourcis sur l'accueil
    CREATE TABLE IF NOT EXISTS product_favs (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, product_id)
    );
  `)
  // Admins : listés par pseudo dans la config (ADMINS=…), resynchronisés à chaque démarrage
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name)
  if (!userCols.includes('is_admin')) db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0')
  const adminNames = admins.map((a) => a.trim().toLowerCase()).filter(Boolean)
  const isAdminName = (name) => adminNames.includes(name.toLowerCase())
  db.exec('UPDATE users SET is_admin = 0')
  const setAdmin = db.prepare('UPDATE users SET is_admin = 1 WHERE name = ?')
  for (const a of adminNames) setAdmin.run(a)

  // Migration : avant les bandes, tout le monde était dans une seule compet → bande « La bande » pour tous,
  // et la carte (sans group_id) lui est rattachée. Table recréée pour l'unicité par bande.
  const productCols = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name)
  if (!productCols.includes('group_id')) {
    const first = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get()
    db.exec('PRAGMA foreign_keys = OFF; BEGIN')
    let gid = null
    if (first) {
      gid = Number(db.prepare('INSERT INTO groups (name, code, owner_id) VALUES (?, ?, ?)').run('La bande', newCode(), first.id).lastInsertRowid)
      db.prepare('INSERT INTO group_members (group_id, user_id, joined_at) SELECT ?, id, ? FROM users').run(gid, now())
    }
    db.exec(`
      CREATE TABLE products_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        name TEXT NOT NULL COLLATE NOCASE, cat TEXT NOT NULL, cl REAL NOT NULL, abv REAL NOT NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (group_id, name, cl, abv)
      );
    `)
    if (gid) db.prepare('INSERT INTO products_new (id, group_id, name, cat, cl, abv, created_by, created_at) SELECT id, ?, name, cat, cl, abv, created_by, created_at FROM products').run(gid)
    db.exec('DROP TABLE products; ALTER TABLE products_new RENAME TO products; COMMIT; PRAGMA foreign_keys = ON')
  }

  // Migration : ancienne table « entries » (compteurs par type) → une conso par verre
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'entries'").get()) {
    const OLD = {
      biere: ['Demi', 'biere', 25, 5], pinte: ['Pinte', 'biere', 50, 5], vin: ['Verre de vin', 'vin', 12, 12],
      shot: ['Shot', 'fort', 3, 40], cocktail: ['Cocktail', 'cocktail', 20, 10],
    }
    const cols = db.prepare('PRAGMA table_info(entries)').all().map((c) => c.name)
    const ins = db.prepare('INSERT INTO drinks (user_id, day, at, name, cat, cl, abv) VALUES (?, ?, ?, ?, ?, ?, ?)')
    db.exec('BEGIN')
    for (const row of db.prepare('SELECT * FROM entries').all()) {
      const at = Date.parse(`${row.day}T20:00:00Z`)
      for (const [k, d] of Object.entries(OLD)) for (let i = 0; cols.includes(k) && i < row[k]; i++) ins.run(row.user_id, row.day, at, ...d)
    }
    db.exec('DROP TABLE entries; COMMIT')
  }

  // Dernier jour saisissable : demain en UTC, pour laisser de la marge aux fuseaux horaires
  const maxEntryDay = () => new Date(now() + 36 * 3600e3).toISOString().slice(0, 10)
  const newSession = (userId) => {
    const token = randomBytes(24).toString('hex')
    db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId)
    return token
  }

  // Anti-bruteforce du PIN : après 5 échecs, blocage croissant (30 s, 1 min, 2 min… max 15 min)
  const attempts = new Map() // clé -> { fails, until, last }
  const lockedFor = (key) => {
    const a = attempts.get(key)
    return a && a.until > Date.now() ? Math.ceil((a.until - Date.now()) / 1000) : 0
  }
  const recordFail = (key) => {
    const a = attempts.get(key) || { fails: 0, until: 0 }
    a.fails++
    a.last = Date.now()
    if (a.fails >= 5) a.until = Date.now() + Math.min(15 * 60e3, 30e3 * 2 ** (a.fails - 5))
    attempts.set(key, a)
  }
  const purge = setInterval(() => {
    for (const [k, a] of attempts) if (Date.now() - a.last > 3600e3) attempts.delete(k)
  }, 600e3)
  purge.unref()

  const auth = (req, res, next) => {
    const token = bearer(req)
    const user = token
      ? db.prepare('SELECT u.id, u.name, u.avatar_v, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token)
      : null
    if (!user) return bad(res, 'Non connecté', 401)
    req.user = { ...user, is_admin: !!user.is_admin }
    next()
  }

  // Bande courante : en-tête X-Group (sinon la première rejointe). Les routes « de bande » en ont besoin.
  const myGroups = (userId) => db.prepare(`
    SELECT g.id, g.name, g.code, g.owner_id, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS members
    FROM group_members m JOIN groups g ON g.id = m.group_id WHERE m.user_id = ? ORDER BY m.joined_at, g.id
  `).all(userId)
  const isMember = (groupId, userId) => !!db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId)
  const group = (req, res, next) => {
    const wanted = Number(req.headers['x-group'])
    const g = wanted
      ? db.prepare('SELECT g.* FROM groups g JOIN group_members m ON m.group_id = g.id WHERE g.id = ? AND m.user_id = ?').get(wanted, req.user.id)
      : myGroups(req.user.id)[0]
    if (!g) return res.status(409).json({ error: wanted ? "Tu n'es pas dans cette bande" : 'Rejoins ou crée une bande', code: 'NO_GROUP' })
    req.group = g
    req.memberIds = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(g.id).map((r) => r.user_id)
    next()
  }
  // Peut modifier/retirer un produit : son auteur, le patron de la bande, ou un admin
  const canManage = (p, req) => p.created_by === req.user.id || req.group.owner_id === req.user.id || req.user.is_admin
  const joinGroup = (groupId, userId) =>
    db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)').run(groupId, userId, now())
  const groupOut = (g) => ({ id: g.id, name: g.name, code: g.code, owner_id: g.owner_id, members: g.members })

  // Badges d'une personne ; `newBadges(userId, fn)` donne ceux débloqués par fn()
  const historyOf = (userId) => ({
    drinks: db.prepare('SELECT day, at, name, cat, cl, abv FROM drinks WHERE user_id = ?').all(userId),
    extras: db.prepare('SELECT day, at, kind FROM extras WHERE user_id = ?').all(userId),
    tz,
  })
  const newBadges = (userId, fn) => {
    const before = computeBadges(historyOf(userId))
    const out = fn()
    const after = computeBadges(historyOf(userId))
    return { out, badges: BADGES.filter((b) => after.has(b.key) && !before.has(b.key)) }
  }

  const app = express()
  app.use(express.json({ limit: '400kb' }))
  app.use((req, _res, next) => {
    req.body ??= {} // requête sans corps JSON
    next()
  })

  app.get('/api/config', (_req, res) => res.json({ inviteRequired: !!inviteCode }))

  app.post('/api/register', (req, res) => {
    const name = String(req.body.name || '').trim()
    const pin = String(req.body.pin || '')
    if (inviteCode && req.body.invite !== inviteCode) return bad(res, "Code d'invitation invalide", 403)
    if (checkName(name)) return bad(res, checkName(name))
    if (!/^\d{4,8}$/.test(pin)) return bad(res, 'Le PIN doit faire 4 à 8 chiffres')
    if (db.prepare('SELECT 1 FROM users WHERE name = ?').get(name)) return bad(res, 'Pseudo déjà pris', 409)
    // Code de bande facultatif : on rejoint directement la bande des potes
    const code = String(req.body.group || '').trim().toUpperCase()
    const g = code ? db.prepare('SELECT id FROM groups WHERE code = ?').get(code) : null
    if (code && !g) return bad(res, 'Code de bande inconnu', 404)
    const { lastInsertRowid } = db.prepare('INSERT INTO users (name, pin_hash, is_admin) VALUES (?, ?, ?)').run(name, hashPin(pin), +isAdminName(name))
    const id = Number(lastInsertRowid)
    if (g) joinGroup(g.id, id)
    res.json({ token: newSession(id), user: { id, name, avatar_v: 0, is_admin: isAdminName(name) } })
  })

  app.post('/api/login', (req, res) => {
    const name = String(req.body.name || '').trim()
    const key = `login:${name.toLowerCase()}`
    const wait = lockedFor(key)
    if (wait) return bad(res, lockedMsg(wait), 429)
    const user = db.prepare('SELECT * FROM users WHERE name = ?').get(name)
    const ok = checkPin(String(req.body.pin || ''), user?.pin_hash ?? DUMMY_HASH)
    if (!user || !ok) {
      recordFail(key)
      return bad(res, 'Pseudo ou PIN incorrect', 401)
    }
    attempts.delete(key)
    res.json({ token: newSession(user.id), user: { id: user.id, name: user.name, avatar_v: user.avatar_v, is_admin: !!user.is_admin } })
  })

  app.post('/api/logout', auth, (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(bearer(req))
    res.json({ ok: true })
  })

  app.get('/api/me', auth, (req, res) => res.json({ user: req.user }))

  // Photo de profil : le client envoie une image déjà redimensionnée (data URL)
  app.put('/api/me/avatar', auth, (req, res) => {
    const dataUrl = String(req.body.dataUrl || '')
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) return bad(res, 'Image invalide')
    if (dataUrl.length > 300_000) return bad(res, 'Image trop lourde')
    const v = Date.now()
    db.prepare('UPDATE users SET avatar = ?, avatar_v = ? WHERE id = ?').run(dataUrl, v, req.user.id)
    res.json({ avatar_v: v })
  })
  app.delete('/api/me/avatar', auth, (req, res) => {
    db.prepare('UPDATE users SET avatar = NULL, avatar_v = 0 WHERE id = ?').run(req.user.id)
    res.json({ avatar_v: 0 })
  })
  // Public (une balise <img> n'envoie pas de token) ; URL versionnée => cache long
  app.get('/api/avatar/:id', (req, res) => {
    const row = db.prepare('SELECT avatar FROM users WHERE id = ?').get(Number(req.params.id))
    const m = row?.avatar?.match(/^data:(image\/\w+);base64,(.+)$/)
    if (!m) return res.status(404).end()
    res.set('Cache-Control', 'public, max-age=31536000, immutable').type(m[1]).send(Buffer.from(m[2], 'base64'))
  })

  // Profil : pseudo + PIN
  app.patch('/api/me', auth, (req, res) => {
    const name = String(req.body.name || '').trim()
    const err = checkName(name)
    if (err) return bad(res, err)
    if (db.prepare('SELECT 1 FROM users WHERE name = ? AND id != ?').get(name, req.user.id)) return bad(res, 'Pseudo déjà pris', 409)
    // Le statut admin suit le pseudo : changer de pseudo peut le donner ou le retirer
    db.prepare('UPDATE users SET name = ?, is_admin = ? WHERE id = ?').run(name, +isAdminName(name), req.user.id)
    res.json({ user: { ...req.user, name, is_admin: isAdminName(name) } })
  })

  app.put('/api/me/pin', auth, (req, res) => {
    const key = `pin:${req.user.id}`
    const wait = lockedFor(key)
    if (wait) return bad(res, lockedMsg(wait), 429)
    const { pin_hash } = db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(req.user.id)
    if (!checkPin(String(req.body.current || ''), pin_hash)) {
      recordFail(key)
      return bad(res, 'PIN actuel incorrect', 403)
    }
    attempts.delete(key)
    const next = String(req.body.next || '')
    if (!/^\d{4,8}$/.test(next)) return bad(res, 'Le PIN doit faire 4 à 8 chiffres')
    db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(hashPin(next), req.user.id)
    // Déconnecte les autres appareils, garde la session courante
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, bearer(req))
    res.json({ ok: true })
  })

  // --- Bandes -------------------------------------------------------------------
  app.get('/api/groups', auth, (req, res) => res.json(myGroups(req.user.id).map(groupOut)))

  app.post('/api/groups', auth, (req, res) => {
    const name = String(req.body.name || '').trim()
    if (name.length < 2 || name.length > 30 || /\p{Cc}/u.test(name)) return bad(res, 'Nom de bande entre 2 et 30 caractères')
    let code
    do code = newCode()
    while (db.prepare('SELECT 1 FROM groups WHERE code = ?').get(code))
    const id = Number(db.prepare('INSERT INTO groups (name, code, owner_id) VALUES (?, ?, ?)').run(name, code, req.user.id).lastInsertRowid)
    joinGroup(id, req.user.id)
    res.json(groupOut(myGroups(req.user.id).find((g) => g.id === id)))
  })

  app.post('/api/groups/join', auth, (req, res) => {
    const code = String(req.body.code || '').trim().toUpperCase()
    const g = db.prepare('SELECT id FROM groups WHERE code = ?').get(code)
    if (!g) return bad(res, 'Code de bande inconnu', 404)
    joinGroup(g.id, req.user.id)
    res.json(groupOut(myGroups(req.user.id).find((x) => x.id === g.id)))
  })

  // Quitter une bande ; le patron qui part passe la main au plus ancien, la dernière personne qui part la supprime
  app.delete('/api/groups/:id/members/me', auth, (req, res) => {
    const id = Number(req.params.id)
    const g = db.prepare('SELECT owner_id FROM groups WHERE id = ?').get(id)
    if (!g || !isMember(id, req.user.id)) return bad(res, 'Bande introuvable', 404)
    db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(id, req.user.id)
    const next = db.prepare('SELECT user_id FROM group_members WHERE group_id = ? ORDER BY joined_at LIMIT 1').get(id)
    if (!next) db.prepare('DELETE FROM groups WHERE id = ?').run(id)
    else if (g.owner_id === req.user.id) db.prepare('UPDATE groups SET owner_id = ? WHERE id = ?').run(next.user_id, id)
    res.json({ ok: true })
  })

  // Membres de la bande courante
  app.get('/api/users', auth, group, (req, res) => {
    res.json(db.prepare(`
      SELECT u.id, u.name, u.avatar_v FROM users u JOIN group_members m ON m.user_id = u.id WHERE m.group_id = ? ORDER BY u.id
    `).all(req.group.id))
  })

  // Ajouter une conso (une par appel : un verre = un tap)
  app.post('/api/drinks', auth, (req, res) => {
    const day = req.body.day
    if (!isDay(day)) return bad(res, 'Date invalide')
    if (day > maxEntryDay()) return bad(res, 'Pas de saisie dans le futur')
    const { drink, error } = checkDrink(req.body)
    if (error) return bad(res, error)
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM drinks WHERE user_id = ? AND day = ?').get(req.user.id, day)
    if (n >= MAX_DRINKS_PER_DAY) return bad(res, `Maximum ${MAX_DRINKS_PER_DAY} consos par soirée`)
    const at = now()
    const { out: id, badges } = newBadges(req.user.id, () =>
      Number(db.prepare('INSERT INTO drinks (user_id, day, at, name, cat, cl, abv) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(req.user.id, day, at, drink.name, drink.cat, drink.cl, drink.abv).lastInsertRowid)
    )
    res.json({ id, day, at, ...drink, units: round1(unitsOf(drink)), badges })
  })

  // Eau et clopes : un tap = un, hors score
  app.post('/api/extras', auth, (req, res) => {
    const { day, kind } = req.body
    if (!isDay(day) || day > maxEntryDay()) return bad(res, 'Date invalide')
    if (!EXTRAS.includes(kind)) return bad(res, 'Type inconnu (eau ou clope)')
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM extras WHERE user_id = ? AND day = ? AND kind = ?').get(req.user.id, day, kind)
    if (n >= MAX_DRINKS_PER_DAY) return bad(res, `Maximum ${MAX_DRINKS_PER_DAY} par soirée`)
    const at = now()
    const { out: id, badges } = newBadges(req.user.id, () =>
      Number(db.prepare('INSERT INTO extras (user_id, day, at, kind) VALUES (?, ?, ?, ?)').run(req.user.id, day, at, kind).lastInsertRowid)
    )
    res.json({ id, day, at, kind, count: n + 1, badges })
  })
  app.delete('/api/extras/:id', auth, (req, res) => {
    const { changes } = db.prepare('DELETE FROM extras WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id)
    if (!changes) return bad(res, 'Introuvable', 404)
    res.json({ ok: true })
  })
  app.get('/api/extras/me', auth, (req, res) => {
    const { from, to } = req.query
    if (!isDay(from) || !isDay(to)) return bad(res, 'Période invalide')
    res.json(db.prepare('SELECT id, day, at, kind FROM extras WHERE user_id = ? AND day BETWEEN ? AND ? ORDER BY at DESC, id DESC').all(req.user.id, from, to))
  })

  // Supprimer une de ses consos (erreur de saisie)
  app.delete('/api/drinks/:id', auth, (req, res) => {
    const { changes } = db.prepare('DELETE FROM drinks WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id)
    if (!changes) return bad(res, 'Conso introuvable', 404)
    res.json({ ok: true })
  })

  // Mes consos sur une période, de la plus récente à la plus ancienne
  app.get('/api/drinks/me', auth, (req, res) => {
    const { from, to } = req.query
    if (!isDay(from) || !isDay(to)) return bad(res, 'Période invalide')
    const rows = db.prepare(
      'SELECT id, day, at, name, cat, cl, abv FROM drinks WHERE user_id = ? AND day BETWEEN ? AND ? ORDER BY at DESC, id DESC'
    ).all(req.user.id, from, to)
    res.json(rows.map((r) => ({ ...r, units: round1(unitsOf(r)) })))
  })

  // Mes boissons habituelles (pour les ajouter en un tap) : les plus bues, puis les plus récentes
  app.get('/api/drinks/favorites', auth, (req, res) => {
    res.json(db.prepare(`
      SELECT name, cat, cl, abv, COUNT(*) AS count FROM drinks WHERE user_id = ?
      GROUP BY name, cat, cl, abv ORDER BY count DESC, MAX(at) DESC LIMIT 8
    `).all(req.user.id))
  })

  // Soirées gagnées par personne (ex æquo tous gagnants), avant la date donnée (= soirée en cours exclue)
  // Calculé entre les membres de la bande seulement.
  const winsMap = (before, groupId) => {
    const rows = db.prepare(`
      WITH totals AS (
        SELECT user_id, day, ROUND(SUM(${UNITS()}), 2) AS t FROM drinks
        WHERE day < ? AND user_id IN (SELECT user_id FROM group_members WHERE group_id = ?) GROUP BY user_id, day
      ), best AS (
        SELECT day, MAX(t) AS m FROM totals GROUP BY day HAVING m > 0
      )
      SELECT t.user_id, COUNT(*) AS wins FROM totals t JOIN best b ON b.day = t.day AND b.m = t.t GROUP BY t.user_id
    `).all(isDay(before) ? before : '9999-12-31', groupId)
    return Object.fromEntries(rows.map((w) => [w.user_id, w.wins]))
  }

  // Fiche d'un joueur : stats depuis le début, boissons préférées, dernières soirées, détail d'une soirée
  app.get('/api/users/:id/stats', auth, group, (req, res) => {
    const id = Number(req.params.id)
    const user = db.prepare('SELECT id, name, avatar_v, created_at FROM users WHERE id = ?').get(id)
    if (!user || !req.memberIds.includes(id)) return bad(res, 'Joueur introuvable', 404)
    const { day } = req.query
    if (day !== undefined && !isDay(day)) return bad(res, 'Date invalide')

    const nights = db.prepare(`
      SELECT day, SUM(${UNITS()}) AS units, COUNT(*) AS count FROM drinks WHERE user_id = ? GROUP BY day ORDER BY day DESC
    `).all(id)
    const units = nights.reduce((s, n) => s + n.units, 0)
    const best = nights.reduce((b, n) => (!b || n.units > b.units ? n : b), null)
    const byCat = db.prepare(`
      SELECT ${CATS.map((c) => `COALESCE(SUM(CASE WHEN cat = '${c}' THEN ${UNITS()} END), 0) AS ${c}`).join(', ')}
      FROM drinks WHERE user_id = ?
    `).get(id)
    const top = db.prepare(`
      SELECT name, cat, cl, abv, COUNT(*) AS count FROM drinks WHERE user_id = ?
      GROUP BY name, cat, cl, abv ORDER BY count DESC, MAX(at) DESC LIMIT 5
    `).all(id)
    const drinks = day
      ? db.prepare('SELECT id, at, name, cat, cl, abv FROM drinks WHERE user_id = ? AND day = ? ORDER BY at DESC, id DESC').all(id, day)
      : []
    const extraCount = (kind, d) =>
      db.prepare(`SELECT COUNT(*) AS n FROM extras WHERE user_id = ? AND kind = ?${d ? ' AND day = ?' : ''}`).get(...[id, kind, d].filter(Boolean)).n
    const wins = winsMap(req.query.winsBefore, req.group.id)[id] || 0
    const got = computeBadges({ ...historyOf(id), wins })

    res.json({
      user,
      nights: nights.length,
      units: round1(units),
      count: nights.reduce((s, n) => s + n.count, 0),
      avg: nights.length ? round1(units / nights.length) : 0,
      record: best ? { day: best.day, units: round1(best.units) } : null,
      wins,
      eau: extraCount('eau'),
      clope: extraCount('clope'),
      tonight: day ? { eau: extraCount('eau', day), clope: extraCount('clope', day) } : null,
      badges: BADGES.map((b) => ({ ...b, got: got.has(b.key) })),
      byCat: Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, round1(v)])),
      top,
      recent: nights.slice(0, 14).map((n) => ({ day: n.day, units: round1(n.units), count: n.count })),
      drinks: drinks.map((d) => ({ ...d, units: round1(unitsOf(d)) })),
    })
  })

  // --- La carte ------------------------------------------------------------------
  const PRODUCT_COLS = `p.id, p.name, p.cat, p.cl, p.abv, p.created_by, u.name AS created_by_name,
    (SELECT COUNT(*) FROM product_favs WHERE product_id = p.id) AS favs,
    EXISTS (SELECT 1 FROM product_favs WHERE product_id = p.id AND user_id = ?) AS fav`
  const productOut = (r) => ({ ...r, fav: !!r.fav, units: round1(unitsOf(r)) })
  const getProduct = (id, userId) =>
    db.prepare(`SELECT ${PRODUCT_COLS}, p.group_id FROM products p LEFT JOIN users u ON u.id = p.created_by WHERE p.id = ?`).get(userId, id)
  const productOf = (req, res) => {
    const p = getProduct(Number(req.params.id), req.user.id)
    if (!p || p.group_id !== req.group.id) {
      bad(res, 'Produit introuvable', 404)
      return null
    }
    return p
  }

  // Toute la carte de la bande, les plus mis en favori d'abord
  app.get('/api/products', auth, group, (req, res) => {
    const rows = db.prepare(`
      SELECT ${PRODUCT_COLS} FROM products p LEFT JOIN users u ON u.id = p.created_by
      WHERE p.group_id = ? ORDER BY favs DESC, p.name
    `).all(req.user.id, req.group.id)
    res.json(rows.map(productOut))
  })

  // Mes favoris (cartes de toutes mes bandes), dans l'ordre où je les ai ajoutés
  app.get('/api/products/favorites', auth, (req, res) => {
    const rows = db.prepare(`
      SELECT ${PRODUCT_COLS} FROM product_favs f JOIN products p ON p.id = f.product_id
      LEFT JOIN users u ON u.id = p.created_by
      WHERE f.user_id = ? AND p.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)
      ORDER BY f.created_at, p.id
    `).all(req.user.id, req.user.id, req.user.id)
    res.json(rows.map(productOut))
  })

  // Ajouter un produit à la carte (il passe direct dans mes favoris)
  app.post('/api/products', auth, group, (req, res) => {
    const { drink, error } = checkDrink(req.body)
    if (error) return bad(res, error)
    const dup = db.prepare('SELECT id FROM products WHERE group_id = ? AND name = ? AND cl = ? AND abv = ?').get(req.group.id, drink.name, drink.cl, drink.abv)
    if (dup) return bad(res, 'Ce produit est déjà sur la carte', 409)
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO products (group_id, name, cat, cl, abv, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.group.id, drink.name, drink.cat, drink.cl, drink.abv, req.user.id)
    const id = Number(lastInsertRowid)
    db.prepare('INSERT INTO product_favs (user_id, product_id, created_at) VALUES (?, ?, ?)').run(req.user.id, id, now())
    res.json(productOut(getProduct(id, req.user.id)))
  })

  // Corriger un produit (nom, catégorie, volume, degré) : son auteur, le patron de la bande, ou un admin.
  // Les verres déjà bus ne changent pas (ils gardent leurs propres volume et degré).
  app.patch('/api/products/:id', auth, group, (req, res) => {
    const p = productOf(req, res)
    if (!p) return
    if (!canManage(p, req)) return bad(res, "Seul celui qui l'a ajouté, le patron de la bande ou un admin peut le modifier", 403)
    const { drink, error } = checkDrink(req.body)
    if (error) return bad(res, error)
    const dup = db.prepare('SELECT id FROM products WHERE group_id = ? AND name = ? AND cl = ? AND abv = ? AND id != ?')
      .get(req.group.id, drink.name, drink.cl, drink.abv, p.id)
    if (dup) return bad(res, 'Ce produit est déjà sur la carte', 409)
    db.prepare('UPDATE products SET name = ?, cat = ?, cl = ?, abv = ? WHERE id = ?').run(drink.name, drink.cat, drink.cl, drink.abv, p.id)
    res.json(productOut(getProduct(p.id, req.user.id)))
  })

  // Retirer un produit de la carte : son auteur, le patron de la bande, ou un admin
  app.delete('/api/products/:id', auth, group, (req, res) => {
    const p = productOf(req, res)
    if (!p) return
    if (!canManage(p, req)) return bad(res, "Seul celui qui l'a ajouté, le patron de la bande ou un admin peut le retirer", 403)
    db.prepare('DELETE FROM products WHERE id = ?').run(p.id)
    res.json({ ok: true })
  })

  app.put('/api/products/:id/fav', auth, group, (req, res) => {
    const id = Number(req.params.id)
    if (!productOf(req, res)) return
    db.prepare('INSERT OR IGNORE INTO product_favs (user_id, product_id, created_at) VALUES (?, ?, ?)').run(req.user.id, id, now())
    res.json(productOut(getProduct(id, req.user.id)))
  })
  app.delete('/api/products/:id/fav', auth, group, (req, res) => {
    const id = Number(req.params.id)
    db.prepare('DELETE FROM product_favs WHERE user_id = ? AND product_id = ?').run(req.user.id, id)
    const p = getProduct(id, req.user.id)
    res.json(p ? productOut(p) : { ok: true })
  })

  // Classement sur une période (from = to pour une soirée), en verres standard
  app.get('/api/leaderboard', auth, group, (req, res) => {
    const { from, to, activeSince } = req.query
    if (!isDay(from) || !isDay(to)) return bad(res, 'Période invalide')
    if (activeSince && !isDay(activeSince)) return bad(res, 'Date invalide')

    // Totaux par personne et par soirée, puis agrégés sur la période
    const perDay = db.prepare(`
      SELECT user_id, day, ${CATS.map((c) => `SUM(CASE WHEN cat = '${c}' THEN ${UNITS()} ELSE 0 END) AS ${c},`).join(' ')}
        SUM(${UNITS()}) AS total, COUNT(*) AS count
      FROM drinks WHERE day BETWEEN ? AND ? AND user_id IN (SELECT user_id FROM group_members WHERE group_id = ?)
      GROUP BY user_id, day
    `).all(from, to, req.group.id)
    const agg = new Map()
    for (const r of perDay) {
      const a = agg.get(r.user_id) ?? { ...Object.fromEntries(CATS.map((c) => [c, 0])), total: 0, count: 0, days: 0, suspect_days: 0 }
      for (const c of CATS) a[c] += r[c]
      a.total += r.total
      a.count += r.count
      a.days++
      if (r.total > SUSPECT_UNITS) a.suspect_days++
      agg.set(r.user_id, a)
    }

    // Palmarès : soirées gagnées depuis le début, soirée en cours exclue (winsBefore = ce soir côté client)
    const winMap = winsMap(req.query.winsBefore, req.group.id)
    // Eau et clopes sur la période (affichées, hors score)
    const extraMap = Object.fromEntries(
      db.prepare(`
        SELECT user_id, SUM(kind = 'eau') AS eau, SUM(kind = 'clope') AS clope FROM extras
        WHERE day BETWEEN ? AND ? GROUP BY user_id
      `).all(from, to).map((r) => [r.user_id, r])
    )

    const users = db.prepare(`
      SELECT u.id, u.name, u.avatar_v, (SELECT MAX(day) FROM drinks WHERE user_id = u.id AND day <= ?) AS last_day
      FROM users u JOIN group_members m ON m.user_id = u.id WHERE m.group_id = ?
    `).all(to, req.group.id)
    const empty = { ...Object.fromEntries(CATS.map((c) => [c, 0])), total: 0, count: 0, days: 0, suspect_days: 0 }
    const ranking = users
      .map((u) => {
        const a = agg.get(u.id) ?? empty
        return { ...u, ...a, ...Object.fromEntries(CATS.map((c) => [c, round1(a[c])])), total: round1(a.total), wins: winMap[u.id] || 0,
          eau: extraMap[u.id]?.eau ?? 0, clope: extraMap[u.id]?.clope ?? 0 }
      })
      .sort((x, y) => y.total - x.total || x.name.localeCompare(y.name))

    // On masque les inactifs (rien bu depuis activeSince), sauf soi-même.
    // Pour une période terminée (ended=1), ceux qui y ont participé restent affichés.
    const ended = req.query.ended === '1'
    const visible = ranking.filter(
      (r) =>
        !activeSince || r.id === req.user.id || (ended && r.days > 0) || (r.last_day && r.last_day >= activeSince)
    )
    res.json(visible.map(({ last_day, ...r }) => r))
  })

  // Totaux journaliers de chacun sur une période, par catégorie (pour les graphes)
  app.get('/api/series', auth, group, (req, res) => {
    const { from, to } = req.query
    if (!isDay(from) || !isDay(to)) return bad(res, 'Période invalide')
    const rows = db.prepare(`
      SELECT user_id, day, ${CATS.map((c) => `SUM(CASE WHEN cat = '${c}' THEN ${UNITS()} ELSE 0 END) AS ${c},`).join(' ')}
        SUM(${UNITS()}) AS total
      FROM drinks WHERE day BETWEEN ? AND ? AND user_id IN (SELECT user_id FROM group_members WHERE group_id = ?)
      GROUP BY user_id, day ORDER BY day
    `).all(from, to, req.group.id)
    res.json(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' && k !== 'user_id' ? round1(v) : v]))))
  })

  // En prod : sert le front buildé
  if (distDir && existsSync(distDir)) {
    app.use(express.static(distDir))
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')))
  }

  // Erreurs non prévues (JSON mal formé, contrainte SQL…) : toujours une réponse JSON
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return bad(res, 'JSON invalide')
    if (err.type === 'entity.too.large') return bad(res, 'Requête trop lourde', 413)
    if (String(err.code).startsWith('ERR_SQLITE') && /UNIQUE/.test(err.message)) {
      return bad(res, /products/.test(err.message) ? 'Ce produit est déjà sur la carte' : 'Pseudo déjà pris', 409)
    }
    console.error(err)
    bad(res, 'Erreur serveur', 500)
  })

  const close = () => {
    clearInterval(purge)
    db.close()
  }
  return { app, db, close }
}
