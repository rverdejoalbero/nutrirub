import type { Ingrediente, Producto } from '../db/types'
import { redondear } from './formato'

/** Los campos nutricionales que se agregan al componer un plato. */
const CAMPOS = [
  'kcal',
  'proteinas',
  'carbohidratos',
  'azucares',
  'grasas',
  'saturadas',
  'fibra',
  'sal',
] as const

type Campo = (typeof CAMPOS)[number]

/** Los cuatro que un producto siempre declara. El resto son opcionales. */
type Basico = 'kcal' | 'proteinas' | 'carbohidratos' | 'grasas'
const BASICOS: Basico[] = ['kcal', 'proteinas', 'carbohidratos', 'grasas']

export type ValoresPor100 = Record<Basico, number> & {
  [K in Exclude<Campo, Basico>]?: number
}

const ceros = (): ValoresPor100 => ({ kcal: 0, proteinas: 0, carbohidratos: 0, grasas: 0 })

export interface IngredienteResuelto {
  ingrediente: Ingrediente
  producto: Producto | undefined
}

/** Suma de los pesos crudos. Es solo la sugerencia de peso final por defecto. */
export const pesoCrudo = (ingredientes: Ingrediente[]): number =>
  ingredientes.reduce((a, i) => a + (i.cantidad || 0), 0)

/**
 * Convierte una lista de ingredientes y el peso del plato terminado en unos
 * valores por 100 g, que es como se guarda todo en esta app.
 *
 * El peso final es lo que hace que esto sea correcto y no una aproximacion:
 * 100 g de macarrones crudos pesan unos 230 g cocidos, asi que dividir por la
 * suma de los ingredientes daria un plato el doble de calorico de lo que es.
 *
 * Un ingrediente que ya no existe (producto borrado) se ignora en la suma;
 * quien llame puede detectarlo mirando `faltan`.
 */
export function componer(
  resueltos: IngredienteResuelto[],
  pesoFinal: number,
): { por100: ValoresPor100; totales: Record<Campo, number>; faltan: Ingrediente[] } {
  const totales = Object.fromEntries(CAMPOS.map((c) => [c, 0])) as Record<Campo, number>
  const faltan: Ingrediente[] = []

  for (const { ingrediente, producto } of resueltos) {
    if (!producto) {
      faltan.push(ingrediente)
      continue
    }
    const factor = (ingrediente.cantidad || 0) / 100
    for (const c of CAMPOS) totales[c] += (producto[c] ?? 0) * factor
  }

  const por100 = ceros()
  if (pesoFinal > 0) {
    for (const c of CAMPOS) por100[c] = redondear((totales[c] / pesoFinal) * 100, 2)
  }
  return { por100, totales, faltan }
}

/**
 * Si ninguno de los ingredientes que se han podido resolver declara un campo
 * opcional, el plato tampoco deberia declararlo: un 0 diria "no tiene fibra"
 * cuando lo cierto es "no lo sabemos".
 */
export function camposConocidos(resueltos: IngredienteResuelto[]): Set<Campo> {
  const vistos = new Set<Campo>(BASICOS)
  for (const { producto } of resueltos) {
    if (!producto) continue
    for (const c of CAMPOS) {
      if (typeof producto[c] === 'number') vistos.add(c)
    }
  }
  return vistos
}

/** Los valores listos para guardar como Producto, con los opcionales limpiados. */
export function valoresDelPlato(
  resueltos: IngredienteResuelto[],
  pesoFinal: number,
): ValoresPor100 {
  const { por100 } = componer(resueltos, pesoFinal)
  const conocidos = camposConocidos(resueltos)
  // Los basicos van siempre; los opcionales solo si algun ingrediente los
  // declaraba, para no afirmar un cero que nadie sabe.
  const salida = ceros()
  for (const c of CAMPOS) {
    if (conocidos.has(c)) salida[c] = por100[c] ?? 0
  }
  return salida
}
