import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createApp } from '../app.js'
import { start, PINTE, SHOT, VIN } from './helpers.js'

let s
beforeEach(async () => (s = await start()))
afterEach(() => s.stop())

// Petit PNG 1×1 valide
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

describe('inscription / connexion', () => {
  test('inscription puis /me', async () => {
    const { token } = await s.register('Bob')
    const me = await s.call('GET', '/me', { token })
    assert.equal(me.status, 200)
    assert.equal(me.body.user.name, 'Bob')
  })

  test('pseudo déjà pris (insensible à la casse)', async () => {
    await s.register('Bob')
    const r = await s.call('POST', '/register', { body: { name: 'bob', pin: '1234' } })
    assert.equal(r.status, 409)
  })

  test('pseudo avec caractères de contrôle refusé (inscription et changement)', async () => {
    assert.equal((await s.call('POST', '/register', { body: { name: 'Bo\nb', pin: '1234' } })).status, 400)
    const { token } = await s.register('Bob')
    assert.equal((await s.call('PATCH', '/me', { token, body: { name: 'Bo\u0000b' } })).status, 400)
  })

  test('validation pseudo et PIN', async () => {
    assert.equal((await s.call('POST', '/register', { body: { name: 'B', pin: '1234' } })).status, 400)
    assert.equal((await s.call('POST', '/register', { body: { name: 'Bob', pin: '12' } })).status, 400)
    assert.equal((await s.call('POST', '/register', { body: { name: 'Bob', pin: 'abcd' } })).status, 400)
  })

  test('connexion OK, mauvais PIN, pseudo inconnu', async () => {
    await s.register('Bob', '1234')
    assert.equal((await s.call('POST', '/login', { body: { name: 'Bob', pin: '1234' } })).status, 200)
    const wrong = await s.call('POST', '/login', { body: { name: 'Bob', pin: '0000' } })
    const unknown = await s.call('POST', '/login', { body: { name: 'Nobody', pin: '0000' } })
    assert.equal(wrong.status, 401)
    assert.equal(unknown.status, 401)
    assert.equal(wrong.body.error, unknown.body.error) // même message : on ne révèle pas quels pseudos existent
  })

  test('blocage après 5 PIN faux, même avec le bon PIN', async () => {
    await s.register('Bob', '1234')
    for (let i = 0; i < 5; i++) assert.equal((await s.call('POST', '/login', { body: { name: 'Bob', pin: '0000' } })).status, 401)
    const locked = await s.call('POST', '/login', { body: { name: 'Bob', pin: '1234' } })
    assert.equal(locked.status, 429)
    assert.match(locked.body.error, /Trop d'essais/)
  })

  test('déconnexion invalide le token', async () => {
    const { token } = await s.register('Bob')
    await s.call('POST', '/logout', { token })
    assert.equal((await s.call('GET', '/me', { token })).status, 401)
  })

  test("code d'invitation requis quand configuré", async () => {
    const s2 = await start({ inviteCode: 'secret' })
    try {
      assert.deepEqual((await s2.call('GET', '/config')).body, { inviteRequired: true })
      assert.equal((await s2.call('POST', '/register', { body: { name: 'Bob', pin: '1234' } })).status, 403)
      assert.equal((await s2.call('POST', '/register', { body: { name: 'Bob', pin: '1234', invite: 'secret' } })).status, 200)
    } finally {
      await s2.stop()
    }
  })
})

describe('robustesse', () => {
  test('requête sans corps → 400 en JSON, pas 500', async () => {
    const r = await s.call('POST', '/login')
    assert.equal(r.status, 401)
    assert.equal(typeof r.body.error, 'string')
  })

  test('JSON mal formé → 400 JSON invalide', async () => {
    const r = await s.call('POST', '/login', { raw: '{oops' })
    assert.equal(r.status, 400)
    assert.equal(r.body.error, 'JSON invalide')
  })

  test('routes protégées sans token → 401', async () => {
    for (const p of ['/me', '/users', '/leaderboard?from=2026-11-01&to=2026-11-03', '/drinks/me?from=2026-11-01&to=2026-11-03', '/drinks/favorites', '/products', '/products/favorites', '/series?from=2026-11-01&to=2026-11-03']) {
      assert.equal((await s.call('GET', p)).status, 401, p)
    }
  })
})

describe('consos', () => {
  test('ajouter puis relire, score en verres standard calculé sur le volume et le degré', async () => {
    const { token } = await s.register('Bob')
    const r = await s.drink(token, '2026-11-02')
    assert.equal(r.status, 200)
    assert.equal(r.body.units, 2) // 50 cl à 5 % = 20 g d'alcool pur
    assert.equal((await s.drink(token, '2026-11-02', SHOT)).body.units, 1.3) // 4 cl à 40 % = 12,8 g
    const list = (await s.call('GET', '/drinks/me?from=2026-11-01&to=2026-11-03', { token })).body
    assert.deepEqual(list.map((d) => [d.name, d.cl, d.abv, d.units]), [['Shot', 4, 40, 1.3], ['Pinte', 50, 5, 2]])
  })

  test('une pinte de triple ne vaut pas une pinte de blonde', async () => {
    const { token } = await s.register('Bob')
    assert.equal((await s.drink(token, '2026-11-02', { name: 'Triple', abv: 8.5 })).body.units, 3.4)
  })

  test('supprimer une conso : seulement les siennes', async () => {
    const a = await s.register('Alice')
    const b = await s.register('Bob')
    const { id } = (await s.drink(a.token, '2026-11-02')).body
    assert.equal((await s.call('DELETE', `/drinks/${id}`, { token: b.token })).status, 404)
    assert.equal((await s.call('DELETE', `/drinks/${id}`, { token: a.token })).status, 200)
    assert.deepEqual((await s.call('GET', '/drinks/me?from=2026-11-02&to=2026-11-02', { token: a.token })).body, [])
  })

  test('valeurs invalides refusées', async () => {
    const { token } = await s.register('Bob')
    for (const d of [{ cl: 0 }, { cl: 201 }, { abv: -1 }, { abv: 101 }, { abv: 'fort' }, { cat: 'soda' }, { name: '' }, { name: 'x'.repeat(41) }]) {
      assert.equal((await s.drink(token, '2026-11-02', d)).status, 400, JSON.stringify(d))
    }
  })

  test('dates invalides ou dans le futur refusées', async () => {
    const { token } = await s.register('Bob')
    assert.equal((await s.drink(token, '2026-02-30')).status, 400)
    assert.equal((await s.drink(token, '2026-11-10')).status, 400)
    assert.equal((await s.drink(token, '2026-11-04')).status, 200) // marge fuseaux
  })

  test('boissons habituelles : les plus bues en premier', async () => {
    const { token } = await s.register('Bob')
    await s.drink(token, '2026-11-01', SHOT)
    await s.drink(token, '2026-11-02', {}, 3)
    await s.drink(token, '2026-11-02', { abv: 8 })
    const fav = (await s.call('GET', '/drinks/favorites', { token })).body
    assert.deepEqual(fav.map((f) => [f.name, f.abv, f.count]), [['Pinte', 5, 3], ['Pinte', 8, 1], ['Shot', 40, 1]])
  })
})

describe('classement', () => {
  test('tri par verres standard, détail par catégorie et nombre de consos', async () => {
    const a = await s.register('Alice')
    const b = await s.register('Bob')
    await s.drink(a.token, '2026-11-02', SHOT, 3) // 3,84
    await s.drink(b.token, '2026-11-02', {}, 2) // 4
    await s.drink(b.token, '2026-11-02', VIN) // 1,2
    const r = (await s.call('GET', '/leaderboard?from=2026-11-02&to=2026-11-02', { token: a.token })).body
    assert.deepEqual(r.map((x) => [x.name, x.total, x.count]), [['Bob', 5.2, 3], ['Alice', 3.8, 3]])
    assert.equal(r[0].biere, 4)
    assert.equal(r[0].vin, 1.2)
  })

  test('badge suspect au-delà de 30 verres standard dans une soirée', async () => {
    const a = await s.register('Alice')
    await s.drink(a.token, '2026-11-01', {}, 16) // 32
    await s.drink(a.token, '2026-11-02', {}, 15) // 30 : pile la limite, pas suspect
    const r = await s.call('GET', '/leaderboard?from=2026-11-01&to=2026-11-02', { token: a.token })
    assert.equal(r.body[0].suspect_days, 1)
    assert.equal(r.body[0].days, 2)
  })

  test('victoires : soirées gagnées, soirée en cours exclue, ex æquo tous gagnants', async () => {
    const a = await s.register('Alice')
    const b = await s.register('Bob')
    await s.drink(a.token, '2026-11-01', {}, 2)
    await s.drink(b.token, '2026-11-01', {}, 1)
    await s.drink(a.token, '2026-11-02', SHOT, 3)
    await s.drink(b.token, '2026-11-02', SHOT, 3)
    await s.drink(b.token, '2026-11-03', {}, 10)
    const r = await s.call('GET', '/leaderboard?from=2026-11-01&to=2026-11-03&winsBefore=2026-11-03', { token: a.token })
    assert.deepEqual(Object.fromEntries(r.body.map((x) => [x.name, x.wins])), { Alice: 2, Bob: 1 })
  })

  test('inactifs depuis 7 jours masqués, sauf moi ; période terminée = participants visibles', async () => {
    const me = await s.register('Moi')
    const active = await s.register('Actif')
    const ghost = await s.register('Fantome')
    await s.drink(active.token, '2026-11-01')
    await s.drink(ghost.token, '2026-10-15')
    const now = await s.call('GET', '/leaderboard?from=2000-01-01&to=2026-11-03&activeSince=2026-10-27&ended=0', { token: me.token })
    assert.deepEqual(now.body.map((x) => x.name).sort(), ['Actif', 'Moi'])
    const past = await s.call('GET', '/leaderboard?from=2026-10-15&to=2026-10-15&activeSince=2026-10-08&ended=1', { token: me.token })
    assert.ok(past.body.some((x) => x.name === 'Fantome'))
  })

  test('période invalide refusée', async () => {
    const { token } = await s.register('Bob')
    assert.equal((await s.call('GET', '/leaderboard?from=2026-11-01&to=2026-11-31', { token })).status, 400)
  })

  test('séries journalières par catégorie pour les graphes', async () => {
    const a = await s.register('Alice')
    await s.drink(a.token, '2026-11-02', {}, 2)
    await s.drink(a.token, '2026-11-02', SHOT)
    await s.drink(a.token, '2026-11-02', { name: 'Monster', cat: 'energy', cl: 50, abv: 0 })
    const r = await s.call('GET', '/series?from=2026-11-01&to=2026-11-03', { token: a.token })
    // Verres standard par catégorie alcoolisée, et nombre de consos par catégorie (sans alcool compris)
    assert.deepEqual(r.body, [{
      user_id: a.id, day: '2026-11-02', biere: 4, vin: 0, fort: 1.3, cocktail: 0, autre: 0,
      n_biere: 2, n_vin: 0, n_fort: 1, n_cocktail: 0, n_autre: 0, n_energy: 1, n_soft: 0, n_chaud: 0, total: 5.3, count: 4,
    }])
  })
})

describe('fiche joueur', () => {
  test('stats depuis le début, record, victoires, préférées, détail d’une soirée', async () => {
    const a = await s.register('Alice')
    const b = await s.register('Bob')
    await s.drink(a.token, '2026-11-01', {}, 3) // 6
    await s.drink(a.token, '2026-11-02', SHOT, 2) // 2,56
    await s.drink(a.token, '2026-11-02', VIN) // 1,2
    await s.drink(b.token, '2026-11-02', {}, 3) // Bob gagne le 2
    const r = await s.call('GET', `/users/${a.id}/stats?day=2026-11-02&winsBefore=2026-11-03`, { token: b.token })
    assert.equal(r.status, 200)
    assert.equal(r.body.user.name, 'Alice')
    assert.equal(r.body.nights, 2)
    assert.equal(r.body.count, 6)
    assert.equal(r.body.units, 9.8)
    assert.equal(r.body.avg, 4.9)
    assert.deepEqual(r.body.record, { day: '2026-11-01', units: 6 })
    assert.equal(r.body.wins, 1)
    assert.equal(r.body.byCat.biere, 6)
    assert.deepEqual(r.body.top.map((t) => [t.name, t.count]), [['Pinte', 3], ['Shot', 2], ['Vin rouge', 1]])
    assert.deepEqual(r.body.recent.map((n) => n.day), ['2026-11-02', '2026-11-01'])
    assert.deepEqual(r.body.drinks.map((d) => d.name), ['Vin rouge', 'Shot', 'Shot'])
  })

  test('joueur sans conso, inconnu, date invalide', async () => {
    const a = await s.register('Alice')
    const r = await s.call('GET', `/users/${a.id}/stats`, { token: a.token })
    assert.deepEqual([r.body.nights, r.body.units, r.body.record, r.body.drinks], [0, 0, null, []])
    assert.equal((await s.call('GET', '/users/999/stats', { token: a.token })).status, 404)
    assert.equal((await s.call('GET', `/users/${a.id}/stats?day=hier`, { token: a.token })).status, 400)
  })
})

describe('la carte', () => {
  const CHOUFFE = { name: 'Chouffe', cat: 'biere', cl: 33, abv: 8 }

  test('ajouter un produit : visible par tous, en favori pour son auteur', async () => {
    const a = await s.register('Alice')
    const b = await s.register('Bob')
    const r = await s.call('POST', '/products', { token: a.token, body: CHOUFFE })
    assert.equal(r.status, 200)
    assert.equal(r.body.units, 2.1)
    assert.equal(r.body.created_by_name, 'Alice')
    assert.deepEqual((await s.call('GET', '/products/favorites', { token: a.token })).body.map((p) => p.name), ['Chouffe'])
    const seenByBob = (await s.call('GET', '/products', { token: b.token })).body
    assert.deepEqual(seenByBob.map((p) => [p.name, p.fav, p.favs]), [['Chouffe', false, 1]])
  })

  test('doublon refusé (même nom sans la casse, même volume, même degré) ; autre volume accepté', async () => {
    const a = await s.register('Alice')
    await s.call('POST', '/products', { token: a.token, body: CHOUFFE })
    assert.equal((await s.call('POST', '/products', { token: a.token, body: { ...CHOUFFE, name: 'chouffe' } })).status, 409)
    assert.equal((await s.call('POST', '/products', { token: a.token, body: { ...CHOUFFE, cl: 50 } })).status, 200)
  })

  test('produit invalide refusé', async () => {
    const a = await s.register('Alice')
    assert.equal((await s.call('POST', '/products', { token: a.token, body: { ...CHOUFFE, abv: -2 } })).status, 400)
    assert.equal((await s.call('POST', '/products', { token: a.token, body: { ...CHOUFFE, name: '' } })).status, 400)
  })

  test('favoris : ajout, ordre d’ajout, retrait, idempotent', async () => {
    const a = await s.register('Alice')
    const b = await s.register('Bob')
    const p1 = (await s.call('POST', '/products', { token: a.token, body: CHOUFFE })).body
    const p2 = (await s.call('POST', '/products', { token: a.token, body: { name: 'Ricard', cat: 'fort', cl: 2, abv: 45 } })).body
    s.clock.t += 1000
    await s.call('PUT', `/products/${p2.id}/fav`, { token: b.token })
    s.clock.t += 1000
    const r = await s.call('PUT', `/products/${p1.id}/fav`, { token: b.token })
    assert.equal(r.body.fav, true)
    assert.equal(r.body.favs, 2)
    await s.call('PUT', `/products/${p1.id}/fav`, { token: b.token })
    assert.deepEqual((await s.call('GET', '/products/favorites', { token: b.token })).body.map((p) => p.name), ['Ricard', 'Chouffe'])
    await s.call('DELETE', `/products/${p2.id}/fav`, { token: b.token })
    assert.deepEqual((await s.call('GET', '/products/favorites', { token: b.token })).body.map((p) => p.name), ['Chouffe'])
    assert.equal((await s.call('PUT', '/products/999/fav', { token: b.token })).status, 404)
  })

  test('retirer de la carte : seulement l’auteur, et ça disparaît des favoris de tous', async () => {
    const a = await s.register('Alice')
    const b = await s.register('Bob')
    const p = (await s.call('POST', '/products', { token: a.token, body: CHOUFFE })).body
    await s.call('PUT', `/products/${p.id}/fav`, { token: b.token })
    assert.equal((await s.call('DELETE', `/products/${p.id}`, { token: b.token })).status, 403)
    assert.equal((await s.call('DELETE', `/products/${p.id}`, { token: a.token })).status, 200)
    assert.deepEqual((await s.call('GET', '/products/favorites', { token: b.token })).body, [])
  })
})

describe('admins', () => {
  const CHOUFFE = { name: 'Chouffe', cat: 'biere', cl: 33, abv: 8 }

  test('un admin (pseudo dans la config, sans la casse) peut retirer le produit de quelqu’un d’autre', async () => {
    const s2 = await start({ admins: ['boss'] })
    try {
      const a = await s2.register('Alice')
      const boss = await s2.register('Boss')
      assert.equal((await s2.call('GET', '/me', { token: boss.token })).body.user.is_admin, true)
      assert.equal((await s2.call('GET', '/me', { token: a.token })).body.user.is_admin, false)
      const p = (await s2.call('POST', '/products', { token: a.token, body: CHOUFFE })).body
      assert.equal((await s2.call('DELETE', `/products/${p.id}`, { token: boss.token })).status, 200)
    } finally {
      await s2.stop()
    }
  })

  test('changer de pseudo ne permet pas de devenir admin… sauf à prendre un pseudo admin', async () => {
    const s2 = await start({ admins: ['boss'] })
    try {
      const a = await s2.register('Alice')
      const r = await s2.call('PATCH', '/me', { token: a.token, body: { name: 'Boss' } })
      assert.equal(r.body.user.is_admin, true) // le pseudo était libre : c'est la config qui décide
      await s2.call('PATCH', '/me', { token: a.token, body: { name: 'Alice2' } })
      assert.equal((await s2.call('GET', '/me', { token: a.token })).body.user.is_admin, false)
    } finally {
      await s2.stop()
    }
  })
})

describe('bandes', () => {
  test('créer, rejoindre par code, classement entre membres de la bande seulement', async () => {
    const a = await s.register('Alice', '1234', { group: false })
    const b = await s.register('Bob', '1234', { group: false })
    const c = await s.register('Chloé', '1234', { group: false })
    assert.equal((await s.call('GET', '/users', { token: a.token })).body.code, 'NO_GROUP')
    const g = (await s.call('POST', '/groups', { token: a.token, body: { name: 'Les Pochtrons' } })).body
    assert.match(g.code, /^[A-Z2-9]{6}$/)
    assert.equal((await s.call('POST', '/groups/join', { token: b.token, body: { code: g.code.toLowerCase() } })).body.members, 2)
    assert.equal((await s.call('POST', '/groups/join', { token: c.token, body: { code: 'ZZZZZZ' } })).status, 404)
    await s.call('POST', '/groups', { token: c.token, body: { name: 'Solo' } })
    await s.drink(c.token, '2026-11-02', {}, 5)
    await s.drink(b.token, '2026-11-02')
    const lb = (await s.call('GET', '/leaderboard?from=2026-11-02&to=2026-11-02', { token: a.token })).body
    assert.deepEqual(lb.map((r) => r.name), ['Bob', 'Alice'])
    // Le profil de Chloé reste visible (recherche), mais marqué hors bande
    assert.equal((await s.call('GET', `/users/${c.id}/stats`, { token: a.token })).body.inBand, false)
  })

  test('sans bande (solo) : on boit, on voit sa fiche et celle des autres (hors bande), pas le classement', async () => {
    const a = await s.register('Alice', '1234', { group: false })
    const b = await s.register('Bob', '1234', { group: false })
    assert.equal((await s.drink(a.token, '2026-11-02')).status, 200)
    const me = await s.call('GET', `/users/${a.id}/stats?day=2026-11-02`, { token: a.token })
    assert.equal(me.status, 200)
    assert.deepEqual([me.body.units, me.body.wins, me.body.drinks.length], [2, 0, 1])
    const other = await s.call('GET', `/users/${b.id}/stats`, { token: a.token })
    assert.deepEqual([other.status, other.body.inBand], [200, false])
    assert.equal((await s.call('GET', '/users/9999/stats', { token: a.token })).status, 404)
    assert.equal((await s.call('GET', '/leaderboard?from=2026-11-02&to=2026-11-02', { token: a.token })).body.code, 'NO_GROUP')
  })

  test('inscription avec un code de bande ; code inconnu refusé', async () => {
    const a = await s.register('Alice', '1234', { group: false })
    const g = (await s.call('POST', '/groups', { token: a.token, body: { name: 'Bar' } })).body
    const r = await s.call('POST', '/register', { body: { name: 'Bob', pin: '1234', group: g.code } })
    assert.deepEqual((await s.call('GET', '/groups', { token: r.body.token })).body.map((x) => x.name), ['Bar'])
    assert.equal((await s.call('POST', '/register', { body: { name: 'Zed', pin: '1234', group: 'NOPE00' } })).status, 404)
  })

  test('en-tête X-Group : choisir sa bande, refusé si on n’en est pas', async () => {
    const a = await s.register('Alice', '1234', { group: false })
    const b = await s.register('Bob', '1234', { group: false })
    const g1 = (await s.call('POST', '/groups', { token: a.token, body: { name: 'Un' } })).body
    const g2 = (await s.call('POST', '/groups', { token: a.token, body: { name: 'Deux' } })).body
    await s.call('POST', '/groups/join', { token: b.token, body: { code: g2.code } })
    const users = (id) => s.call('GET', '/users', { token: a.token, headers: { 'X-Group': String(id) } })
    assert.deepEqual((await users(g1.id)).body.map((u) => u.name), ['Alice'])
    assert.deepEqual((await users(g2.id)).body.map((u) => u.name), ['Alice', 'Bob'])
    assert.equal((await s.call('GET', '/users', { token: b.token, headers: { 'X-Group': String(g1.id) } })).status, 409)
  })

  test('une seule carte pour tout le monde, quelle que soit la bande (et même en solo)', async () => {
    const a = await s.register('Alice', '1234', { group: false })
    const solo = await s.register('Solo', '1234', { group: false })
    const g1 = (await s.call('POST', '/groups', { token: a.token, body: { name: 'Un' } })).body
    const g2 = (await s.call('POST', '/groups', { token: a.token, body: { name: 'Deux' } })).body
    const add = (g) => s.call('POST', '/products', { token: a.token, headers: { 'X-Group': String(g.id) }, body: SHOT })
    assert.equal((await add(g1)).status, 200)
    assert.equal((await add(g2)).status, 409) // déjà sur la carte commune
    const list = (await s.call('GET', '/products', { token: a.token, headers: { 'X-Group': String(g2.id) } })).body
    assert.equal(list.length, 1)
    assert.deepEqual((await s.call('GET', '/products', { token: solo.token })).body.map((p) => p.name), ['Shot'])
    assert.equal((await s.call('PUT', `/products/${list[0].id}/fav`, { token: solo.token })).status, 200)
    assert.deepEqual((await s.call('GET', '/products/favorites', { token: solo.token })).body.map((p) => p.name), ['Shot'])
  })

  test('quitter : le patron passe la main, la bande vide disparaît', async () => {
    const a = await s.register('Alice', '1234', { group: false })
    const b = await s.register('Bob', '1234', { group: false })
    const g = (await s.call('POST', '/groups', { token: a.token, body: { name: 'Bar' } })).body
    await s.call('POST', '/groups/join', { token: b.token, body: { code: g.code } })
    await s.call('DELETE', `/groups/${g.id}/members/me`, { token: a.token })
    assert.equal((await s.call('GET', '/groups', { token: b.token })).body[0].owner_id, b.id)
    await s.call('DELETE', `/groups/${g.id}/members/me`, { token: b.token })
    assert.equal((await s.call('POST', '/groups/join', { token: a.token, body: { code: g.code } })).status, 404)
  })
})

describe('eau et clopes', () => {
  test('comptées à part, hors score, visibles au classement et dans la fiche', async () => {
    const a = await s.register('Alice')
    await s.drink(a.token, '2026-11-02')
    const e = await s.call('POST', '/extras', { token: a.token, body: { day: '2026-11-02', kind: 'eau' } })
    assert.equal(e.body.count, 1)
    await s.call('POST', '/extras', { token: a.token, body: { day: '2026-11-02', kind: 'clope' } })
    await s.call('POST', '/extras', { token: a.token, body: { day: '2026-11-02', kind: 'clope' } })
    const lb = (await s.call('GET', '/leaderboard?from=2026-11-02&to=2026-11-02', { token: a.token })).body[0]
    assert.deepEqual([lb.total, lb.eau, lb.clope], [2, 1, 2])
    const st = (await s.call('GET', `/users/${a.id}/stats?day=2026-11-02`, { token: a.token })).body
    assert.deepEqual([st.eau, st.clope, st.tonight.clope], [1, 2, 2])
    assert.equal((await s.call('DELETE', `/extras/${e.body.id}`, { token: a.token })).status, 200)
    assert.equal((await s.call('GET', '/extras/me?from=2026-11-02&to=2026-11-02', { token: a.token })).body.length, 2)
  })

  test('type inconnu refusé', async () => {
    const a = await s.register('Alice')
    assert.equal((await s.call('POST', '/extras', { token: a.token, body: { day: '2026-11-02', kind: 'joint' } })).status, 400)
  })
})

describe('badges', () => {
  test('débloqués renvoyés à l’ajout (une seule fois), liste complète dans la fiche', async () => {
    const a = await s.register('Alice')
    s.clock.t = Date.parse('2026-11-02T21:00:00+01:00') // 21h : pas d'« apéro dès midi »
    const first = await s.drink(a.token, '2026-11-02')
    assert.deepEqual(first.body.badges.map((b) => b.key), ['premiere'])
    assert.deepEqual((await s.drink(a.token, '2026-11-02')).body.badges, [])
    await s.drink(a.token, '2026-11-02', {}, 2)
    const fifth = await s.drink(a.token, '2026-11-02') // horloge figée : 5 verres « en même temps »
    assert.ok(fifth.body.badges.some((b) => b.key === 'tournee'))
    const st = (await s.call('GET', `/users/${a.id}/stats`, { token: a.token })).body
    assert.ok(st.badges.find((b) => b.key === 'tournee').got)
    assert.equal(st.badges.find((b) => b.key === 'chameau').got, false)
  })
})

describe('modifier un produit', () => {
  test('auteur seulement (le patron de la bande non) ; doublon refusé', async () => {
    const owner = await s.register('Patron') // crée la bande de test
    const a = await s.register('Alice')
    const b = await s.register('Bob')
    const p = (await s.call('POST', '/products', { token: a.token, body: { name: 'Chouffe', cat: 'biere', cl: 33, abv: 7 } })).body
    await s.call('POST', '/products', { token: a.token, body: { name: 'Leffe', cat: 'biere', cl: 33, abv: 6.6 } })
    const fix = { name: 'Chouffe', cat: 'biere', cl: 33, abv: 8 }
    assert.equal((await s.call('PATCH', `/products/${p.id}`, { token: b.token, body: fix })).status, 403)
    const r = await s.call('PATCH', `/products/${p.id}`, { token: a.token, body: fix })
    assert.equal(r.body.abv, 8)
    assert.equal(r.body.units, 2.1)
    assert.equal((await s.call('PATCH', `/products/${p.id}`, { token: owner.token, body: { ...fix, name: 'Chouffe Houblon' } })).status, 403)
    assert.equal((await s.call('PATCH', `/products/${p.id}`, { token: a.token, body: { name: 'Leffe', cat: 'biere', cl: 33, abv: 6.6 } })).status, 409)
  })
})

describe('migration', () => {
  test('carte et joueurs d’avant les bandes : tout le monde rejoint « La bande »', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'alcool-test-'))
    const file = path.join(dir, 'old.db')
    const old = new DatabaseSync(file)
    old.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        pin_hash TEXT NOT NULL, avatar TEXT, avatar_v INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE, cat TEXT NOT NULL,
        cl REAL NOT NULL, abv REAL NOT NULL, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (name, cl, abv));
      CREATE TABLE product_favs (user_id INTEGER NOT NULL, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL, PRIMARY KEY (user_id, product_id));
      INSERT INTO users (name, pin_hash) VALUES ('Vieux', 'x:y'), ('Vieille', 'x:y');
      INSERT INTO products (name, cat, cl, abv, created_by) VALUES ('Chouffe', 'biere', 33, 8, 1);
      INSERT INTO product_favs VALUES (2, 1, 0);
    `)
    old.close()
    const { db, close } = createApp({ dbPath: file })
    try {
      const g = db.prepare('SELECT * FROM groups').get()
      assert.equal(g.name, 'La bande')
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?').get(g.id).n, 2)
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM products').get().n, 1) // la carte reste, commune
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM product_favs').get().n, 1) // favoris conservés
    } finally {
      close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('une carte par bande → une carte commune : doublons fusionnés, favoris suivis', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'alcool-test-'))
    const file = path.join(dir, 'bandes.db')
    createApp({ dbPath: file }).close() // schéma actuel, puis on remet l'ancienne table products
    const old = new DatabaseSync(file)
    old.exec(`
      PRAGMA foreign_keys = OFF;
      INSERT INTO users (name, pin_hash) VALUES ('A', 'x:y'), ('B', 'x:y');
      INSERT INTO groups (name, code, owner_id) VALUES ('Un', 'AAAAAA', 1), ('Deux', 'BBBBBB', 2);
      DROP TABLE products;
      CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER NOT NULL, name TEXT NOT NULL COLLATE NOCASE,
        cat TEXT NOT NULL, cl REAL NOT NULL, abv REAL NOT NULL, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (group_id, name, cl, abv));
      INSERT INTO products (group_id, name, cat, cl, abv, created_by) VALUES
        (1, 'Chouffe', 'biere', 33, 8, 1), (1, 'Ricard', 'fort', 2, 45, 1), (2, 'chouffe', 'biere', 33, 8, 2);
      INSERT INTO product_favs VALUES (1, 1, 5), (1, 3, 9), (2, 3, 7);
    `)
    old.close()
    const { db, close } = createApp({ dbPath: file })
    try {
      const cols = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name)
      assert.ok(!cols.includes('group_id'))
      assert.deepEqual(db.prepare('SELECT id, name FROM products ORDER BY id').all().map((r) => ({ ...r })), [
        { id: 1, name: 'Chouffe' }, { id: 2, name: 'Ricard' },
      ])
      assert.deepEqual(db.prepare('SELECT user_id, product_id, created_at FROM product_favs ORDER BY user_id').all().map((r) => ({ ...r })), [
        { user_id: 1, product_id: 1, created_at: 5 }, { user_id: 2, product_id: 1, created_at: 7 },
      ])
    } finally {
      close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('ancienne table entries (compteurs) convertie en consos', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'alcool-test-'))
    const file = path.join(dir, 'old.db')
    const old = new DatabaseSync(file)
    old.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        pin_hash TEXT NOT NULL, avatar TEXT, avatar_v INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE entries (user_id INTEGER NOT NULL, day TEXT NOT NULL, updated_at TEXT, biere INTEGER NOT NULL DEFAULT 0,
        pinte INTEGER NOT NULL DEFAULT 0, vin INTEGER NOT NULL DEFAULT 0, shot INTEGER NOT NULL DEFAULT 0,
        cocktail INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day));
      INSERT INTO users (name, pin_hash) VALUES ('Vieux', 'x:y');
      INSERT INTO entries (user_id, day, pinte, shot) VALUES (1, '2026-10-01', 2, 1);
    `)
    old.close()
    const { db, close } = createApp({ dbPath: file })
    try {
      assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'entries'").get(), undefined)
      const rows = db.prepare('SELECT name, cat, cl, abv FROM drinks ORDER BY id').all().map((r) => [r.name, r.cat, r.cl, r.abv])
      assert.deepEqual(rows, [['Pinte', 'biere', 50, 5], ['Pinte', 'biere', 50, 5], ['Shot', 'fort', 3, 40]])
    } finally {
      close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('profil', () => {
  test('changer de pseudo (pris / OK)', async () => {
    const { token } = await s.register('Bob')
    await s.register('Alice')
    assert.equal((await s.call('PATCH', '/me', { token, body: { name: 'alice' } })).status, 409)
    assert.equal((await s.call('PATCH', '/me', { token, body: { name: 'Bobby' } })).body.user.name, 'Bobby')
  })

  test('changer de PIN déconnecte les autres appareils', async () => {
    const { token } = await s.register('Bob', '1234')
    const other = (await s.call('POST', '/login', { body: { name: 'Bob', pin: '1234' } })).body.token
    assert.equal((await s.call('PUT', '/me/pin', { token, body: { current: '0000', next: '5555' } })).status, 403)
    assert.equal((await s.call('PUT', '/me/pin', { token, body: { current: '1234', next: '5555' } })).status, 200)
    assert.equal((await s.call('GET', '/me', { token })).status, 200)
    assert.equal((await s.call('GET', '/me', { token: other })).status, 401)
    assert.equal((await s.call('POST', '/login', { body: { name: 'Bob', pin: '5555' } })).status, 200)
  })

  test('photo : envoi, lecture publique en cache, suppression', async () => {
    const { token, id } = await s.register('Bob')
    assert.equal((await s.call('PUT', '/me/avatar', { token, body: { dataUrl: 'javascript:alert(1)' } })).status, 400)
    const up = await s.call('PUT', '/me/avatar', { token, body: { dataUrl: PNG } })
    assert.ok(up.body.avatar_v > 0)
    const img = await s.call('GET', `/avatar/${id}`)
    assert.equal(img.status, 200)
    assert.equal(img.headers.get('content-type'), 'image/png')
    assert.match(img.headers.get('cache-control'), /immutable/)
    await s.call('DELETE', '/me/avatar', { token })
    assert.equal((await s.call('GET', `/avatar/${id}`)).status, 404)
  })
})

describe('journal : note, avis, photo', () => {
  const MONSTER = { name: 'Monster Ultra', cat: 'energy', cl: 50, abv: 0 }

  test('conso notée avec avis et photo, complétée après coup, photo servie par sa clé', async () => {
    const a = await s.register('Alice')
    const r = await s.drink(a.token, '2026-11-02', { rating: 8, review: 'Bien fraîche', photo: PNG })
    assert.equal(r.status, 200)
    assert.equal(r.body.rating, 8)
    assert.equal(r.body.review, 'Bien fraîche')
    assert.match(r.body.photo_key, /^[0-9a-f]{24}$/)
    assert.equal(r.body.photo, undefined) // la photo elle-même n'est pas renvoyée
    const img = await fetch(s.base + `/photos/${r.body.photo_key}`)
    assert.equal(img.status, 200)
    assert.equal(img.headers.get('content-type'), 'image/png')
    assert.equal((await s.call('GET', '/photos/inconnue')).status, 404)

    const b = await s.register('Bob')
    assert.equal((await s.call('PATCH', `/drinks/${r.body.id}`, { token: b.token, body: { rating: 1 } })).status, 404)
    const p = await s.call('PATCH', `/drinks/${r.body.id}`, { token: a.token, body: { rating: 3, photo: null, day: '2026-11-01' } })
    assert.equal(p.status, 200)
    assert.deepEqual([p.body.rating, p.body.review, p.body.photo_key, p.body.day], [3, 'Bien fraîche', null, '2026-11-01'])
    assert.equal((await fetch(s.base + `/photos/${r.body.photo_key}`)).status, 404) // ancienne photo plus servie
    assert.equal((await s.call('PATCH', `/drinks/${r.body.id}`, { token: a.token, body: { rating: 12 } })).status, 400)
  })

  test('sans alcool (Monster) : noté, dans le fil, mais hors score', async () => {
    const a = await s.register('Alice')
    await s.drink(a.token, '2026-11-02', { ...MONSTER, rating: 9 })
    await s.drink(a.token, '2026-11-02')
    const lb = (await s.call('GET', '/leaderboard?from=2026-11-02&to=2026-11-02', { token: a.token })).body
    assert.deepEqual([lb[0].total, lb[0].count], [2, 1])
    const feed = (await s.call('GET', '/feed', { token: a.token })).body
    assert.deepEqual(feed.items.map((d) => d.name), ['Pinte', 'Monster Ultra'])
    const stats = (await s.call('GET', `/users/${a.id}/stats`, { token: a.token })).body
    assert.deepEqual([stats.units, stats.count, stats.rated], [2, 1, 1])
  })

  test('fil de la bande : membres seulement, pagination par curseur', async () => {
    const a = await s.register('Alice')
    const b = await s.register('Bob')
    const c = await s.register('Chloé', '1234', { group: false })
    for (let i = 0; i < 5; i++) {
      s.clock.t += 60e3
      await s.drink(i % 2 ? b.token : a.token, '2026-11-03', { name: `Bière ${i}` })
    }
    await s.drink(c.token, '2026-11-03', { name: 'Secrète' })
    const p1 = (await s.call('GET', '/feed?limit=3', { token: a.token })).body
    assert.deepEqual(p1.items.map((d) => [d.name, d.user_name]), [['Bière 4', 'Alice'], ['Bière 3', 'Bob'], ['Bière 2', 'Alice']])
    const p2 = (await s.call('GET', `/feed?limit=3&before=${p1.next}`, { token: a.token })).body
    assert.deepEqual(p2.items.map((d) => d.name), ['Bière 1', 'Bière 0'])
    assert.equal(p2.next, null)
    // Chloé, seule : son propre fil
    assert.deepEqual((await s.call('GET', '/feed', { token: c.token })).body.items.map((d) => d.name), ['Secrète'])
  })

  test('journal : par soirée, plus récentes d’abord, visible hors bande', async () => {
    const a = await s.register('Alice')
    const c = await s.register('Chloé', '1234', { group: false })
    await s.drink(a.token, '2026-10-30', { name: 'Vieille' })
    await s.drink(a.token, '2026-11-02', { name: 'Récente' })
    const d = (await s.call('GET', `/users/${a.id}/diary?limit=1`, { token: a.token })).body
    assert.deepEqual([d.items.map((x) => x.name), d.more], [['Récente'], true])
    const d2 = (await s.call('GET', `/users/${a.id}/diary?limit=1&offset=1`, { token: a.token })).body
    assert.deepEqual([d2.items.map((x) => x.name), d2.more], [['Vieille'], false])
    assert.equal((await s.call('GET', `/users/${a.id}/diary`, { token: c.token })).body.items.length, 2)
    assert.equal((await s.call('GET', '/users/9999/diary', { token: c.token })).status, 404)
  })

  test('fiche produit : consos rattachées, note moyenne, répartition, avis des potes seulement', async () => {
    const a = await s.register('Alice')
    const b = await s.register('Bob')
    const c = await s.register('Chloé', '1234', { group: false })
    // Bue avant d'être sur la carte : rattachée quand on l'ajoute
    await s.drink(a.token, '2026-11-01', { ...MONSTER, rating: 6 })
    const p = (await s.call('POST', '/products', { token: a.token, body: MONSTER })).body
    await s.drink(b.token, '2026-11-02', { product_id: p.id, rating: 10, review: 'La meilleure' })
    await s.drink(c.token, '2026-11-02', { product_id: p.id, rating: 2, review: 'Bof' })
    const f = (await s.call('GET', `/products/${p.id}`, { token: a.token })).body
    assert.deepEqual([f.logs, f.drinkers, f.rating, f.ratings, f.mine], [3, 3, 6, 3, 1])
    assert.deepEqual([f.hist[1], f.hist[5], f.hist[9]], [1, 1, 1])
    assert.deepEqual(f.reviews.map((r) => r.user_name), ['Bob', 'Alice']) // Chloé n'est pas dans ma bande
    assert.equal((await s.call('GET', '/products/9999', { token: a.token })).status, 404)
    const list = (await s.call('GET', '/products', { token: a.token })).body
    assert.equal(list[0].rating, 6)
  })

  test('top 4 : 4 places, produits de la carte, sans doublon, visible dans la fiche', async () => {
    const a = await s.register('Alice')
    const p1 = (await s.call('POST', '/products', { token: a.token, body: MONSTER })).body
    const p2 = (await s.call('POST', '/products', { token: a.token, body: { ...PINTE, name: 'Chouffe', abv: 8 } })).body
    assert.equal((await s.call('PUT', '/me/tops', { token: a.token, body: { slots: [p1.id] } })).status, 400)
    assert.equal((await s.call('PUT', '/me/tops', { token: a.token, body: { slots: [p1.id, p1.id, null, null] } })).status, 400)
    assert.equal((await s.call('PUT', '/me/tops', { token: a.token, body: { slots: [9999, null, null, null] } })).status, 404)
    assert.equal((await s.call('PUT', '/me/tops', { token: a.token, body: { slots: [null, p2.id, null, p1.id] } })).status, 200)
    const tops = (await s.call('GET', `/users/${a.id}/stats`, { token: a.token })).body.tops
    assert.deepEqual(tops.map((t) => t?.name ?? null), [null, 'Chouffe', null, 'Monster Ultra'])
    // Produit retiré de la carte : sa place se libère
    await s.call('DELETE', `/products/${p2.id}`, { token: a.token })
    assert.deepEqual((await s.call('GET', `/users/${a.id}/stats`, { token: a.token })).body.tops.map((t) => t?.name ?? null), [null, null, null, 'Monster Ultra'])
  })
})

describe('photos de la carte', () => {
  test('à la création, puis : tout le monde peut en mettre une s’il n’y en a pas, seul l’auteur la change', async () => {
    const a = await s.register('Alice')
    const b = await s.register('Bob')
    const withPhoto = (await s.call('POST', '/products', { token: a.token, body: { ...PINTE, name: 'Chouffe', photo: PNG } })).body
    assert.match(withPhoto.photo_key, /^[0-9a-f]{24}$/)
    assert.equal((await fetch(s.base + `/photos/${withPhoto.photo_key}`)).status, 200)
    const bare = (await s.call('POST', '/products', { token: a.token, body: { ...PINTE, name: 'Leffe' } })).body
    assert.equal(bare.photo_key, null)
    // Bob ajoute la photo manquante
    const r = await s.call('PUT', `/products/${bare.id}/photo`, { token: b.token, body: { photo: PNG } })
    assert.equal(r.status, 200)
    assert.ok(r.body.photo_key)
    // …mais ne peut ni la changer ni la retirer ; Alice (l'autrice) oui
    assert.equal((await s.call('PUT', `/products/${bare.id}/photo`, { token: b.token, body: { photo: PNG } })).status, 403)
    assert.equal((await s.call('PUT', `/products/${bare.id}/photo`, { token: b.token, body: { photo: null } })).status, 403)
    assert.equal((await s.call('PUT', `/products/${bare.id}/photo`, { token: a.token, body: { photo: null } })).body.photo_key, null)
    assert.equal((await s.call('PUT', `/products/${bare.id}/photo`, { token: a.token, body: { photo: 'pas une image' } })).status, 400)
  })
})

describe('boissons d’un profil', () => {
  test('regroupées (sans la casse), compteurs, note moyenne, avis ; détail d’une boisson ; visible hors bande', async () => {
    const a = await s.register('Alice')
    const c = await s.register('Chloé', '1234', { group: false })
    await s.drink(a.token, '2026-10-30', { name: 'Chouffe', abv: 8, rating: 8, review: 'Top' })
    await s.drink(a.token, '2026-11-02', { name: 'chouffe', abv: 8, rating: 6 })
    await s.drink(a.token, '2026-11-02', { name: 'Chouffe', abv: 8 })
    await s.drink(a.token, '2026-11-02', SHOT)
    const list = (await s.call('GET', `/users/${a.id}/drinks`, { token: a.token })).body
    assert.equal(list.length, 2)
    const ch = list[0]
    assert.deepEqual([ch.count, ch.rating, ch.ratings, ch.reviews, ch.first_day, ch.last_day, ch.units], [3, 7, 2, 1, '2026-10-30', '2026-11-02', 9.6])
    const logs = (await s.call('GET', `/users/${a.id}/drinks/logs?name=Chouffe&cl=50&abv=8`, { token: a.token })).body
    assert.equal(logs.length, 3)
    assert.equal(logs.at(-1).review, 'Top')
    assert.equal((await s.call('GET', `/users/${a.id}/drinks`, { token: c.token })).body.length, 2)
    assert.equal((await s.call('GET', `/users/${a.id}/drinks/logs?name=Chouffe`, { token: a.token })).status, 400)
  })
})

describe('page d’une boisson', () => {
  test('infos renseignées à la création, corrigées par l’auteur ; potes qui l’ont bue ; similaires ; ma note', async () => {
    const a = await s.register('Alice')
    const b = await s.register('Bob')
    const body = { ...PINTE, name: 'Chouffe', abv: 8, maker: "Brasserie d'Achouffe", origin: 'Belgique', style: 'Blonde forte', description: 'Le lutin.\nFruitée.' }
    const p = (await s.call('POST', '/products', { token: a.token, body })).body
    assert.deepEqual([p.maker, p.origin, p.style, p.description], [body.maker, 'Belgique', 'Blonde forte', 'Le lutin.\nFruitée.'])
    assert.equal((await s.call('POST', '/products', { token: a.token, body: { ...body, name: 'X', style: 'y'.repeat(41) } })).status, 400)
    // Patch partiel : seule l'origine change, la description est vidée
    const up = await s.call('PATCH', `/products/${p.id}`, { token: a.token, body: { ...PINTE, name: 'Chouffe', abv: 8, origin: 'Wallonie', description: '' } })
    assert.deepEqual([up.body.maker, up.body.origin, up.body.description], [body.maker, 'Wallonie', null])
    assert.equal((await s.call('PATCH', `/products/${p.id}`, { token: b.token, body: { ...PINTE, name: 'Chouffe', abv: 8, origin: 'Lune' } })).status, 403)
    await s.call('POST', '/products', { token: a.token, body: { ...PINTE, name: 'Karmeliet', abv: 8.4 } })
    await s.drink(b.token, '2026-11-02', { product_id: p.id, rating: 9 })
    await s.drink(b.token, '2026-11-02', { product_id: p.id })
    await s.drink(a.token, '2026-11-02', { product_id: p.id, rating: 4 })
    const f = (await s.call('GET', `/products/${p.id}`, { token: a.token })).body
    assert.deepEqual(f.people.map((x) => [x.name, x.count, x.rating]), [['Bob', 2, 9], ['Alice', 1, 4]])
    assert.deepEqual(f.similar.map((x) => x.name), ['Karmeliet'])
    assert.equal(f.myRating, 4)
  })
})

test('infos : n’importe qui complète un champ vide, seul l’auteur change un champ rempli', async () => {
  const a = await s.register('Alice')
  const b = await s.register('Bob')
  const p = (await s.call('POST', '/products', { token: a.token, body: { ...PINTE, name: 'Chouffe', origin: 'Belgique' } })).body
  const r = await s.call('PUT', `/products/${p.id}/info`, { token: b.token, body: { maker: "Brasserie d'Achouffe", origin: 'Belgique' } })
  assert.equal(r.status, 200)
  assert.equal(r.body.maker, "Brasserie d'Achouffe")
  assert.equal((await s.call('PUT', `/products/${p.id}/info`, { token: b.token, body: { origin: 'France' } })).status, 403)
  assert.equal((await s.call('PUT', `/products/${p.id}/info`, { token: a.token, body: { origin: 'Wallonie', maker: null } })).body.maker, null)
})

test('recherche : personnes (même hors bande, sans accents) et boissons (nom ou producteur)', async () => {
  const a = await s.register('Alice')
  await s.register('Élodie')
  await s.register('Chloé', '1234', { group: false })
  await s.call('POST', '/products', { token: a.token, body: { ...PINTE, name: 'Chouffe', maker: "Brasserie d'Achouffe" } })
  await s.call('POST', '/products', { token: a.token, body: { ...PINTE, name: 'Leffe' } })
  const r = (await s.call('GET', '/search?q=elo', { token: a.token })).body
  assert.deepEqual(r.users.map((u) => [u.name, u.inBand]), [['Élodie', true]])
  const c = (await s.call('GET', '/search?q=chlo', { token: a.token })).body
  assert.deepEqual(c.users.map((u) => [u.name, u.inBand]), [['Chloé', false]])
  assert.deepEqual((await s.call('GET', '/search?q=achouffe', { token: a.token })).body.products.map((p) => p.name), ['Chouffe'])
  assert.deepEqual((await s.call('GET', '/search?q=', { token: a.token })).body, { users: [], products: [] })
})

test('« déjà bue » : sans date ni note, hors score et hors journal ; compte dans les buveurs et le profil', async () => {
  const a = await s.register('Alice')
  const b = await s.register('Bob')
  const p = (await s.call('POST', '/products', { token: a.token, body: { ...PINTE, name: 'Chouffe', abv: 8 } })).body
  assert.equal((await s.call('PUT', `/products/${p.id}/tried`, { token: b.token })).status, 200)
  assert.equal((await s.call('PUT', `/products/${p.id}/tried`, { token: b.token })).status, 200) // idempotent
  assert.equal((await s.call('PUT', '/products/9999/tried', { token: b.token })).status, 404)
  const f = (await s.call('GET', `/products/${p.id}`, { token: b.token })).body
  assert.deepEqual([f.marked, f.tried, f.mine, f.drinkers, f.logs], [true, true, 0, 1, 0])
  assert.deepEqual(f.people.map((x) => [x.name, x.count]), [['Bob', 0]])
  assert.equal((await s.call('GET', '/products', { token: b.token })).body.find((x) => x.id === p.id).tried, true)
  assert.equal((await s.call('GET', '/products', { token: a.token })).body.find((x) => x.id === p.id).tried, false)
  // Dans ses boissons : 0 conso, marquée ; rien dans le journal ni au classement
  const list = (await s.call('GET', `/users/${b.id}/drinks`, { token: a.token })).body
  assert.deepEqual(list.map((d) => [d.name, d.count, d.marked]), [['Chouffe', 0, true]])
  assert.deepEqual((await s.call('GET', `/users/${b.id}/diary`, { token: b.token })).body.items, [])
  // Une vraie conso ensuite : plus de doublon dans ses boissons
  await s.drink(b.token, '2026-11-02', { product_id: p.id })
  assert.deepEqual((await s.call('GET', `/users/${b.id}/drinks`, { token: b.token })).body.map((d) => d.count), [1])
  assert.equal((await s.call('DELETE', `/products/${p.id}/tried`, { token: b.token })).body.marked, false)
})

test('follow : suivre hors bande, fil « abonnements », avis des gens suivis, compteurs', async () => {
  const a = await s.register('Alice')
  const c = await s.register('Chloé', '1234', { group: false })
  const p = (await s.call('POST', '/products', { token: c.token, body: { ...PINTE, name: 'Chouffe' } })).body
  await s.drink(c.token, '2026-11-02', { product_id: p.id, rating: 8, review: 'Top' })
  assert.equal((await s.call('PUT', `/users/${a.id}/follow`, { token: a.token })).status, 400)
  assert.equal((await s.call('GET', `/products/${p.id}`, { token: a.token })).body.reviews.length, 0)
  assert.equal((await s.call('PUT', `/users/${c.id}/follow`, { token: a.token })).body.iFollow, true)
  assert.deepEqual((await s.call('GET', '/feed?scope=follow', { token: a.token })).body.items.map((d) => d.user_name), ['Chloé'])
  assert.deepEqual((await s.call('GET', '/feed', { token: a.token })).body.items, []) // fil de la bande : inchangé
  assert.equal((await s.call('GET', `/products/${p.id}`, { token: a.token })).body.reviews[0].review, 'Top')
  const st = (await s.call('GET', `/users/${c.id}/stats`, { token: a.token })).body
  assert.deepEqual([st.followers, st.following, st.iFollow], [1, 0, true])
  assert.deepEqual((await s.call('GET', `/users/${c.id}/followers`, { token: c.token })).body.map((u) => [u.name, u.iFollow]), [['Alice', false]])
  assert.deepEqual((await s.call('GET', `/users/${a.id}/following`, { token: a.token })).body.map((u) => [u.name, u.iFollow]), [['Chloé', true]])
  await s.call('DELETE', `/users/${c.id}/follow`, { token: a.token })
  assert.equal((await s.call('GET', `/users/${c.id}/stats`, { token: a.token })).body.iFollow, false)
})

test('lieu d’une conso : à l’ajout, modifiable, suggestions de mes lieux', async () => {
  const a = await s.register('Alice')
  const r = await s.drink(a.token, '2026-11-02', { place: '  Le Bar du Coin ' })
  assert.equal(r.body.place, 'Le Bar du Coin')
  s.clock.t += 60e3
  await s.drink(a.token, '2026-11-02', { place: 'Chez Max' })
  assert.deepEqual((await s.call('GET', '/drinks/places', { token: a.token })).body.map((p) => p.place), ['Chez Max', 'Le Bar du Coin'])
  assert.equal((await s.call('PATCH', `/drinks/${r.body.id}`, { token: a.token, body: { place: '' } })).body.place, null)
  assert.equal((await s.drink(a.token, '2026-11-02', { place: 'x'.repeat(61) })).status, 400)
  // Lieux partagés (même lieu sans la casse = même lieu), prêts pour une carte (lat/lng vides)
  const b = await s.register('Bob')
  await s.drink(b.token, '2026-11-02', { place: 'chez max' })
  const all = (await s.call('GET', '/places', { token: a.token })).body
  assert.deepEqual(all.map((p) => [p.name, p.logs, p.drinkers, p.lat, p.private]), [['Chez Max', 2, 2, null, false], ['Le Bar du Coin', 0, 0, null, false]])
  assert.deepEqual((await s.call('GET', '/places?mine=1', { token: a.token })).body.map((p) => p.name), ['Chez Max'])
  // Suggestions : aussi les lieux des autres (après les miens, ceux de ma bande avant les autres),
  // mais un lieu privé seulement si je fais partie de ses bandes
  await s.drink(b.token, '2026-11-02', { place: 'Le Zinc' })
  await s.drink(b.token, '2026-11-02', { place: 'Chez Bob', place_private: true })
  const sugg = async (t) => (await s.call('GET', '/drinks/places', { token: t })).body.map((p) => [p.place, p.mine])
  assert.deepEqual(await sugg(a.token), [['Chez Max', true], ['Chez Bob', false], ['Le Zinc', false], ['Le Bar du Coin', false]])
  const c = await s.register('Chloé', '1234', { group: false })
  assert.deepEqual(await sugg(c.token), [['Chez Max', false], ['Le Zinc', false], ['Le Bar du Coin', false]])
})

test('migration : ancien lieu en texte sur les consos → table places', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'alcool-'))
  const file = path.join(dir, 'a.db')
  const first = createApp({ dbPath: file })
  first.db.exec("INSERT INTO users (name, pin_hash) VALUES ('A', 'x:y')")
  first.db.exec('ALTER TABLE drinks ADD COLUMN place TEXT')
  first.db.exec("INSERT INTO drinks (user_id, day, at, name, cat, cl, abv, place) VALUES (1, '2026-11-01', 1, 'B', 'biere', 50, 5, 'Le Rade'), (1, '2026-11-01', 2, 'B', 'biere', 50, 5, 'le rade')")
  first.close()
  const again = createApp({ dbPath: file })
  const rows = again.db.prepare('SELECT d.place_id, pl.name FROM drinks d JOIN places pl ON pl.id = d.place_id').all()
  assert.deepEqual(rows.map((r) => r.name), ['Le Rade', 'Le Rade'])
  assert.ok(!again.db.prepare('PRAGMA table_info(drinks)').all().some((c) => c.name === 'place'))
  again.close()
  rmSync(dir, { recursive: true })
})

