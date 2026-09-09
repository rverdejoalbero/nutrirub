/** Redondeo a un numero de decimales, devolviendo numero. */
export const redondear = (n: number, dec = 1): number => {
  const f = 10 ** dec
  return Math.round(n * f) / f
}

/** Entero con separador de miles espanol. Para kcal. */
export function ent(n: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.round(n))
}

/** Un decimal como mucho, coma decimal. Para gramos. */
export function gr(n: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(redondear(n, 1))
}

/** Acepta '1,2' y '1.2'. Devuelve null si no hay numero valido. */
export function aNumero(texto: string): number | null {
  const limpio = texto.trim().replace(/\s/g, '').replace(',', '.')
  if (limpio === '') return null
  const n = Number(limpio)
  return isFinite(n) ? n : null
}
