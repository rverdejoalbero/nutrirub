import { db, soloVivos } from '../db/db'
import { nuevoId } from '../db/types'
import type { Registro } from '../db/types'
import { redondear } from './formato'

/**
 * Copia todo lo registrado un dia en otro.
 *
 * Los macros se recalculan a partir del producto actual cuando ese producto
 * sigue existiendo. No es una contradiccion con congelarlos: el registro de
 * ayer no se toca, pero el de hoy es un apunte NUEVO y debe reflejar lo mejor
 * que sabemos hoy. Si corregiste la etiqueta anteayer, hoy cuenta la corregida.
 *
 * Si el producto ya no esta, se copian los valores congelados: peor eso que
 * perder la comida.
 */
export async function duplicarDia(desde: string, hacia: string): Promise<number> {
  if (desde === hacia) return 0

  return db.transaction('rw', db.diario, db.alimentos, async () => {
    const origen = soloVivos(await db.diario.where('fecha').equals(desde).toArray())
    if (origen.length === 0) return 0

    const ahora = Date.now()
    const nuevos: Registro[] = []

    for (const [i, r] of origen.entries()) {
      // Un producto borrado (logicamente) cuenta como inexistente.
      const encontrado = await db.alimentos.get(r.productoId)
      const producto = encontrado && !encontrado.borradoEn ? encontrado : undefined
      const escala = producto ? r.cantidad / 100 : 0

      nuevos.push({
        ...r,
        id: nuevoId(),
        fecha: hacia,
        // +i mantiene el orden dentro de cada momento del dia.
        creadoEn: ahora + i,
        actualizadoEn: ahora + i,
        borradoEn: undefined,
        ...(producto
          ? {
              nombreProducto: producto.marca
                ? `${producto.nombre} · ${producto.marca}`
                : producto.nombre,
              unidad: producto.unidadBase,
              kcal: redondear(producto.kcal * escala, 1),
              proteinas: redondear(producto.proteinas * escala, 2),
              carbohidratos: redondear(producto.carbohidratos * escala, 2),
              grasas: redondear(producto.grasas * escala, 2),
              azucares:
                producto.azucares !== undefined
                  ? redondear(producto.azucares * escala, 2)
                  : undefined,
              fibra:
                producto.fibra !== undefined ? redondear(producto.fibra * escala, 2) : undefined,
              sal: producto.sal !== undefined ? redondear(producto.sal * escala, 3) : undefined,
            }
          : {}),
      })
    }

    await db.diario.bulkAdd(nuevos)
    return nuevos.length
  })
}

/** El dia con registros mas reciente anterior a la fecha dada, si lo hay. */
export async function diaAnteriorConDatos(antesDe: string): Promise<string | null> {
  const previos = soloVivos(await db.diario.where('fecha').below(antesDe).toArray())
  if (previos.length === 0) return null
  return previos.reduce((max, r) => (r.fecha > max ? r.fecha : max), previos[0].fecha)
}
