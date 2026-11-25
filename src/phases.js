export const descriptions = [
  [
    'Subestructura',
    'Cimentación',
    'La base reparte las cargas del edificio sobre el terreno.',
    'M2 17h20M4 12h16v3H4zM7 12V5h3v7m4 0V5h3v7',
  ],
  [
    'Subestructura',
    'Garajes',
    'Ejecución de los dos niveles bajo rasante destinados a aparcamiento.',
    'M2 6h20M3 10h18v10H3zM9 17v-5h4a1.5 1.5 0 0 1 0 3H9',
  ],
  [
    'Estructura y envolvente',
    'Estructura',
    'Pilares y forjados dan forma a las cuatro plantas residenciales.',
    'M3 4h18M3 10h18M3 16h18M6 4v16m6-16v16m6-16v16',
  ],
  [
    'Estructura y envolvente',
    'Fachadas',
    'Los cerramientos protegen las viviendas del exterior.',
    'M4 20V4h16v16zM8 8h2v3H8zm6 0h2v3h-2zM8 15h2v3H8zm6 0h2v3h-2z',
  ],
  [
    'Interior y habitabilidad',
    'Instalaciones',
    'Redes de agua y electricidad y divisiones interiores de las viviendas.',
    'M13 2L5 14h6l-1 8 9-13h-7z',
  ],
  [
    'Interior y habitabilidad',
    'Acabados',
    'Revestimientos, carpinterías y remates de los espacios interiores.',
    'M3 4h14v6H3zM17 7h4v6l-9 2v5h-3v-7l9-2',
  ],
  [
    'Entrega',
    'Entrega',
    'Comprobaciones y trámites previos a la entrega de las viviendas.',
    'M14 12a5 5 0 1 0-3-3l-8 8v4h4v-3h3v-3z',
  ],
]
export function icon(i) {
  const ns = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(ns, 'svg'),
    p = document.createElementNS(ns, 'path')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('class', 'phaseIcon')
  p.setAttribute('d', descriptions[i][3])
  svg.append(p)
  return svg
}
export const day = (d) =>
  new Date(d.length === 10 ? d + 'T12:00:00Z' : d).toLocaleDateString('es-ES', {
    dateStyle: 'long',
    timeZone: 'Europe/Madrid',
  })
export function phaseStatus(state, i, entries, now, mode) {
  if (state.completed[i]) return 'Completada'
  const obs = entries.find(
    (e) => e.phase === state.plans[mode][i].id && e.observation,
  )
  if (!obs) return 'Sin confirmar'
  const age = Date.now() - Date.parse(obs.observed + 'T12:00:00Z')
  if (age > 90 * 86400000) return 'Sin información reciente'
  return (
    {
      active: 'En ejecución',
      pending: 'Pendiente',
      late: 'Retrasada respecto al plan',
    }[obs.observation] || 'Sin confirmar'
  )
}
export function yearParts(start, duration) {
  const parts = []
  let n = start
  while (n < start + duration) {
    const absolute = 2026 * 12 + 11 + n,
      year = Math.floor(absolute / 12),
      months = Math.min(start + duration - n, 12 - (absolute % 12))
    parts.push({ year, months })
    n += months
  }
  return parts
}
export const yearColor = (year) =>
  'var(--year' + ((((year - 2026) % 5) + 5) % 5) + ')'
