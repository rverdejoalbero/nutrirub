import { beforeEach, describe, expect, it } from 'vitest'
import { db, guardarObjetivos, objetivosEn } from '../db/db'
import { borrarTodo, construirCopia, importar, nombreFichero } from './copia'
import type { Producto, Registro } from '../db/types'

const producto = (nombre: string, extra: Partial<Producto> = {}): Producto => ({
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

const registro = (productoId: number, extra: Partial<Registro> = {}): Registro => ({
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
  fibra: 3.75,
  sal: 0.025,
  creadoEn: 2000,
  ...extra,
})

async function sembrar() {
  const id = await db.productos.add(producto('Macarrones', { marca: 'Gallo' }))
  await db.productos.add(producto('Atún', { marca: 'Calvo', kcal: 116 }))
  await db.registros.add(registro(id))
  await db.registros.add(registro(id, { fecha: '2026-09-08', momento: 'cena', creadoEn: 2001 }))
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
    expect(c.formato).toBe(1)
    expect(c.productos).toHaveLength(2)
    expect(c.registros).toHaveLength(2)
    expect(c.objetivos).toHaveLength(1)
  })

  it('sin fotos deja fuera el blob', async () => {
    await db.productos.add(
      producto('Con foto', { fotoEtiqueta: new Blob(['xxxx'], { type: 'image/jpeg' }) }),
    )
    const c = await construirCopia(false)
    expect(c.incluyeFotos).toBe(false)
    expect(c.productos[0].fotoEtiqueta).toBeUndefined()
  })

  it('con fotos las mete en base64', async () => {
    await db.productos.add(
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
    const antesProductos = await db.productos.toArray()
    const antesRegistros = await db.registros.toArray()
    const texto = JSON.stringify(await construirCopia(true))

    await borrarTodo()
    expect(await db.productos.count()).toBe(0)

    const r = await importar(texto, 'reemplazar')
    expect(r).toEqual({ productos: 2, registros: 2, objetivos: 1 })
    expect(await db.productos.toArray()).toEqual(antesProductos)
    expect(await db.registros.toArray()).toEqual(antesRegistros)
  })

  it('conserva los ids, para que los registros sigan apuntando a su producto', async () => {
    await sembrar()
    const texto = JSON.stringify(await construirCopia(false))
    const idOriginal = (await db.registros.toArray())[0].productoId

    await borrarTodo()
    await importar(texto, 'reemplazar')

    const reg = (await db.registros.toArray())[0]
    expect(reg.productoId).toBe(idOriginal)
    expect(await db.productos.get(reg.productoId)).toBeDefined()
  })

  it('la foto vuelve como Blob con su tamaño y su tipo', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    await db.productos.add(
      producto('Con foto', { fotoEtiqueta: new Blob([bytes], { type: 'image/jpeg' }) }),
    )
    const texto = JSON.stringify(await construirCopia(true))
    await borrarTodo()
    await importar(texto, 'reemplazar')

    const p = await db.productos.where('nombre').equals('Con foto').first()
    expect(p?.fotoEtiqueta).toBeInstanceOf(Blob)
    expect(p?.fotoEtiqueta?.size).toBe(8)
    expect(p?.fotoEtiqueta?.type).toBe('image/jpeg')
    expect(new Uint8Array(await p!.fotoEtiqueta!.arrayBuffer())).toEqual(bytes)
  })

  it('borra lo que hubiese antes', async () => {
    await sembrar()
    const texto = JSON.stringify(await construirCopia(false))
    await db.productos.add(producto('Sobrante'))
    await importar(texto, 'reemplazar')
    expect(await db.productos.where('nombre').equals('Sobrante').count()).toBe(0)
    expect(await db.productos.count()).toBe(2)
  })

  it('los macros congelados llegan intactos', async () => {
    await sembrar()
    const texto = JSON.stringify(await construirCopia(false))
    await borrarTodo()
    await importar(texto, 'reemplazar')
    const r = (await db.registros.toArray()).find((x) => x.fecha === '2026-09-09')!
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
    expect(await db.productos.count()).toBe(2)
    expect(await db.registros.count()).toBe(2)
  })

  it('añade lo que falta sin tocar lo que hay', async () => {
    await sembrar()
    const texto = JSON.stringify(await construirCopia(false))
    await borrarTodo()
    await db.productos.add(producto('Solo mio'))

    const r = await importar(texto, 'fusionar')
    expect(r.productos).toBe(2)
    expect(await db.productos.count()).toBe(3)
    expect(await db.productos.where('nombre').equals('Solo mio').count()).toBe(1)
  })

  it('remapea los ids para que los registros no apunten a otro producto', async () => {
    // Al fusionar, los ids del fichero chocan con los de la base. Si no se
    // remapean, un registro de macarrones acabaria colgando de otra cosa.
    await sembrar()
    const texto = JSON.stringify(await construirCopia(false))
    await borrarTodo()
    // Ocupamos el id 1 con algo distinto
    await db.productos.add(producto('Ocupa el hueco'))

    await importar(texto, 'fusionar')
    for (const reg of await db.registros.toArray()) {
      const p = await db.productos.get(reg.productoId)
      expect(p?.nombre).toBe('Macarrones')
    }
  })

  it('distingue dos productos con el mismo nombre y distinta marca', async () => {
    await db.productos.add(producto('Yogur', { marca: 'Danone' }))
    const texto = JSON.stringify(await construirCopia(false))
    await borrarTodo()
    await db.productos.add(producto('Yogur', { marca: 'Pascual' }))

    const r = await importar(texto, 'fusionar')
    expect(r.productos).toBe(1)
    expect(await db.productos.count()).toBe(2)
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
    expect(await db.productos.count()).toBe(2)
    expect(await db.registros.count()).toBe(2)
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
    await db.objetivos.add({ desde: '2026-01-01', kcal: 2000, proteinas: 120, carbohidratos: 200, grasas: 60 })
    await db.objetivos.add({ desde: '2026-06-01', kcal: 2400, proteinas: 150, carbohidratos: 240, grasas: 75 })

    expect((await objetivosEn('2026-03-15')).kcal).toBe(2000)
    expect((await objetivosEn('2026-06-01')).kcal).toBe(2400)
    expect((await objetivosEn('2026-09-09')).kcal).toBe(2400)
  })

  it('antes del primer objetivo usa el de por defecto', async () => {
    await db.objetivos.add({ desde: '2026-06-01', kcal: 2400, proteinas: 150, carbohidratos: 240, grasas: 75 })
    expect((await objetivosEn('2026-01-01')).kcal).toBe(2200)
  })

  it('sin ningun objetivo guardado devuelve el de por defecto', async () => {
    expect((await objetivosEn('2026-09-09')).kcal).toBe(2200)
  })

  it('cambiar dos veces el mismo dia no crea dos filas', async () => {
    await guardarObjetivos({ kcal: 2300, proteinas: 140, carbohidratos: 230, grasas: 70 })
    await guardarObjetivos({ kcal: 2500, proteinas: 160, carbohidratos: 250, grasas: 80 })
    expect(await db.objetivos.count()).toBe(1)
    expect((await db.objetivos.toArray())[0].kcal).toBe(2500)
  })
})

