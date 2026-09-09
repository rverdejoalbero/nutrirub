import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { borrarTodo } from './copia'
import { diaAnteriorConDatos, duplicarDia } from './diario'
import type { Producto, Registro } from '../db/types'

const AYER = '2026-09-08'
const HOY = '2026-09-09'

const macarrones: Producto = {
  nombre: 'Macarrones',
  marca: 'Gallo',
  unidadBase: 'g',
  kcal: 359,
  proteinas: 12.5,
  carbohidratos: 71,
  grasas: 1.5,
  fibra: 3,
  origen: 'manual',
  creadoEn: 0,
}

const registro = (productoId: number, extra: Partial<Registro> = {}): Registro => ({
  fecha: AYER,
  momento: 'comida',
  productoId,
  nombreProducto: 'Macarrones · Gallo',
  cantidad: 100,
  unidad: 'g',
  kcal: 359,
  proteinas: 12.5,
  carbohidratos: 71,
  grasas: 1.5,
  fibra: 3,
  creadoEn: 1000,
  ...extra,
})

beforeEach(async () => {
  await borrarTodo()
})

describe('duplicarDia', () => {
  it('copia todos los registros al dia destino', async () => {
    const id = await db.productos.add(macarrones)
    await db.registros.add(registro(id, { momento: 'desayuno' }))
    await db.registros.add(registro(id, { momento: 'cena', cantidad: 200 }))

    expect(await duplicarDia(AYER, HOY)).toBe(2)
    const deHoy = await db.registros.where('fecha').equals(HOY).toArray()
    expect(deHoy).toHaveLength(2)
    expect(deHoy.map((r) => r.momento).sort()).toEqual(['cena', 'desayuno'])
  })

  it('no toca el dia de origen', async () => {
    const id = await db.productos.add(macarrones)
    await db.registros.add(registro(id))
    await duplicarDia(AYER, HOY)
    expect(await db.registros.where('fecha').equals(AYER).count()).toBe(1)
  })

  it('respeta las cantidades', async () => {
    const id = await db.productos.add(macarrones)
    await db.registros.add(registro(id, { cantidad: 250 }))
    await duplicarDia(AYER, HOY)
    const r = (await db.registros.where('fecha').equals(HOY).toArray())[0]
    expect(r.cantidad).toBe(250)
    expect(r.kcal).toBeCloseTo(897.5, 1)
  })

  it('recalcula con el producto de hoy, no con los macros congelados de ayer', async () => {
    // El registro de ayer se queda como estaba, pero el apunte de hoy es
    // nuevo y debe usar la etiqueta ya corregida.
    const id = await db.productos.add(macarrones)
    await db.registros.add(registro(id))
    await db.productos.update(id, { kcal: 300 })

    await duplicarDia(AYER, HOY)
    const ayer = (await db.registros.where('fecha').equals(AYER).toArray())[0]
    const hoy = (await db.registros.where('fecha').equals(HOY).toArray())[0]
    expect(ayer.kcal).toBe(359)
    expect(hoy.kcal).toBe(300)
  })

  it('actualiza el nombre si el producto se renombro', async () => {
    const id = await db.productos.add(macarrones)
    await db.registros.add(registro(id))
    await db.productos.update(id, { nombre: 'Macarrones integrales', marca: undefined })

    await duplicarDia(AYER, HOY)
    const hoy = (await db.registros.where('fecha').equals(HOY).toArray())[0]
    expect(hoy.nombreProducto).toBe('Macarrones integrales')
  })

  it('si el producto ya no existe copia los valores congelados', async () => {
    // Perder la comida seria peor que copiar un dato viejo.
    await db.registros.add(registro(999))
    expect(await duplicarDia(AYER, HOY)).toBe(1)
    const hoy = (await db.registros.where('fecha').equals(HOY).toArray())[0]
    expect(hoy.kcal).toBe(359)
    expect(hoy.nombreProducto).toBe('Macarrones · Gallo')
  })

  it('genera ids nuevos en vez de pisar los de origen', async () => {
    const id = await db.productos.add(macarrones)
    await db.registros.add(registro(id))
    await duplicarDia(AYER, HOY)
    const todos = await db.registros.toArray()
    expect(todos).toHaveLength(2)
    expect(new Set(todos.map((r) => r.id)).size).toBe(2)
  })

  it('conserva el orden dentro del dia', async () => {
    const id = await db.productos.add(macarrones)
    await db.registros.add(registro(id, { nombreProducto: 'A', creadoEn: 1 }))
    await db.registros.add(registro(id, { nombreProducto: 'B', creadoEn: 2 }))
    await db.registros.add(registro(id, { nombreProducto: 'C', creadoEn: 3 }))

    await duplicarDia(AYER, HOY)
    const hoy = (await db.registros.where('fecha').equals(HOY).toArray()).sort(
      (a, b) => a.creadoEn - b.creadoEn,
    )
    expect(hoy.map((r) => r.cantidad)).toHaveLength(3)
    expect(hoy[0].creadoEn).toBeLessThan(hoy[1].creadoEn)
    expect(hoy[1].creadoEn).toBeLessThan(hoy[2].creadoEn)
  })

  it('duplicar un dia vacio no hace nada', async () => {
    expect(await duplicarDia('2026-01-01', HOY)).toBe(0)
    expect(await db.registros.count()).toBe(0)
  })

  it('duplicar sobre el mismo dia no duplica nada', async () => {
    const id = await db.productos.add(macarrones)
    await db.registros.add(registro(id))
    expect(await duplicarDia(AYER, AYER)).toBe(0)
    expect(await db.registros.count()).toBe(1)
  })

  it('se suma a lo que ya hubiese en el destino', async () => {
    const id = await db.productos.add(macarrones)
    await db.registros.add(registro(id))
    await db.registros.add(registro(id, { fecha: HOY, momento: 'desayuno' }))

    await duplicarDia(AYER, HOY)
    expect(await db.registros.where('fecha').equals(HOY).count()).toBe(2)
  })
})

describe('diaAnteriorConDatos', () => {
  it('encuentra el dia con registros mas reciente', async () => {
    const id = await db.productos.add(macarrones)
    await db.registros.add(registro(id, { fecha: '2026-09-01' }))
    await db.registros.add(registro(id, { fecha: '2026-09-05' }))
    await db.registros.add(registro(id, { fecha: '2026-09-03' }))

    expect(await diaAnteriorConDatos(HOY)).toBe('2026-09-05')
  })

  it('no mira el dia actual ni el futuro', async () => {
    const id = await db.productos.add(macarrones)
    await db.registros.add(registro(id, { fecha: HOY }))
    await db.registros.add(registro(id, { fecha: '2026-12-25' }))
    expect(await diaAnteriorConDatos(HOY)).toBeNull()
  })

  it('sin nada anterior devuelve null', async () => {
    expect(await diaAnteriorConDatos(HOY)).toBeNull()
  })

  it('cruza el cambio de año', async () => {
    const id = await db.productos.add(macarrones)
    await db.registros.add(registro(id, { fecha: '2025-12-31' }))
    expect(await diaAnteriorConDatos('2026-01-01')).toBe('2025-12-31')
  })
})
