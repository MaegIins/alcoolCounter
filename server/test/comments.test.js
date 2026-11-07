import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { start } from './helpers.js'

let s
beforeEach(async () => (s = await start()))
afterEach(() => s.stop())

test('commentaires : écrire, lire, compteur dans le fil, droits de suppression', async () => {
  const a = await s.register('Alice')
  const b = await s.register('Bob')
  const c = await s.register('Carl')
  const id = (await s.drink(a.token, '2026-11-03')).body.id

  assert.equal((await s.call('POST', `/drinks/${id}/comments`, { token: b.token, body: { body: '   ' } })).status, 400)
  assert.equal((await s.call('POST', `/drinks/${id}/comments`, { token: b.token, body: { body: 'x'.repeat(501) } })).status, 400)
  assert.equal((await s.call('POST', '/drinks/9999/comments', { token: b.token, body: { body: 'Hey' } })).status, 404)

  const after = (await s.call('POST', `/drinks/${id}/comments`, { token: b.token, body: { body: ' Santé !\nÀ la tienne ' } })).body
  assert.deepEqual(after.map((x) => [x.user_name, x.body]), [['Bob', 'Santé !\nÀ la tienne']])
  await s.call('POST', `/drinks/${id}/comments`, { token: c.token, body: { body: 'Encore ?' } })

  const list = (await s.call('GET', `/drinks/${id}/comments`, { token: a.token })).body
  assert.deepEqual(list.map((x) => x.user_name), ['Bob', 'Carl'])
  assert.equal((await s.call('GET', '/feed', { token: a.token })).body.items.find((l) => l.id === id).comments, 2)

  // Carl ne peut pas supprimer celui de Bob ; Alice (auteur de la conso) oui ; Carl le sien oui
  assert.equal((await s.call('DELETE', `/comments/${list[0].id}`, { token: c.token })).status, 403)
  assert.equal((await s.call('DELETE', `/comments/${list[0].id}`, { token: a.token })).status, 200)
  assert.deepEqual((await s.call('DELETE', `/comments/${list[1].id}`, { token: c.token })).body, [])

  // Conso supprimée : ses commentaires partent avec
  await s.call('POST', `/drinks/${id}/comments`, { token: b.token, body: { body: 'Bye' } })
  await s.call('DELETE', `/drinks/${id}`, { token: a.token })
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM drink_comments').get().n, 0)
})

test('commentaires : 10 par minute maximum', async () => {
  const a = await s.register('Alice')
  const id = (await s.drink(a.token, '2026-11-03')).body.id
  for (let i = 0; i < 10; i++) assert.equal((await s.call('POST', `/drinks/${id}/comments`, { token: a.token, body: { body: `n${i}` } })).status, 200)
  assert.equal((await s.call('POST', `/drinks/${id}/comments`, { token: a.token, body: { body: 'trop' } })).status, 429)
  s.clock.t += 61_000
  assert.equal((await s.call('POST', `/drinks/${id}/comments`, { token: a.token, body: { body: 'ok' } })).status, 200)
})

test('likes : un par personne, compteur et « liké par moi » dans le fil, page de la conso', async () => {
  const a = await s.register('Alice')
  const b = await s.register('Bob')
  const id = (await s.drink(a.token, '2026-11-03', { review: 'Pas mal' })).body.id

  assert.equal((await s.call('PUT', '/drinks/9999/like', { token: b.token })).status, 404)
  assert.deepEqual((await s.call('PUT', `/drinks/${id}/like`, { token: b.token })).body, { likes: 1, liked: true })
  assert.deepEqual((await s.call('PUT', `/drinks/${id}/like`, { token: b.token })).body, { likes: 1, liked: true }) // idempotent
  await s.call('PUT', `/drinks/${id}/like`, { token: a.token })

  const asB = (await s.call('GET', '/feed', { token: b.token })).body.items.find((l) => l.id === id)
  assert.equal(asB.likes, 2)
  assert.equal(asB.liked, true)

  const page = (await s.call('GET', `/drinks/${id}`, { token: b.token })).body
  assert.equal(page.user_name, 'Alice')
  assert.equal(page.review, 'Pas mal')
  assert.deepEqual(page.likers.map((u) => u.name).sort(), ['Alice', 'Bob'])
  assert.equal((await s.call('GET', '/drinks/9999', { token: b.token })).status, 404)
  assert.equal((await s.call('GET', '/drinks/me?from=2026-11-01&to=2026-11-03', { token: a.token })).status, 200) // pas pris pour un id

  assert.deepEqual((await s.call('DELETE', `/drinks/${id}/like`, { token: b.token })).body, { likes: 1, liked: false })
  assert.equal((await s.call('GET', '/feed', { token: b.token })).body.items.find((l) => l.id === id).liked, false)
})