describe('platos compuestos en la copia', () => {
  /** Un plato de 200 g de macarrones sobre 560 g de peso final. */
  async function sembrarPlato() {
    const idM = await db.productos.add(producto('Macarrones', { marca: 'Gallo' }))
    const idT = await db.productos.add(producto('Tomate frito', { kcal: 82 }))
    await db.productos.add(
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

    const plato = (await db.productos.toArray()).find((p) => p.origen === 'receta')!
    expect(plato.pesoFinal).toBe(560)
    expect(plato.ingredientes).toHaveLength(2)
    expect(plato.ingredientes![0].cantidad).toBe(200)
  })

  it('al reemplazar, los ingredientes siguen apuntando a su producto', async () => {
    await sembrarPlato()
    const texto = JSON.stringify(await construirCopia(false))
    await borrarTodo()
    await importar(texto, 'reemplazar')

    const plato = (await db.productos.toArray()).find((p) => p.origen === 'receta')!
    for (const i of plato.ingredientes!) {
      expect((await db.productos.get(i.productoId))?.nombre).toBe(i.nombre)
    }
  })

  it('al fusionar, los ids de los ingredientes se remapean', async () => {
    // Sin remapear, el plato acabaria apuntando a productos ajenos: sus macros
    // dejarian de tener nada que ver con lo que dice que lleva.
    await sembrarPlato()
    const texto = JSON.stringify(await construirCopia(false))
    await borrarTodo()
    // Ocupamos los primeros ids con cosas distintas para forzar el desplazamiento
    await db.productos.add(producto('Otra cosa'))
    await db.productos.add(producto('Y otra'))

    await importar(texto, 'fusionar')
    const plato = (await db.productos.toArray()).find((p) => p.origen === 'receta')!
    expect(plato.ingredientes).toHaveLength(2)
    for (const i of plato.ingredientes!) {
      const apuntado = await db.productos.get(i.productoId)
      expect(apuntado?.nombre).toBe(i.nombre)
    }
  })

  it('el favorito sobrevive a la ida y vuelta', async () => {
    await db.productos.add(producto('Atún', { favorito: true }))
    await db.productos.add(producto('Pan', { favorito: false }))
    const texto = JSON.stringify(await construirCopia(false))
    await borrarTodo()
    await importar(texto, 'reemplazar')

    const todos = await db.productos.toArray()
    expect(todos.find((p) => p.nombre === 'Atún')?.favorito).toBe(true)
    expect(todos.find((p) => p.nombre === 'Pan')?.favorito).toBe(false)
  })
})
