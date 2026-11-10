import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeTitles, TITLES } from '../titles.js'
import { start } from './helpers.js'

const many = (n, d) => Array.from({ length: n }, () => ({ cat: 'biere', abv: 8, ...d }))

test('titres : clés uniques, seuils positifs', () => {
  assert.equal(new Set(TITLES.map((t) => t.key)).size, TITLES.length)
  assert.ok(TITLES.every((t) => t.n >= 1 && t.label && t.how && (t.wins || typeof t.match === 'function')))
})

test('titres : N fois la bonne boisson (sans accents ni casse), pas avant', () => {
  assert.ok(!computeTitles({ drinks: many(9, { name: 'La Chouffe' }) }).has('chouffe10'))
  const c = computeTitles({ drinks: many(20, { name: 'CHOUFFE Houblon' }) })
  assert.ok(c.has('chouffe10') && c.has('chouffe20') && !c.has('chouffe30'))
  assert.ok(computeTitles({ drinks: many(1, { name: 'Méga Démon' }) }).has('megademon'))
  assert.ok(computeTitles({ drinks: many(1, { name: 'Perroquet explosif' }) }).has('perroquetexplosif'))
  assert.ok(computeTitles({ drinks: many(3, { name: '86' }) }).has('huitsix'))
  assert.ok(computeTitles({ drinks: many(3, { name: '8.6 Original' }) }).has('huitsix'))
  assert.ok(!computeTitles({ drinks: many(3, { name: 'Cuvée 1986' }) }).has('huitsix'))
  assert.ok(computeTitles({ drinks: many(5, { name: 'Vodka Red Bull', cat: 'cocktail' }) }).has('vodkarb'))
  assert.ok(computeTitles({ drinks: many(30, { name: 'Blonde', abv: 5 }) }).has('pilseur'))
  assert.ok(!computeTitles({ drinks: many(30, { name: 'Blonde', abv: 5.5 }) }).has('pilseur'))
  assert.ok(computeTitles({ drinks: many(3, { name: 'Vin rouge', cat: 'vin', abv: 13 }) }).has('rouge'))
  const g = computeTitles({ drinks: many(10, { name: 'Guinness Draught' }) })
  assert.ok(g.has('guinness') && g.has('topg'))
  assert.ok(!computeTitles({ drinks: many(9, { name: 'Guinness' }) }).has('topg'))
  assert.ok(computeTitles({ drinks: many(5, { name: 'Kasteel Rouge' }) }).has('kasteel'))
})

test('titres en vrai : débloqués à la conso (toast + notif), affichés d’office, choisis ou retirés, jamais un pas débloqué', async () => {
  const s = await start()
  try {
    const a = await s.register('Alice')
    let r
    for (let i = 0; i < 3; i++) r = await s.drink(a.token, '2026-11-02', { name: 'Guinness', cl: 50, abv: 4.2 })
    assert.ok(!r.body.badges.some((b) => b.kind === 'title'))
    r = await s.drink(a.token, '2026-11-02', { name: 'Guinness', cl: 50, abv: 4.2 })
    assert.deepEqual(r.body.badges.filter((b) => b.kind === 'title').map((b) => b.label), ['Chanceux'])
    let me = (await s.call('GET', `/users/${a.id}/stats`, { token: a.token })).body
    assert.equal(me.title, 'Chanceux') // premier titre : affiché d'office
    assert.deepEqual(me.titles.map((t) => [t.label, t.current]), [['Chanceux', true]])
    assert.equal(me.titlesTotal, TITLES.length)
    const notifs = (await s.call('GET', '/notifications', { token: a.token })).body.items
    assert.equal(notifs.find((n) => n.kind === 'title').title.label, 'Chanceux')
    assert.equal((await s.call('PUT', '/me/title', { token: a.token, body: { key: 'ricard' } })).status, 400)
    assert.equal((await s.call('PUT', '/me/title', { token: a.token, body: { key: null } })).body.title, null)
    // Aucun choisi exprès : le titre suivant ne s'affiche pas tout seul
    for (let i = 0; i < 3; i++) await s.drink(a.token, '2026-11-02', { name: 'Monaco', cat: 'cocktail', cl: 25, abv: 3 })
    me = (await s.call('GET', `/users/${a.id}/stats`, { token: a.token })).body
    assert.equal(me.title, null)
    assert.equal(me.titles.length, 2)
    assert.equal((await s.call('PUT', '/me/title', { token: a.token, body: { key: 'monaco' } })).body.title, 'Petit joueur')
    const ranks = (await s.call('GET', '/ranks', { token: a.token })).body
    assert.equal(ranks.titles[a.id], 'Petit joueur')
  } finally {
    await s.stop()
  }
})
