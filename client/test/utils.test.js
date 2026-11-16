import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CATS, FORMATS, PALETTE, colorMap, unitsOf, fmtDrink, drinkId, toDay, nightOf, addDays, monthBounds, mondayOf, dayLabel,
  fmt, niceMax, niceTicks, sanitizeDigits, starsText, timeAgo, RANKS, rankOf, isNoelDay, isNouvelAnDay, isBeaujolaisDay, isStPatrickDay, seasonOf,
} from '../src/utils.js'

test('CATS : clés alignées sur le serveur, couleurs uniques ; formats valides', () => {
  assert.deepEqual(CATS.map((c) => c.key), ['biere', 'vin', 'fort', 'shot', 'cocktail', 'autre', 'energy', 'soft', 'chaud'])
  assert.equal(new Set(CATS.map((c) => c.hex)).size, CATS.length)
  const cat = Object.fromEntries(CATS.map((c) => [c.key, c]))
  // Formats alcoolisés : un degré ; sans alcool : 0
  assert.ok(FORMATS.every((p) => cat[p.cat] && p.cl > 0 && (cat[p.cat].alco ? p.abv > 0 : p.abv === 0)))
  assert.equal(new Set(FORMATS.map(drinkId)).size, FORMATS.length)
  assert.ok(CATS.every((c) => (c.alco ? c.degrees.length : !c.degrees.length) && c.degrees.every((d) => d >= 0 && d <= 100)))
})

test('étoiles et temps relatif', () => {
  assert.equal(starsText(7), '★★★½')
  assert.equal(starsText(10), '★★★★★')
  assert.equal(starsText(null), '')
  const now = Date.parse('2026-11-05T20:00:00Z')
  assert.equal(timeAgo(now - 20e3, now), "à l'instant")
  assert.equal(timeAgo(now - 5 * 60e3, now), 'il y a 5 min')
  assert.equal(timeAgo(now - 3 * 3600e3, now), 'il y a 3 h')
  assert.equal(timeAgo(now - 2 * 864e5, now), 'il y a 2 j')
  assert.equal(fmtDrink({ cl: 50, abv: 0 }), '50 cl · sans alcool')
  assert.equal(fmtDrink({ cl: 25, abv: 0, caffeine: 80 }), '25 cl · sans alcool')
})

test('unitsOf : 10 g d’alcool pur = 1 verre standard', () => {
  assert.equal(unitsOf({ cl: 50, abv: 5 }), 2)
  assert.equal(unitsOf({ cl: 25, abv: 5 }), 1)
})

test('nightOf : avant 6h du matin, on est encore la veille au soir', () => {
  assert.equal(nightOf(new Date(2026, 10, 3, 23, 30)), '2026-11-03')
  assert.equal(nightOf(new Date(2026, 10, 4, 2, 0)), '2026-11-03')
  assert.equal(nightOf(new Date(2026, 10, 4, 5, 59)), '2026-11-03')
  assert.equal(nightOf(new Date(2026, 10, 4, 6, 0)), '2026-11-04')
  assert.equal(nightOf(new Date(2027, 0, 1, 3, 0)), '2026-12-31') // réveillon
  assert.equal(nightOf(new Date(2026, 9, 25, 3, 0)), '2026-10-24') // nuit du changement d'heure
})

test('toDay / addDays : dates locales, passages de mois et d’année', () => {
  assert.equal(toDay(new Date(2026, 10, 3)), '2026-11-03')
  assert.equal(addDays('2026-11-30', 1), '2026-12-01')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2024-03-01', -1), '2024-02-29')
  assert.equal(addDays('2026-10-25', 1), '2026-10-26')
})

test('monthBounds / mondayOf', () => {
  assert.deepEqual(monthBounds('2026-11-15'), ['2026-11-01', '2026-11-30'])
  assert.deepEqual(monthBounds('2024-02-10'), ['2024-02-01', '2024-02-29'])
  assert.equal(mondayOf('2026-11-05'), '2026-11-02')
  assert.equal(mondayOf('2026-11-08'), '2026-11-02')
  assert.equal(mondayOf('2027-01-01'), '2026-12-28')
})

