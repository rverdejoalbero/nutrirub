import { beforeEach, describe, expect, it } from 'vitest'
import { db, guardarObjetivos, objetivosEn } from '../db/db'
import { borrarTodo, construirCopia, importar, nombreFichero } from './copia'
import type { Producto, Registro } from '../db/types'
import { unObjetivo, unProducto, unRegistro } from '../pruebas/fabricas'

const producto = (nombre: string, extra: Partial<Producto> = {}): Producto =>
  unProducto(nombre, extra)

const registro = (productoId: string, extra: Partial<Registro> = {}): Registro =>
  unRegistro(productoId, { fibra: 3.75, sal: 0.025, ...extra })

async function sembrar() {
  const id = await db.alimentos.add(producto('Macarrones', { marca: 'Gallo' }))
  await db.alimentos.add(producto('Atún', { marca: 'Calvo', kcal: 116 }))
  await db.diario.add(registro(id))
  await db.diario.add(registro(id, { fecha: '2026-09-08', momento: 'cena', creadoEn: 2001 }))
  await guardarObjetivos({ kcal: 2400, proteinas: 150, carbohidratos: 240, grasas: 75 })
}

beforeEach(async () => {
  await borrarTodo()
})

describe('construirCopia', () => {
  it('recoge las tres tablas', async () => {
    await sembrar()
    const c = await construirCopia(false)
    expect(c.app).toBe('nutrirub')
    expect(c.formato).toBe(2)
    expect(c.productos).toHaveLength(2)
    expect(c.registros).toHaveLength(2)
    expect(c.objetivos).toHaveLength(1)
  })

  it('sin fotos deja fuera el blob', async () => {
    await db.alimentos.add(
      producto('Con foto', { fotoEtiqueta: new Blob(['xxxx'], { type: 'image/jpeg' }) }),
    )
    const c = await construirCopia(false)
    expect(c.incluyeFotos).toBe(false)
    expect(c.productos[0].fotoEtiqueta).toBeUndefined()
  })

  it('con fotos las mete en base64', async () => {
    await db.alimentos.add(
      producto('Con foto', { fotoEtiqueta: new Blob(['xxxx'], { type: 'image/jpeg' }) }),
    )
    const c = await construirCopia(true)
    expect(c.incluyeFotos).toBe(true)
    expect(typeof c.productos[0].fotoEtiqueta).toBe('string')
  })

  it('la copia es serializable a JSON', async () => {
    // Si un Blob se colase sin convertir, JSON.stringify lo dejaria en {}
    // y la copia saldria silenciosamente rota.
    await sembrar()
    const texto = JSON.stringify(await construirCopia(false))
    expect(() => JSON.parse(texto)).not.toThrow()
    expect(texto).not.toContain('[object Blob]')
  })
})

describe('nombreFichero', () => {
  it('lleva la fecha y distingue si van fotos', () => {
    expect(nombreFichero(false)).toMatch(/^nutrirub-\d{4}-\d{2}-\d{2}\.json$/)
    expect(nombreFichero(true)).toMatch(/-con-fotos\.json$/)
  })
})

