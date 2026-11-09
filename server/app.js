import express from 'express'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
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
export const MAX_COMMENT = 500
export const MAX_PHOTO = 200_000 // data URL (~150 ko) : le client compresse à ~100 ko, au-delà on refuse
export const MAX_CL = 200 // par conso (une bouteille de 1,5 L de vin passe en plusieurs fois)
export const MAX_DRINKS_PER_DAY = 100
export const SUSPECT_UNITS = 30 // au-delà : badge « suspect » (on ne bloque pas, on affiche)
export const EXTRAS = ['eau', 'clope'] // comptés à part, hors score
// Code de bande : 6 caractères sans ambiguïté (pas de 0/O, 1/I/L)
/**
 * Fusionne la fiche `dupId` dans `keepId` puis la supprime : verres, favoris, « déjà bue », tops suivent ;
 * la photo et les infos manquantes de la fiche gardée sont reprises du doublon. À appeler dans une transaction.
 */
export function mergeProducts(db, keepId, dupId) {
  if (keepId === dupId) return
  db.prepare('UPDATE drinks SET product_id = ? WHERE product_id = ?').run(keepId, dupId)
  for (const t of ['product_favs', 'product_tried']) {
    db.prepare(`INSERT OR IGNORE INTO ${t} (user_id, product_id, created_at) SELECT user_id, ?, created_at FROM ${t} WHERE product_id = ?`).run(keepId, dupId)
    db.prepare(`DELETE FROM ${t} WHERE product_id = ?`).run(dupId)
  }
  // Top 4 : si la fiche gardée y est déjà, la place du doublon se libère
  db.prepare('DELETE FROM user_tops WHERE product_id = ? AND user_id IN (SELECT user_id FROM user_tops WHERE product_id = ?)').run(dupId, keepId)
  db.prepare('UPDATE user_tops SET product_id = ? WHERE product_id = ?').run(keepId, dupId)
  const dup = db.prepare('SELECT photo, photo_key, maker, origin, style, description FROM products WHERE id = ?').get(dupId)
  db.prepare('DELETE FROM products WHERE id = ?').run(dupId) // avant de reprendre sa photo (clé unique)
  if (dup) {
    db.prepare(`UPDATE products SET
      photo_key = CASE WHEN photo IS NULL THEN ? ELSE photo_key END, photo = COALESCE(photo, ?),
      maker = COALESCE(maker, ?), origin = COALESCE(origin, ?), style = COALESCE(style, ?), description = COALESCE(description, ?)
      WHERE id = ?`).run(dup.photo_key, dup.photo, dup.maker, dup.origin, dup.style, dup.description, keepId)
  }
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const newCode = () => Array.from(randomBytes(6), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('')
// Verres standard d'une conso, en SQL (préfixe de table optionnel) et en JS
const UNITS = (p = '') => `(${p}cl * ${p}abv * 0.008)`
export const unitsOf = ({ cl, abv }) => cl * abv * 0.008
const round1 = (n) => Math.round(n * 10) / 10
// Pour comparer des noms : sans accents ni casse
const fold = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

// --- Fonctions pures (testées unitairement) ----------------------------------
export const hashPin = (pin) => {
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

// Nouveau PIN (inscription, changement) : 6 à 8 chiffres. Les PIN plus courts créés avant restent valides
// pour se connecter : la règle n'est pas rétroactive, ils seront à 6 chiffres au prochain changement.
export const PIN_RULE = /^\d{6,8}$/
const PIN_MSG = 'Le PIN doit faire 6 à 8 chiffres'
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
 * @param {string|number|boolean} [o.trustProxy]  derrière un reverse proxy : réglage Express « trust proxy »
 *                                 (ex. 1), pour que les limites par IP voient la vraie IP des visiteurs
 * @param {number} [o.sessionDays] une session inutilisée pendant ce nombre de jours expire (90 par défaut)
 */
export function createApp({ dbPath = ':memory:', inviteCode = '', now = Date.now, distDir, admins = [], tz = 'Europe/Paris', trustProxy = false, sessionDays = 90 } = {}) {
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
    -- token = empreinte SHA-256 du jeton (le jeton lui-même n'est connu que du navigateur)
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS drinks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day TEXT NOT NULL,   -- journée (YYYY-MM-DD), décidée par le client : jusqu'à 6h on compte la veille
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
      UNIQUE (name, abv) -- une fiche par boisson ; cl = format proposé par défaut, chaque verre a le sien
    );
    -- Favoris de chacun : raccourcis sur l'accueil
    CREATE TABLE IF NOT EXISTS product_favs (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, product_id)
    );
  `)
  // Admins : listés par pseudo dans la config (ADMINS=…), mais le droit est attaché au COMPTE qui a eu ce pseudo
  // en premier (admin_claims), pas au pseudo : si l'admin change de pseudo ou supprime son compte, personne ne
  // devient admin en reprenant le pseudo. Un pseudo d'admin déjà attribué est réservé (inscription et renommage).
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name)
  if (!userCols.includes('is_admin')) db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0')
  db.exec(`CREATE TABLE IF NOT EXISTS admin_claims (
    name TEXT PRIMARY KEY COLLATE NOCASE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- NULL : compte supprimé, le pseudo reste réservé
    claimed_at INTEGER NOT NULL
  )`)
  const adminNames = admins.map((a) => a.trim().toLowerCase()).filter(Boolean)
  const isAdminName = (name) => adminNames.includes(name.toLowerCase())
  const claimOf = (name) => db.prepare('SELECT user_id FROM admin_claims WHERE name = ?').get(name)
  // Au démarrage : un pseudo d'admin pas encore attribué l'est au compte qui le porte (s'il existe)
  for (const a of adminNames) {
    const u = db.prepare('SELECT id FROM users WHERE name = ?').get(a)
    if (u && !claimOf(a)) db.prepare('INSERT INTO admin_claims (name, user_id, claimed_at) VALUES (?, ?, ?)').run(a, u.id, now())
  }
  const syncAdmins = () => {
    db.exec('UPDATE users SET is_admin = 0')
    const set = db.prepare('UPDATE users SET is_admin = 1 WHERE id = (SELECT user_id FROM admin_claims WHERE name = ?)')
    for (const a of adminNames) set.run(a)
  }
  syncAdmins()
  // Pseudo réservé : c'est un pseudo d'admin déjà attribué à un autre compte (ou à un compte supprimé)
  const reservedFor = (name, userId = null) => {
    if (!isAdminName(name)) return false
    const c = claimOf(name)
    return !!c && c.user_id !== userId
  }

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
  // Bande proposée (une au plus, choisie par un admin) : offerte à l'arrivée et en solo, rejoignable sans code
  addCols('groups', [['is_default', 'INTEGER NOT NULL DEFAULT 0']])
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
    -- Unicité des noms : voir places_scope2 plus bas (un public par nom, un privé par nom et créateur, un chez-soi par personne)
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

  // « Chez moi » : un lieu par personne (home_of), affiché « Chez moi » à son propriétaire et « Chez <pseudo> »
  // aux autres (suit les changements de pseudo). Nom stocké « Chez moi » ; l'unicité est par propriétaire.
  // Sa position n'est jamais montrée aux autres (c'est une adresse perso).
  addCols('places', [['home_of', 'INTEGER REFERENCES users(id) ON DELETE CASCADE']])
  // Fiche d'un lieu : photo, description, adresse (toutes facultatives)
  addCols('places', [['photo', 'TEXT'], ['photo_key', 'TEXT'], ['description', 'TEXT'], ['address', 'TEXT']])
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS places_photo_key ON places(photo_key)')
  db.exec(`
    DROP INDEX IF EXISTS places_scope;
    CREATE UNIQUE INDEX IF NOT EXISTS places_scope2 ON places(name COLLATE NOCASE,
      (CASE WHEN home_of IS NOT NULL THEN -home_of WHEN private THEN created_by ELSE 0 END));
    CREATE UNIQUE INDEX IF NOT EXISTS places_home ON places(home_of) WHERE home_of IS NOT NULL;
  `)
  // Migration : les lieux « Chez moi » créés à la main deviennent le chez-soi de leur créateur (un par personne)
  for (const r of db.prepare(`SELECT id, created_by FROM places WHERE home_of IS NULL AND created_by IS NOT NULL
    AND name = 'Chez moi' COLLATE NOCASE ORDER BY id`).all()) {
    if (!db.prepare('SELECT 1 FROM places WHERE home_of = ?').get(r.created_by)) {
      db.prepare("UPDATE places SET home_of = created_by, name = 'Chez moi' WHERE id = ?").run(r.id)
    }
  }
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
    -- Commentaires sous les consos des gens (partent avec la conso ou le compte)
    CREATE TABLE IF NOT EXISTS drink_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drink_id INTEGER NOT NULL REFERENCES drinks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      at INTEGER NOT NULL,
      body TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS drink_comments_drink ON drink_comments(drink_id, at);
    -- Likes sur les consos (un par personne)
    CREATE TABLE IF NOT EXISTS drink_likes (
      drink_id INTEGER NOT NULL REFERENCES drinks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      at INTEGER NOT NULL,
      PRIMARY KEY (drink_id, user_id)
    );
    -- Likes sur les commentaires
    CREATE TABLE IF NOT EXISTS comment_likes (
      comment_id INTEGER NOT NULL REFERENCES drink_comments(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      at INTEGER NOT NULL,
      PRIMARY KEY (comment_id, user_id)
    );
    -- Notifs : quelqu'un a liké / commenté ma conso, répondu sous une conso que j'ai commentée, m'a suivi.
    -- Elles disparaissent avec ce qui les a causées (like retiré, commentaire supprimé, conso supprimée…).
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      drink_id INTEGER REFERENCES drinks(id) ON DELETE CASCADE,
      comment_id INTEGER REFERENCES drink_comments(id) ON DELETE CASCADE,
      at INTEGER NOT NULL,
      read INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, at);
  `)
  // Consos d'avant : rattachées au produit de la carte de même nom, volume et degré
  if (!drinkColsBefore.includes('product_id')) {
    db.exec(`UPDATE drinks SET product_id = (
      SELECT p.id FROM products p WHERE p.name = drinks.name COLLATE NOCASE AND p.cl = drinks.cl AND p.abv = drinks.abv
    )`)
  }
  // Migration : une fiche par boisson, plus une par contenance (« Kronenbourg 25 cl » et « 50 cl » → une seule).
  // Les doublons (même nom sans la casse, même degré) sont fusionnés sur la fiche la plus bue (puis la plus ancienne),
  // puis la table est recréée avec l'unicité (nom, degré).
  const productsSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'products'").get().sql
  if (/UNIQUE \(name, cl, abv\)/.test(productsSql)) {
    const groups = db.prepare(`
      SELECT p.id, p.name, p.abv, (SELECT COUNT(*) FROM drinks d WHERE d.product_id = p.id) AS n FROM products p
      ORDER BY lower(p.name), p.abv, n DESC, p.id
    `).all()
    const keepOf = new Map()
    db.exec('BEGIN')
    for (const p of groups) {
      const k = `${p.name.toLowerCase()}|${p.abv}`
      if (!keepOf.has(k)) keepOf.set(k, p.id)
      else mergeProducts(db, keepOf.get(k), p.id)
    }
    db.exec('COMMIT')
    db.exec(`
      PRAGMA foreign_keys = OFF; BEGIN;
      CREATE TABLE products_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL COLLATE NOCASE, cat TEXT NOT NULL, cl REAL NOT NULL, abv REAL NOT NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        photo TEXT, photo_key TEXT, maker TEXT, origin TEXT, style TEXT, description TEXT,
        UNIQUE (name, abv)
      );
      INSERT INTO products_new (id, name, cat, cl, abv, created_by, created_at, photo, photo_key, maker, origin, style, description)
        SELECT id, name, cat, cl, abv, created_by, created_at, photo, photo_key, maker, origin, style, description FROM products;
      DROP TABLE products; ALTER TABLE products_new RENAME TO products;
      CREATE UNIQUE INDEX IF NOT EXISTS products_photo_key ON products(photo_key);
      COMMIT; PRAGMA foreign_keys = ON;
    `)
  }
  const photoKey = () => randomBytes(12).toString('hex')

  // Dernier jour saisissable : demain en UTC, pour laisser de la marge aux fuseaux horaires
  const maxEntryDay = () => new Date(now() + 36 * 3600e3).toISOString().slice(0, 10)
  // Sessions : on ne garde en base que l'empreinte du jeton (une fuite de la base ne donne pas de sessions),
  // et une session inutilisée pendant `sessionDays` jours expire.
  const tokenHash = (t) => createHash('sha256').update(t).digest('hex')
  if (!db.prepare('PRAGMA table_info(sessions)').all().some((c) => c.name === 'last_used')) {
    db.exec('ALTER TABLE sessions ADD COLUMN last_used INTEGER NOT NULL DEFAULT 0')
    // Anciens jetons stockés en clair (48 caractères) → leur empreinte (64)
    for (const r of db.prepare('SELECT token FROM sessions WHERE length(token) = 48').all()) {
      db.prepare('UPDATE sessions SET token = ?, last_used = ? WHERE token = ?').run(tokenHash(r.token), now(), r.token)
    }
  }
  const SESSION_TTL = sessionDays * 864e5
  const newSession = (userId) => {
    const token = randomBytes(32).toString('hex')
    db.prepare('INSERT INTO sessions (token, user_id, last_used) VALUES (?, ?, ?)').run(tokenHash(token), userId, now())
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
  // Limites par adresse IP (fenêtre glissante simple) : essais de PIN ratés tous comptes confondus (contre le
  // « 1234 sur tous les pseudos »), inscriptions, codes de bande faux (contre l'énumération des codes).
  const hits = new Map() // clé -> { n, reset }
  const overLimit = (key, max) => (hits.get(key)?.reset > Date.now() ? hits.get(key).n >= max : false)
  const hit = (key, windowMs) => {
    const h = hits.get(key)
    if (h && h.reset > Date.now()) h.n++
    else hits.set(key, { n: 1, reset: Date.now() + windowMs })
  }
  const LIMITS = { loginFail: [30, 15 * 60e3], register: [10, 3600e3], joinFail: [20, 3600e3] }
  const blocked = (kind, req) => overLimit(`${kind}:${req.ip}`, LIMITS[kind][0])
  const count = (kind, req) => hit(`${kind}:${req.ip}`, LIMITS[kind][1])
  const purge = setInterval(() => {
    for (const [k, a] of attempts) if (Date.now() - a.last > 3600e3) attempts.delete(k)
    for (const [k, h] of hits) if (h.reset < Date.now()) hits.delete(k)
    // Garde-fou mémoire : des milliers de pseudos inventés ne font pas gonfler la table indéfiniment
    if (attempts.size > 10_000) attempts.clear()
    if (hits.size > 50_000) hits.clear()
  }, 600e3)
  purge.unref()

  // Lieux privés : visibles par leur créateur et les membres des bandes autorisées. `viewer` = qui fait la requête
  // (fixé par auth ; les requêtes SQLite sont synchrones, donc pas de mélange entre deux requêtes HTTP).
  let viewer = 0
  const canSeePlace = db.prepare(`SELECT 1 FROM places pl WHERE pl.id = ? AND (pl.private = 0 OR pl.created_by = ? OR EXISTS (
    SELECT 1 FROM place_groups pg JOIN group_members gm ON gm.group_id = pg.group_id WHERE pg.place_id = pl.id AND gm.user_id = ?))`)
  const lastCl = db.prepare('SELECT cl FROM drinks WHERE product_id = ? AND user_id = ? ORDER BY at DESC, id DESC LIMIT 1')
  db.function('my_cl', (pid) => lastCl.get(pid, viewer)?.cl ?? null)
  db.function('viewer_id', () => viewer)
  db.function('place_visible', (id) => (id != null && canSeePlace.get(id, viewer, viewer) ? 1 : 0))
  // Nom affiché d'un lieu : « Chez moi » pour mon chez-moi, « Chez <pseudo> » pour celui des autres
  const placeRow = db.prepare('SELECT pl.name, pl.home_of, u.name AS owner FROM places pl LEFT JOIN users u ON u.id = pl.home_of WHERE pl.id = ?')
  db.function('place_label', (id) => {
    const r = id == null ? null : placeRow.get(id)
    if (!r) return null
    if (r.home_of == null) return r.name
    return r.home_of === viewer ? 'Chez moi' : `Chez ${r.owner}`
  })

  const auth = (req, res, next) => {
    const token = bearer(req)
    const hash = token ? tokenHash(token) : null
    const user = hash
      ? db.prepare('SELECT u.id, u.name, u.avatar_v, u.is_admin, s.last_used FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(hash)
      : null
    if (user && now() - user.last_used > SESSION_TTL) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(hash)
      return bad(res, 'Session expirée, reconnecte-toi', 401)
    }
    if (!user) return bad(res, 'Non connecté', 401)
    // Dernière utilisation, mise à jour au plus une fois par heure
    if (now() - user.last_used > 3600e3) db.prepare('UPDATE sessions SET last_used = ? WHERE token = ?').run(now(), hash)
    delete user.last_used
    req.user = { ...user, is_admin: !!user.is_admin }
    viewer = user.id
    next()
  }

  // Bande courante : en-tête X-Group (sinon la première rejointe). Les routes « de bande » en ont besoin.
  const myGroups = (userId) => db.prepare(`
    SELECT g.id, g.name, g.code, g.owner_id, g.is_default, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS members
    FROM group_members m JOIN groups g ON g.id = m.group_id WHERE m.user_id = ? ORDER BY m.joined_at, g.id
  `).all(userId)
  const userExists = (id) => !!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)
  // Bande proposée à tous : rejoignable sans code, donc jamais destinataire d'un lieu privé
  const isOpenGroup = (id) => !!db.prepare('SELECT 1 FROM groups WHERE id = ? AND is_default = 1').get(Number(id))
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
  const groupOut = (g) => ({ id: g.id, name: g.name, code: g.code, owner_id: g.owner_id, members: g.members, is_default: !!g.is_default })
  const freshCode = () => {
    let code
    do code = newCode()
    while (db.prepare('SELECT 1 FROM groups WHERE code = ?').get(code))
    return code
  }
  const badGroupName = (name) => name.length < 2 || name.length > 30 || /\p{Cc}/u.test(name)

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
  app.disable('x-powered-by')
  if (trustProxy) app.set('trust proxy', trustProxy)
  // En-têtes de sécurité (HTML et API) + remise à zéro du « viewer » des fonctions SQL à chaque requête
  const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // styles en ligne : Vue et Leaflet
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://tile.openstreetmap.org",
    "connect-src 'self'",
    "frame-src 'none'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
  ].join('; ')
  app.use((_req, res, next) => {
    viewer = 0
    res.set({
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Permissions-Policy': 'geolocation=(self), camera=(self), microphone=(), payment=()',
    })
    next()
  })
  app.use(express.json({ limit: '300kb' })) // une photo compressée tient largement dedans
  app.use((req, _res, next) => {
    req.body ??= {} // requête sans corps JSON
    next()
  })

  app.get('/api/config', (_req, res) => res.json({ inviteRequired: !!inviteCode }))

  app.post('/api/register', (req, res) => {
    if (blocked('register', req)) return bad(res, "Trop d'inscriptions depuis cette connexion, réessaie plus tard", 429)
    const name = String(req.body.name || '').trim()
    const pin = String(req.body.pin || '')
    if (inviteCode && req.body.invite !== inviteCode) return bad(res, "Code d'invitation invalide", 403)
    if (checkName(name)) return bad(res, checkName(name))
    if (!PIN_RULE.test(pin)) return bad(res, PIN_MSG)
    if (db.prepare('SELECT 1 FROM users WHERE name = ?').get(name) || reservedFor(name)) return bad(res, 'Pseudo déjà pris', 409)
    // Code de bande facultatif : on rejoint directement la bande des potes
    const code = String(req.body.group || '').trim().toUpperCase()
    const g = code ? db.prepare('SELECT id FROM groups WHERE code = ?').get(code) : null
    if (code && blocked('joinFail', req)) return bad(res, 'Trop de codes faux, réessaie dans une heure', 429)
    if (code && !g) {
      count('joinFail', req)
      return bad(res, 'Code de bande inconnu', 404)
    }
    const { lastInsertRowid } = db.prepare('INSERT INTO users (name, pin_hash, is_admin) VALUES (?, ?, 0)').run(name, hashPin(pin))
    const id = Number(lastInsertRowid)
    // Premier compte à prendre un pseudo d'admin (installation neuve) : il devient admin, et le pseudo lui est réservé
    if (isAdminName(name)) {
      db.prepare('INSERT INTO admin_claims (name, user_id, claimed_at) VALUES (?, ?, ?)').run(name.toLowerCase(), id, now())
      syncAdmins()
    }
    const isAdmin = !!db.prepare('SELECT is_admin FROM users WHERE id = ?').get(id).is_admin
    // Lien d'invitation → cette bande. Sinon personne n'est mis d'office dans une bande : la bande proposée
    // (is_default) est offerte à l'arrivée, chacun choisit d'entrer en compet avec tout le monde ou non.
    if (g) joinGroup(g.id, id)
    count('register', req)
    res.json({ token: newSession(id), user: { id, name, avatar_v: 0, is_admin: isAdmin } })
  })

  app.post('/api/login', (req, res) => {
    const name = String(req.body.name || '').trim()
    const key = `login:${name.toLowerCase()}`
    const wait = lockedFor(key)
    if (wait) return bad(res, lockedMsg(wait), 429)
    if (blocked('loginFail', req)) return bad(res, "Trop d'essais depuis cette connexion, réessaie dans 15 min", 429)
    const user = db.prepare('SELECT * FROM users WHERE name = ?').get(name)
    const ok = checkPin(String(req.body.pin || ''), user?.pin_hash ?? DUMMY_HASH)
    if (!user || !ok) {
      recordFail(key)
      count('loginFail', req)
      return bad(res, 'Pseudo ou PIN incorrect', 401)
    }
    attempts.delete(key)
    res.json({ token: newSession(user.id), user: { id: user.id, name: user.name, avatar_v: user.avatar_v, is_admin: !!user.is_admin } })
  })

  app.post('/api/logout', auth, (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(tokenHash(bearer(req)))
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
    // Un pseudo d'admin ne se prend pas en se renommant (il est attribué à un compte, ou se gagne à l'inscription)
    if (isAdminName(name) && claimOf(name)?.user_id !== req.user.id) return bad(res, 'Pseudo réservé', 409)
    // Le statut admin reste attaché au compte : changer de pseudo ne le donne ni ne le retire
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id)
    res.json({ user: { ...req.user, name } })
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
    if (!PIN_RULE.test(next)) return bad(res, PIN_MSG)
    db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(hashPin(next), req.user.id)
    // Déconnecte les autres appareils, garde la session courante
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, tokenHash(bearer(req)))
    res.json({ ok: true })
  })

  // --- Supprimer un compte -------------------------------------------------------
  // Tout ce qui est à lui part avec (consos, sessions, bandes rejointes, abonnements, son « chez moi ») ;
  // ses bandes passent au plus ancien membre restant, ou disparaissent s'il était seul ;
  // les produits qu'il a ajoutés à la carte restent (sans auteur).
  const deleteUser = (id) => {
    db.exec('BEGIN')
    try {
      for (const g of db.prepare('SELECT id FROM groups WHERE owner_id = ?').all(id)) {
        const next = db.prepare('SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ? ORDER BY joined_at LIMIT 1').get(g.id, id)
        if (next) db.prepare('UPDATE groups SET owner_id = ? WHERE id = ?').run(next.user_id, g.id)
        else db.prepare('DELETE FROM groups WHERE id = ?').run(g.id)
      }
      db.prepare('DELETE FROM users WHERE id = ?').run(id)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }
  // Moi : avec mon PIN (comme pour le changer)
  app.delete('/api/me', auth, (req, res) => {
    const key = `pin:${req.user.id}`
    const wait = lockedFor(key)
    if (wait) return bad(res, lockedMsg(wait), 429)
    const { pin_hash } = db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(req.user.id)
    if (!checkPin(String(req.body?.pin || ''), pin_hash)) {
      recordFail(key)
      return bad(res, 'PIN incorrect', 403)
    }
    deleteUser(req.user.id)
    res.json({ ok: true })
  })
  // Quelqu'un d'autre : admin seulement
  app.delete('/api/users/:id', auth, (req, res) => {
    if (!req.user.is_admin) return bad(res, 'Réservé aux admins', 403)
    const id = Number(req.params.id)
    if (id === req.user.id) return bad(res, 'Pour ton propre compte, passe par tes réglages')
    if (!userExists(id)) return bad(res, 'Compte introuvable', 404)
    deleteUser(id)
    res.json({ ok: true })
  })

  // --- Bandes -------------------------------------------------------------------
  app.get('/api/groups', auth, (req, res) => res.json(myGroups(req.user.id).map(groupOut)))

  app.post('/api/groups', auth, (req, res) => {
    const name = String(req.body.name || '').trim()
    if (badGroupName(name)) return bad(res, 'Nom de bande entre 2 et 30 caractères')
    const id = Number(db.prepare('INSERT INTO groups (name, code, owner_id) VALUES (?, ?, ?)').run(name, freshCode(), req.user.id).lastInsertRowid)
    joinGroup(id, req.user.id)
    res.json(groupOut(myGroups(req.user.id).find((g) => g.id === id)))
  })

  // La bande proposée à tous (choisie par un admin), qu'on peut rejoindre sans code ; null s'il n'y en a pas
  const suggested = () => db.prepare(`
    SELECT g.id, g.name, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS members FROM groups g WHERE g.is_default = 1
  `).get() ?? null
  app.get('/api/groups/suggested', auth, (req, res) => {
    const g = suggested()
    res.json(g && { ...g, joined: isMember(g.id, req.user.id) })
  })

  // Rejoindre une bande : avec son code, ou { suggested: true } pour la bande proposée
  app.post('/api/groups/join', auth, (req, res) => {
    if (blocked('joinFail', req)) return bad(res, 'Trop de codes faux, réessaie dans une heure', 429)
    const code = String(req.body.code || '').trim().toUpperCase()
    const g = req.body.suggested === true ? suggested() : db.prepare('SELECT id FROM groups WHERE code = ?').get(code)
    if (!g) {
      if (req.body.suggested !== true) count('joinFail', req)
      return bad(res, req.body.suggested === true ? 'Pas de bande proposée' : 'Code de bande inconnu', 404)
    }
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

  // --- Gestion d'une bande : son patron, ou un admin --------------------------------
  const managed = (req, res, next) => {
    const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(Number(req.params.id))
    if (!g || !(isMember(g.id, req.user.id) || req.user.is_admin)) return bad(res, 'Bande introuvable', 404)
    if (g.owner_id !== req.user.id && !req.user.is_admin) return bad(res, 'Réservé au patron de la bande', 403)
    req.managed = g
    next()
  }
  const managedOut = (id) =>
    groupOut(db.prepare('SELECT g.*, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS members FROM groups g WHERE g.id = ?').get(id))

  // Membres d'une bande, pour la gérer (les plus anciens d'abord)
  app.get('/api/groups/:id/members', auth, managed, (req, res) => {
    res.json(db.prepare(`
      SELECT u.id, u.name, u.avatar_v, m.joined_at FROM group_members m JOIN users u ON u.id = m.user_id
      WHERE m.group_id = ? ORDER BY m.joined_at, u.id
    `).all(req.managed.id))
  })

  // Modifier une bande (tout facultatif) :
  //   name          renommer
  //   owner_id      passer la main à un autre membre
  //   is_default    en faire la bande proposée à tous, rejoignable sans code (une seule à la fois) — admin seulement
  app.patch('/api/groups/:id', auth, managed, (req, res) => {
    const g = req.managed
    const b = req.body
    const sets = {}
    if ('name' in b) {
      const name = String(b.name ?? '').trim()
      if (badGroupName(name)) return bad(res, 'Nom de bande entre 2 et 30 caractères')
      sets.name = name
    }
    if ('owner_id' in b) {
      const owner = Number(b.owner_id)
      if (!isMember(g.id, owner)) return bad(res, "Le nouveau patron doit être dans la bande")
      sets.owner_id = owner
    }
    if ('is_default' in b && !req.user.is_admin) return bad(res, 'Réservé aux admins', 403)
    db.exec('BEGIN')
    try {
      if ('is_default' in b) {
        if (b.is_default) {
          db.prepare('UPDATE groups SET is_default = 0 WHERE is_default = 1').run()
          // Devenue ouverte à tous : elle ne voit plus les lieux privés qu'on lui avait partagés
          db.prepare('DELETE FROM place_groups WHERE group_id = ?').run(g.id)
        }
        sets.is_default = b.is_default ? 1 : 0
      }
      for (const [col, v] of Object.entries(sets)) db.prepare(`UPDATE groups SET ${col} = ? WHERE id = ?`).run(v, g.id)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
    res.json(managedOut(g.id))
  })

  // Nouveau code d'invitation (l'ancien et les liens déjà envoyés ne marchent plus)
  app.post('/api/groups/:id/code', auth, managed, (req, res) => {
    db.prepare('UPDATE groups SET code = ? WHERE id = ?').run(freshCode(), req.managed.id)
    res.json(managedOut(req.managed.id))
  })

  // Exclure quelqu'un de la bande (ses verres restent à lui ; il peut revenir avec le code, d'où « nouveau code »)
  app.delete('/api/groups/:id/members/:userId', auth, managed, (req, res) => {
    const uid = Number(req.params.userId)
    if (uid === req.user.id) return bad(res, 'Pour partir, quitte la bande')
    if (uid === req.managed.owner_id) return bad(res, 'Impossible d’exclure le patron')
    if (!db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(req.managed.id, uid).changes) {
      return bad(res, 'Pas dans cette bande', 404)
    }
    res.json(managedOut(req.managed.id))
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
    CASE WHEN place_visible(d.place_id) THEN place_label(d.place_id) END AS place,
    p.photo_key AS product_photo_key,
    (SELECT COUNT(*) FROM drink_comments c WHERE c.drink_id = d.id) AS comments,
    (SELECT COUNT(*) FROM drink_likes k WHERE k.drink_id = d.id) AS likes,
    EXISTS (SELECT 1 FROM drink_likes k WHERE k.drink_id = d.id AND k.user_id = viewer_id()) AS liked`
  // Lieu d'une conso, retrouvé ou créé. Privé : le mien de ce nom (partagé avec la bande donnée) ;
  // sinon mon lieu privé de ce nom s'il existe, puis le lieu public.
  const placeIdFor = (name, userId, { priv = false, groupId: gid = null } = {}) => {
    if (!name) return null
    // Un lieu privé n'est jamais partagé avec la bande proposée à tous (n'importe qui peut y entrer)
    const groupId = gid && !isOpenGroup(gid) ? gid : null
    // « Chez moi » : mon chez-moi (créé au besoin) ; « Chez <pseudo> » : le chez-soi de cette personne, si je le vois
    if (/^chez moi$/i.test(name)) {
      let home = db.prepare('SELECT id, private FROM places WHERE home_of = ?').get(userId)
      if (!home) {
        const id = Number(db.prepare(`INSERT INTO places (name, private, created_by, home_of, created_at) VALUES ('Chez moi', ?, ?, ?, ?)`)
          .run(priv ? 1 : 0, userId, userId, now()).lastInsertRowid)
        home = { id, private: priv ? 1 : 0 }
      }
      if (home.private && groupId && isMember(groupId, userId)) db.prepare('INSERT OR IGNORE INTO place_groups (place_id, group_id) VALUES (?, ?)').run(home.id, groupId)
      return home.id
    }
    const chez = /^chez (.+)$/i.exec(name)
    const other = chez && db.prepare('SELECT pl.id FROM places pl JOIN users u ON u.id = pl.home_of WHERE u.name = ? COLLATE NOCASE').get(chez[1].trim())
    if (other && canSeePlace.get(other.id, userId, userId)) return other.id
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
  const logOut = (r) => ({ ...r, units: round1(unitsOf(r)), ...('liked' in r ? { liked: !!r.liked } : {}) })
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
    // Depuis la carte : nom, catégorie et degré du produit ; le volume est celui choisi (demi, pinte…), sinon celui de la fiche
    const { drink, error } = checkDrink(prod ? { ...prod, cl: req.body.cl ?? prod.cl } : req.body)
    if (error) return bad(res, error)
    const { log, error: logError } = checkLog(req.body)
    if (logError) return bad(res, logError)
    // Pas de produit donné : on rattache quand même à la carte si la boisson y est
    productId ??= db.prepare('SELECT id FROM products WHERE name = ? AND abv = ?').get(drink.name, drink.abv)?.id ?? null
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM drinks WHERE user_id = ? AND day = ?').get(req.user.id, day)
    if (n >= MAX_DRINKS_PER_DAY) return bad(res, `Maximum ${MAX_DRINKS_PER_DAY} consos par jour`)
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
      ?? db.prepare('SELECT photo FROM places WHERE photo_key = ?').get(key)
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
    if (!q) return res.json({ users: [], products: [], places: [] })
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
    const places = placesOf(req).filter((p) => fold(p.name).includes(q))
      .sort((a, b) => rank(a.name) - rank(b.name) || b.logs - a.logs).slice(0, 10)
      .map(({ id, name, private: priv, home, logs }) => ({ id, name, private: priv, home, logs }))
    res.json({ users, products, places })
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
    const { changes } = db.prepare('INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)').run(req.user.id, id, now())
    if (changes) notify(id, req.user.id, 'follow')
    res.json({ iFollow: true })
  })
  app.delete('/api/users/:id/follow', auth, (req, res) => {
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(req.user.id, Number(req.params.id))
    db.prepare("DELETE FROM notifications WHERE kind = 'follow' AND user_id = ? AND actor_id = ?").run(Number(req.params.id), req.user.id)
    res.json({ iFollow: false })
  })

  // Toutes les boissons différentes d'une personne, avec ses chiffres : une boisson de la carte = une ligne, même si le
  // volume ou le degré d'une conso a changé (fiche corrigée, verre différent) ; hors carte, même nom, volume et degré
  app.get('/api/users/:id/drinks', auth, groupOrSolo, (req, res) => {
    const id = Number(req.params.id)
    if (!userExists(id)) return bad(res, 'Joueur introuvable', 404) // profils visibles par tous (recherche)
    const rows = db.prepare(`
      SELECT COALESCE(MAX(p.name), d.name) AS name, COALESCE(MAX(p.cat), d.cat) AS cat,
        COALESCE(MAX(p.cl), d.cl) AS cl, COALESCE(MAX(p.abv), d.abv) AS abv,
        d.product_id, MAX(p.photo_key) AS product_photo_key,
        COUNT(*) AS count, SUM(d.cl * d.abv * 0.008) AS units, ROUND(AVG(d.rating), 1) AS rating, COUNT(d.rating) AS ratings,
        COUNT(d.review) AS reviews, COUNT(d.photo_key) AS photos, MIN(d.day) AS first_day, MAX(d.day) AS last_day, MAX(d.at) AS last_at,
        (SELECT d2.photo_key FROM drinks d2 WHERE d2.user_id = d.user_id AND d2.photo_key IS NOT NULL
          AND (CASE WHEN d.product_id IS NOT NULL THEN d2.product_id = d.product_id
            ELSE d2.product_id IS NULL AND d2.name = d.name COLLATE NOCASE AND d2.cl = d.cl AND d2.abv = d.abv END)
          ORDER BY d2.at DESC LIMIT 1) AS last_photo_key
      FROM drinks d LEFT JOIN products p ON p.id = d.product_id
      WHERE d.user_id = ?
      GROUP BY d.product_id, CASE WHEN d.product_id IS NULL THEN d.name END COLLATE NOCASE,
        CASE WHEN d.product_id IS NULL THEN d.cl END, CASE WHEN d.product_id IS NULL THEN d.abv END
      ORDER BY count DESC, last_at DESC
    `).all(id)
    const marked = db.prepare(`
      SELECT p.name, p.cat, p.cl, p.abv, p.id AS product_id, p.photo_key AS product_photo_key, t.created_at AS marked_at
      FROM product_tried t JOIN products p ON p.id = t.product_id WHERE t.user_id = ?
    `).all(id).filter((m) => !rows.some((r) => r.product_id === m.product_id || (fold(r.name) === fold(m.name) && r.cl === m.cl && r.abv === m.abv)))
    res.json([
      ...rows.map((r) => ({ ...r, units: round1(r.units) })),
      ...marked.map((m) => ({ ...m, count: 0, rating: null, ratings: 0, reviews: 0, photos: 0, first_day: null, last_day: null, last_at: null, last_photo_key: null, units: 0, marked: true })),
    ])
  })

  // Toutes les consos d'une personne pour une boisson donnée (?name=&cl=&abv=), plus récentes d'abord
  app.get('/api/users/:id/drinks/logs', auth, groupOrSolo, (req, res) => {
    const id = Number(req.params.id)
    if (!userExists(id)) return bad(res, 'Joueur introuvable', 404) // profils visibles par tous (recherche)
    // Boisson de la carte (?product_id=) : toutes ses consos ; sinon (?name=&cl=&abv=) celles hors carte
    const productId = Number(req.query.product_id)
    const { name } = req.query
    const cl = Number(req.query.cl)
    const abv = Number(req.query.abv)
    if (!(productId > 0) && (!name || !Number.isFinite(cl) || !Number.isFinite(abv))) return bad(res, 'Boisson invalide')
    const rows = productId > 0
      ? db.prepare(`
          SELECT ${LOG_COLS} FROM drinks d LEFT JOIN products p ON p.id = d.product_id
          WHERE d.user_id = ? AND d.product_id = ? ORDER BY d.at DESC, d.id DESC LIMIT 500
        `).all(id, productId)
      : db.prepare(`
          SELECT ${LOG_COLS} FROM drinks d LEFT JOIN products p ON p.id = d.product_id
          WHERE d.user_id = ? AND d.product_id IS NULL AND d.name = ? COLLATE NOCASE AND d.cl = ? AND d.abv = ?
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
    if (n >= MAX_DRINKS_PER_DAY) return bad(res, `Maximum ${MAX_DRINKS_PER_DAY} par jour`)
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

  // --- Notifs ---------------------------------------------------------------------------------
  const ownerOf = (drinkId) => db.prepare('SELECT user_id FROM drinks WHERE id = ?').get(drinkId)?.user_id
  // Jamais pour soi-même ; un like ou un follow refait ne crée pas de doublon (l'ancienne remonte)
  const notify = (userId, actorId, kind, { drinkId = null, commentId = null } = {}) => {
    if (!userId || userId === actorId) return
    if (kind === 'like' || kind === 'follow' || kind === 'comment_like') {
      db.prepare('DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND kind = ? AND drink_id IS ? AND comment_id IS ?')
        .run(userId, actorId, kind, drinkId, commentId)
    }
    db.prepare('INSERT INTO notifications (user_id, actor_id, kind, drink_id, comment_id, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, actorId, kind, drinkId, commentId, now())
  }
  const unread = (userId) => db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0').get(userId).n
  // Mes notifs, plus récentes d'abord (?before=<id> pour la suite)
  app.get('/api/notifications', auth, (req, res) => {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 30))
    const before = Number(req.query.before) || null
    const rows = db.prepare(`
      SELECT n.id, n.kind, n.at, n.read, n.drink_id, n.actor_id, u.name AS actor_name, u.avatar_v AS actor_avatar_v,
        d.name AS drink_name, d.cat AS drink_cat, SUBSTR(c.body, 1, 140) AS comment
      FROM notifications n JOIN users u ON u.id = n.actor_id
      LEFT JOIN drinks d ON d.id = n.drink_id LEFT JOIN drink_comments c ON c.id = n.comment_id
      WHERE n.user_id = ? ${before ? 'AND n.id < ?' : ''} ORDER BY n.id DESC LIMIT ?
    `).all(req.user.id, ...(before ? [before] : []), limit + 1)
    const items = rows.slice(0, limit).map((r) => ({ ...r, read: !!r.read }))
    res.json({ items, next: rows.length > limit ? items.at(-1).id : null, unread: unread(req.user.id) })
  })
  app.get('/api/notifications/unread', auth, (req, res) => res.json({ unread: unread(req.user.id) }))
  app.post('/api/notifications/read', auth, (req, res) => {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(req.user.id)
    res.json({ unread: 0 })
  })

  // Page d'une conso : la conso, son auteur, et qui l'a likée (les plus récents d'abord)
  app.get('/api/drinks/:id(\\d+)', auth, (req, res) => {
    const id = Number(req.params.id)
    const log = db.prepare(`
      SELECT ${LOG_COLS}, u.name AS user_name, u.avatar_v, p.maker AS maker FROM drinks d
      JOIN users u ON u.id = d.user_id LEFT JOIN products p ON p.id = d.product_id WHERE d.id = ?
    `).get(id)
    if (!log) return bad(res, 'Conso introuvable', 404)
    const likers = db.prepare(`
      SELECT u.id, u.name, u.avatar_v FROM drink_likes k JOIN users u ON u.id = k.user_id WHERE k.drink_id = ? ORDER BY k.at DESC LIMIT 100
    `).all(id)
    res.json({ ...logOut(log), likers })
  })
  // Liker / ne plus liker une conso
  const likeState = (id, userId) => ({
    likes: db.prepare('SELECT COUNT(*) AS n FROM drink_likes WHERE drink_id = ?').get(id).n,
    liked: !!db.prepare('SELECT 1 FROM drink_likes WHERE drink_id = ? AND user_id = ?').get(id, userId),
  })
  app.put('/api/drinks/:id/like', auth, (req, res) => {
    const id = Number(req.params.id)
    if (!db.prepare('SELECT 1 FROM drinks WHERE id = ?').get(id)) return bad(res, 'Conso introuvable', 404)
    const { changes } = db.prepare('INSERT OR IGNORE INTO drink_likes (drink_id, user_id, at) VALUES (?, ?, ?)').run(id, req.user.id, now())
    if (changes) notify(ownerOf(id), req.user.id, 'like', { drinkId: id })
    res.json(likeState(id, req.user.id))
  })
  app.delete('/api/drinks/:id/like', auth, (req, res) => {
    const id = Number(req.params.id)
    db.prepare('DELETE FROM drink_likes WHERE drink_id = ? AND user_id = ?').run(id, req.user.id)
    db.prepare("DELETE FROM notifications WHERE kind = 'like' AND drink_id = ? AND actor_id = ?").run(id, req.user.id)
    res.json(likeState(id, req.user.id))
  })

  // Commentaires d'une conso, du plus ancien au plus récent. Tout le monde peut lire et commenter (les profils sont publics).
  const commentsOf = (drinkId) => db.prepare(`
    SELECT c.id, c.drink_id, c.user_id, c.at, c.body, u.name AS user_name, u.avatar_v,
      (SELECT COUNT(*) FROM comment_likes k WHERE k.comment_id = c.id) AS likes,
      EXISTS (SELECT 1 FROM comment_likes k WHERE k.comment_id = c.id AND k.user_id = viewer_id()) AS liked
    FROM drink_comments c JOIN users u ON u.id = c.user_id WHERE c.drink_id = ? ORDER BY c.at, c.id
  `).all(drinkId).map((c) => ({ ...c, liked: !!c.liked }))
  app.get('/api/drinks/:id/comments', auth, (req, res) => {
    const id = Number(req.params.id)
    if (!db.prepare('SELECT 1 FROM drinks WHERE id = ?').get(id)) return bad(res, 'Conso introuvable', 404)
    res.json(commentsOf(id))
  })
  app.post('/api/drinks/:id/comments', auth, (req, res) => {
    const id = Number(req.params.id)
    if (!db.prepare('SELECT 1 FROM drinks WHERE id = ?').get(id)) return bad(res, 'Conso introuvable', 404)
    const body = String(req.body.body ?? '').trim()
    if (!body) return bad(res, 'Commentaire vide')
    if (body.length > MAX_COMMENT) return bad(res, `Commentaire de ${MAX_COMMENT} caractères maximum`)
    if (/[\u0000-\u0009\u000b-\u001f\u007f]/.test(body)) return bad(res, 'Caractères invalides')
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM drink_comments WHERE user_id = ? AND at > ?').get(req.user.id, now() - 60_000)
    if (n >= 10) return bad(res, 'Doucement, trop de commentaires d’un coup', 429)
    const cid = Number(db.prepare('INSERT INTO drink_comments (drink_id, user_id, at, body) VALUES (?, ?, ?, ?)').run(id, req.user.id, now(), body).lastInsertRowid)
    const owner = ownerOf(id)
    notify(owner, req.user.id, 'comment', { drinkId: id, commentId: cid })
    // Ceux qui ont déjà commenté cette conso (sauf l'auteur, déjà prévenu) : une réponse
    for (const { user_id } of db.prepare('SELECT DISTINCT user_id FROM drink_comments WHERE drink_id = ? AND user_id NOT IN (?, ?)').all(id, owner, req.user.id)) {
      notify(user_id, req.user.id, 'reply', { drinkId: id, commentId: cid })
    }
    res.json(commentsOf(id))
  })
  // Liker / ne plus liker un commentaire
  const commentLikeState = (id, userId) => ({
    likes: db.prepare('SELECT COUNT(*) AS n FROM comment_likes WHERE comment_id = ?').get(id).n,
    liked: !!db.prepare('SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?').get(id, userId),
  })
  app.put('/api/comments/:id/like', auth, (req, res) => {
    const id = Number(req.params.id)
    const c = db.prepare('SELECT user_id, drink_id FROM drink_comments WHERE id = ?').get(id)
    if (!c) return bad(res, 'Commentaire introuvable', 404)
    const { changes } = db.prepare('INSERT OR IGNORE INTO comment_likes (comment_id, user_id, at) VALUES (?, ?, ?)').run(id, req.user.id, now())
    if (changes) notify(c.user_id, req.user.id, 'comment_like', { drinkId: c.drink_id, commentId: id })
    res.json(commentLikeState(id, req.user.id))
  })
  app.delete('/api/comments/:id/like', auth, (req, res) => {
    const id = Number(req.params.id)
    db.prepare('DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?').run(id, req.user.id)
    db.prepare("DELETE FROM notifications WHERE kind = 'comment_like' AND comment_id = ? AND actor_id = ?").run(id, req.user.id)
    res.json(commentLikeState(id, req.user.id))
  })

  // Supprimer un commentaire : son auteur, l'auteur de la conso, ou un admin
  app.delete('/api/comments/:id', auth, (req, res) => {
    const c = db.prepare('SELECT c.user_id, c.drink_id, d.user_id AS owner FROM drink_comments c JOIN drinks d ON d.id = c.drink_id WHERE c.id = ?').get(Number(req.params.id))
    if (!c) return bad(res, 'Commentaire introuvable', 404)
    if (c.user_id !== req.user.id && c.owner !== req.user.id && !req.user.is_admin) return bad(res, 'Pas ton commentaire', 403)
    db.prepare('DELETE FROM drink_comments WHERE id = ?').run(Number(req.params.id))
    res.json(commentsOf(c.drink_id))
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
      SELECT pl.id, place_label(pl.id) AS place, pl.private, pl.home_of IS NOT NULL AS home, COUNT(d.id) AS count,
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
    res.json(rows.map(({ my_last, circle, ...r }) => ({ ...r, home: !!r.home, mine: my_last != null })))
  })

  // Tous les lieux, avec leurs coordonnées (vides pour l'instant) et leur fréquentation :
  // la source de données d'une future carte géographique. ?mine=1 : seulement ceux où j'ai bu.
  const placesOf = (req, { mine = false, id = null } = {}) => {
    const rows = db.prepare(`
      SELECT pl.id, place_label(pl.id) AS name, pl.home_of,
        -- La position d'un chez-soi n'est montrée qu'à son propriétaire
        CASE WHEN pl.home_of IS NULL OR pl.home_of = ? THEN pl.lat END AS lat,
        CASE WHEN pl.home_of IS NULL OR pl.home_of = ? THEN pl.lng END AS lng,
        -- L'adresse d'un chez-soi aussi (sa photo et sa description restent visibles par ceux qui voient le lieu)
        CASE WHEN pl.home_of IS NULL OR pl.home_of = ? THEN pl.address END AS address,
        pl.photo_key, pl.description,
        pl.private, pl.created_by, COUNT(d.id) AS logs, COUNT(DISTINCT d.user_id) AS drinkers,
        SUM(d.user_id = ?) AS my_logs, MAX(d.at) AS last_at
      FROM places pl LEFT JOIN drinks d ON d.place_id = pl.id ${mine ? 'AND d.user_id = ?' : ''}
      WHERE place_visible(pl.id) ${id ? 'AND pl.id = ?' : ''}
      GROUP BY pl.id ${mine ? 'HAVING logs > 0' : ''} ORDER BY logs DESC, name
    `).all(req.user.id, req.user.id, req.user.id, req.user.id, ...(mine ? [req.user.id] : []), ...(id ? [id] : []))
    const groupsOf = db.prepare('SELECT g.id, g.name FROM place_groups pg JOIN groups g ON g.id = pg.group_id WHERE pg.place_id = ? ORDER BY g.name')
    return rows.map(({ home_of, ...r }) => ({
      ...r, private: !!r.private, home: home_of != null, home_of, my_logs: r.my_logs ?? 0, mine: r.created_by === req.user.id, groups: r.private ? groupsOf.all(r.id) : [],
    }))
  }
  app.get('/api/places', auth, (req, res) => res.json(placesOf(req, { mine: req.query.mine === '1' }).map(({ home_of, ...r }) => r)))

  // Page d'un lieu : sa fiche (comme dans la liste), ce qu'on y boit, qui y boit, les dernières consos.
  // Invisible (404) pour qui ne peut pas voir le lieu, comme partout ailleurs.
  app.get('/api/places/:id(\\d+)', auth, (req, res) => {
    const id = Number(req.params.id)
    const [pl] = placesOf(req, { id })
    if (!pl) return bad(res, 'Lieu introuvable', 404)
    const { home_of, ...place } = pl
    const owner = home_of ? db.prepare('SELECT id, name, avatar_v FROM users WHERE id = ?').get(home_of) : null
    const creator = pl.created_by ? db.prepare('SELECT name FROM users WHERE id = ?').get(pl.created_by)?.name ?? null : null
    const stats = db.prepare(`SELECT ROUND(AVG(rating), 1) AS rating, COUNT(rating) AS ratings, MIN(day) AS first_day,
      ROUND(SUM(${UNITS()}), 1) AS units FROM drinks WHERE place_id = ?`).get(id)
    const drinks = db.prepare(`
      SELECT d.name, d.cat, MAX(d.product_id) AS product_id, MAX(p.photo_key) AS product_photo_key, COUNT(*) AS count,
        ROUND(AVG(d.rating), 1) AS rating, COUNT(DISTINCT d.user_id) AS drinkers
      FROM drinks d LEFT JOIN products p ON p.id = d.product_id
      WHERE d.place_id = ? GROUP BY COALESCE(d.product_id, d.name COLLATE NOCASE) ORDER BY count DESC, MAX(d.at) DESC LIMIT 12
    `).all(id)
    const people = db.prepare(`
      SELECT u.id, u.name, u.avatar_v, COUNT(*) AS count, MAX(d.at) AS last_at FROM drinks d JOIN users u ON u.id = d.user_id
      WHERE d.place_id = ? GROUP BY u.id ORDER BY count DESC, last_at DESC LIMIT 30
    `).all(id)
    const logs = db.prepare(`
      SELECT ${LOG_COLS}, u.name AS user_name, u.avatar_v FROM drinks d
      JOIN users u ON u.id = d.user_id LEFT JOIN products p ON p.id = d.product_id
      WHERE d.place_id = ? ORDER BY d.at DESC, d.id DESC LIMIT 30
    `).all(id)
    res.json({ ...place, owner, creator, ...stats, drinks, people, recent: logs.map(logOut) })
  })

  // Champs d'un lieu envoyés par le client (tout est facultatif dans le corps), validés pour le lieu `pl` :
  //   name                         renommer                      — son créateur, ou un admin
  //   private, groups: [id…]       visibilité et bandes autorisées — son créateur, ou un admin
  //   lat, lng (null, null = vider) position, pour le plan — créateur/admin ; les autres peuvent
  //                                 seulement remplir une position encore vide (comme la photo d'une boisson)
  //   address, description, photo  idem : les autres complètent seulement ce qui manque
  // → { set, groups } ou { error, status }
  const placeChanges = (b, pl, user) => {
    const owner = pl.created_by === user.id || user.is_admin
    const set = {}
    if ('name' in b) {
      const name = String(b.name ?? '').trim()
      if (pl.home_of != null) {
        // Le client renvoie le nom tel qu'affiché : on l'ignore s'il n'a pas changé
        if (!/^chez moi$/i.test(name)) return { error: '« Chez moi » ne se renomme pas : les autres le voient avec ton pseudo' }
      } else {
        if (!name || name.length > 60 || /\p{Cc}/u.test(name)) return { error: 'Nom de lieu entre 1 et 60 caractères' }
        if (/^chez moi$/i.test(name)) return { error: '« Chez moi » est réservé : choisis-le directement quand tu ajoutes un verre' }
        set.name = name
      }
    }
    if ('private' in b) set.private = b.private === true ? 1 : 0
    if ('lat' in b || 'lng' in b) {
      const clear = b.lat == null && b.lng == null
      const lat = Number(b.lat)
      const lng = Number(b.lng)
      if (!clear && !(Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180)) {
        return { error: 'Position invalide (latitude -90 à 90, longitude -180 à 180)' }
      }
      set.lat = clear ? null : Math.round(lat * 1e6) / 1e6
      set.lng = clear ? null : Math.round(lng * 1e6) / 1e6
    }
    for (const [k, label, max] of [['description', 'Description', 1000], ['address', 'Adresse', 150]]) {
      if (!(k in b)) continue
      const v = b[k] == null ? '' : String(b[k]).trim()
      if (v.length > max || (k === 'address' ? /\p{Cc}/u.test(v) : /[\p{Cc}--[\n\r\t]]/v.test(v))) return { error: `${label} : ${max} caractères maximum` }
      set[k] = v || null
    }
    if ('photo' in b) {
      const { log, error } = checkLog({ photo: b.photo })
      if (error) return { error }
      set.photo = log.photo
      set.photo_key = log.photo ? photoKey() : null
    }
    // Les autres (qui voient le lieu) peuvent seulement compléter ce qui manque : position, adresse, description,
    // photo — jamais sur un « Chez X »
    const fills = { lat: pl.lat == null, lng: pl.lng == null, address: pl.address == null, description: pl.description == null, photo: pl.photo == null, photo_key: pl.photo == null }
    const onlyFilling = pl.home_of == null && !('groups' in b) && Object.keys(set).length > 0
      && Object.entries(set).every(([k, v]) => fills[k] && v != null)
    if (!owner && !onlyFilling) return { error: "Seul celui qui l'a créé peut modifier ce lieu (les autres peuvent compléter ce qui manque)", status: 403 }
    const groups = Array.isArray(b.groups) ? b.groups.map(Number) : null
    if (groups?.some((g) => !isMember(g, user.id))) return { error: "Tu n'es pas dans cette bande", status: 403 }
    if (groups?.some(isOpenGroup)) return { error: 'La bande proposée à tous est ouverte : un lieu privé ne peut pas y être partagé' }
    // Pas deux lieux de même nom dans la même portée (public, ou privés d'une même personne)
    const name = set.name ?? pl.name
    const priv = set.private ?? pl.private
    const clash = pl.home_of == null && db.prepare(`SELECT 1 FROM places WHERE id != ? AND name = ? AND home_of IS NULL AND ${priv ? 'private = 1 AND created_by = ?' : 'private = 0'}`)
      .get(pl.id ?? 0, name, ...(priv ? [pl.created_by] : []))
    if (clash) return { error: priv ? 'Tu as déjà un lieu privé de ce nom' : 'Un lieu public porte déjà ce nom', status: 409 }
    return { set, groups, priv }
  }
  // Enregistre les changements validés par placeChanges (dans une transaction ouverte par l'appelant)
  const applyPlace = (id, { set, groups, priv }) => {
    for (const [k, v] of Object.entries(set)) db.prepare(`UPDATE places SET ${k} = ? WHERE id = ?`).run(v, id)
    if (!priv) db.prepare('DELETE FROM place_groups WHERE place_id = ?').run(id)
    else if (groups) {
      db.prepare('DELETE FROM place_groups WHERE place_id = ?').run(id)
      for (const g of groups) db.prepare('INSERT INTO place_groups (place_id, group_id) VALUES (?, ?)').run(id, g)
    }
  }

  // Créer un lieu depuis La carte › Lieux (sans passer par un verre) : mêmes champs que la modification,
  // le nom en plus (obligatoire). Public par défaut.
  app.post('/api/places', auth, (req, res) => {
    const b = { ...req.body, name: req.body.name ?? '' }
    const draft = { id: null, name: '', home_of: null, private: 0, created_by: req.user.id }
    const ch = placeChanges(b, draft, req.user)
    if (ch.error) return bad(res, ch.error, ch.status)
    db.exec('BEGIN')
    try {
      const id = Number(db.prepare('INSERT INTO places (name, private, created_by, created_at) VALUES (?, ?, ?, ?)')
        .run(ch.set.name, ch.priv ? 1 : 0, req.user.id, now()).lastInsertRowid)
      applyPlace(id, ch)
      db.exec('COMMIT')
      const { home_of, ...place } = placesOf(req, { id })[0]
      res.json(place)
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  })

  app.patch('/api/places/:id', auth, (req, res) => {
    const pl = db.prepare('SELECT * FROM places WHERE id = ?').get(Number(req.params.id))
    if (!pl || !canSeePlace.get(pl.id, req.user.id, req.user.id)) return bad(res, 'Lieu introuvable', 404)
    const ch = placeChanges(req.body, pl, req.user)
    if (ch.error) return bad(res, ch.error, ch.status)
    db.exec('BEGIN')
    applyPlace(pl.id, ch)
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
  // Onglet « Stats » d'un profil (public comme le reste du profil). Tout est calculé ici, sur les consos de la personne :
  // par mois, catégorie, jour de la semaine, heure ; calendrier de l'année ; séries et pauses ; ce mois contre le
  // précédent ; volumes et équivalences ; notes (face aux autres) ; découvertes ; lieux ; rythme ; eau et clopes ;
  // compagnons de verre (même journée, même lieu visible) ; et face à ma bande si la personne en fait partie.
  app.get('/api/users/:id(\\d+)/insights', auth, groupOrSolo, (req, res) => {
    const id = Number(req.params.id)
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) return bad(res, 'Joueur introuvable', 404)
    const rows = db.prepare('SELECT day, at, name, cat, cl, abv, product_id, rating, place_id FROM drinks WHERE user_id = ? ORDER BY at').all(id)
    const hm = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    const minOf = (at) => { const [h, m] = hm.format(at).split(':').map(Number); return (h % 24) * 60 + m }
    // Aujourd'hui (la journée court jusqu'à 6h)
    const todayDay = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now() - 6 * 3600e3)
    const DAY = 864e5
    const shift = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10)
    const r1 = (n) => round1(n)
    const box = () => ({ units: 0, count: 0 })

    const [ty, tm] = todayDay.split('-').map(Number)
    const months = Array.from({ length: 12 }, (_, i) => ({ month: new Date(Date.UTC(ty, tm - 12 + i, 1)).toISOString().slice(0, 7), ...box() }))
    const monthIdx = new Map(months.map((m, i) => [m.month, i]))
    const cats = Object.fromEntries(CATS.map((c) => [c, box()]))
    const weekdays = Array.from({ length: 7 }, box) // lundi = 0
    const hours = Array.from({ length: 24 }, box)
    const byDay = new Map() // jour → { units, count, alco, first, last } (minutes depuis 6h)
    const yearAgo = shift(todayDay, -364)
    const kinds = new Map() // boisson (fiche ou nom) → premier jour
    let cl = 0, pure = 0
    for (const r of rows) {
      const u = unitsOf(r)
      const add = (o) => { o.units += u; o.count++ }
      const mi = monthIdx.get(r.day.slice(0, 7))
      if (mi !== undefined) add(months[mi])
      if (cats[r.cat]) add(cats[r.cat])
      add(weekdays[(new Date(`${r.day}T12:00:00Z`).getUTCDay() + 6) % 7])
      const min = minOf(r.at)
      add(hours[Math.floor(min / 60)])
      const d = byDay.get(r.day) ?? { units: 0, count: 0, alco: 0, first: null, last: null }
      add(d)
      if (r.abv > 0) {
        d.alco++
        const m6 = (min - 360 + 1440) % 1440 // minutes depuis 6h : 1h du matin vient après 23h
        d.first = d.first == null ? m6 : Math.min(d.first, m6)
        d.last = d.last == null ? m6 : Math.max(d.last, m6)
      }
      byDay.set(r.day, d)
      cl += r.cl
      pure += (r.cl * r.abv) / 100
      const k = r.product_id ? `p${r.product_id}` : `n${r.name.toLowerCase()}`
      if (!kinds.has(k)) kinds.set(k, r.day)
    }

    // Calendrier : les 365 derniers jours bus
    const calendar = [...byDay].filter(([d]) => d >= yearAgo).map(([day, d]) => ({ day, units: r1(d.units), count: d.count }))

    // Séries (jours d'alcool consécutifs) et pauses (jours sans, entre le premier verre et aujourd'hui)
    const alcoDays = [...byDay].filter(([, d]) => d.alco).map(([day]) => day).sort()
    let streak = 0, run = 0
    let pause = { days: 0, from: null, current: false }
    alcoDays.forEach((d, i) => {
      run = i && shift(alcoDays[i - 1], 1) === d ? run + 1 : 1
      streak = Math.max(streak, run)
      if (i) {
        const gap = (Date.parse(d) - Date.parse(alcoDays[i - 1])) / DAY - 1
        if (gap > pause.days) pause = { days: gap, from: shift(alcoDays[i - 1], 1), current: false }
      }
    })
    if (alcoDays.length) {
      const gap = (Date.parse(todayDay) - Date.parse(alcoDays.at(-1))) / DAY
      if (gap > pause.days) pause = { days: gap, from: shift(alcoDays.at(-1), 1), current: true }
    }
    const curRun = alcoDays.at(-1) === todayDay || alcoDays.at(-1) === shift(todayDay, -1) ? run : 0

    // Ce mois-ci (jusqu'à aujourd'hui) contre le même nombre de jours le mois dernier
    const dom = Number(todayDay.slice(8))
    const prevMonth = new Date(Date.UTC(ty, tm - 2, 1)).toISOString().slice(0, 7)
    const period = (prefix) => {
      const o = { units: 0, count: 0, days: 0 }
      for (const [day, d] of byDay) {
        if (day.startsWith(prefix) && Number(day.slice(8)) <= dom) { o.units += d.units; o.count += d.count; if (d.alco) o.days++ }
      }
      return { ...o, units: r1(o.units) }
    }
    const trend = { now: period(todayDay.slice(0, 7)), before: period(prevMonth), dom }

    // Notes : moyenne, répartition, et écart avec la note moyenne des autres sur les mêmes fiches
    const ratings = rows.filter((r) => r.rating != null)
    const hist = Array(10).fill(0)
    for (const r of ratings) hist[r.rating - 1]++
    const vs = db.prepare(`
      SELECT AVG(me.rating - o.avg) AS diff, COUNT(*) AS n FROM drinks me
      JOIN (SELECT product_id, AVG(rating) AS avg FROM drinks WHERE user_id != ? AND rating IS NOT NULL AND product_id IS NOT NULL GROUP BY product_id) o
        ON o.product_id = me.product_id
      WHERE me.user_id = ? AND me.rating IS NOT NULL
    `).get(id, id)
    const critic = {
      count: ratings.length,
      avg: ratings.length ? r1(ratings.reduce((s, r) => s + r.rating, 0) / ratings.length) : null,
      hist,
      diff: vs.n ? r1(vs.diff) : null, // sur 10 (une demi-étoile = 1)
      compared: vs.n,
    }

    const alcoTotal = rows.filter((r) => r.abv > 0).length
    // Découvertes : boissons différentes, premières fois par mois, « déjà bues » sans conso
    const newByMonth = months.map((m) => ({ month: m.month, count: 0 }))
    for (const day of kinds.values()) { const i = monthIdx.get(day.slice(0, 7)); if (i !== undefined) newByMonth[i].count++ }
    const triedOnly = db.prepare(`SELECT COUNT(*) AS n FROM product_tried t WHERE t.user_id = ?
      AND NOT EXISTS (SELECT 1 FROM drinks WHERE user_id = t.user_id AND product_id = t.product_id)`).get(id).n
    // Fidèle ou explorateur : la part de la boisson la plus bue (hors café, énergisants et softs)
    const favCount = new Map()
    for (const r of rows) if (r.abv > 0) favCount.set(r.name, (favCount.get(r.name) ?? 0) + 1)
    const [favName, favN] = [...favCount].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
    const explore = { distinct: kinds.size, triedOnly, newByMonth, fav: favName, favShare: alcoTotal ? Math.round((favN / alcoTotal) * 100) : 0 }

    // Lieux : différents (visibles par moi), chez soi / ailleurs / sans lieu (des pourcentages : aucun lieu révélé)
    const home = db.prepare('SELECT id FROM places WHERE home_of = ?').get(id)?.id
    const withPlace = rows.filter((r) => r.place_id != null)
    const isVisible = db.prepare('SELECT place_visible(?) AS v')
    const visiblePlaces = new Set([...new Set(withPlace.map((r) => r.place_id))].filter((pid) => isVisible.get(pid).v))
    const places = {
      distinct: visiblePlaces.size,
      home: withPlace.filter((r) => r.place_id === home).length,
      out: withPlace.filter((r) => r.place_id !== home).length,
      none: rows.length - withPlace.length,
    }

    // Rythme : heure moyenne du premier et du dernier verre d'alcool d'une journée
    const alcoRows = [...byDay.values()].filter((d) => d.alco)
    const avgMin = (k) => (alcoRows.length ? Math.round(alcoRows.reduce((s, d) => s + d[k], 0) / alcoRows.length + 360) % 1440 : null)
    const rhythm = { first: avgMin('first'), last: avgMin('last'), perDay: alcoRows.length ? r1(alcoRows.reduce((s, d) => s + d.alco, 0) / alcoRows.length) : 0 }

    // Eau et clopes
    const ex = db.prepare(`SELECT SUM(kind = 'eau') AS eau, SUM(kind = 'clope') AS clope, COUNT(DISTINCT CASE WHEN kind = 'clope' THEN day END) AS clopeDays
      FROM extras WHERE user_id = ?`).get(id)
    const alcoCount = rows.filter((r) => r.abv > 0).length
    const extras = {
      eau: ex.eau ?? 0, clope: ex.clope ?? 0,
      eauPerDrink: alcoCount ? Math.round(((ex.eau ?? 0) / alcoCount) * 100) / 100 : 0,
      clopePerDay: ex.clopeDays ? r1(ex.clope / ex.clopeDays) : 0,
    }

    // Compagnons de verre : journées où quelqu'un a bu au même lieu (que je peux voir) le même jour
    const buddies = db.prepare(`
      SELECT u.id, u.name, u.avatar_v, COUNT(DISTINCT a.day) AS days FROM drinks a
      JOIN drinks b ON b.day = a.day AND b.place_id = a.place_id AND b.user_id != a.user_id
      JOIN users u ON u.id = b.user_id
      WHERE a.user_id = ? AND a.place_id IS NOT NULL AND place_visible(a.place_id)
      GROUP BY u.id ORDER BY days DESC, u.name LIMIT 3
    `).all(id)

    // Face à ma bande (si la personne en fait partie) : moyenne par jour bu, et rang par catégorie
    let band = null
    if (req.group && req.memberIds.includes(id) && req.memberIds.length > 1) {
      const ids = req.memberIds
      const ph = ids.map(() => '?').join(',')
      const per = db.prepare(`
        SELECT user_id, SUM(${UNITS()}) AS units, COUNT(DISTINCT day) AS days FROM drinks
        WHERE abv > 0 AND user_id IN (${ph}) GROUP BY user_id
      `).all(...ids)
      const avgs = per.filter((p) => p.days).map((p) => ({ id: p.user_id, avg: p.units / p.days, units: p.units }))
      const mine = avgs.find((a) => a.id === id)
      const catRows = db.prepare(`
        SELECT user_id, cat, SUM(${UNITS()}) AS units, COUNT(*) AS count FROM drinks WHERE user_id IN (${ph}) GROUP BY user_id, cat
      `).all(...ids)
      const rankIn = (list, v) => 1 + list.filter((x) => x > v).length
      band = {
        name: req.group.name,
        members: ids.length,
        avg: mine ? r1(mine.avg) : 0,
        bandAvg: avgs.length ? r1(avgs.reduce((s, a) => s + a.avg, 0) / avgs.length) : 0,
        rank: mine ? rankIn(avgs.map((a) => a.units), mine.units) : null,
        ranked: avgs.length,
        cats: CATS.map((c) => {
          const key = ALCO.includes(c) ? 'units' : 'count'
          const vals = catRows.filter((r) => r.cat === c)
          const me = vals.find((r) => r.user_id === id)?.[key] ?? 0
          return { cat: c, rank: me ? rankIn(vals.map((r) => r[key]), me) : null, of: vals.length }
        }).filter((c) => c.rank),
      }
    }

    res.json({
      total: rows.length,
      months: months.map((m) => ({ ...m, units: r1(m.units) })),
      cats: CATS.map((c) => ({ cat: c, units: r1(cats[c].units), count: cats[c].count })).filter((c) => c.count),
      weekdays: weekdays.map((w) => ({ ...w, units: r1(w.units) })),
      hours: hours.map((h) => ({ ...h, units: r1(h.units) })),
      calendar, today: todayDay,
      streak, curStreak: curRun, pause,
      trend,
      volume: { litres: r1(cl / 100), pure: Math.round((pure / 100) * 100) / 100, kcal: Math.round(rows.reduce((s, r) => s + unitsOf(r), 0) * 70) },
      critic, explore, places, rhythm, extras, buddies, band,
    })
  })

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
    // Comme l'onglet Boissons : une boisson de la carte = une ligne, quel que soit le volume ou le degré des verres
    const top = db.prepare(`
      SELECT COALESCE(MAX(p.name), d.name) AS name, COALESCE(MAX(p.cat), d.cat) AS cat,
        COALESCE(MAX(p.cl), d.cl) AS cl, COALESCE(MAX(p.abv), d.abv) AS abv,
        d.product_id, COUNT(*) AS count, ROUND(AVG(d.rating), 1) AS rating
      FROM drinks d LEFT JOIN products p ON p.id = d.product_id WHERE d.user_id = ?
      GROUP BY d.product_id, CASE WHEN d.product_id IS NULL THEN d.name END COLLATE NOCASE,
        CASE WHEN d.product_id IS NULL THEN d.cl END, CASE WHEN d.product_id IS NULL THEN d.abv END
      ORDER BY count DESC, MAX(d.at) DESC LIMIT 5
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
      places: db.prepare(`
        SELECT d.place_id AS id, place_label(d.place_id) AS name, pl.private, pl.home_of IS NOT NULL AS home, pl.photo_key,
          COUNT(*) AS count, COUNT(DISTINCT d.day) AS nights, MAX(d.at) AS last_at
        FROM drinks d JOIN places pl ON pl.id = d.place_id
        WHERE d.user_id = ? AND place_visible(d.place_id)
        GROUP BY d.place_id ORDER BY nights DESC, count DESC LIMIT 6
      `).all(id).map((r) => ({ ...r, private: !!r.private, home: !!r.home })),
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
  // Bière de la carte : volume « habituel » = celui de mon dernier verre de cette bière (sinon celui de la fiche).
  // C'est ce qui est bu en un tap et présélectionné ; default_cl reste le format de la fiche (pour la modifier).
  const PRODUCT_COLS = `p.id, p.name, p.cat, COALESCE(CASE WHEN p.cat = 'biere' THEN my_cl(p.id) END, p.cl) AS cl, p.cl AS default_cl,
    CASE WHEN p.cat = 'biere' THEN my_cl(p.id) END AS my_cl, p.abv, p.created_by, u.name AS created_by_name, p.photo_key,
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
    // Où on la boit le plus (seulement les lieux que je peux voir)
    const places = db.prepare(`
      SELECT d.place_id AS id, place_label(d.place_id) AS name, pl.private, pl.home_of IS NOT NULL AS home, pl.photo_key,
        COUNT(*) AS count, COUNT(DISTINCT d.user_id) AS drinkers, ROUND(AVG(d.rating), 1) AS rating
      FROM drinks d JOIN places pl ON pl.id = d.place_id
      WHERE d.product_id = ? AND place_visible(d.place_id)
      GROUP BY d.place_id ORDER BY count DESC, MAX(d.at) DESC LIMIT 6
    `).all(p.id).map((r) => ({ ...r, private: !!r.private, home: !!r.home }))
    res.json({
      ...productOut(p), hist, drinkers, mine: mine.n, marked, tried: marked || mine.n > 0, myRating: myLast?.rating ?? null,
      reviews: reviews.map(logOut), people, places, similar: similar.map(productOut),
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

  // Ajouter un produit à la carte (pas mis en favori : chacun choisit les siens)
  app.post('/api/products', auth, (req, res) => {
    const { drink, error } = checkDrink(req.body)
    if (error) return bad(res, error)
    const { log, error: photoError } = checkLog({ photo: req.body.photo })
    if (photoError) return bad(res, photoError)
    const { info, error: infoError } = checkInfo(req.body)
    if (infoError) return bad(res, infoError)
    const dup = db.prepare('SELECT id FROM products WHERE name = ? AND abv = ?').get(drink.name, drink.abv)
    if (dup) return bad(res, 'Cette boisson est déjà sur la carte (la contenance se choisit à chaque verre)', 409)
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO products (name, cat, cl, abv, created_by, photo, photo_key, maker, origin, style, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(drink.name, drink.cat, drink.cl, drink.abv, req.user.id, log.photo, log.photo ? photoKey() : null,
      info.maker ?? null, info.origin ?? null, info.style ?? null, info.description ?? null)
    const id = Number(lastInsertRowid)
    // Les consos déjà bues de cette boisson (par tout le monde) rejoignent sa fiche
    db.prepare('UPDATE drinks SET product_id = ? WHERE product_id IS NULL AND name = ? COLLATE NOCASE AND abv = ?').run(id, drink.name, drink.abv)
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
    const dup = db.prepare('SELECT id FROM products WHERE name = ? AND abv = ? AND id != ?')
      .get(drink.name, drink.abv, p.id)
    if (dup) return bad(res, 'Cette boisson est déjà sur la carte', 409)
    db.prepare('UPDATE products SET name = ?, cat = ?, cl = ?, abv = ? WHERE id = ?').run(drink.name, drink.cat, drink.cl, drink.abv, p.id)
    for (const [k, v] of Object.entries(info)) db.prepare(`UPDATE products SET ${k} = ? WHERE id = ?`).run(v, p.id)
    if ('photo' in log) db.prepare('UPDATE products SET photo = ?, photo_key = ? WHERE id = ?').run(log.photo, log.photo ? photoKey() : null, p.id)
    // Les consos sans lien qui correspondent au produit corrigé y sont rattachées
    db.prepare('UPDATE drinks SET product_id = ? WHERE product_id IS NULL AND name = ? COLLATE NOCASE AND abv = ?').run(p.id, drink.name, drink.abv)
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
