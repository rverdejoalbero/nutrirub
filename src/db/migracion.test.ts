import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { NutriDB } from './db'

let n = 0
const nombreSuelto = () => `nutrirub-prueba-${Date.now()}-${n++}`

/** Una base tal y como la dejaba la version 1: ids enteros, sin sincronizacion. */
async function crearBaseV1(nombre: string) {
  const vieja = new Dexie(nombre)
  vieja.version(1).stores({
    productos: '++id, nombre, codigoBarras, ultimoUso',
    registros: '++id, fecha, productoId',
    objetivos: '++id, desde',
  })
  await vieja.open()
  return vieja
}

const productoV1 = (nombre: string, extra: Record<string, unknown> = {}) => ({
  nombre,
  unidadBase: 'g',
  kcal: 359,
  proteinas: 12.5,
  carbohidratos: 71,
  grasas: 1.5,
  origen: 'manual',
  creadoEn: 1000,
  ...extra,
})

const registroV1 = (productoId: number, extra: Record<string, unknown> = {}) => ({
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
  creadoEn: 2000,
  ...extra,
})

/** Rellena una base v1, la cierra y la vuelve a abrir ya migrada. */
async function migrar(sembrar: (v: Dexie) => Promise<void>) {
  const nombre = nombreSuelto()
  const vieja = await crearBaseV1(nombre)
  await sembrar(vieja)
  vieja.close()

  const nueva = new NutriDB(nombre)
  await nueva.open()
  return nueva
}

