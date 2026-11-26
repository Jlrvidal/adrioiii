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
// Explicación ampliada de cada fase: qué se suele hacer, qué la acelera y qué la
// retrasa. Mismo orden que `phases` en schedule.js.
export const guides = [
  {
    work: [
      'Replanteo: se marcan en el terreno la posición y las cotas del edificio.',
      'Excavación y vaciado del solar hasta la profundidad de los dos sótanos, con retirada de tierras en camiones.',
      'Contención de las tierras con muros o pantallas para que el terreno y los edificios vecinos no se muevan mientras se excava.',
      'Si aparece agua en el terreno, bombeo y drenaje para trabajar en seco.',
      'Ejecución de la cimentación (zapatas o losa): armado con acero y hormigonado.',
      'Red de saneamiento enterrada y toma de tierra del edificio.',
    ],
    faster: [
      'Que el terreno sea como indicaba el estudio geotécnico.',
      'Tiempo seco: sin barro ni charcos se excava y se hormigona sin pausas.',
      'Maquinaria y camiones de tierras disponibles sin esperas.',
      'Permisos de ocupación de la vía y acometidas tramitados con antelación.',
    ],
    slower: [
      'Lluvias continuadas: inundan la excavación e impiden hormigonar.',
      'Agua subterránea, roca o rellenos que no estaban previstos.',
      'Tuberías o cables enterrados, o hallazgos arqueológicos que obligan a parar.',
      'Afecciones a los edificios vecinos que exigen apuntalar o ir más despacio.',
      'Inspecciones o licencias pendientes antes de poder empezar.',
    ],
  },
  {
    work: [
      'Muros de los sótanos, con su impermeabilización y drenaje para que no entre agua.',
      'Pilares y forjados (los «suelos» de hormigón) de las dos plantas de garaje, hasta llegar a la planta baja.',
      'Rampa de acceso de vehículos.',
      'Huecos y pasos previstos para ventilación, desagües, ascensor y protección contra incendios.',
    ],
    faster: [
      'Encofrados reutilizables y un ritmo constante de hormigonado.',
      'Suministro de hormigón y acero sin cortes.',
      'Tiempo templado y seco: el hormigón fragua bien y se puede desencofrar antes.',
    ],
    slower: [
      'Filtraciones de agua que obligan a reforzar la impermeabilización.',
      'Lluvia intensa o heladas: no se puede hormigonar.',
      'Frío: el hormigón tarda más en endurecer y hay que esperar para desencofrar.',
      'Falta de material o retrasos en las entregas de acero.',
    ],
  },
  {
    work: [
      'Pilares, forjados y escaleras de las cuatro plantas de viviendas, desde la baja hasta la cubierta.',
      'Hueco del ascensor y núcleos de comunicación.',
      'Se trabaja planta a planta: es habitual completar una cada pocas semanas.',
      'Ensayos de control del hormigón y revisiones de la dirección de obra.',
    ],
    faster: [
      'Grúa y equipo de encofradores estables durante toda la fase.',
      'Empezar fachadas o instalaciones en las plantas de abajo mientras se sube la estructura.',
      'Buen tiempo para hormigonar en altura.',
    ],
    slower: [
      'Viento fuerte: la grúa no puede trabajar.',
      'Lluvia intensa o heladas en los días de hormigonado.',
      'Cambios de proyecto o resultados de ensayos que hay que revisar.',
    ],
  },
  {
    work: [
      'Cubierta del edificio con su aislamiento e impermeabilización.',
      'Cerramientos exteriores (ladrillo, paneles u otros) y aislamiento térmico.',
      'Colocación de ventanas, vidrios y elementos de fachada, normalmente con andamios.',
      'Objetivo clave: dejar el edificio «cerrado» para que la lluvia no afecte a los trabajos de dentro.',
    ],
    faster: [
      'Ventanas y materiales pedidos con antelación: muchos se fabrican a medida y tardan semanas.',
      'Andamios montados por tramos para trabajar en varias zonas a la vez.',
      'Buen tiempo para trabajar en altura.',
    ],
    slower: [
      'Plazos de fabricación de carpinterías y vidrios.',
      'Lluvia y viento: los trabajos en altura se suspenden por seguridad.',
      'Falta de cuadrillas especializadas.',
      'Cambios de materiales o de acabado exterior.',
    ],
  },
  {
    work: [
      'Tabiques que dividen cada vivienda en estancias.',
      'Redes de agua, desagües, electricidad y telecomunicaciones.',
      'Calefacción, agua caliente, ventilación y, si los hay, aire acondicionado o aerotermia.',
      'Ascensor e instalaciones del garaje: ventilación, detección de humos y protección contra incendios.',
      'Pruebas de presión y de funcionamiento antes de tapar las conducciones.',
      'Suele ser la fase más larga, porque coinciden muchos oficios distintos.',
    ],
    faster: [
      'Buena coordinación entre oficios (tabiqueros, fontaneros, electricistas) trabajando planta a planta en cadena.',
      'Equipos como el ascensor o la caldera pedidos con tiempo.',
      'Edificio ya cerrado: se trabaja dentro sin depender del tiempo.',
    ],
    slower: [
      'Descoordinación entre oficios que obliga a rehacer trabajos.',
      'Retrasos en la entrega de equipos.',
      'Cambios o personalizaciones pedidos por los compradores.',
      'Pruebas que no se superan a la primera.',
    ],
  },
  {
    work: [
      'Suelos, alicatados de baños y cocinas, yesos y pintura.',
      'Puertas interiores, armarios y carpintería.',
      'Montaje de cocinas, sanitarios, grifería y mecanismos eléctricos (enchufes, interruptores).',
      'Acabado de zonas comunes: portal, escaleras y garaje.',
      'Limpieza final y repaso de pequeños defectos.',
    ],
    faster: [
      'Instalaciones terminadas y probadas antes de empezar.',
      'Materiales ya en obra y elecciones de los compradores cerradas pronto.',
      'Viviendas secas y sin polvo.',
    ],
    slower: [
      'Humedades: impiden pintar o colocar algunos suelos.',
      'Cambios de calidades o personalizaciones de última hora.',
      'Retrasos en el suministro de cocinas, sanitarios o puertas.',
      'Muchos repasos de defectos.',
    ],
  },
  {
    work: [
      'Certificado final de obra firmado por la dirección facultativa.',
      'Licencia de primera ocupación o declaración responsable, según el municipio.',
      'Altas de luz, agua y gas con las compañías suministradoras.',
      'Escritura de obra nueva y división horizontal ante notario y registro.',
      'Visitas de los compradores para revisar su vivienda y anotar repasos.',
      'Firma de escrituras y entrega de llaves.',
    ],
    faster: [
      'Documentación preparada durante la obra, no al final.',
      'Ayuntamiento y compañías suministradoras con plazos ágiles.',
      'Pocos defectos pendientes en la revisión final.',
    ],
    slower: [
      'Plazos administrativos de la licencia o de la inspección municipal.',
      'Demoras de las compañías en conectar los suministros.',
      'Defectos que hay que corregir antes de la entrega.',
    ],
  },
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