test('lieu privé : visible par moi et les bandes autorisées seulement (nom masqué ailleurs, même sur les consos)', async () => {
  const a = await s.register('Alice')
  const b = await s.register('Bob') // même bande qu'Alice
  const c = await s.register('Chloé', '1234', { group: false })
  const r = await s.drink(a.token, '2026-11-02', { place: 'Chez moi', place_private: true })
  assert.equal(r.body.place, 'Chez moi')
  const seen = async (t) => (await s.call('GET', '/places', { token: t })).body.map((p) => p.name)
  assert.deepEqual(await seen(b.token), ['Chez moi']) // partagé avec la bande courante d'Alice
  assert.deepEqual(await seen(c.token), [])
  assert.equal((await s.call('GET', `/users/${a.id}/diary`, { token: c.token })).body.items[0].place, null)
  assert.equal((await s.call('GET', `/users/${a.id}/diary`, { token: b.token })).body.items[0].place, 'Chez moi')
  // Le « Chez moi » de Chloé est un autre lieu
  await s.drink(c.token, '2026-11-02', { place: 'Chez moi', place_private: true })
  assert.deepEqual(await seen(c.token), ['Chez moi'])
  const mine = (await s.call('GET', '/places', { token: a.token })).body.find((p) => p.mine)
  assert.equal(mine.groups.length, 1)
  // Retirer la bande : Bob ne le voit plus ; Bob ne peut pas changer la visibilité
  assert.equal((await s.call('PATCH', `/places/${mine.id}`, { token: b.token, body: { private: false } })).status, 403)
  await s.call('PATCH', `/places/${mine.id}`, { token: a.token, body: { private: true, groups: [] } })
  assert.deepEqual(await seen(b.token), [])
  // Rendu public : tout le monde le voit
  await s.call('PATCH', `/places/${mine.id}`, { token: a.token, body: { private: false } })
  assert.deepEqual(await seen(c.token), ['Chez moi', 'Chez moi'])
})