describe('importar en modo reemplazar', () => {
  it('restaura sobre una base vacia dejandola igual', async () => {
    // El caso que de verdad importa: movil perdido, app reinstalada.
    await sembrar()
    const antesProductos = await db.alimentos.toArray()
    const antesRegistros = await db.diario.toArray()
    const texto = JSON.stringify(await construirCopia(true))

    await borrarTodo()
    expect(await db.alimentos.count()).toBe(0)

    const r = await importar(texto, 'reemplazar')
    expect(r).toEqual({ productos: 2, registros: 2, objetivos: 1 })
    expect(await db.alimentos.toArray()).toEqual(antesProductos)
    expect(await db.diario.toArray()).toEqual(antesRegistros)
  })

  it('conserva los ids, para que los registros sigan apuntando a su producto', async () => {
    await sembrar()
    const texto = JSON.stringify(await construirCopia(false))
    const idOriginal = (await db.diario.toArray())[0].productoId

    await borrarTodo()
    await importar(texto, 'reemplazar')

    const reg = (await db.diario.toArray())[0]
    expect(reg.productoId).toBe(idOriginal)
    expect(await db.alimentos.get(reg.productoId)).toBeDefined()
  })

  it('la foto vuelve como Blob con su tamaño y su tipo', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    await db.alimentos.add(
      producto('Con foto', { fotoEtiqueta: new Blob([bytes], { type: 'image/jpeg' }) }),
    )
    const texto = JSON.stringify(await construirCopia(true))
    await borrarTodo()
    await importar(texto, 'reemplazar')

    const p = await db.alimentos.where('nombre').equals('Con foto').first()
    expect(p?.fotoEtiqueta).toBeInstanceOf(Blob)
    expect(p?.fotoEtiqueta?.size).toBe(8)
    expect(p?.fotoEtiqueta?.type).toBe('image/jpeg')
    expect(new Uint8Array(await p!.fotoEtiqueta!.arrayBuffer())).toEqual(bytes)
  })

  it('borra lo que hubiese antes', async () => {
    await sembrar()
    const texto = JSON.stringify(await construirCopia(false))
    await db.alimentos.add(producto('Sobrante'))
    await importar(texto, 'reemplazar')
    expect(await db.alimentos.where('nombre').equals('Sobrante').count()).toBe(0)
    expect(await db.alimentos.count()).toBe(2)
  })

  it('los macros congelados llegan intactos', async () => {
    await sembrar()
    const texto = JSON.stringify(await construirCopia(false))
    await borrarTodo()
    await importar(texto, 'reemplazar')
    const r = (await db.diario.toArray()).find((x) => x.fecha === '2026-09-09')!
    expect(r.kcal).toBe(448.8)
    expect(r.proteinas).toBe(15.63)
    expect(r.fibra).toBe(3.75)
    expect(r.sal).toBe(0.025)
  })
})

describe('importar en modo fusionar', () => {
  it('reimportar lo mismo no duplica nada', async () => {
    await sembrar()
    const texto = JSON.stringify(await construirCopia(false))
    const r = await importar(texto, 'fusionar')
    expect(r).toEqual({ productos: 0, registros: 0, objetivos: 0 })
    expect(await db.alimentos.count()).toBe(2)
    expect(await db.diario.count()).toBe(2)
  })

  it('añade lo que falta sin tocar lo que hay', async () => {
    await sembrar()
    const texto = JSON.stringify(await construirCopia(false))
    await borrarTodo()
    await db.alimentos.add(producto('Solo mio'))

    const r = await importar(texto, 'fusionar')
    expect(r.productos).toBe(2)
    expect(await db.alimentos.count()).toBe(3)
    expect(await db.alimentos.where('nombre').equals('Solo mio').count()).toBe(1)
  })

  it('los ids se conservan: un UUID identifica lo mismo en todos los moviles', async () => {
    // Con enteros autoincrementales habia que remapear al fusionar, y ahi vivia
    // un bug. Con UUIDs el problema desaparece: el id que trae el fichero es
    // valido tal cual.
    await sembrar()
    const idsAntes = (await db.alimentos.toArray()).map((p) => p.id).sort()
    const texto = JSON.stringify(await construirCopia(false))
    await borrarTodo()
    await db.alimentos.add(producto('Algo que ya estaba'))

    await importar(texto, 'fusionar')
    const idsDespues = (await db.alimentos.toArray()).map((p) => p.id)
    for (const id of idsAntes) expect(idsDespues).toContain(id)
    for (const reg of await db.diario.toArray()) {
      expect((await db.alimentos.get(reg.productoId))?.nombre).toBe('Macarrones')
    }
  })

  it('ante el mismo id, gana la version mas reciente', async () => {
    const p = producto('Macarrones', { kcal: 359, actualizadoEn: 100 })
    await db.alimentos.add(p)
    const texto = JSON.stringify({
      app: 'nutrirub',
      formato: 2,
      exportadoEn: 0,
      incluyeFotos: false,
      productos: [{ ...p, kcal: 400, actualizadoEn: 200 }],
      registros: [],
      objetivos: [],
    })
    await importar(texto, 'fusionar')
    expect((await db.alimentos.get(p.id))?.kcal).toBe(400)
  })

  it('una copia vieja no pisa un cambio mas nuevo del movil', async () => {
    const p = producto('Macarrones', { kcal: 359, actualizadoEn: 100 })
    const texto = JSON.stringify({
      app: 'nutrirub',
      formato: 2,
      exportadoEn: 0,
      incluyeFotos: false,
      productos: [p],
      registros: [],
      objetivos: [],
    })
    // Aqui ya lo habias corregido despues de exportar
    await db.alimentos.add({ ...p, kcal: 300, actualizadoEn: 500 })
    await importar(texto, 'fusionar')
    expect((await db.alimentos.get(p.id))?.kcal).toBe(300)
  })

  it('fusionar una copia antigua no resucita lo que borraste', async () => {
    // El borrado local es mas reciente que el fichero, asi que gana. Sin esta
    // regla, cada restauracion traeria de vuelta media despensa.
    const p = producto('Ya no lo compro', { actualizadoEn: 100 })
    const texto = JSON.stringify({
      app: 'nutrirub',
      formato: 2,
      exportadoEn: 0,
      incluyeFotos: false,
      productos: [p],
      registros: [],
      objetivos: [],
    })
    await db.alimentos.add({ ...p, borradoEn: 500, actualizadoEn: 500 })

    await importar(texto, 'fusionar')
    expect((await db.alimentos.get(p.id))?.borradoEn).toBe(500)
    expect(await construirCopia(false).then((c) => c.productos)).toHaveLength(0)
  })
})