test('dayLabel : libellés courts en français sans point', () => {
  assert.equal(dayLabel('2026-11-02'), 'lun')
  assert.equal(dayLabel('2026-11-02', true), 'lun 2 nov')
})

test('fmt : décimale à la française, pluriel', () => {
  assert.equal(fmt(0), '0 verre')
  assert.equal(fmt(1.28), '1,3 verre')
  assert.equal(fmt(2), '2 verres')
  assert.equal(fmt(12.04), '12 verres')
  assert.equal(fmtDrink({ cl: 50, abv: 6.5 }), '50 cl · 6,5°')
})

test('niceMax / niceTicks : graduations rondes (1-2-5), au plus 5, qui couvrent la valeur', () => {
  for (let m = 1; m <= 5000; m++) {
    const max = niceMax(m)
    const ticks = niceTicks(max)
    assert.ok(max >= m, `max ${max} < ${m}`)
    assert.equal(ticks[0], 0)
    assert.equal(ticks.at(-1), max, `dernière graduation ≠ max pour ${m}`)
    assert.ok(ticks.length >= 2 && ticks.length <= 5, `${ticks.length} graduations pour ${m}`)
    assert.match(String(ticks[1]), /^[125]0*$/, `pas non rond ${ticks[1]} pour ${m}`)
  }
})

test('sanitizeDigits : chiffres seulement, plafond', () => {
  assert.equal(sanitizeDigits('a1b2'), '12')
  assert.equal(sanitizeDigits('99', 59), '59')
  assert.equal(sanitizeDigits(null), '')
})

test('colorMap : une couleur de la palette par personne', () => {
  const m = colorMap([{ id: 1 }, { id: 13 }, { id: 2 }])
  assert.ok(Object.values(m).every((c) => PALETTE.includes(c)))
})

test('URL de chaque écran, aller-retour', async () => {
  const { urlOf, parseUrl } = await import('../src/utils.js')
  const cases = [
    [{ view: 'home' }, '/'],
    [{ view: 'feed' }, '/activite'],
    [{ view: 'carte' }, '/carte'],
    [{ view: 'settings' }, '/reglages'],
    [{ view: 'user', userId: 12 }, '/profil/12'],
    [{ view: 'user', userId: 12, tab: 'journal' }, '/profil/12?onglet=journal'],
    [{ view: 'product', productId: 34 }, '/boisson/34'],
    [{ view: 'place', placeId: 5 }, '/lieu/5'],
    [{ view: 'post', postId: 78 }, '/conso/78'],
    [{ view: 'notifs' }, '/notifs'],
  ]
  for (const [st, url] of cases) {
    assert.equal(urlOf(st), url)
    const [path, q] = url.split('?')
    const back = parseUrl(path, q ? `?${q}` : '')
    assert.equal(back.view, st.view)
    assert.equal(back.userId ?? null, st.userId ?? null)
    assert.equal(back.productId ?? null, st.productId ?? null)
    assert.equal(back.placeId ?? null, st.placeId ?? null)
    assert.equal(back.postId ?? null, st.postId ?? null)
  }
  assert.equal(parseUrl('/n-importe-quoi').view, 'home')
  assert.equal(parseUrl('/carte/').view, 'carte')
  assert.equal(parseUrl('/nouveautes').view, 'nouveautes')
  assert.equal(urlOf({ view: 'nouveautes' }), '/nouveautes')
  assert.equal(parseUrl('/profil/abc').view, 'home')
})

