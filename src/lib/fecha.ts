/** Fecha local en 'YYYY-MM-DD'. Nunca toISOString(), que pasa por UTC. */
export function aISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const hoyISO = () => aISO(new Date())

export function desdeISO(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d)
}

export function sumarDias(iso: string, n: number): string {
  const d = desdeISO(iso)
  d.setDate(d.getDate() + n)
  return aISO(d)
}

/** Los n dias hasta hoy, del mas antiguo al mas reciente. */
export function ultimosDias(n: number, hasta = hoyISO()): string[] {
  return Array.from({ length: n }, (_, i) => sumarDias(hasta, i - n + 1))
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function etiquetaFecha(iso: string): string {
  const hoy = hoyISO()
  if (iso === hoy) return 'Hoy'
  if (iso === sumarDias(hoy, -1)) return 'Ayer'
  if (iso === sumarDias(hoy, 1)) return 'Mañana'
  const d = desdeISO(iso)
  const base = `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`
  const texto = base.charAt(0).toUpperCase() + base.slice(1)
  return d.getFullYear() === new Date().getFullYear() ? texto : `${texto} ${d.getFullYear()}`
}

/**
 * La misma fecha en una frase que se pueda encajar detras de "copiar".
 * "Ayer" necesita "lo de ayer", pero un dia con nombre necesita "lo del
 * sabado 5 sep": el articulo cambia, asi que lo decide esta funcion y no
 * la plantilla que la usa.
 */
export function frasePosesiva(iso: string): string {
  const e = etiquetaFecha(iso)
  const suelto = ['Hoy', 'Ayer', 'Mañana']
  return suelto.includes(e) ? `lo de ${e.toLowerCase()}` : `lo del ${e.toLowerCase()}`
}