describe('migracion de la v1 a UUIDs', () => {
  it('trae los alimentos con id nuevo y conserva sus datos', async () => {
    const db = await migrar(async (v) => {
      await v.table('productos').add(productoV1('Macarrones', { marca: 'Gallo', fibra: 3 }))
    })

    const alimentos = await db.alimentos.toArray()
    expect(alimentos).toHaveLength(1)
    const a = alimentos[0]
    expect(a.nombre).toBe('Macarrones')
    expect(a.marca).toBe('Gallo')
    expect(a.kcal).toBe(359)
    expect(a.fibra).toBe(3)
    // El id ya no es un numero, es un UUID
    expect(typeof a.id).toBe('string')
    expect(a.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i)
    db.close()
  })

  it('conserva creadoEn y pone actualizadoEn', async () => {
    const db = await migrar(async (v) => {
      await v.table('productos').add(productoV1('Macarrones'))
    })
    const a = (await db.alimentos.toArray())[0]
    // La fecha de alta es historia y no se toca; la de actualizacion nace hoy
    expect(a.creadoEn).toBe(1000)
    expect(a.actualizadoEn).toBeGreaterThan(1000)
    expect(a.borradoEn).toBeUndefined()
    db.close()
  })

  it('un registro sigue apuntando a SU producto, no a otro', async () => {
    // Lo que de verdad puede romperse: si el mapa de ids se aplica mal, un
    // registro de macarrones acaba colgando del atun.
    const db = await migrar(async (v) => {
      const idM = (await v.table('productos').add(productoV1('Macarrones'))) as number
      const idA = (await v.table('productos').add(productoV1('Atún', { kcal: 116 }))) as number
      await v.table('registros').add(registroV1(idM, { nombreProducto: 'Macarrones' }))
      await v.table('registros').add(registroV1(idA, { nombreProducto: 'Atún' }))
    })

    const porId = new Map((await db.alimentos.toArray()).map((a) => [a.id, a.nombre]))
    const diario = await db.diario.toArray()
    expect(diario).toHaveLength(2)
    for (const r of diario) {
      expect(porId.get(r.productoId)).toBe(r.nombreProducto)
    }
    db.close()
  })

  it('los ingredientes de un plato tambien se remapean', async () => {
    const db = await migrar(async (v) => {
      const idM = (await v.table('productos').add(productoV1('Macarrones'))) as number
      const idT = (await v.table('productos').add(productoV1('Tomate', { kcal: 82 }))) as number
      await v.table('productos').add(
        productoV1('Macarrones con tomate', {
          origen: 'receta',
          pesoFinal: 560,
          ingredientes: [
            { productoId: idM, nombre: 'Macarrones', cantidad: 200, unidad: 'g' },
            { productoId: idT, nombre: 'Tomate', cantidad: 100, unidad: 'g' },
          ],
        }),
      )
    })

    const alimentos = await db.alimentos.toArray()
    const porId = new Map(alimentos.map((a) => [a.id, a.nombre]))
    const plato = alimentos.find((a) => a.origen === 'receta')!
    expect(plato.ingredientes).toHaveLength(2)
    for (const i of plato.ingredientes!) {
      expect(typeof i.productoId).toBe('string')
      expect(porId.get(i.productoId)).toBe(i.nombre)
    }
    db.close()
  })

  it('una referencia ya rota no revienta la migracion', async () => {
    // Si el producto se borro antes de migrar, el registro ya estaba colgando.
    // Peor que dejarlo colgando seria perder la comida o abortar la migracion.
    const db = await migrar(async (v) => {
      await v.table('registros').add(registroV1(999, { nombreProducto: 'Fantasma' }))
    })
    const r = (await db.diario.toArray())[0]
    expect(r.nombreProducto).toBe('Fantasma')
    expect(typeof r.productoId).toBe('string')
    expect(await db.alimentos.get(r.productoId)).toBeUndefined()
    db.close()
  })

  it('los macros congelados llegan intactos', async () => {
    const db = await migrar(async (v) => {
      const id = (await v.table('productos').add(productoV1('Macarrones'))) as number
      await v.table('registros').add(registroV1(id, { fibra: 3.75, sal: 0.025 }))
    })
    const r = (await db.diario.toArray())[0]
    expect(r.kcal).toBe(448.8)
    expect(r.proteinas).toBe(15.63)
    expect(r.fibra).toBe(3.75)
    expect(r.sal).toBe(0.025)
    expect(r.cantidad).toBe(125)
    db.close()
  })

  it('los objetivos con su historico sobreviven', async () => {
    const db = await migrar(async (v) => {
      await v.table('objetivos').add({
        desde: '2026-01-01',
        kcal: 2000,
        proteinas: 120,
        carbohidratos: 200,
        grasas: 60,
      })
      await v.table('objetivos').add({
        desde: '2026-06-01',
        kcal: 2400,
        proteinas: 150,
        carbohidratos: 240,
        grasas: 75,
      })
    })
    const metas = (await db.objetivosPorFecha.toArray()).sort((a, b) =>
      a.desde.localeCompare(b.desde),
    )
    expect(metas.map((m) => m.kcal)).toEqual([2000, 2400])
    expect(metas.every((m) => typeof m.id === 'string')).toBe(true)
    db.close()
  })

  it('la foto de la etiqueta sigue siendo un Blob', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const db = await migrar(async (v) => {
      await v
        .table('productos')
        .add(productoV1('Con foto', { fotoEtiqueta: new Blob([bytes], { type: 'image/jpeg' }) }))
    })
    const a = (await db.alimentos.toArray())[0]
    expect(a.fotoEtiqueta).toBeInstanceOf(Blob)
    expect(a.fotoEtiqueta!.size).toBe(4)
    db.close()
  })

  it('las tablas viejas se quedan vacias y desaparecen', async () => {
    const db = await migrar(async (v) => {
      await v.table('productos').add(productoV1('Macarrones'))
    })
    expect(db.tables.map((t) => t.name).sort()).toEqual(['alimentos', 'diario', 'objetivosPorFecha'])
    db.close()
  })

  it('una base vacia migra sin quejarse', async () => {
    const db = await migrar(async () => {})
    expect(await db.alimentos.count()).toBe(0)
    expect(await db.diario.count()).toBe(0)
    db.close()
  })

  it('no pierde ni duplica nada con varios registros', async () => {
    const db = await migrar(async (v) => {
      const ids: number[] = []
      for (let i = 0; i < 5; i++) {
        ids.push((await v.table('productos').add(productoV1(`Producto ${i}`))) as number)
      }
      for (let d = 1; d <= 4; d++) {
        for (const id of ids) {
          await v.table('registros').add(registroV1(id, { fecha: `2026-09-0${d}` }))
        }
      }
    })
    expect(await db.alimentos.count()).toBe(5)
    expect(await db.diario.count()).toBe(20)
    // Y todos los ids son distintos entre si
    const ids = (await db.diario.toArray()).map((r) => r.id)
    expect(new Set(ids).size).toBe(20)
    db.close()
  })

  it('abrir una base ya migrada no la vuelve a migrar', async () => {
    const nombre = nombreSuelto()
    const vieja = await crearBaseV1(nombre)
    await vieja.table('productos').add(productoV1('Macarrones'))
    vieja.close()

    const primera = new NutriDB(nombre)
    await primera.open()
    const idTrasMigrar = (await primera.alimentos.toArray())[0].id
    primera.close()

    const segunda = new NutriDB(nombre)
    await segunda.open()
    expect(await segunda.alimentos.count()).toBe(1)
    expect((await segunda.alimentos.toArray())[0].id).toBe(idTrasMigrar)
    segunda.close()
  })
})

describe('base nueva, sin nada que migrar', () => {
  it('arranca directamente en el esquema nuevo', async () => {
    const db = new NutriDB(nombreSuelto())
    await db.open()
    expect(db.tables.map((t) => t.name).sort()).toEqual(['alimentos', 'diario', 'objetivosPorFecha'])
    expect(await db.alimentos.count()).toBe(0)
    db.close()
  })
})
