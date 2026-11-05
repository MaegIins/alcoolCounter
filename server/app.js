import express from 'express'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { computeBadges, BADGES } from './badges.js'

// Chaque conso est enregistrée avec son volume et son degré : le score vient de l'alcool pur réellement bu.
// 1 verre standard = 10 g d'alcool pur ; grammes = cl × 10 × degré/100 × 0,8 (densité de l'éthanol).
// Catégories = couleurs des graphes ; pour en ajouter une : ici + côté client (utils.js) + style.css.
// Les premières sont alcoolisées (elles font le score) ; les suivantes sont là pour les dégustations
// (Monster, sodas, café…) : on les note comme le reste, mais elles ne comptent pas (degré 0).
export const ALCO = ['biere', 'vin', 'fort', 'cocktail', 'autre']
export const SOFT = ['energy', 'soft', 'chaud']
export const CATS = [...ALCO, ...SOFT]
export const MAX_REVIEW = 1000
export const MAX_PHOTO = 200_000 // data URL (~150 ko) : le client compresse à ~100 ko, au-delà on refuse
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
// Pour comparer des noms : sans accents ni casse
const fold = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

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
  if (!Number.isFinite(abv) || abv < 0 || abv > 100) return { error: 'Degré entre 0 et 100 %' }
  return { drink: { name, cat, cl: round1(cl), abv: SOFT.includes(cat) ? 0 : round1(abv) } }
}
// Infos d'une boisson de la carte, renseignées par qui l'ajoute (toutes facultatives) : comme la fiche d'un film.
// Seuls les champs présents dans b sont renvoyés (pour un PATCH partiel). Renvoie { info } ou { error }.
export const INFO_FIELDS = { maker: ['Producteur', 60], origin: ['Origine', 40], style: ['Style', 40], description: ['Description', 1000] }
export const checkInfo = (b) => {
  const info = {}
  for (const [k, [label, max]] of Object.entries(INFO_FIELDS)) {
    if (!(k in b)) continue
    const v = b[k] == null ? '' : String(b[k]).trim()
    if (v.length > max) return { error: `${label} : ${max} caractères maximum` }
    if (k === 'description' ? /[\p{Cc}--[\n\r\t]]/v.test(v) : /\p{Cc}/u.test(v)) return { error: `${label} : caractères invisibles interdits` }
    info[k] = v || null
  }
  return { info }
}

