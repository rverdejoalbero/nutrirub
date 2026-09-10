import { type Objetivos, type Producto, type Registro, nuevoId } from '../db/types'

/**
 * Fabricas para los tests. Rellenan lo obligatorio para que cada prueba solo
 * escriba lo que de verdad esta comprobando: si un test tiene que repetir id,
 * creadoEn y actualizadoEn, lo interesante se pierde entre el ruido.
 */

export function unProducto(nombre = 'Macarrones', extra: Partial<Producto> = {}): Producto {
  const ahora = 1000
  return {
    id: nuevoId(),
    nombre,
    unidadBase: 'g',
    kcal: 359,
    proteinas: 12.5,
    carbohidratos: 71,
    grasas: 1.5,
    origen: 'manual',
    creadoEn: ahora,
    actualizadoEn: ahora,
    ...extra,
  }
}

export function unRegistro(productoId: string, extra: Partial<Registro> = {}): Registro {
  const ahora = 2000
  return {
    id: nuevoId(),
    fecha: '2026-09-09',
    momento: 'comida',
    productoId,
    nombreProducto: 'Macarrones',
    cantidad: 125,
    unidad: 'g',
    kcal: 448.8,
    proteinas: 15.63,
    carbohidratos: 88.75,
    grasas: 1.88,
    creadoEn: ahora,
    actualizadoEn: ahora,
    ...extra,
  }
}

export function unObjetivo(desde: string, extra: Partial<Objetivos> = {}): Objetivos {
  const ahora = 3000
  return {
    id: nuevoId(),
    desde,
    kcal: 2200,
    proteinas: 140,
    carbohidratos: 220,
    grasas: 70,
    creadoEn: ahora,
    actualizadoEn: ahora,
    ...extra,
  }
}