describe('validacion de la copia', () => {
  it('rechaza un JSON que no lo es', async () => {
    await expect(importar('no soy json', 'reemplazar')).rejects.toThrow(/no es un JSON válido/i)
  })

  it('rechaza un fichero de otra app', async () => {
    await expect(importar('{"app":"otracosa"}', 'reemplazar')).rejects.toThrow(/no es una copia/i)
  })

  it('rechaza una copia sin las tablas', async () => {
    await expect(importar('{"app":"nutrirub","formato":1}', 'reemplazar')).rejects.toThrow(
      /faltan productos/i,
    )
  })

  it('rechaza un formato del futuro en vez de romper a medias', async () => {
    const c = JSON.stringify({ app: 'nutrirub', formato: 99, productos: [], registros: [] })
    await expect(importar(c, 'reemplazar')).rejects.toThrow(/versión más nueva/i)
  })

  it('no deja la base a medio borrar si la copia es invalida', async () => {
    // Lo peor posible: borrar lo que hay y luego fallar al importar.
    await sembrar()
    await expect(importar('basura', 'reemplazar')).rejects.toThrow()
    expect(await db.alimentos.count()).toBe(2)
    expect(await db.diario.count()).toBe(2)
  })

  it('tolera que falte el array de objetivos', async () => {
    const c = JSON.stringify({ app: 'nutrirub', formato: 1, productos: [], registros: [] })
    await expect(importar(c, 'reemplazar')).resolves.toEqual({
      productos: 0,
      registros: 0,
      objetivos: 0,
    })
  })
})