test('modifier un lieu : nom et position par le créateur ; les autres ajoutent seulement une position manquante', async () => {
  const a = await s.register('Alice')
  const b = await s.register('Bob')
  await s.drink(a.token, '2026-11-02', { place: 'Le Rade' })
  const id = (await s.call('GET', '/places', { token: a.token })).body[0].id
  const patch = (t, body) => s.call('PATCH', `/places/${id}`, { token: t, body })
  assert.equal((await patch(b.token, { name: 'Autre' })).status, 403)
  assert.equal((await patch(b.token, { lat: 48.8566, lng: 2.3522 })).status, 200) // position manquante : OK
  assert.equal((await patch(b.token, { lat: 1, lng: 1 })).status, 403) // déjà renseignée
  assert.equal((await patch(a.token, { lat: 91, lng: 0 })).status, 400)
  assert.equal((await patch(a.token, { name: 'Le Vieux Rade', lat: 45.764043, lng: 4.835659 })).status, 200)
  const p = (await s.call('GET', '/places', { token: b.token })).body[0]
  assert.deepEqual([p.name, p.lat, p.lng], ['Le Vieux Rade', 45.764043, 4.835659])
  assert.equal((await s.call('GET', `/users/${a.id}/diary`, { token: a.token })).body.items[0].place, 'Le Vieux Rade') // les consos suivent
  assert.equal((await patch(a.token, { lat: null, lng: null })).status, 200)
  assert.equal((await patch(a.token, { name: '' })).status, 400)
})

