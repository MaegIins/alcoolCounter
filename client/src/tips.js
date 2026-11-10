// Infobulles qui marchent aussi au doigt : `data-tip="texte"` sur n'importe quel élément (à la place de `title`,
// invisible sur téléphone). Souris : au survol. Doigt : on touche pour l'afficher, on retouche (ou on touche
// ailleurs, ou on fait défiler) pour la fermer. Une seule bulle pour toute l'appli, gérée par délégation.
let bubble = null
let current = null // élément dont la bulle est affichée

function el() {
  if (!bubble) {
    bubble = document.createElement('div')
    bubble.className = 'tip-bubble'
    bubble.setAttribute('role', 'tooltip')
    document.body.append(bubble)
  }
  return bubble
}

function show(target) {
  const text = target.dataset.tip
  if (!text) return hide()
  current?.classList.remove('tip-on')
  current = target
  target.classList.add('tip-on')
  const b = el()
  b.textContent = text
  b.style.opacity = '1'
  // Au-dessus de l'élément, centrée, sans sortir de l'écran (en dessous s'il n'y a pas la place)
  const r = target.getBoundingClientRect()
  const w = b.offsetWidth
  const h = b.offsetHeight
  const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2))
  const top = r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8
  b.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
}

function hide() {
  current?.classList.remove('tip-on')
  current = null
  if (bubble) bubble.style.opacity = '0'
}

export function initTips() {
  // Souris (en ignorant les évènements souris que le navigateur simule juste après un tap)
  let touchedAt = 0
  document.addEventListener('mouseover', (e) => {
    if (Date.now() - touchedAt < 800) return
    const t = e.target.closest?.('[data-tip]')
    if (t) show(t)
    else if (current) hide()
  })
  // Doigt / stylet : un tap (pas un glisser) bascule la bulle
  let down = null
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') touchedAt = Date.now()
    down = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY }
  }, { passive: true })
  document.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse') touchedAt = Date.now()
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) return
    down = null
    const t = e.target.closest?.('[data-tip]')
    if (t && t !== current) show(t)
    else hide()
  }, { passive: true })
  window.addEventListener('scroll', hide, { passive: true, capture: true })
  window.addEventListener('resize', hide, { passive: true })
}
