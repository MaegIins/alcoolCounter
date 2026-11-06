import { createApp } from '../app.js'

// Horloge contrôlable : 3 novembre 2026, midi à Paris
export const PINTE = { name: 'Pinte', cat: 'biere', cl: 50, abv: 5 }
export const SHOT = { name: 'Shot', cat: 'fort', cl: 4, abv: 40 }
export const VIN = { name: 'Vin rouge', cat: 'vin', cl: 12.5, abv: 12 }

export const T0 = Date.parse('2026-11-03T12:00:00+01:00')

/** Démarre une app neuve (base en mémoire) sur un port libre et renvoie de quoi l'appeler. */
export async function start(options = {}) {
  const clock = { t: T0 }
  const { app, db, close } = createApp({ now: () => clock.t, ...options })
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const base = `http://127.0.0.1:${server.address().port}/api`

  /** Appel JSON : renvoie { status, body, headers } */
  const call = async (method, path, { token, body, raw, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    })
    const text = await res.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      json = text
    }
    return { status: res.status, body: json, headers: res.headers }
  }

  /** Inscrit quelqu'un (dans la bande de test commune, sauf group: false) et renvoie son token + id */
  let groupCode = null
  const register = async (name, pin = '123456', { group = true } = {}) => {
    const r = await call('POST', '/register', { body: { name, pin, ...(group && groupCode ? { group: groupCode } : {}) } })
    if (r.status !== 200) throw new Error(`register ${name}: ${JSON.stringify(r.body)}`)
    const token = r.body.token
    if (group && !groupCode) groupCode = (await call('POST', '/groups', { token, body: { name: 'Test' } })).body.code
    return { token, id: r.body.user.id }
  }

  /** Ajoute une conso (par défaut une pinte 50 cl à 5 % = 2 verres standard), n fois */
  const drink = async (token, day, d = {}, n = 1) => {
    let r
    for (let i = 0; i < n; i++) {
      r = await call('POST', '/drinks', { token, body: { day, ...PINTE, ...d } })
    }
    return r
  }

  const stop = async () => {
    await new Promise((r) => server.close(r))
    close()
  }
  return { call, register, drink, clock, db, stop, base }
}