describe('objetivos con historico', () => {
  it('cada dia se compara con el objetivo vigente entonces', async () => {
    // Es el mismo principio que congelar los macros: cambiar el objetivo hoy
    // no debe reescribir la linea de referencia de la semana pasada.
    await db.objetivosPorFecha.add(unObjetivo('2026-01-01', { kcal: 2000, proteinas: 120, carbohidratos: 200, grasas: 60 }))
    await db.objetivosPorFecha.add(unObjetivo('2026-06-01', { kcal: 2400, proteinas: 150, carbohidratos: 240, grasas: 75 }))

    expect((await objetivosEn('2026-03-15')).kcal).toBe(2000)
    expect((await objetivosEn('2026-06-01')).kcal).toBe(2400)
    expect((await objetivosEn('2026-09-09')).kcal).toBe(2400)
  })

  it('antes del primer objetivo usa el de por defecto', async () => {
    await db.objetivosPorFecha.add(unObjetivo('2026-06-01', { kcal: 2400, proteinas: 150, carbohidratos: 240, grasas: 75 }))
    expect((await objetivosEn('2026-01-01')).kcal).toBe(2200)
  })

  it('sin ningun objetivo guardado devuelve el de por defecto', async () => {
    expect((await objetivosEn('2026-09-09')).kcal).toBe(2200)
  })

  it('cambiar dos veces el mismo dia no crea dos filas', async () => {
    await guardarObjetivos({ kcal: 2300, proteinas: 140, carbohidratos: 230, grasas: 70 })
    await guardarObjetivos({ kcal: 2500, proteinas: 160, carbohidratos: 250, grasas: 80 })
    expect(await db.objetivosPorFecha.count()).toBe(1)
    expect((await db.objetivosPorFecha.toArray())[0].kcal).toBe(2500)
  })
})

describe('platos compuestos en la copia', () => {
  /** Un plato de 200 g de macarrones sobre 560 g de peso final. */
  async function sembrarPlato() {
    const idM = await db.alimentos.add(producto('Macarrones', { marca: 'Gallo' }))
    const idT = await db.alimentos.add(producto('Tomate frito', { kcal: 82 }))
    await db.alimentos.add(
      producto('Macarrones con tomate', {
        origen: 'receta',
        kcal: 142.86,
        pesoFinal: 560,
        ingredientes: [
          { productoId: idM, nombre: 'Macarrones', cantidad: 200, unidad: 'g' },
          { productoId: idT, nombre: 'Tomate frito', cantidad: 100, unidad: 'g' },
        ],
      }),
    )
    return { idM, idT }
  }

  it('el plato viaja entero en la exportacion', async () => {
    await sembrarPlato()
    const texto = JSON.stringify(await construirCopia(false))
    await borrarTodo()
    await importar(texto, 'reemplazar')

    const plato = (await db.alimentos.toArray()).find((p) => p.origen === 'receta')!
    expect(plato.pesoFinal).toBe(560)
    expect(plato.ingredientes).toHaveLength(2)
    expect(plato.ingredientes![0].cantidad).toBe(200)
  })

  it('al reemplazar, los ingredientes siguen apuntando a su producto', async () => {
    await sembrarPlato()
    const texto = JSON.stringify(await construirCopia(false))
    await borrarTodo()
    await importar(texto, 'reemplazar')

    const plato = (await db.alimentos.toArray()).find((p) => p.origen === 'receta')!
    for (const i of plato.ingredientes!) {
      expect((await db.alimentos.get(i.productoId))?.nombre).toBe(i.nombre)
    }
  })

  it('al fusionar, los ids de los ingredientes se remapean', async () => {
    // Sin remapear, el plato acabaria apuntando a productos ajenos: sus macros
    // dejarian de tener nada que ver con lo que dice que lleva.
    await sembrarPlato()
    const texto = JSON.stringify(await construirCopia(false))
    await borrarTodo()
    // Ocupamos los primeros ids con cosas distintas para forzar el desplazamiento
    await db.alimentos.add(producto('Otra cosa'))
    await db.alimentos.add(producto('Y otra'))

    await importar(texto, 'fusionar')
    const plato = (await db.alimentos.toArray()).find((p) => p.origen === 'receta')!
    expect(plato.ingredientes).toHaveLength(2)
    for (const i of plato.ingredientes!) {
      const apuntado = await db.alimentos.get(i.productoId)
      expect(apuntado?.nombre).toBe(i.nombre)
    }
  })

  it('el favorito sobrevive a la ida y vuelta', async () => {
    await db.alimentos.add(producto('Atún', { favorito: true }))
    await db.alimentos.add(producto('Pan', { favorito: false }))
    const texto = JSON.stringify(await construirCopia(false))
    await borrarTodo()
    await importar(texto, 'reemplazar')

    const todos = await db.alimentos.toArray()
    expect(todos.find((p) => p.nombre === 'Atún')?.favorito).toBe(true)
    expect(todos.find((p) => p.nombre === 'Pan')?.favorito).toBe(false)
  })
})