describe('gestion des bandes', () => {
  test('le patron renomme, change le code, exclut, passe la main ; les autres non', async () => {
    const a = await s.register('Alice') // patronne de la bande de test
    const b = await s.register('Bob')
    const c = await s.register('Chloé')
    const g = (await s.call('GET', '/groups', { token: a.token })).body[0]
    // Bob n'est pas patron
    assert.equal((await s.call('PATCH', `/groups/${g.id}`, { token: b.token, body: { name: 'Pirates' } })).status, 403)
    assert.equal((await s.call('DELETE', `/groups/${g.id}/members/${c.id}`, { token: b.token })).status, 403)
    // Renommer
    assert.equal((await s.call('PATCH', `/groups/${g.id}`, { token: a.token, body: { name: 'x' } })).status, 400)
    assert.equal((await s.call('PATCH', `/groups/${g.id}`, { token: a.token, body: { name: 'Pirates' } })).body.name, 'Pirates')
    // Membres
    assert.deepEqual((await s.call('GET', `/groups/${g.id}/members`, { token: a.token })).body.map((m) => m.name), ['Alice', 'Bob', 'Chloé'])
    // Nouveau code : l'ancien ne marche plus
    const code = (await s.call('POST', `/groups/${g.id}/code`, { token: a.token })).body.code
    assert.notEqual(code, g.code)
    // Exclure Chloé (pas soi-même) ; elle ne revient pas avec l'ancien code, mais avec le nouveau
    assert.equal((await s.call('DELETE', `/groups/${g.id}/members/${a.id}`, { token: a.token })).status, 400)
    assert.equal((await s.call('DELETE', `/groups/${g.id}/members/${c.id}`, { token: a.token })).body.members, 2)
    assert.deepEqual((await s.call('GET', '/groups', { token: c.token })).body, [])
    assert.equal((await s.call('POST', '/groups/join', { token: c.token, body: { code: g.code } })).status, 404)
    assert.equal((await s.call('POST', '/groups/join', { token: c.token, body: { code } })).status, 200)
    // Passer la main à Bob : Alice ne gère plus, Bob si ; on ne peut pas exclure le patron
    assert.equal((await s.call('PATCH', `/groups/${g.id}`, { token: a.token, body: { owner_id: 999 } })).status, 400)
    assert.equal((await s.call('PATCH', `/groups/${g.id}`, { token: a.token, body: { owner_id: b.id } })).body.owner_id, b.id)
    assert.equal((await s.call('PATCH', `/groups/${g.id}`, { token: a.token, body: { name: 'Alice' } })).status, 403)
    assert.equal((await s.call('DELETE', `/groups/${g.id}/members/${b.id}`, { token: b.token })).status, 400)
    // Seul un admin choisit la bande par défaut
    assert.equal((await s.call('PATCH', `/groups/${g.id}`, { token: b.token, body: { is_default: true } })).status, 403)
  })

  test('bande proposée : personne n’y est mis d’office, on la rejoint sans code ; un admin gère toute bande', async () => {
    const s2 = await start({ admins: ['boss'] })
    try {
      const boss = await s2.register('Boss', '1234', { group: false })
      const main = (await s2.call('POST', '/groups', { token: boss.token, body: { name: 'Bande' } })).body
      const other = (await s2.call('POST', '/groups', { token: boss.token, body: { name: 'Autre' } })).body
      // Sans bande proposée : rien à rejoindre sans code
      const a = await s2.register('Alice', '1234', { group: false })
      assert.equal((await s2.call('GET', '/groups/suggested', { token: a.token })).body, null)
      assert.equal((await s2.call('POST', '/groups/join', { token: a.token, body: { suggested: true } })).status, 404)
      // Bande proposée (une seule à la fois)
      assert.equal((await s2.call('PATCH', `/groups/${other.id}`, { token: boss.token, body: { is_default: true } })).body.is_default, true)
      assert.equal((await s2.call('PATCH', `/groups/${main.id}`, { token: boss.token, body: { is_default: true } })).body.is_default, true)
      assert.deepEqual((await s2.call('GET', '/groups', { token: boss.token })).body.map((g) => [g.name, g.is_default]), [['Bande', true], ['Autre', false]])
      // Un nouveau n'y est pas mis d'office : il la voit proposée et la rejoint en un tap
      const b = await s2.register('Bob', '1234', { group: false })
      assert.deepEqual((await s2.call('GET', '/groups', { token: b.token })).body, [])
      assert.deepEqual((await s2.call('GET', '/groups/suggested', { token: b.token })).body, { id: main.id, name: 'Bande', members: 1, joined: false })
      assert.equal((await s2.call('POST', '/groups/join', { token: b.token, body: { suggested: true } })).body.name, 'Bande')
      assert.equal((await s2.call('GET', '/groups/suggested', { token: b.token })).body.joined, true)
      // Arrivé par un lien d'invitation : seulement cette bande-là
      const c = (await s2.call('POST', '/register', { body: { name: 'Chloé', pin: '1234', group: other.code } })).body
      assert.deepEqual((await s2.call('GET', '/groups', { token: c.token })).body.map((g) => g.name), ['Autre'])
      // Un admin gère une bande dont il n'est pas patron
      const own = (await s2.call('POST', '/groups', { token: b.token, body: { name: 'Chez Bob' } })).body
      assert.equal((await s2.call('PATCH', `/groups/${own.id}`, { token: boss.token, body: { name: 'Chez Bobby' } })).body.name, 'Chez Bobby')
    } finally {
      await s2.stop()
    }
  })
})