test('notifs : like, commentaire, réponse, follow ; jamais pour soi ; lues ; retirées avec leur cause', async () => {
  const a = await s.register('Alice')
  const b = await s.register('Bob')
  const c = await s.register('Carl')
  const id = (await s.drink(a.token, '2026-11-03')).body.id
  const notifs = async (t) => (await s.call('GET', '/notifications', { token: t })).body

  await s.call('PUT', `/drinks/${id}/like`, { token: a.token }) // soi-même : rien
  await s.call('PUT', `/drinks/${id}/like`, { token: b.token })
  await s.call('POST', `/drinks/${id}/comments`, { token: b.token, body: { body: 'Santé' } })
  s.clock.t += 1000
  await s.call('POST', `/drinks/${id}/comments`, { token: c.token, body: { body: 'Moi aussi' } })
  await s.call('PUT', `/users/${a.id}/follow`, { token: c.token })

  let n = await notifs(a.token)
  assert.equal(n.unread, 4)
  assert.deepEqual(n.items.map((x) => [x.kind, x.actor_name]), [['follow', 'Carl'], ['comment', 'Carl'], ['comment', 'Bob'], ['like', 'Bob']])
  assert.equal(n.items[1].comment, 'Moi aussi')
  assert.equal(n.items[3].drink_name, 'Pinte')
  // Bob a commenté avant Carl : il est prévenu de la réponse ; Carl, non
  assert.deepEqual((await notifs(b.token)).items.map((x) => x.kind), ['reply'])
  assert.deepEqual((await notifs(c.token)).items, [])

  // Like retiré puis remis : une seule notif ; unfollow : la notif part
  await s.call('DELETE', `/drinks/${id}/like`, { token: b.token })
  await s.call('PUT', `/drinks/${id}/like`, { token: b.token })
  await s.call('DELETE', `/users/${a.id}/follow`, { token: c.token })
  n = await notifs(a.token)
  assert.deepEqual(n.items.map((x) => x.kind), ['like', 'comment', 'comment'])

  assert.equal((await s.call('POST', '/notifications/read', { token: a.token })).body.unread, 0)
  assert.equal((await s.call('GET', '/notifications/unread', { token: a.token })).body.unread, 0)
  assert.ok((await notifs(a.token)).items.every((x) => x.read))

  // Conso supprimée : ses notifs aussi
  await s.call('DELETE', `/drinks/${id}`, { token: a.token })
  assert.deepEqual((await notifs(a.token)).items, [])
  assert.deepEqual((await notifs(b.token)).items, [])
})

test('likes de commentaires : compteur, « liké par moi », notif à l’auteur du commentaire', async () => {
  const a = await s.register('Alice')
  const b = await s.register('Bob')
  const id = (await s.drink(a.token, '2026-11-03')).body.id
  const [cm] = (await s.call('POST', `/drinks/${id}/comments`, { token: b.token, body: { body: 'Santé' } })).body
  assert.equal(cm.likes, 0)
  assert.equal(cm.liked, false)

  assert.equal((await s.call('PUT', '/comments/9999/like', { token: a.token })).status, 404)
  assert.deepEqual((await s.call('PUT', `/comments/${cm.id}/like`, { token: a.token })).body, { likes: 1, liked: true })
  await s.call('PUT', `/comments/${cm.id}/like`, { token: b.token }) // son propre commentaire : pas de notif
  const [seen] = (await s.call('GET', `/drinks/${id}/comments`, { token: a.token })).body
  assert.equal(seen.likes, 2)
  assert.equal(seen.liked, true)

  const kinds = async () => (await s.call('GET', '/notifications', { token: b.token })).body.items.map((x) => [x.kind, x.actor_name, x.comment])
  assert.deepEqual(await kinds(), [['comment_like', 'Alice', 'Santé']])
  await s.call('DELETE', `/comments/${cm.id}/like`, { token: a.token })
  assert.deepEqual(await kinds(), [])
  await s.call('PUT', `/comments/${cm.id}/like`, { token: a.token })
  await s.call('DELETE', `/comments/${cm.id}`, { token: b.token }) // commentaire supprimé : likes et notifs partent
  assert.deepEqual(await kinds(), [])
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM comment_likes').get().n, 0)
})