describe('copias del formato 1, de antes de los UUIDs', () => {
  /** Un fichero tal y como lo exportaba la app cuando los ids eran enteros. */
  const copiaV1 = JSON.stringify({
    app: 'nutrirub',
    formato: 1,
    exportadoEn: 1_700_000_000_000,
    incluyeFotos: false,
    productos: [
      {
        id: 1,
        nombre: 'Macarrones',
        marca: 'Gallo',
        unidadBase: 'g',
        kcal: 359,
        proteinas: 12.5,
        carbohidratos: 71,
        grasas: 1.5,
        origen: 'manual',
        creadoEn: 1000,
      },
      {
        id: 2,
        nombre: 'Tomate',
        unidadBase: 'g',
        kcal: 82,
        proteinas: 1.5,
        carbohidratos: 9,
        grasas: 4,
        origen: 'manual',
        creadoEn: 1001,
      },
      {
        id: 3,
        nombre: 'Macarrones con tomate',
        unidadBase: 'g',
        kcal: 142.86,
        proteinas: 4.73,
        carbohidratos: 26.96,
        grasas: 1.25,
        origen: 'receta',
        pesoFinal: 560,
        ingredientes: [
          { productoId: 1, nombre: 'Macarrones', cantidad: 200, unidad: 'g' },
          { productoId: 2, nombre: 'Tomate', cantidad: 100, unidad: 'g' },
        ],
        creadoEn: 1002,
      },
    ],
    registros: [
      {
        id: 1,
        fecha: '2026-09-09',
        momento: 'comida',
        productoId: 1,
        nombreProducto: 'Macarrones · Gallo',
        cantidad: 125,
        unidad: 'g',
        kcal: 448.8,
        proteinas: 15.63,
        carbohidratos: 88.75,
        grasas: 1.88,
        creadoEn: 2000,
      },
    ],
    objetivos: [
      { id: 1, desde: '2026-01-01', kcal: 2000, proteinas: 120, carbohidratos: 200, grasas: 60 },
    ],
  })

  it('se importa sin quejarse', async () => {
    // Si esto fallase, cualquier copia guardada antes del cambio seria papel
    // mojado justo el dia que hiciera falta.
    const r = await importar(copiaV1, 'reemplazar')
    expect(r).toEqual({ productos: 3, registros: 1, objetivos: 1 })
  })

  it('los ids enteros se convierten en UUIDs', async () => {
    await importar(copiaV1, 'reemplazar')
    for (const p of await db.alimentos.toArray()) {
      expect(typeof p.id).toBe('string')
      expect(p.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i)
    }
  })

  it('el registro sigue apuntando a sus macarrones', async () => {
    await importar(copiaV1, 'reemplazar')
    const r = (await db.diario.toArray())[0]
    expect((await db.alimentos.get(r.productoId))?.nombre).toBe('Macarrones')
    expect(r.kcal).toBe(448.8)
  })

  it('los ingredientes del plato tambien se traducen', async () => {
    await importar(copiaV1, 'reemplazar')
    const plato = (await db.alimentos.toArray()).find((p) => p.origen === 'receta')!
    expect(plato.ingredientes).toHaveLength(2)
    for (const i of plato.ingredientes!) {
      expect((await db.alimentos.get(i.productoId))?.nombre).toBe(i.nombre)
    }
    expect(plato.pesoFinal).toBe(560)
  })

  it('todo queda con marca de tiempo, listo para sincronizar', async () => {
    await importar(copiaV1, 'reemplazar')
    for (const p of await db.alimentos.toArray()) {
      expect(p.actualizadoEn).toBeGreaterThan(0)
      expect(p.creadoEn).toBeGreaterThan(0)
    }
  })

  it('conserva la fecha de alta original', async () => {
    await importar(copiaV1, 'reemplazar')
    const m = (await db.alimentos.toArray()).find((p) => p.nombre === 'Macarrones')!
    expect(m.creadoEn).toBe(1000)
  })
})