// Note (1 à 10 = demi-étoiles), avis, photo : tous facultatifs. Renvoie { log } ou { error }.
// Seuls les champs présents dans b sont renvoyés (pour un PATCH partiel).
export const checkLog = (b) => {
  const log = {}
  if ('rating' in b) {
    const r = b.rating == null || b.rating === 0 ? null : Number(b.rating)
    if (r !== null && !(Number.isInteger(r) && r >= 1 && r <= 10)) return { error: 'Note entre ½ et 5 étoiles' }
    log.rating = r
  }
  if ('review' in b) {
    const t = b.review == null ? '' : String(b.review).trim()
    if (t.length > MAX_REVIEW) return { error: `Avis de ${MAX_REVIEW} caractères maximum` }
    log.review = t || null
  }
  if ('place' in b) {
    const t = b.place == null ? '' : String(b.place).trim()
    if (t.length > 60 || /\p{Cc}/u.test(t)) return { error: 'Lieu de 60 caractères maximum' }
    log.place = t || null
  }
  if ('photo' in b) {
    const p = b.photo == null ? null : String(b.photo)
    if (p !== null && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p)) return { error: 'Photo invalide' }
    if (p && p.length > MAX_PHOTO) return { error: 'Photo trop lourde' }
    log.photo = p
  }
  return { log }
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
  const hasTable = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t)
  const hadGroups = hasTable('groups')
  const hadProducts = hasTable('products')
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
    -- La carte : une seule, commune à tout le monde (quelle que soit la bande), remplie par tous
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE,
      cat TEXT NOT NULL,
      cl REAL NOT NULL,
      abv REAL NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (name, cl, abv)
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

  // Migration : avant les bandes, tout le monde était dans une seule compet → bande « La bande » pour tous
  if (hadProducts && !hadGroups) {
    const first = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get()
    if (first) {
      db.exec('BEGIN')
      const gid = Number(db.prepare('INSERT INTO groups (name, code, owner_id) VALUES (?, ?, ?)').run('La bande', newCode(), first.id).lastInsertRowid)
      db.prepare('INSERT INTO group_members (group_id, user_id, joined_at) SELECT ?, id, ? FROM users').run(gid, now())
      db.exec('COMMIT')
    }
  }
  // Migration : une carte par bande → une carte commune. Les doublons (même nom, volume, degré) sont
  // fusionnés sur le plus ancien ; les favoris suivent. Table recréée pour l'unicité globale.
  const productCols = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name)
  if (productCols.includes('group_id')) {
    db.exec(`
      PRAGMA foreign_keys = OFF; BEGIN;
      CREATE TABLE products_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL COLLATE NOCASE, cat TEXT NOT NULL, cl REAL NOT NULL, abv REAL NOT NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (name, cl, abv)
      );
      CREATE TEMP TABLE product_map AS
        SELECT p.id AS old_id, (SELECT MIN(q.id) FROM products q WHERE q.name = p.name AND q.cl = p.cl AND q.abv = p.abv) AS new_id
        FROM products p;
      INSERT INTO products_new (id, name, cat, cl, abv, created_by, created_at)
        SELECT id, name, cat, cl, abv, created_by, created_at FROM products WHERE id IN (SELECT new_id FROM product_map);
      CREATE TEMP TABLE favs_old AS SELECT * FROM product_favs;
      DELETE FROM product_favs;
      INSERT OR IGNORE INTO product_favs (user_id, product_id, created_at)
        SELECT f.user_id, m.new_id, MIN(f.created_at) FROM favs_old f JOIN product_map m ON m.old_id = f.product_id
        GROUP BY f.user_id, m.new_id;
      DROP TABLE favs_old; DROP TABLE product_map;
      DROP TABLE products; ALTER TABLE products_new RENAME TO products;
      COMMIT; PRAGMA foreign_keys = ON;
    `)
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

  // Journal façon carnet de dégustation : chaque conso peut avoir une note, un avis, une photo, et pointer
  // vers le produit de la carte (pour les avis d'un produit). Photos servies par une clé aléatoire.
  const addCols = (table, cols) => {
    const have = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
    for (const [name, def] of cols) if (!have.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`)
  }
  const drinkColsBefore = db.prepare('PRAGMA table_info(drinks)').all().map((c) => c.name)
  // Lieux : une table à part, partagée par tout le monde (comme la carte), pour pouvoir un jour les placer
  // sur une carte géographique : lat/lng facultatifs, vides tant que personne ne les a renseignés.
  db.exec(`
    CREATE TABLE IF NOT EXISTS places (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE,
      lat REAL CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
      lng REAL CHECK (lng IS NULL OR lng BETWEEN -180 AND 180),
      private INTEGER NOT NULL DEFAULT 0, -- 1 : visible seulement par son créateur et les bandes autorisées
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL
    );
  `)
  // Migration : lieux d'avant la confidentialité (nom unique partout) → colonne private, unicité par portée
  if (!db.prepare('PRAGMA table_info(places)').all().some((c) => c.name === 'private')) {
    db.exec(`PRAGMA foreign_keys = OFF; BEGIN;
      CREATE TABLE places_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE,
      lat REAL CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
      lng REAL CHECK (lng IS NULL OR lng BETWEEN -180 AND 180),
      private INTEGER NOT NULL DEFAULT 0, -- 1 : visible seulement par son créateur et les bandes autorisées
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL
      );
      INSERT INTO places_new (id, name, lat, lng, created_by, created_at) SELECT id, name, lat, lng, created_by, created_at FROM places;
      DROP TABLE places; ALTER TABLE places_new RENAME TO places;
      COMMIT; PRAGMA foreign_keys = ON;`)
  }
  db.exec(`
    -- Un lieu public par nom ; un lieu privé par nom et par créateur (« Chez moi » de chacun)
    CREATE UNIQUE INDEX IF NOT EXISTS places_scope ON places(name COLLATE NOCASE, (CASE WHEN private THEN created_by ELSE 0 END));
    -- Bandes qui voient un lieu privé
    CREATE TABLE IF NOT EXISTS place_groups (
      place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      PRIMARY KEY (place_id, group_id)
    );
  `)
  addCols('drinks', [
    ['product_id', 'INTEGER REFERENCES products(id) ON DELETE SET NULL'],
    ['rating', 'INTEGER'],
    ['review', 'TEXT'],
    ['photo', 'TEXT'],
    ['photo_key', 'TEXT'],
    ['place_id', 'INTEGER REFERENCES places(id) ON DELETE SET NULL'], // où on l'a bue, facultatif
  ])
  // Migration : ancien lieu en texte libre sur chaque conso → table places
  if (db.prepare('PRAGMA table_info(drinks)').all().some((c) => c.name === 'place')) {
    db.exec('BEGIN')
    for (const r of db.prepare('SELECT DISTINCT place FROM drinks WHERE place IS NOT NULL').all()) {
      db.prepare('INSERT OR IGNORE INTO places (name, created_at) VALUES (?, ?)').run(r.place, now())
    }
    db.exec(`UPDATE drinks SET place_id = (SELECT id FROM places WHERE name = drinks.place) WHERE place IS NOT NULL;
      ALTER TABLE drinks DROP COLUMN place; COMMIT`)
  }
  db.exec('CREATE INDEX IF NOT EXISTS drinks_place ON drinks(place_id)')
  addCols('products', [['photo', 'TEXT'], ['photo_key', 'TEXT'], ['maker', 'TEXT'], ['origin', 'TEXT'], ['style', 'TEXT'], ['description', 'TEXT']])
  db.exec(`
    CREATE INDEX IF NOT EXISTS drinks_at ON drinks(at);
    CREATE INDEX IF NOT EXISTS drinks_product ON drinks(product_id);
    CREATE UNIQUE INDEX IF NOT EXISTS drinks_photo_key ON drinks(photo_key);
    CREATE UNIQUE INDEX IF NOT EXISTS products_photo_key ON products(photo_key);
    -- Top 4 de chacun (4 places, un produit de la carte par place)
    -- « Déjà bue » : je l'ai bue un jour, sans date ni note (hors score, hors journal)
    CREATE TABLE IF NOT EXISTS product_tried (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, product_id)
    );
    -- Abonnements (follow) : à côté des bandes ; le fil « Abonnements » et les avis viennent aussi des gens suivis
    CREATE TABLE IF NOT EXISTS follows (
      follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (follower_id, followee_id)
    );
    CREATE TABLE IF NOT EXISTS user_tops (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slot INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 3),
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, slot)
    );
  `)
  // Consos d'avant : rattachées au produit de la carte de même nom, volume et degré
  if (!drinkColsBefore.includes('product_id')) {
    db.exec(`UPDATE drinks SET product_id = (
      SELECT p.id FROM products p WHERE p.name = drinks.name COLLATE NOCASE AND p.cl = drinks.cl AND p.abv = drinks.abv
    )`)
  }
  const photoKey = () => randomBytes(12).toString('hex')

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

  // Lieux privés : visibles par leur créateur et les membres des bandes autorisées. `viewer` = qui fait la requête
  // (fixé par auth ; les requêtes SQLite sont synchrones, donc pas de mélange entre deux requêtes HTTP).
  let viewer = 0
  const canSeePlace = db.prepare(`SELECT 1 FROM places pl WHERE pl.id = ? AND (pl.private = 0 OR pl.created_by = ? OR EXISTS (
    SELECT 1 FROM place_groups pg JOIN group_members gm ON gm.group_id = pg.group_id WHERE pg.place_id = pl.id AND gm.user_id = ?))`)
  db.function('place_visible', (id) => (id != null && canSeePlace.get(id, viewer, viewer) ? 1 : 0))

  const auth = (req, res, next) => {
    const token = bearer(req)
    const user = token
      ? db.prepare('SELECT u.id, u.name, u.avatar_v, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token)
      : null
    if (!user) return bad(res, 'Non connecté', 401)
    req.user = { ...user, is_admin: !!user.is_admin }
    viewer = user.id
    next()
  }

  // Bande courante : en-tête X-Group (sinon la première rejointe). Les routes « de bande » en ont besoin.
  const myGroups = (userId) => db.prepare(`
    SELECT g.id, g.name, g.code, g.owner_id, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS members
    FROM group_members m JOIN groups g ON g.id = m.group_id WHERE m.user_id = ? ORDER BY m.joined_at, g.id
  `).all(userId)
  const userExists = (id) => !!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)
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
  // Variante tolérante : sans bande, on continue en solo (req.group = null, seul membre = soi)
  const groupOrSolo = (req, res, next) => {
    if (req.headers['x-group'] || myGroups(req.user.id).length) return group(req, res, next)
    req.group = null
    req.memberIds = [req.user.id]
    next()
  }
  // Peut modifier/retirer un produit de la carte commune : son auteur, ou un admin
  const canManage = (p, req) => p.created_by === req.user.id || req.user.is_admin
  const joinGroup = (groupId, userId) =>
    db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)').run(groupId, userId, now())
  const groupOut = (g) => ({ id: g.id, name: g.name, code: g.code, owner_id: g.owner_id, members: g.members })

  // Badges d'une personne ; `newBadges(userId, fn)` donne ceux débloqués par fn()
  const historyOf = (userId) => ({
    drinks: db.prepare('SELECT day, at, name, cat, cl, abv FROM drinks WHERE user_id = ? AND abv > 0').all(userId),
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
  app.use(express.json({ limit: '300kb' })) // une photo compressée tient largement dedans
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

  // Une conso telle que renvoyée au client (sans la photo elle-même : on donne sa clé)
  const LOG_COLS = `d.id, d.user_id, d.day, d.at, d.name, d.cat, d.cl, d.abv, d.product_id, d.rating, d.review, d.photo_key,
    CASE WHEN place_visible(d.place_id) THEN d.place_id END AS place_id,
    CASE WHEN place_visible(d.place_id) THEN (SELECT name FROM places WHERE id = d.place_id) END AS place,
    p.photo_key AS product_photo_key`
  // Lieu d'une conso, retrouvé ou créé. Privé : le mien de ce nom (partagé avec la bande donnée) ;
  // sinon mon lieu privé de ce nom s'il existe, puis le lieu public.
  const placeIdFor = (name, userId, { priv = false, groupId = null } = {}) => {
    if (!name) return null
    const mine = db.prepare('SELECT id FROM places WHERE name = ? AND private = 1 AND created_by = ?').get(name, userId)
    let id = mine?.id
    if (priv && !id) {
      id = Number(db.prepare('INSERT INTO places (name, private, created_by, created_at) VALUES (?, 1, ?, ?)').run(name, userId, now()).lastInsertRowid)
    }
    if (priv && groupId && isMember(groupId, userId)) db.prepare('INSERT OR IGNORE INTO place_groups (place_id, group_id) VALUES (?, ?)').run(id, groupId)
    if (id) return id
    db.prepare('INSERT OR IGNORE INTO places (name, private, created_by, created_at) VALUES (?, 0, ?, ?)').run(name, userId, now())
    return db.prepare('SELECT id FROM places WHERE name = ? AND private = 0').get(name).id
  }
  const placeOpts = (req) => ({ priv: req.body.place_private === true, groupId: Number(req.headers['x-group']) || myGroups(req.user.id)[0]?.id || null })
  const logOut = (r) => ({ ...r, units: round1(unitsOf(r)) })
  const getLog = (id) => db.prepare(`SELECT ${LOG_COLS} FROM drinks d LEFT JOIN products p ON p.id = d.product_id WHERE d.id = ?`).get(id)

  // Ajouter une conso (une par appel : un verre = un tap), avec en option note, avis et photo.
  // product_id : la boisson vient de la carte (nom, catégorie, volume, degré repris du produit).
  app.post('/api/drinks', auth, (req, res) => {
    const day = req.body.day
    if (!isDay(day)) return bad(res, 'Date invalide')
    if (day > maxEntryDay()) return bad(res, 'Pas de saisie dans le futur')
    let productId = req.body.product_id == null ? null : Number(req.body.product_id)
    const prod = productId ? db.prepare('SELECT name, cat, cl, abv FROM products WHERE id = ?').get(productId) : null
    if (productId && !prod) return bad(res, 'Produit introuvable', 404)
    const { drink, error } = checkDrink(prod ?? req.body)
    if (error) return bad(res, error)
    const { log, error: logError } = checkLog(req.body)
    if (logError) return bad(res, logError)
    // Pas de produit donné : on rattache quand même à la carte si la boisson y est
    productId ??= db.prepare('SELECT id FROM products WHERE name = ? AND cl = ? AND abv = ?').get(drink.name, drink.cl, drink.abv)?.id ?? null
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM drinks WHERE user_id = ? AND day = ?').get(req.user.id, day)
    if (n >= MAX_DRINKS_PER_DAY) return bad(res, `Maximum ${MAX_DRINKS_PER_DAY} consos par soirée`)
    const at = now()
    const { out: id, badges } = newBadges(req.user.id, () =>
      Number(db.prepare(`INSERT INTO drinks (user_id, day, at, name, cat, cl, abv, product_id, rating, review, photo, photo_key, place_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(req.user.id, day, at, drink.name, drink.cat, drink.cl, drink.abv, productId,
          log.rating ?? null, log.review ?? null, log.photo ?? null, log.photo ? photoKey() : null, placeIdFor(log.place, req.user.id, placeOpts(req))).lastInsertRowid)
    )
    res.json({ ...logOut(getLog(id)), badges })
  })

  // Compléter une de ses consos après coup : note, avis, photo (null = retirer), soirée
  app.patch('/api/drinks/:id', auth, (req, res) => {
    const id = Number(req.params.id)
    if (!db.prepare('SELECT 1 FROM drinks WHERE id = ? AND user_id = ?').get(id, req.user.id)) return bad(res, 'Conso introuvable', 404)
    const { log, error } = checkLog(req.body)
    if (error) return bad(res, error)
    if ('day' in req.body) {
      if (!isDay(req.body.day) || req.body.day > maxEntryDay()) return bad(res, 'Date invalide')
      log.day = req.body.day
    }
    if ('photo' in log) log.photo_key = log.photo ? photoKey() : null
    if ('place' in log) {
      log.place_id = placeIdFor(log.place, req.user.id, placeOpts(req))
      delete log.place
    }
    const keys = Object.keys(log)
    if (keys.length) db.prepare(`UPDATE drinks SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => log[k]), id)
    res.json(logOut(getLog(id)))
  })

  // Photos (consos et produits) : publiques mais introuvables sans leur clé aléatoire, qui change à chaque photo
  app.get('/api/photos/:key', (req, res) => {
    const key = String(req.params.key)
    const row = db.prepare('SELECT photo FROM drinks WHERE photo_key = ?').get(key) ?? db.prepare('SELECT photo FROM products WHERE photo_key = ?').get(key)
    const m = row?.photo?.match(/^data:(image\/\w+);base64,(.+)$/)
    if (!m) return res.status(404).end()
    res.set('Cache-Control', 'public, max-age=31536000, immutable').type(m[1]).send(Buffer.from(m[2], 'base64'))
  })

  // Fil d'activité : les dernières consos des membres de la bande (soi seul en solo), plus récentes d'abord.
  // Pagination par curseur : ?before=<at>:<id> (renvoyé dans `next`).
  app.get('/api/feed', auth, groupOrSolo, (req, res) => {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
    const [bAt, bId] = String(req.query.before || '').split(':').map(Number)
    const cursor = Number.isFinite(bAt) && Number.isFinite(bId) && req.query.before
    const ids = req.query.scope === 'follow'
      ? [req.user.id, ...db.prepare('SELECT followee_id FROM follows WHERE follower_id = ?').all(req.user.id).map((r) => r.followee_id)]
      : req.memberIds
    const rows = db.prepare(`
      SELECT ${LOG_COLS}, u.name AS user_name, u.avatar_v FROM drinks d
      JOIN users u ON u.id = d.user_id LEFT JOIN products p ON p.id = d.product_id
      WHERE d.user_id IN (${ids.map(() => '?').join(',')}) ${cursor ? 'AND (d.at < ? OR (d.at = ? AND d.id < ?))' : ''}
      ORDER BY d.at DESC, d.id DESC LIMIT ?
    `).all(...ids, ...(cursor ? [bAt, bAt, bId] : []), limit + 1)
    const more = rows.length > limit
    const items = rows.slice(0, limit).map(logOut)
    res.json({ items, next: more ? `${items.at(-1).at}:${items.at(-1).id}` : null })
  })

  // Recherche : des personnes (toutes, bande ou pas) et des boissons de la carte, par nom (sans accents ni casse)
  app.get('/api/search', auth, groupOrSolo, (req, res) => {
    const q = fold(String(req.query.q || '').trim())
    if (!q) return res.json({ users: [], products: [] })
    const rank = (name) => (fold(name).startsWith(q) ? 0 : 1)
    const users = db.prepare('SELECT id, name, avatar_v FROM users').all()
      .filter((u) => fold(u.name).includes(q))
      .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
      .slice(0, 12)
      .map((u) => ({ ...u, inBand: req.memberIds.includes(u.id), me: u.id === req.user.id }))
    const products = db.prepare(`SELECT ${PRODUCT_COLS} FROM products p LEFT JOIN users u ON u.id = p.created_by`).all(req.user.id)
      .filter((p) => fold(p.name).includes(q) || (p.maker && fold(p.maker).includes(q)))
      .sort((a, b) => rank(a.name) - rank(b.name) || b.logs - a.logs || a.name.localeCompare(b.name))
      .slice(0, 20)
      .map(productOut)
    res.json({ users, products })
  })

  // Abonnés (qui le suit) et abonnements (qui il suit) d'une personne, avec « je le suis ? »
  for (const [path, col, other] of [['followers', 'followee_id', 'follower_id'], ['following', 'follower_id', 'followee_id']]) {
    app.get(`/api/users/:id/${path}`, auth, (req, res) => {
      const id = Number(req.params.id)
      if (!userExists(id)) return bad(res, 'Joueur introuvable', 404)
      res.json(db.prepare(`
        SELECT u.id, u.name, u.avatar_v,
          EXISTS (SELECT 1 FROM follows x WHERE x.follower_id = ? AND x.followee_id = u.id) AS iFollow
        FROM follows f JOIN users u ON u.id = f.${other} WHERE f.${col} = ? ORDER BY f.created_at DESC
      `).all(req.user.id, id).map((u) => ({ ...u, iFollow: !!u.iFollow })))
    })
  }

  // Suivre quelqu'un (bande ou pas) / arrêter
  app.put('/api/users/:id/follow', auth, (req, res) => {
    const id = Number(req.params.id)
    if (!userExists(id)) return bad(res, 'Joueur introuvable', 404)
    if (id === req.user.id) return bad(res, 'Tu ne peux pas te suivre toi-même')
    db.prepare('INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)').run(req.user.id, id, now())
    res.json({ iFollow: true })
  })
  app.delete('/api/users/:id/follow', auth, (req, res) => {
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(req.user.id, Number(req.params.id))
    res.json({ iFollow: false })
  })

  // Toutes les boissons différentes d'une personne (même nom, volume et degré = même boisson), avec ses chiffres
  app.get('/api/users/:id/drinks', auth, groupOrSolo, (req, res) => {
    const id = Number(req.params.id)
    if (!userExists(id)) return bad(res, 'Joueur introuvable', 404) // profils visibles par tous (recherche)
    const rows = db.prepare(`
      SELECT d.name, d.cat, d.cl, d.abv, MAX(d.product_id) AS product_id, MAX(p.photo_key) AS product_photo_key,
        COUNT(*) AS count, ROUND(AVG(d.rating), 1) AS rating, COUNT(d.rating) AS ratings, COUNT(d.review) AS reviews,
        COUNT(d.photo_key) AS photos, MIN(d.day) AS first_day, MAX(d.day) AS last_day, MAX(d.at) AS last_at,
        (SELECT d2.photo_key FROM drinks d2 WHERE d2.user_id = d.user_id AND d2.name = d.name AND d2.cl = d.cl AND d2.abv = d.abv
          AND d2.photo_key IS NOT NULL ORDER BY d2.at DESC LIMIT 1) AS last_photo_key
      FROM drinks d LEFT JOIN products p ON p.id = d.product_id
      WHERE d.user_id = ?
      GROUP BY d.name COLLATE NOCASE, d.cl, d.abv
      ORDER BY count DESC, last_at DESC
    `).all(id)
    const marked = db.prepare(`
      SELECT p.name, p.cat, p.cl, p.abv, p.id AS product_id, p.photo_key AS product_photo_key, t.created_at AS marked_at
      FROM product_tried t JOIN products p ON p.id = t.product_id WHERE t.user_id = ?
    `).all(id).filter((m) => !rows.some((r) => r.product_id === m.product_id || (fold(r.name) === fold(m.name) && r.cl === m.cl && r.abv === m.abv)))
    res.json([
      ...rows.map((r) => ({ ...r, units: round1(unitsOf(r) * r.count) })),
      ...marked.map((m) => ({ ...m, count: 0, rating: null, ratings: 0, reviews: 0, photos: 0, first_day: null, last_day: null, last_at: null, last_photo_key: null, units: 0, marked: true })),
    ])
  })

  // Toutes les consos d'une personne pour une boisson donnée (?name=&cl=&abv=), plus récentes d'abord
  app.get('/api/users/:id/drinks/logs', auth, groupOrSolo, (req, res) => {
    const id = Number(req.params.id)
    if (!userExists(id)) return bad(res, 'Joueur introuvable', 404) // profils visibles par tous (recherche)
    const { name } = req.query
    const cl = Number(req.query.cl)
    const abv = Number(req.query.abv)
    if (!name || !Number.isFinite(cl) || !Number.isFinite(abv)) return bad(res, 'Boisson invalide')
    const rows = db.prepare(`
      SELECT ${LOG_COLS} FROM drinks d LEFT JOIN products p ON p.id = d.product_id
      WHERE d.user_id = ? AND d.name = ? COLLATE NOCASE AND d.cl = ? AND d.abv = ?
      ORDER BY d.at DESC, d.id DESC LIMIT 500
    `).all(id, String(name), cl, abv)
    res.json(rows.map(logOut))
  })

  // Journal d'une personne : ses consos par soirée, plus récentes d'abord (?offset=&limit=)
  app.get('/api/users/:id/diary', auth, groupOrSolo, (req, res) => {
    const id = Number(req.params.id)
    if (!userExists(id)) return bad(res, 'Joueur introuvable', 404) // profils visibles par tous (recherche)
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40))
    const offset = Math.max(0, Number(req.query.offset) || 0)
    const rows = db.prepare(`
      SELECT ${LOG_COLS} FROM drinks d LEFT JOIN products p ON p.id = d.product_id
      WHERE d.user_id = ? ORDER BY d.day DESC, d.at DESC, d.id DESC LIMIT ? OFFSET ?
    `).all(id, limit + 1, offset)
    res.json({ items: rows.slice(0, limit).map(logOut), more: rows.length > limit })
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
      `SELECT ${LOG_COLS} FROM drinks d LEFT JOIN products p ON p.id = d.product_id
       WHERE d.user_id = ? AND d.day BETWEEN ? AND ? ORDER BY d.at DESC, d.id DESC`
    ).all(req.user.id, from, to)
    res.json(rows.map(logOut))
  })

  // Mes boissons habituelles (pour les ajouter en un tap) : les plus bues, puis les plus récentes
  // Suggestions de lieux quand on ajoute un verre : tous les lieux que je peux voir, mes lieux les plus récents
  // d'abord, puis ceux fréquentés par mes bandes et les gens que je suis, puis les plus fréquentés tout court.
  // `mine` dit si j'y ai déjà bu (le client montre ceux-là quand le champ est vide, et filtre tout le reste en tapant).
  app.get('/api/drinks/places', auth, (req, res) => {
    const rows = db.prepare(`
      SELECT pl.id, pl.name AS place, pl.private, COUNT(d.id) AS count,
        MAX(CASE WHEN d.user_id = ? THEN d.at END) AS my_last,
        SUM(d.user_id IN (
          SELECT m2.user_id FROM group_members m1 JOIN group_members m2 ON m2.group_id = m1.group_id WHERE m1.user_id = ?
          UNION SELECT followee_id FROM follows WHERE follower_id = ?
        )) AS circle
      FROM places pl LEFT JOIN drinks d ON d.place_id = pl.id
      WHERE place_visible(pl.id)
      GROUP BY pl.id
      ORDER BY my_last IS NULL, my_last DESC, circle DESC, count DESC, pl.name
      LIMIT 300
    `).all(req.user.id, req.user.id, req.user.id)
    res.json(rows.map(({ my_last, circle, ...r }) => ({ ...r, mine: my_last != null })))
  })

  // Tous les lieux, avec leurs coordonnées (vides pour l'instant) et leur fréquentation :
  // la source de données d'une future carte géographique. ?mine=1 : seulement ceux où j'ai bu.
  app.get('/api/places', auth, (req, res) => {
    const mine = req.query.mine === '1'
    const rows = db.prepare(`
      SELECT pl.id, pl.name, pl.lat, pl.lng, pl.private, pl.created_by, COUNT(d.id) AS logs, COUNT(DISTINCT d.user_id) AS drinkers,
        SUM(d.user_id = ?) AS my_logs, MAX(d.at) AS last_at
      FROM places pl LEFT JOIN drinks d ON d.place_id = pl.id ${mine ? 'AND d.user_id = ?' : ''}
      WHERE place_visible(pl.id)
      GROUP BY pl.id ${mine ? 'HAVING logs > 0' : ''} ORDER BY logs DESC, pl.name
    `).all(req.user.id, ...(mine ? [req.user.id] : []))
    const groupsOf = db.prepare('SELECT g.id, g.name FROM place_groups pg JOIN groups g ON g.id = pg.group_id WHERE pg.place_id = ? ORDER BY g.name')
    res.json(rows.map((r) => ({ ...r, private: !!r.private, my_logs: r.my_logs ?? 0, mine: r.created_by === req.user.id, groups: r.private ? groupsOf.all(r.id) : [] })))
  })

  // Modifier un lieu (tout est facultatif dans le corps) :
  //   name                         renommer                      — son créateur, ou un admin
  //   private, groups: [id…]       visibilité et bandes autorisées — son créateur, ou un admin
  //   lat, lng (null, null = vider) position, pour une future carte — créateur/admin ; les autres peuvent
  //                                 seulement remplir une position encore vide (comme la photo d'une boisson)
  app.patch('/api/places/:id', auth, (req, res) => {
    const pl = db.prepare('SELECT * FROM places WHERE id = ?').get(Number(req.params.id))
    if (!pl || !canSeePlace.get(pl.id, req.user.id, req.user.id)) return bad(res, 'Lieu introuvable', 404)
    const owner = pl.created_by === req.user.id || req.user.is_admin
    const b = req.body
    const set = {}
    if ('name' in b) {
      const name = String(b.name ?? '').trim()
      if (!name || name.length > 60 || /\p{Cc}/u.test(name)) return bad(res, 'Nom de lieu entre 1 et 60 caractères')
      set.name = name
    }
    if ('private' in b) set.private = b.private === true ? 1 : 0
    if ('lat' in b || 'lng' in b) {
      const clear = b.lat == null && b.lng == null
      const lat = Number(b.lat)
      const lng = Number(b.lng)
      if (!clear && !(Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180)) {
        return bad(res, 'Position invalide (latitude -90 à 90, longitude -180 à 180)')
      }
      set.lat = clear ? null : Math.round(lat * 1e6) / 1e6
      set.lng = clear ? null : Math.round(lng * 1e6) / 1e6
    }
    const onlyFillingCoords = Object.keys(set).every((k) => k === 'lat' || k === 'lng') && pl.lat == null && set.lat != null && !('groups' in b)
    if (!owner && !onlyFillingCoords) return bad(res, "Seul celui qui l'a créé peut modifier ce lieu (les autres peuvent juste ajouter une position manquante)", 403)
    const groups = Array.isArray(b.groups) ? b.groups.map(Number) : null
    if (groups?.some((g) => !isMember(g, req.user.id))) return bad(res, "Tu n'es pas dans cette bande", 403)
    // Pas deux lieux de même nom dans la même portée (public, ou privés d'une même personne)
    const name = set.name ?? pl.name
    const priv = set.private ?? pl.private
    const clash = db.prepare(`SELECT 1 FROM places WHERE id != ? AND name = ? AND ${priv ? 'private = 1 AND created_by = ?' : 'private = 0'}`)
      .get(pl.id, name, ...(priv ? [pl.created_by] : []))
    if (clash) return bad(res, priv ? 'Tu as déjà un lieu privé de ce nom' : 'Un lieu public porte déjà ce nom', 409)
    db.exec('BEGIN')
    for (const [k, v] of Object.entries(set)) db.prepare(`UPDATE places SET ${k} = ? WHERE id = ?`).run(v, pl.id)
    if (!priv) db.prepare('DELETE FROM place_groups WHERE place_id = ?').run(pl.id)
    else if (groups) {
      db.prepare('DELETE FROM place_groups WHERE place_id = ?').run(pl.id)
      for (const g of groups) db.prepare('INSERT INTO place_groups (place_id, group_id) VALUES (?, ?)').run(pl.id, g)
    }
    db.exec('COMMIT')
    res.json({ ok: true })
  })

  app.get('/api/drinks/favorites', auth, (req, res) => {
    res.json(db.prepare(`
      SELECT d.name, d.cat, d.cl, d.abv, MAX(d.product_id) AS product_id, MAX(p.photo_key) AS product_photo_key, COUNT(*) AS count
      FROM drinks d LEFT JOIN products p ON p.id = d.product_id WHERE d.user_id = ?
      GROUP BY d.name, d.cat, d.cl, d.abv ORDER BY count DESC, MAX(d.at) DESC LIMIT 12
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

  // Fiche d'un joueur : stats depuis le début, boissons préférées, dernières soirées, détail d'une soirée.
  // Visible par tout le monde (on trouve les gens avec la recherche) ; victoires comptées dans ma bande courante.
  app.get('/api/users/:id/stats', auth, groupOrSolo, (req, res) => {
    const id = Number(req.params.id)
    const user = db.prepare('SELECT id, name, avatar_v, created_at FROM users WHERE id = ?').get(id)
    if (!user) return bad(res, 'Joueur introuvable', 404)
    const { day } = req.query
    if (day !== undefined && !isDay(day)) return bad(res, 'Date invalide')

    const nights = db.prepare(`
      SELECT day, SUM(${UNITS()}) AS units, COUNT(*) AS count FROM drinks WHERE user_id = ? AND abv > 0 GROUP BY day ORDER BY day DESC
    `).all(id)
    const units = nights.reduce((s, n) => s + n.units, 0)
    const best = nights.reduce((b, n) => (!b || n.units > b.units ? n : b), null)
    const byCat = db.prepare(`
      SELECT ${ALCO.map((c) => `COALESCE(SUM(CASE WHEN cat = '${c}' THEN ${UNITS()} END), 0) AS ${c}`).join(', ')}
      FROM drinks WHERE user_id = ?
    `).get(id)
    const top = db.prepare(`
      SELECT name, cat, cl, abv, MAX(product_id) AS product_id, COUNT(*) AS count, ROUND(AVG(rating), 1) AS rating
      FROM drinks WHERE user_id = ?
      GROUP BY name, cat, cl, abv ORDER BY count DESC, MAX(at) DESC LIMIT 5
    `).all(id)
    const drinks = day
      ? db.prepare('SELECT id, at, name, cat, cl, abv FROM drinks WHERE user_id = ? AND day = ? ORDER BY at DESC, id DESC').all(id, day)
      : []
    const extraCount = (kind, d) =>
      db.prepare(`SELECT COUNT(*) AS n FROM extras WHERE user_id = ? AND kind = ?${d ? ' AND day = ?' : ''}`).get(...[id, kind, d].filter(Boolean)).n
    const wins = req.group ? winsMap(req.query.winsBefore, req.group.id)[id] || 0 : 0
    const got = computeBadges({ ...historyOf(id), wins })
    const tops = db.prepare(`
      SELECT t.slot, ${PRODUCT_COLS} FROM user_tops t JOIN products p ON p.id = t.product_id
      LEFT JOIN users u ON u.id = p.created_by WHERE t.user_id = ? ORDER BY t.slot
    `).all(req.user.id, id)
    const year = String(new Date(now()).getUTCFullYear())
    const rated = db.prepare('SELECT COUNT(*) AS n FROM drinks WHERE user_id = ? AND rating IS NOT NULL').get(id)
    const { thisYear } = db.prepare("SELECT COUNT(*) AS thisYear FROM drinks WHERE user_id = ? AND substr(day, 1, 4) = ?").get(id, year)

    res.json({
      user,
      nights: nights.length,
      units: round1(units),
      count: nights.reduce((s, n) => s + n.count, 0),
      avg: nights.length ? round1(units / nights.length) : 0,
      record: best ? { day: best.day, units: round1(best.units) } : null,
      wins,
      inBand: req.memberIds.includes(id),
      followers: db.prepare('SELECT COUNT(*) AS n FROM follows WHERE followee_id = ?').get(id).n,
      following: db.prepare('SELECT COUNT(*) AS n FROM follows WHERE follower_id = ?').get(id).n,
      iFollow: !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?').get(req.user.id, id),
      tops: Array.from({ length: 4 }, (_, i) => {
        const t = tops.find((x) => x.slot === i)
        return t ? productOut(t) : null
      }),
      rated: rated.n,
      reviews: db.prepare("SELECT COUNT(*) AS n FROM drinks WHERE user_id = ? AND review IS NOT NULL").get(id).n,
      thisYear,
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
  // Note moyenne et nombre de consos : sur tout le monde (la carte est commune)
  const PRODUCT_COLS = `p.id, p.name, p.cat, p.cl, p.abv, p.created_by, u.name AS created_by_name, p.photo_key,
    p.maker, p.origin, p.style, p.description,
    (SELECT COUNT(*) FROM product_favs WHERE product_id = p.id) AS favs,
    EXISTS (SELECT 1 FROM product_favs WHERE product_id = p.id AND user_id = ?) AS fav,
    (SELECT COUNT(*) FROM drinks WHERE product_id = p.id) AS logs,
    (SELECT ROUND(AVG(rating), 1) FROM drinks WHERE product_id = p.id AND rating IS NOT NULL) AS rating,
    (SELECT COUNT(rating) FROM drinks WHERE product_id = p.id) AS ratings`
  // Mes potes : moi + les membres de toutes mes bandes (pour les avis affichés sur un produit)
  const FRIENDS = `SELECT ? UNION SELECT m2.user_id FROM group_members m1 JOIN group_members m2 ON m2.group_id = m1.group_id WHERE m1.user_id = ?
    UNION SELECT followee_id FROM follows WHERE follower_id = ?`
  const productOut = (r) => ({ ...r, fav: !!r.fav, units: round1(unitsOf(r)) })
  const getProduct = (id, userId) =>
    db.prepare(`SELECT ${PRODUCT_COLS} FROM products p LEFT JOIN users u ON u.id = p.created_by WHERE p.id = ?`).get(userId, id)
  const productOf = (req, res) => {
    const p = getProduct(Number(req.params.id), req.user.id)
    if (!p) {
      bad(res, 'Produit introuvable', 404)
      return null
    }
    return p
  }

  // Boissons que j'ai bues : avec au moins une conso, ou marquées « déjà bue »
  const triedSet = (userId) => new Set(db.prepare(`
    SELECT product_id FROM drinks WHERE user_id = ? AND product_id IS NOT NULL
    UNION SELECT product_id FROM product_tried WHERE user_id = ?
  `).all(userId, userId).map((r) => r.product_id))

  // Toute la carte (commune), les plus mis en favori d'abord
  app.get('/api/products', auth, (req, res) => {
    const rows = db.prepare(`
      SELECT ${PRODUCT_COLS} FROM products p LEFT JOIN users u ON u.id = p.created_by
      ORDER BY favs DESC, p.name
    `).all(req.user.id)
    const tried = triedSet(req.user.id)
    res.json(rows.map((r) => ({ ...productOut(r), tried: tried.has(r.id) })))
  })

  // Fiche d'un produit : chiffres, répartition des notes (tout le monde), avis et photos de mes potes
  app.get('/api/products/:id(\\d+)', auth, (req, res) => {
    const p = productOf(req, res)
    if (!p) return
    const hist = Array(10).fill(0)
    for (const r of db.prepare('SELECT rating, COUNT(*) AS n FROM drinks WHERE product_id = ? AND rating IS NOT NULL GROUP BY rating').all(p.id)) hist[r.rating - 1] = r.n
    const { drinkers } = db.prepare(`SELECT COUNT(*) AS drinkers FROM (
      SELECT user_id FROM drinks WHERE product_id = ? UNION SELECT user_id FROM product_tried WHERE product_id = ?
    )`).get(p.id, p.id)
    const marked = !!db.prepare('SELECT 1 FROM product_tried WHERE product_id = ? AND user_id = ?').get(p.id, req.user.id)
    const mine = db.prepare('SELECT COUNT(*) AS n, MAX(rating) AS best FROM drinks WHERE product_id = ? AND user_id = ?').get(p.id, req.user.id)
    const reviews = db.prepare(`
      SELECT ${LOG_COLS}, u.name AS user_name, u.avatar_v FROM drinks d
      JOIN users u ON u.id = d.user_id LEFT JOIN products p ON p.id = d.product_id
      WHERE d.product_id = ? AND (d.rating IS NOT NULL OR d.review IS NOT NULL OR d.photo_key IS NOT NULL)
        AND d.user_id IN (${FRIENDS})
      ORDER BY d.at DESC, d.id DESC LIMIT 200
    `).all(p.id, req.user.id, req.user.id, req.user.id)
    // Mes potes qui l'ont bue : combien de fois, leur note moyenne
    const people = db.prepare(`
      SELECT u.id, u.name, u.avatar_v, COUNT(*) AS count, ROUND(AVG(d.rating), 1) AS rating, MAX(d.at) AS last_at
      FROM drinks d JOIN users u ON u.id = d.user_id
      WHERE d.product_id = ? AND d.user_id IN (${FRIENDS})
      GROUP BY u.id
      UNION ALL
      SELECT u.id, u.name, u.avatar_v, 0, NULL, t.created_at FROM product_tried t JOIN users u ON u.id = t.user_id
      WHERE t.product_id = ? AND t.user_id IN (${FRIENDS})
        AND NOT EXISTS (SELECT 1 FROM drinks WHERE product_id = t.product_id AND user_id = t.user_id)
      ORDER BY count DESC, last_at DESC
    `).all(p.id, req.user.id, req.user.id, req.user.id, p.id, req.user.id, req.user.id, req.user.id)
    // Dans le même genre : même catégorie, les mieux notées puis les plus bues
    const similar = db.prepare(`
      SELECT ${PRODUCT_COLS} FROM products p LEFT JOIN users u ON u.id = p.created_by
      WHERE p.cat = ? AND p.id != ? ORDER BY rating IS NULL, rating DESC, logs DESC, p.name LIMIT 8
    `).all(req.user.id, p.cat, p.id)
    const myLast = db.prepare('SELECT rating FROM drinks WHERE product_id = ? AND user_id = ? AND rating IS NOT NULL ORDER BY at DESC LIMIT 1').get(p.id, req.user.id)
    res.json({
      ...productOut(p), hist, drinkers, mine: mine.n, marked, tried: marked || mine.n > 0, myRating: myLast?.rating ?? null,
      reviews: reviews.map(logOut), people, similar: similar.map(productOut),
    })
  })

  // Mes favoris, dans l'ordre où je les ai ajoutés
  app.get('/api/products/favorites', auth, (req, res) => {
    const rows = db.prepare(`
      SELECT ${PRODUCT_COLS} FROM product_favs f JOIN products p ON p.id = f.product_id
      LEFT JOIN users u ON u.id = p.created_by
      WHERE f.user_id = ?
      ORDER BY f.created_at, p.id
    `).all(req.user.id, req.user.id)
    res.json(rows.map(productOut))
  })

  // Ajouter un produit à la carte (il passe direct dans mes favoris)
  app.post('/api/products', auth, (req, res) => {
    const { drink, error } = checkDrink(req.body)
    if (error) return bad(res, error)
    const { log, error: photoError } = checkLog({ photo: req.body.photo })
    if (photoError) return bad(res, photoError)
    const { info, error: infoError } = checkInfo(req.body)
    if (infoError) return bad(res, infoError)
    const dup = db.prepare('SELECT id FROM products WHERE name = ? AND cl = ? AND abv = ?').get(drink.name, drink.cl, drink.abv)
    if (dup) return bad(res, 'Ce produit est déjà sur la carte', 409)
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO products (name, cat, cl, abv, created_by, photo, photo_key, maker, origin, style, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(drink.name, drink.cat, drink.cl, drink.abv, req.user.id, log.photo, log.photo ? photoKey() : null,
      info.maker ?? null, info.origin ?? null, info.style ?? null, info.description ?? null)
    const id = Number(lastInsertRowid)
    db.prepare('INSERT INTO product_favs (user_id, product_id, created_at) VALUES (?, ?, ?)').run(req.user.id, id, now())
    // Les consos déjà bues de cette boisson (par tout le monde) rejoignent sa fiche
    db.prepare('UPDATE drinks SET product_id = ? WHERE product_id IS NULL AND name = ? COLLATE NOCASE AND cl = ? AND abv = ?').run(id, drink.name, drink.cl, drink.abv)
    res.json(productOut(getProduct(id, req.user.id)))
  })

  // Corriger un produit (nom, catégorie, volume, degré) : son auteur, ou un admin.
  // Les verres déjà bus ne changent pas (ils gardent leurs propres volume et degré).
  app.patch('/api/products/:id', auth, (req, res) => {
    const p = productOf(req, res)
    if (!p) return
    if (!canManage(p, req)) return bad(res, "Seul celui qui l'a ajouté ou un admin peut le modifier", 403)
    const { drink, error } = checkDrink(req.body)
    if (error) return bad(res, error)
    // Infos et photo : absentes du corps = inchangées, null = vidées / retirée
    const { info, error: infoError } = checkInfo(req.body)
    if (infoError) return bad(res, infoError)
    const { log, error: photoError } = 'photo' in req.body ? checkLog({ photo: req.body.photo }) : { log: {} }
    if (photoError) return bad(res, photoError)
    const dup = db.prepare('SELECT id FROM products WHERE name = ? AND cl = ? AND abv = ? AND id != ?')
      .get(drink.name, drink.cl, drink.abv, p.id)
    if (dup) return bad(res, 'Ce produit est déjà sur la carte', 409)
    db.prepare('UPDATE products SET name = ?, cat = ?, cl = ?, abv = ? WHERE id = ?').run(drink.name, drink.cat, drink.cl, drink.abv, p.id)
    for (const [k, v] of Object.entries(info)) db.prepare(`UPDATE products SET ${k} = ? WHERE id = ?`).run(v, p.id)
    if ('photo' in log) db.prepare('UPDATE products SET photo = ?, photo_key = ? WHERE id = ?').run(log.photo, log.photo ? photoKey() : null, p.id)
    // Les consos sans lien qui correspondent au produit corrigé y sont rattachées
    db.prepare('UPDATE drinks SET product_id = ? WHERE product_id IS NULL AND name = ? COLLATE NOCASE AND cl = ? AND abv = ?').run(p.id, drink.name, drink.cl, drink.abv)
    res.json(productOut(getProduct(p.id, req.user.id)))
  })

  // Retirer un produit de la carte : son auteur, ou un admin
  app.delete('/api/products/:id', auth, (req, res) => {
    const p = productOf(req, res)
    if (!p) return
    if (!canManage(p, req)) return bad(res, "Seul celui qui l'a ajouté ou un admin peut le retirer", 403)
    db.prepare('DELETE FROM products WHERE id = ?').run(p.id)
    res.json({ ok: true })
  })

  // « Déjà bue » : sans date ni note, hors score et hors journal (comme « vu » sans entrée de journal)
  app.put('/api/products/:id/tried', auth, (req, res) => {
    if (!productOf(req, res)) return
    db.prepare('INSERT OR IGNORE INTO product_tried (user_id, product_id, created_at) VALUES (?, ?, ?)').run(req.user.id, Number(req.params.id), now())
    res.json({ marked: true })
  })
  app.delete('/api/products/:id/tried', auth, (req, res) => {
    db.prepare('DELETE FROM product_tried WHERE user_id = ? AND product_id = ?').run(req.user.id, Number(req.params.id))
    res.json({ marked: false })
  })

  // Infos d'un produit (producteur, origine, style, description) : n'importe qui peut compléter un champ vide ;
  // changer ou vider un champ déjà rempli = auteur ou admin
  app.put('/api/products/:id/info', auth, (req, res) => {
    const p = productOf(req, res)
    if (!p) return
    const { info, error } = checkInfo(req.body)
    if (error) return bad(res, error)
    const changes = Object.entries(info).filter(([k, v]) => v !== p[k])
    if (!canManage(p, req) && changes.some(([k]) => p[k] != null)) {
      return bad(res, "Déjà renseigné : seul celui qui l'a ajouté ou un admin peut le changer", 403)
    }
    for (const [k, v] of changes) db.prepare(`UPDATE products SET ${k} = ? WHERE id = ?`).run(v, p.id)
    res.json(productOut(getProduct(p.id, req.user.id)))
  })

  // Photo d'un produit : n'importe qui peut en mettre une s'il n'en a pas ; la changer ou la retirer = auteur ou admin
  app.put('/api/products/:id/photo', auth, (req, res) => {
    const p = productOf(req, res)
    if (!p) return
    if (p.photo_key && !canManage(p, req)) return bad(res, "Il a déjà une photo : seul celui qui l'a ajouté ou un admin peut la changer", 403)
    const { log, error } = checkLog({ photo: req.body.photo ?? null })
    if (error) return bad(res, error)
    if (!log.photo && !canManage(p, req)) return bad(res, "Seul celui qui l'a ajouté ou un admin peut retirer la photo", 403)
    db.prepare('UPDATE products SET photo = ?, photo_key = ? WHERE id = ?').run(log.photo, log.photo ? photoKey() : null, p.id)
    res.json(productOut(getProduct(p.id, req.user.id)))
  })

  app.put('/api/products/:id/fav', auth, (req, res) => {
    const id = Number(req.params.id)
    if (!productOf(req, res)) return
    db.prepare('INSERT OR IGNORE INTO product_favs (user_id, product_id, created_at) VALUES (?, ?, ?)').run(req.user.id, id, now())
    res.json(productOut(getProduct(id, req.user.id)))
  })
  app.delete('/api/products/:id/fav', auth, (req, res) => {
    const id = Number(req.params.id)
    db.prepare('DELETE FROM product_favs WHERE user_id = ? AND product_id = ?').run(req.user.id, id)
    const p = getProduct(id, req.user.id)
    res.json(p ? productOut(p) : { ok: true })
  })

  // Mon top 4 : 4 places, chacune un produit de la carte ou vide (null)
  app.put('/api/me/tops', auth, (req, res) => {
    const slots = req.body.slots
    if (!Array.isArray(slots) || slots.length !== 4) return bad(res, '4 places attendues')
    const ids = slots.map((x) => (x == null ? null : Number(x)))
    if (ids.some((x) => x !== null && !db.prepare('SELECT 1 FROM products WHERE id = ?').get(x))) return bad(res, 'Produit introuvable', 404)
    if (new Set(ids.filter(Boolean)).size !== ids.filter(Boolean).length) return bad(res, 'Deux fois le même produit')
    db.exec('BEGIN')
    db.prepare('DELETE FROM user_tops WHERE user_id = ?').run(req.user.id)
    const ins = db.prepare('INSERT INTO user_tops (user_id, slot, product_id) VALUES (?, ?, ?)')
    ids.forEach((pid, slot) => pid && ins.run(req.user.id, slot, pid))
    db.exec('COMMIT')
    res.json({ ok: true })
  })

  // Classement sur une période (from = to pour une soirée), en verres standard
  app.get('/api/leaderboard', auth, group, (req, res) => {
    const { from, to, activeSince } = req.query
    if (!isDay(from) || !isDay(to)) return bad(res, 'Période invalide')
    if (activeSince && !isDay(activeSince)) return bad(res, 'Date invalide')

    // Totaux par personne et par soirée, puis agrégés sur la période
    const perDay = db.prepare(`
      SELECT user_id, day, ${ALCO.map((c) => `SUM(CASE WHEN cat = '${c}' THEN ${UNITS()} ELSE 0 END) AS ${c},`).join(' ')}
        SUM(${UNITS()}) AS total, COUNT(*) AS count
      FROM drinks WHERE abv > 0 AND day BETWEEN ? AND ? AND user_id IN (SELECT user_id FROM group_members WHERE group_id = ?)
      GROUP BY user_id, day
    `).all(from, to, req.group.id)
    const agg = new Map()
    for (const r of perDay) {
      const a = agg.get(r.user_id) ?? { ...Object.fromEntries(ALCO.map((c) => [c, 0])), total: 0, count: 0, days: 0, suspect_days: 0 }
      for (const c of ALCO) a[c] += r[c]
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
    const empty = { ...Object.fromEntries(ALCO.map((c) => [c, 0])), total: 0, count: 0, days: 0, suspect_days: 0 }
    const ranking = users
      .map((u) => {
        const a = agg.get(u.id) ?? empty
        return { ...u, ...a, ...Object.fromEntries(ALCO.map((c) => [c, round1(a[c])])), total: round1(a.total), wins: winMap[u.id] || 0,
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

  // Totaux journaliers de chacun sur une période, par catégorie (pour les graphes) :
  // verres standard par catégorie alcoolisée, et nombre de consos par catégorie (toutes, sans alcool compris : n_<cat>)
  app.get('/api/series', auth, group, (req, res) => {
    const { from, to } = req.query
    if (!isDay(from) || !isDay(to)) return bad(res, 'Période invalide')
    const rows = db.prepare(`
      SELECT user_id, day, ${ALCO.map((c) => `SUM(CASE WHEN cat = '${c}' THEN ${UNITS()} ELSE 0 END) AS ${c},`).join(' ')}
        ${CATS.map((c) => `SUM(cat = '${c}') AS n_${c},`).join(' ')}
        SUM(${UNITS()}) AS total, COUNT(*) AS count
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
