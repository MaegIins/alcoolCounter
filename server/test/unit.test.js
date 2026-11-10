import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDay, checkName, unitsOf, checkDrink, checkLog, CATS, guessCaffeine } from '../app.js'
import { guessCaffeine as guessClient } from '../../client/src/utils.js'

test('isDay accepte les vraies dates YYYY-MM-DD', () => {
  assert.ok(isDay('2026-11-03'))
  assert.ok(isDay('2024-02-29')) // bissextile
})

test('isDay rejette les dates impossibles ou mal formées', () => {
  for (const s of ['2026-13-01', '2026-02-30', '2025-02-29', '2026-1-3', '03/11/2026', '', null, undefined, 20261103]) {
    assert.equal(isDay(s), false, String(s))
  }
})

test('checkName : 2 à 20 caractères, pas de caractères de contrôle', () => {
  assert.equal(checkName('Al'), null)
  assert.equal(checkName('x'.repeat(20)), null)
  assert.ok(checkName('A'))
  assert.ok(checkName('x'.repeat(21)))
  assert.ok(checkName('Bo\nb'))
  assert.equal(checkName('Léa 🍺'), null)
})

test('unitsOf : 10 g d’alcool pur = 1 verre standard', () => {
  assert.equal(unitsOf({ cl: 50, abv: 5 }), 2)
  assert.equal(unitsOf({ cl: 25, abv: 5 }), 1)
  assert.equal(Math.round(unitsOf({ cl: 4, abv: 40 }) * 100) / 100, 1.28)
})

test('checkDrink : valide et arrondit, refuse le reste', () => {
  assert.deepEqual(checkDrink({ name: ' IPA ', cat: 'biere', cl: '33', abv: 6.54 }), { drink: { name: 'IPA', cat: 'biere', cl: 33, abv: 6.5, caffeine: 0 } })
  assert.ok(checkDrink({ name: 'Eau', cat: 'eau', cl: 25, abv: 5 }).error)
  assert.ok(checkDrink({ name: 'Bière', cat: 'biere', cl: 25, abv: -1 }).error)
  assert.equal(checkDrink({ name: 'Leffe 0.0', cat: 'biere', cl: 25, abv: 0 }).drink.abv, 0) // sans alcool : accepté
  assert.equal(checkDrink({ name: 'Monster', cat: 'energy', cl: 50, abv: 5 }).drink.abv, 0) // sans alcool : forcé à 0
  assert.ok(checkDrink({ name: 'B\nb', cat: 'biere', cl: 25, abv: 5 }).error)
  assert.deepEqual(CATS, ['biere', 'vin', 'fort', 'shot', 'cocktail', 'autre', 'energy', 'soft', 'chaud'])
  // Caféine : donnée (arrondie au mg), sinon estimée ; bornée
  assert.equal(checkDrink({ name: 'Monster', cat: 'energy', cl: 50, abv: 0 }).drink.caffeine, 160)
  assert.equal(checkDrink({ name: 'Café', cat: 'chaud', cl: 5, abv: 0, caffeine: 95.4 }).drink.caffeine, 95)
  assert.ok(checkDrink({ name: 'Café', cat: 'chaud', cl: 5, abv: 0, caffeine: 5000 }).error)
  assert.ok(checkDrink({ name: 'Café', cat: 'chaud', cl: 5, abv: 0, caffeine: -1 }).error)
})

test('checkLog : note en demi-étoiles, avis, photo ; seulement les champs donnés', () => {
  assert.deepEqual(checkLog({}), { log: {} })
  assert.deepEqual(checkLog({ rating: 7, review: '  top  ' }), { log: { rating: 7, review: 'top' } })
  assert.deepEqual(checkLog({ rating: 0, review: '' }), { log: { rating: null, review: null } })
  assert.ok(checkLog({ rating: 11 }).error)
  assert.ok(checkLog({ rating: 2.5 }).error)
  assert.ok(checkLog({ review: 'x'.repeat(1001) }).error)
  assert.ok(checkLog({ photo: 'http://exemple.fr/a.png' }).error)
  assert.deepEqual(checkLog({ photo: null }), { log: { photo: null } })
})

test('guessCaffeine : café, thé, tisane, énergisant, cola ; même règle côté client', () => {
  const cases = [
    [{ name: 'Expresso', cat: 'chaud', cl: 5 }, 80],
    [{ name: 'Thé vert', cat: 'chaud', cl: 25 }, 40],
    [{ name: 'Tisane', cat: 'chaud', cl: 25 }, 0],
    [{ name: 'Café déca', cat: 'chaud', cl: 5 }, 3],
    [{ name: 'Monster', cat: 'energy', cl: 50 }, 160],
    [{ name: 'Coca-Cola', cat: 'soft', cl: 33 }, 33],
    [{ name: 'Orangina', cat: 'soft', cl: 33 }, 0],
    [{ name: 'Espresso martini', cat: 'cocktail', cl: 12 }, 80],
    [{ name: 'Jägerbomb', cat: 'shot', cl: 4 }, 80],
    [{ name: 'Tequila', cat: 'shot', cl: 4 }, 0],
    [{ name: 'Leffe', cat: 'biere', cl: 25 }, 0],
  ]
  for (const [d, mg] of cases) {
    assert.equal(guessCaffeine(d), mg, d.name)
    assert.equal(guessClient(d), mg, `${d.name} (client)`)
  }
})
