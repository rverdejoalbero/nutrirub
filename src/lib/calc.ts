import type { Producto, Registro } from '../db/types'

export interface Macros {
  kcal: number
  proteinas: number
  carbohidratos: number
  grasas: number
}

export const MACROS_CERO: Macros = { kcal: 0, proteinas: 0, carbohidratos: 0, grasas: 0 }

/** Regla unica de conversion: todo se guarda por 100 y se escala aqui. */
export const por100 = (valorPor100: number | undefined, cantidad: number): number =>
  ((valorPor100 ?? 0) * cantidad) / 100

export function macrosDe(p: Producto, cantidad: number): Macros {
  return {
    kcal: por100(p.kcal, cantidad),
    proteinas: por100(p.proteinas, cantidad),
    carbohidratos: por100(p.carbohidratos, cantidad),
    grasas: por100(p.grasas, cantidad),
  }
}

export function sumar(regs: Registro[]): Macros {
  return regs.reduce<Macros>(
    (a, r) => ({
      kcal: a.kcal + r.kcal,
      proteinas: a.proteinas + r.proteinas,
      carbohidratos: a.carbohidratos + r.carbohidratos,
      grasas: a.grasas + r.grasas,
    }),
    { ...MACROS_CERO },
  )
}

/**
 * kcal teoricas a partir de los macros: 4/4/9, mas 2 por gramo de fibra.
 * En las etiquetas europeas los hidratos NO incluyen la fibra, que va aparte
 * y aporta unas 2 kcal/g. Sin ese termino, los productos con mucha fibra
 * darian falso positivo en la comprobacion de coherencia.
 */
export function kcalTeoricas(m: {
  proteinas?: number | null
  carbohidratos?: number | null
  grasas?: number | null
  fibra?: number | null
}): number {
  return (
    4 * (m.proteinas ?? 0) + 4 * (m.carbohidratos ?? 0) + 9 * (m.grasas ?? 0) + 2 * (m.fibra ?? 0)
  )
}

export interface Aviso {
  campo: string
  texto: string
}

/**
 * Comprobaciones sobre unos valores por 100 g. No bloquean el guardado:
 * pintan avisos en la pantalla de revision. Es la forma barata de cazar
 * un OCR mal leido antes de que entre en la base.
 */
export function revisarCoherencia(v: {
  kcal?: number | null
  proteinas?: number | null
  carbohidratos?: number | null
  grasas?: number | null
  azucares?: number | null
  saturadas?: number | null
  fibra?: number | null
  sal?: number | null
}): Aviso[] {
  const avisos: Aviso[] = []
  const num = (x: number | null | undefined) => (typeof x === 'number' && isFinite(x) ? x : null)

  const kcal = num(v.kcal)
  const teoricas = kcalTeoricas(v)

  if (kcal !== null && teoricas > 0) {
    const desvio = Math.abs(kcal - teoricas) / teoricas
    if (desvio > 0.15) {
      avisos.push({
        campo: 'kcal',
        texto: `Revisa estos números, no cuadran: por los macros saldrían unas ${Math.round(teoricas)} kcal.`,
      })
    }
  }

  if (kcal !== null && kcal > 900) {
    avisos.push({ campo: 'kcal', texto: 'Más de 900 kcal por 100 g es imposible.' })
  }

  const gramos: [string, number | null][] = [
    ['proteinas', num(v.proteinas)],
    ['carbohidratos', num(v.carbohidratos)],
    ['grasas', num(v.grasas)],
    ['azucares', num(v.azucares)],
    ['saturadas', num(v.saturadas)],
    ['fibra', num(v.fibra)],
  ]
  for (const [campo, val] of gramos) {
    if (val === null) continue
    if (val < 0) avisos.push({ campo, texto: 'No puede ser negativo.' })
    else if (val > 100) avisos.push({ campo, texto: 'No puede haber más de 100 g por 100 g.' })
  }

  const suma =
    (num(v.proteinas) ?? 0) + (num(v.carbohidratos) ?? 0) + (num(v.grasas) ?? 0) + (num(v.fibra) ?? 0)
  if (suma > 100) {
    avisos.push({ campo: 'kcal', texto: 'Los macros suman más de 100 g por cada 100 g.' })
  }

  const az = num(v.azucares), hc = num(v.carbohidratos)
  if (az !== null && hc !== null && az > hc + 0.01) {
    avisos.push({ campo: 'azucares', texto: 'Los azúcares no pueden superar a los hidratos.' })
  }
  const sat = num(v.saturadas), gr = num(v.grasas)
  if (sat !== null && gr !== null && sat > gr + 0.01) {
    avisos.push({ campo: 'saturadas', texto: 'Las saturadas no pueden superar a las grasas.' })
  }
  const sal = num(v.sal)
  if (sal !== null && sal > 100) avisos.push({ campo: 'sal', texto: 'Valor de sal imposible.' })

  return avisos
}
