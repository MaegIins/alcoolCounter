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

test('chaque badge a une rubrique connue', async () => {
  const { GROUPS } = await import('../badges.js')
  const keys = new Set(GROUPS.map((g) => g.key))
  for (const b of BADGES) assert.ok(keys.has(b.group), b.key)
})

test('régularité : semaine pleine, week-end, retour de cure', () => {
  const d = (day) => pinte(day, `${day}T21:00:00+01:00`)
  const week = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']
  const b = computeBadges({ drinks: week.map(d) })
  assert.ok(b.has('semaine') && b.has('weekend') && b.has('septjours'))
  assert.ok(!computeBadges({ drinks: week.slice(0, 6).map(d) }).has('semaine'))
  assert.ok(computeBadges({ drinks: ['2026-09-01', '2026-10-02'].map(d) }).has('cure'))
  assert.ok(!computeBadges({ drinks: ['2026-09-01', '2026-10-01'].map(d) }).has('cure'))
})

test('calendrier : Saint-Patrick avec une bière, beaujolais le 3e jeudi de novembre, janvier sec', () => {
  assert.ok(computeBadges({ drinks: [pinte('2026-03-17', '2026-03-17T21:00:00+01:00')] }).has('patrick'))
  const vin = (day) => pinte(day, `${day}T21:00:00+01:00`, { cat: 'vin', name: 'Beaujolais', cl: 12, abv: 12 })
  assert.ok(computeBadges({ drinks: [vin('2026-11-19')] }).has('beaujolais'))
  assert.ok(!computeBadges({ drinks: [vin('2026-11-12')] }).has('beaujolais'))
  const d = (day) => pinte(day, `${day}T21:00:00+01:00`)
  assert.ok(computeBadges({ drinks: ['2025-12-20', '2026-02-03'].map(d) }).has('dryjanuary'))
  assert.ok(!computeBadges({ drinks: ['2025-12-20', '2026-01-15', '2026-02-03'].map(d) }).has('dryjanuary'))
})

test('sans alcool : capitaine de soirée, insomnie (les softs ne donnent pas « premier verre »)', () => {
  const day = '2026-11-02'
  const soft = (cat) => ({ day, at: T('2026-11-02T15:00:00+01:00'), name: cat, cat, cl: 50, abv: 0 })
  const b = computeBadges({ drinks: [soft('energy'), soft('energy'), soft('energy')] })
  assert.ok(b.has('capitaine') && b.has('insomnie') && !b.has('premiere'))
  assert.ok(!computeBadges({ drinks: [soft('soft'), soft('soft'), soft('soft'), pinte(day, '2026-11-02T21:00:00+01:00')] }).has('capitaine'))
})

test('lieux, critique, social, secrets', () => {
  const day = (i) => `2026-0${1 + Math.floor(i / 28)}-${String(1 + (i % 28)).padStart(2, '0')}`
  const qg = Array.from({ length: 20 }, (_, i) => pinte(day(i), `${day(i)}T21:00:00+01:00`, { place_id: 7 }))
  assert.ok(computeBadges({ drinks: qg }).has('qg'))
  assert.ok(!computeBadges({ drinks: qg.map((d) => ({ ...d, home: true })) }).has('qg'))
  const tour = [1, 2, 3].map((p) => pinte('2026-11-02', '2026-11-02T21:00:00+01:00', { place_id: p }))
  assert.ok(computeBadges({ drinks: tour }).has('tourneebars'))
  assert.ok(computeBadges({ drinks: [pinte('2026-11-02', '2026-11-02T21:00:00+01:00', { rating: 10 })] }).has('coupdecoeur'))
  const s = computeBadges({ drinks: [], social: { comments: 10, likes: 100, followers: 9 } })
  assert.ok(s.has('bavard') && s.has('star') && !s.has('influence'))
  assert.ok(computeBadges({ drinks: [pinte('2026-11-02', '2026-11-03T00:00:30+01:00')] }).has('minuit'))
  // 4 pintes à 6,25 % = 10 verres standard pile
  const pile = Array.from({ length: 4 }, () => pinte('2026-11-02', '2026-11-02T21:00:00+01:00', { abv: 6.25 }))
  assert.ok(computeBadges({ drinks: pile }).has('pilepoil'))
  assert.ok(BADGES.filter((b) => b.secret).every((b) => b.group === 'secret'))
})

test('secret Irish coffee : café et alcool fort à 10 minutes près', () => {
  const at = (h) => ({ day: '2026-11-02', at: T(`2026-11-02T${h}:00+01:00`) })
  const cafe = { ...at('22:00'), name: 'Café', cat: 'chaud', cl: 5, abv: 0 }
  const shot = (h) => ({ ...at(h), name: 'Whisky', cat: 'fort', cl: 4, abv: 40 })
  assert.ok(computeBadges({ drinks: [cafe, shot('22:08')] }).has('irish'))
  assert.ok(!computeBadges({ drinks: [cafe, shot('22:15')] }).has('irish'))
})
