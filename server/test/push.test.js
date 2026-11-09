import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { start } from './helpers.js'

let s
afterEach(() => s?.stop())
const tick = () => new Promise((r) => setImmediate(r))
const SUB = (n = 1) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/abc${n}`, keys: { p256dh: 'BKey' + n, auth: 'auth' + n } })

/** App avec notifs push, dont les envois sont capturés au lieu de partir chez Google */
async function withPush(reply = () => ({ statusCode: 201 })) {
  const sent = []
  s = await start({
    push: {
      publicKey: 'PUB', privateKey: 'PRIV',
      send: async (sub, body) => {
        sent.push({ endpoint: sub.endpoint, ...JSON.parse(body) })
        const r = reply(sub)
        if (r.statusCode >= 400) throw Object.assign(new Error('push'), r)
        return r
      },
    },
  })
  return sent
}

test('push : désactivé sans clés VAPID', async () => {
  s = await start()
  const a = await s.register('Alice')
  assert.deepEqual((await s.call('GET', '/push/key', { token: a.token })).body, { key: null })
  assert.equal((await s.call('POST', '/push/subscribe', { token: a.token, body: SUB() })).status, 503)
})

test('push : abonnement validé (services de push des navigateurs seulement)', async () => {
  await withPush()
  const a = await s.register('Alice')
  assert.deepEqual((await s.call('GET', '/push/key', { token: a.token })).body, { key: 'PUB' })
  assert.equal((await s.call('POST', '/push/subscribe', { body: SUB() })).status, 401)
  for (const endpoint of ['http://fcm.googleapis.com/x', 'https://evil.example/x', 'https://googleapis.com.evil.example/x', 'pas une url']) {
    assert.equal((await s.call('POST', '/push/subscribe', { token: a.token, body: { ...SUB(), endpoint } })).status, 400, endpoint)
  }
  assert.equal((await s.call('POST', '/push/subscribe', { token: a.token, body: { endpoint: SUB().endpoint } })).status, 400)
  for (const endpoint of ['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/x', 'https://wns2-par02p.notify.windows.com/w/?token=x']) {
    assert.equal((await s.call('POST', '/push/subscribe', { token: a.token, body: { ...SUB(), endpoint } })).status, 200, endpoint)
  }
  // Notif de test : à soi, affichée même appli ouverte, pas plus d'une toutes les 30 s
  assert.deepEqual((await s.call('POST', '/push/test', { token: a.token })).body, { sent: 4 })
  assert.deepEqual((await s.call('POST', '/push/test', { token: a.token })).body, { sent: 0 })
  // Même navigateur réabonné : pas de doublon
  await s.call('POST', '/push/subscribe', { token: a.token, body: SUB() })
  await s.call('POST', '/push/subscribe', { token: a.token, body: SUB() })
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE endpoint = ?').get(SUB().endpoint).n, 1)
})

test('push : like, commentaire, follow arrivent sur les téléphones abonnés, avec le texte et le lien', async () => {
  const sent = await withPush()
  const a = await s.register('Alice')
  const b = await s.register('Bob')
  await s.call('POST', '/push/subscribe', { token: a.token, body: SUB(1) })
  await s.call('POST', '/push/subscribe', { token: a.token, body: SUB(2) }) // 2e téléphone
  const id = (await s.drink(a.token, '2026-11-03')).body.id

  await s.call('PUT', `/drinks/${id}/like`, { token: b.token })
  await tick()
  assert.equal(sent.length, 2)
  assert.deepEqual(new Set(sent.map((p) => p.endpoint)), new Set([SUB(1).endpoint, SUB(2).endpoint]))
  assert.equal(sent[0].title, 'Bob a liké ta conso')
  assert.equal(sent[0].body, 'Pinte')
  assert.equal(sent[0].url, `/conso/${id}`)

  // Like retiré puis remis : pas de 2e notif (anti-rafale)
  await s.call('DELETE', `/drinks/${id}/like`, { token: b.token })
  await s.call('PUT', `/drinks/${id}/like`, { token: b.token })
  await tick()
  assert.equal(sent.length, 2)

  sent.length = 0
  await s.call('POST', `/drinks/${id}/comments`, { token: b.token, body: { body: 'Santé !' } })
  await s.call('PUT', `/users/${a.id}/follow`, { token: b.token })
  await tick()
  const byTitle = Object.fromEntries(sent.map((p) => [p.title, p]))
  assert.equal(byTitle['Bob a commenté ta conso'].body, 'Pinte · « Santé ! »')
  assert.equal(byTitle['Bob te suit'].url, `/profil/${b.id}`)

  // Rien pour Bob (pas abonné), rien pour ses propres actions
  sent.length = 0
  await s.call('PUT', `/drinks/${id}/like`, { token: a.token })
  await tick()
  assert.equal(sent.length, 0)
})

test('push : succès débloqué par les autres → notif ; fêté à l’écran après une conso → pas de notif', async () => {
  const sent = await withPush()
  const a = await s.register('Alice')
  const b = await s.register('Bob')
  await s.call('POST', '/push/subscribe', { token: b.token, body: SUB() })
  const ids = []
  for (let i = 0; i < 10; i++) ids.push((await s.drink(b.token, '2026-11-03')).body.id) // Premier verre… : fêtés à l'écran
  await tick()
  assert.equal(sent.length, 0)
  for (const id of ids) await s.call('PUT', `/drinks/${id}/like`, { token: a.token }) // 10e like : Populaire
  await tick()
  const badge = sent.filter((p) => p.url === `/profil/${b.id}?onglet=badges`)
  assert.equal(badge.length, 1)
  assert.equal(badge[0].title, '❤️ Succès débloqué : Populaire')
  assert.equal(badge[0].body, '10 likes reçus')
})

test('push : déconnexion ou abonnement mort → plus d’envoi', async () => {
  const sent = await withPush((sub) => (sub.endpoint.endsWith('abc2') ? { statusCode: 410 } : { statusCode: 201 }))
  const a = await s.register('Alice')
  const b = await s.register('Bob')
  await s.call('POST', '/push/subscribe', { token: a.token, body: SUB(1) })
  await s.call('POST', '/push/subscribe', { token: a.token, body: SUB(2) })
  await s.call('PUT', `/users/${a.id}/follow`, { token: b.token })
  await tick(); await tick()
  assert.equal(sent.length, 2)
  // 410 : l'abonnement 2 est supprimé
  assert.deepEqual(s.db.prepare('SELECT endpoint FROM push_subs').all().map((r) => r.endpoint), [SUB(1).endpoint])

  // Désabonnement explicite, puis déconnexion d'un autre appareil
  await s.call('POST', '/push/unsubscribe', { token: a.token, body: { endpoint: SUB(1).endpoint } })
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM push_subs').get().n, 0)
  await s.call('POST', '/push/subscribe', { token: a.token, body: SUB(3) })
  await s.call('POST', '/logout', { token: a.token })
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM push_subs').get().n, 0)
})
