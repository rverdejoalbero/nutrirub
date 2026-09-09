import { obtenerProveedor, ErrorIA, type Imagen } from './provider'
import { PROMPT_ETIQUETA } from './prompt'
import type { Unidad } from '../db/types'

export type Confianza = 'alta' | 'media' | 'baja'

export interface EtiquetaLeida {
  nombre: string
  marca: string | null
  unidadBase: Unidad
  kcal: number | null
  grasas: number | null
  saturadas: number | null
  carbohidratos: number | null
  azucares: number | null
  fibra: number | null
  proteinas: number | null
  sal: number | null
  racionG: number | null
  confianza: Confianza
  notas: string | null
}

/**
 * Quita los envoltorios con los que a veces vuelve el JSON: bloques de codigo,
 * texto antes o despues. Se queda con el primer objeto de llave a llave.
 */
export function limpiarJSON(crudo: string): string {
  let t = crudo.trim()
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const ini = t.indexOf('{')
  const fin = t.lastIndexOf('}')
  if (ini >= 0 && fin > ini) t = t.slice(ini, fin + 1)
  return t.trim()
}

/**
 * Numero tolerante: el prompt pide punto decimal, pero las etiquetas espanolas
 * llevan coma y el modelo a veces la arrastra, junto con unidades ("1,2 g").
 */
export function numeroLaxo(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase()
  if (!t || t === 'null' || t === 'n/a' || t === '-' || t === 'trazas') return null
  // "1.234,5" -> "1234.5"   |   "1,2" -> "1.2"   |   "12.5 g" -> "12.5"
  let s = t.replace(/[^\d.,-]/g, '')
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(',', '.')
  const n = Number(s)
  return isFinite(n) ? n : null
}

function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t && t.toLowerCase() !== 'null' ? t : null
}

export function parsearEtiqueta(crudo: string): EtiquetaLeida {
  let j: Record<string, unknown>
  try {
    j = JSON.parse(limpiarJSON(crudo))
  } catch {
    throw new ErrorIA(
      'La respuesta del modelo no se ha entendido. Prueba otra vez o mete los datos a mano.',
    )
  }
  if (!j || typeof j !== 'object') throw new ErrorIA('La respuesta del modelo no es válida.')

  const p = (j.por_100 ?? {}) as Record<string, unknown>
  const unidad = String(j.unidad_base ?? 'g').toLowerCase() === 'ml' ? 'ml' : 'g'
  const conf = String(j.confianza ?? 'media').toLowerCase()

  return {
    nombre: texto(j.nombre) ?? 'Producto sin nombre',
    marca: texto(j.marca),
    unidadBase: unidad as Unidad,
    kcal: numeroLaxo(p.kcal),
    grasas: numeroLaxo(p.grasas),
    saturadas: numeroLaxo(p.saturadas),
    carbohidratos: numeroLaxo(p.carbohidratos),
    azucares: numeroLaxo(p.azucares),
    fibra: numeroLaxo(p.fibra),
    proteinas: numeroLaxo(p.proteinas),
    sal: numeroLaxo(p.sal),
    racionG: numeroLaxo(j.racion_g),
    confianza: (['alta', 'media', 'baja'].includes(conf) ? conf : 'media') as Confianza,
    notas: texto(j.notas),
  }
}

export async function leerEtiqueta(img: Imagen): Promise<EtiquetaLeida> {
  const crudo = await obtenerProveedor().visionJSON(img, PROMPT_ETIQUETA)
  return parsearEtiqueta(crudo)
}
