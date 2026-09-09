import type { Registro } from '../db/types'

/** Los nutrientes que se congelan pero no salen en la pantalla Hoy. */
export const OTROS_NUTRIENTES = ['fibra', 'azucares', 'sal'] as const
export type OtroNutriente = (typeof OTROS_NUTRIENTES)[number]

export const NOMBRE_NUTRIENTE: Record<OtroNutriente, string> = {
  fibra: 'Fibra',
  azucares: 'Azúcares',
  sal: 'Sal',
}

export interface ResumenNutriente {
  /** Media por dia, contando solo los dias que tienen algo registrado. */
  media: number
  /** Registros que declaraban este nutriente. */
  declarados: number
  /** Registros en total en el periodo. */
  total: number
}

/**
 * Media diaria de fibra, azucares y sal.
 *
 * Cuenta solo lo que se declaro. Un registro cuyo producto no traia la fibra
 * no suma cero: sencillamente no cuenta, y por eso se devuelve tambien cuantos
 * registros la declaraban. Sin ese dato la media enganaria hacia abajo y no
 * habria forma de saberlo, que es justo lo contrario de lo que hace el resto
 * de la app cuando no sabe algo.
 */
export function mediasDeNutrientes(
  registros: Registro[],
  diasConDatos: number,
): Record<OtroNutriente, ResumenNutriente> {
  const salida = {} as Record<OtroNutriente, ResumenNutriente>

  for (const clave of OTROS_NUTRIENTES) {
    let suma = 0
    let declarados = 0
    for (const r of registros) {
      const v = r[clave]
      if (typeof v !== 'number' || !isFinite(v)) continue
      suma += v
      declarados++
    }
    salida[clave] = {
      media: diasConDatos > 0 ? suma / diasConDatos : 0,
      declarados,
      total: registros.length,
    }
  }
  return salida
}

/**
 * Cuanto de lo registrado declara el nutriente, de 0 a 1. Sirve para decidir
 * si merece la pena enseñar la cifra o avisar de que se queda corta.
 */
export const cobertura = (r: ResumenNutriente): number =>
  r.total > 0 ? r.declarados / r.total : 0