test('rankOf : palier (couleur de l’anneau) selon le % de succès', () => {
  assert.equal(rankOf(0, 82).i, 0)
  assert.equal(rankOf(0, 0).i, 0)
  assert.equal(rankOf(21, 91).i, 3) // 23 %
  assert.equal(rankOf(31, 91).i, 4) // 34 %
  assert.equal(rankOf(73, 91).i, 7) // 80 % : l'or sans tout avoir
  const top = rankOf(82, 82)
  assert.deepEqual([top.i, top.next], [RANKS.length - 1, null])
  assert.ok(RANKS.every((x, i) => !i || x.min > RANKS[i - 1].min))
})

test('isNoelDay : soirées du 24 et du 25 décembre seulement (la nuit compte pour la veille)', () => {
  assert.ok(isNoelDay('2026-12-24') && isNoelDay('2026-12-25'))
  assert.ok(!isNoelDay('2026-12-23') && !isNoelDay('2026-12-26') && !isNoelDay('2026-11-24'))
  assert.ok(isNoelDay(nightOf(new Date(2026, 11, 26, 5, 30)))) // 26 à 5h30 : encore le réveillon du 25
  assert.ok(!isNoelDay(nightOf(new Date(2026, 11, 24, 5, 30)))) // 24 à 5h30 : encore la soirée du 23
})

test('isNouvelAnDay : la soirée du 31 décembre, jusqu’au 1er à 6h', () => {
  assert.ok(isNouvelAnDay('2026-12-31') && !isNouvelAnDay('2027-01-01') && !isNouvelAnDay('2026-12-30'))
  assert.ok(isNouvelAnDay(nightOf(new Date(2027, 0, 1, 3, 0)))) // 1er à 3h : toujours la Saint-Sylvestre
  assert.ok(!isNouvelAnDay(nightOf(new Date(2027, 0, 1, 7, 0))))
})

test('isBeaujolaisDay : 3e jeudi de novembre', () => {
  for (const d of ['2026-11-19', '2027-11-18', '2028-11-16', '2025-11-20']) assert.ok(isBeaujolaisDay(d), d)
  for (const d of ['2026-11-12', '2026-11-26', '2026-10-15', '2026-11-20']) assert.ok(!isBeaujolaisDay(d), d)
})

test('seasonOf : un thème par fête, rien le reste du temps', () => {
  assert.equal(seasonOf('2026-12-24'), 'noel')
  assert.equal(seasonOf('2026-12-31'), 'nouvel-an')
  assert.equal(seasonOf('2026-11-19'), 'beaujolais')
  assert.equal(seasonOf('2027-03-17'), 'st-patrick')
  assert.equal(seasonOf('2027-10-31'), 'halloween')
  assert.equal(seasonOf('2027-06-21'), 'musique')
  assert.equal(seasonOf(nightOf(new Date(2027, 5, 22, 3, 0))), 'musique') // 22 juin à 3h : encore la fête
  assert.ok(isStPatrickDay(nightOf(new Date(2027, 2, 18, 4, 0)))) // 18 à 4h : encore la Saint-Patrick
  for (const d of ['2026-08-07', '2027-08-06', '2025-08-01']) assert.equal(seasonOf(d), 'biere', d)
  assert.equal(seasonOf('2026-08-14'), null)
  for (const d of ['2023-09-16', '2024-09-21', '2025-09-20', '2026-09-19', '2027-09-18']) assert.equal(seasonOf(d), 'oktoberfest', d)
  assert.equal(seasonOf('2026-09-20'), null)
  assert.equal(seasonOf('2027-02-14'), 'valentin')
  assert.equal(seasonOf('2027-05-01'), 'premier-mai')
  assert.equal(seasonOf('2027-07-14'), '14-juillet')
  assert.equal(seasonOf('2027-04-01'), 'poisson')
  assert.equal(seasonOf('2027-01-01'), 'dry-january')
  assert.equal(seasonOf('2027-01-31'), 'dry-january')
  assert.equal(seasonOf('2026-12-31'), 'nouvel-an') // la nuit du 31 au 1er reste au Nouvel An
  assert.equal(seasonOf('2026-11-16'), null)
})
