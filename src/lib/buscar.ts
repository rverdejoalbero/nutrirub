import type { Producto } from '../db/types'

/** Minusculas y sin tildes, para que "platano" encuentre "plátano". */
export const normalizar = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

/** Todas las palabras de la consulta tienen que aparecer, en cualquier orden. */
export function buscarProductos(productos: Producto[], consulta: string): Producto[] {
  const q = normalizar(consulta.trim())
  if (!q) return productos
  const trozos = q.split(/\s+/)
  return productos.filter((p) => {
    const heno = normalizar(`${p.nombre} ${p.marca ?? ''}`)
    return trozos.every((t) => heno.includes(t))
  })
}
