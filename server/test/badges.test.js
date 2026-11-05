import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeBadges, BADGES, hourIn } from '../badges.js'

const T = (s) => Date.parse(s)
const pinte = (day, at, extra = {}) => ({ day, at: T(at), name: 'Pinte', cat: 'biere', cl: 50, abv: 5, ...extra })

test('clés de badges uniques', () => {
  assert.equal(new Set(BADGES.map((b) => b.key)).size, BADGES.length)
})

test('hourIn : heure de Paris, pas UTC', () => {
  assert.equal(hourIn(T('2026-11-05T02:30:00Z'), 'Europe/Paris'), 3)
})

test('aucun verre : aucun badge', () => {
  assert.equal(computeBadges({ drinks: [] }).size, 0)
})

test('tournée générale : 5 verres en une heure, pas en 61 min', () => {
  const at = (m) => pinte('2026-11-02', new Date(T('2026-11-02T20:00:00+01:00') + m * 60e3).toISOString())
  assert.ok(computeBadges({ drinks: [0, 15, 30, 45, 60].map(at) }).has('tournee'))
  assert.ok(!computeBadges({ drinks: [0, 15, 30, 45, 61].map(at) }).has('tournee'))
})

test('couche-tard et apéro dès midi selon l’heure locale', () => {
  const b = computeBadges({ drinks: [pinte('2026-11-02', '2026-11-03T03:30:00+01:00'), pinte('2026-11-05', '2026-11-05T12:00:00+01:00')] })
  assert.ok(b.has('couchetard') && b.has('apero'))
  assert.ok(!computeBadges({ drinks: [pinte('2026-11-02', '2026-11-02T21:00:00+01:00')] }).has('couchetard'))
})

test('trois soirs d’affilée (y compris en changeant de mois)', () => {
  const d = (day) => pinte(day, `${day}T21:00:00+01:00`)
  assert.ok(computeBadges({ drinks: ['2026-10-31', '2026-11-01', '2026-11-02'].map(d) }).has('serie'))
  assert.ok(!computeBadges({ drinks: ['2026-10-31', '2026-11-01', '2026-11-03'].map(d) }).has('serie'))
})

test('arc-en-ciel, gosier en fer, suspect', () => {
  const day = '2026-11-02'
  const at = '2026-11-02T22:00:00+01:00'
  const b = computeBadges({
    drinks: [
      pinte(day, at), pinte(day, at, { cat: 'vin', name: 'Vin' }), pinte(day, at, { cat: 'cocktail', name: 'Mojito' }),
      ...[1, 2, 3].map(() => pinte(day, at, { cat: 'fort', name: 'Shot', cl: 4, abv: 40 })),
    ],
  })
  assert.ok(b.has('arcenciel') && b.has('gosier') && !b.has('suspect'))
  assert.ok(computeBadges({ drinks: Array.from({ length: 16 }, () => pinte(day, at)) }).has('suspect'))
})

test('eau, clopes, victoires', () => {
  const day = '2026-11-02'
  const at = T('2026-11-02T22:00:00+01:00')
  const drinks = [1, 2, 3].map(() => pinte(day, '2026-11-02T22:00:00+01:00'))
  const eau = (n) => Array.from({ length: n }, () => ({ day, at, kind: 'eau' }))
  const clope = (n) => Array.from({ length: n }, () => ({ day, at, kind: 'clope' }))
  assert.ok(computeBadges({ drinks, extras: eau(3) }).has('sage'))
  assert.ok(!computeBadges({ drinks, extras: eau(2) }).has('sage'))
  assert.ok(computeBadges({ drinks, extras: eau(10) }).has('chameau'))
  const smoke = computeBadges({ drinks, extras: clope(10) })
  assert.ok(smoke.has('poumon') && !smoke.has('cendrier'))
  assert.ok(computeBadges({ drinks, wins: 10 }).has('dynastie'))
})
