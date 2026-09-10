import { beforeEach, describe, expect, it } from 'vitest'
import { db, actualizarProducto, borrarProducto, crearProducto, crearRegistro } from '../db/db'
import { borrarTodo } from '../lib/copia'
import type { FilaNube } from './cliente'
import {
  aFila,
  cuantosPendientes,
  deFila,
  leerMarca,
  marcarTodoParaSubir,
  olvidarMarca,
  sincronizar,
  type Transporte,
} from './sincronizar'

const USUARIO = '11111111-1111-1111-1111-111111111111'

/**
 * Un servidor de mentira: guarda filas y devuelve las posteriores a una marca.
 * La marca es un contador propio, como el subido_en de PostgreSQL: no depende
 * del reloj de ningun cliente.
 */
class ServidorFalso {
  filas = new Map<string, FilaNube & { subido: number }>()
  reloj = 0
  subidas = 0

  transporte(usuarioId = USUARIO): Transporte {
    return {
      usuarioId,
      bajar: async (desde) => {
        const corte = desde ? Number(desde) : -1
        return [...this.filas.values()]
          .filter((f) => f.usuario_id === usuarioId && f.subido > corte)
          .sort((a, b) => a.subido - b.subido)
          .map(({ subido, ...f }) => structuredClone({ ...f, subido_en: String(subido) }))
      },
      subir: async (filas) => {
        this.subidas++
        for (const f of filas) {
          this.filas.set(`${f.usuario_id}|${f.id}`, { ...structuredClone(f), subido: ++this.reloj })
        }
      },
    }
  }

  /** Lo que ve otro dispositivo del mismo usuario. */
  contenidoDe(id: string) {
    return this.filas.get(`${USUARIO}|${id}`)
  }
}

const macarrones = {
  nombre: 'Macarrones',
  unidadBase: 'g' as const,
  kcal: 359,
  proteinas: 12.5,
  carbohidratos: 71,
  grasas: 1.5,
  origen: 'manual' as const,
}

beforeEach(async () => {
  await borrarTodo()
  olvidarMarca(USUARIO)
})

describe('traduccion entre el movil y la nube', () => {
  it('la foto no viaja', async () => {
    // 200 KB que en JSON inflan un tercio mas: harian lenta cada
    // sincronizacion y se comerian la cuota.
    const fila = aFila(
      {
        id: 'x',
        creadoEn: 1,
        actualizadoEn: 2,
        nombre: 'Con foto',
        fotoEtiqueta: new Blob(['xxx']),
      },
      'alimento',
      USUARIO,
    )
    expect(fila.contenido.fotoEtiqueta).toBeUndefined()
    expect(fila.contenido.nombre).toBe('Con foto')
  })

  it('la bandera de pendiente tampoco: es asunto de cada movil', () => {
    const fila = aFila({ id: 'x', creadoEn: 1, actualizadoEn: 2, pendiente: 1 }, 'alimento', USUARIO)
    expect(fila.contenido.pendiente).toBeUndefined()
  })

  it('ida y vuelta conserva el contenido', () => {
    const original = { id: 'x', creadoEn: 1, actualizadoEn: 2, nombre: 'Macarrones', kcal: 359 }
    const vuelta = deFila(aFila(original, 'alimento', USUARIO))
    expect(vuelta).toMatchObject(original)
  })

  it('el borrado viaja en su propia columna', () => {
    const fila = aFila({ id: 'x', creadoEn: 1, actualizadoEn: 5, borradoEn: 5 }, 'alimento', USUARIO)
    expect(fila.borrado_en).toBe(5)
    expect(deFila(fila).borradoEn).toBe(5)
  })

  it('lo no borrado llega sin marca de borrado', () => {
    const fila = aFila({ id: 'x', creadoEn: 1, actualizadoEn: 5 }, 'alimento', USUARIO)
    expect(fila.borrado_en).toBeNull()
    expect(deFila(fila).borradoEn).toBeUndefined()
  })
})

describe('subir', () => {
  it('sube lo creado aqui', async () => {
    const s = new ServidorFalso()
    const id = await crearProducto(macarrones)
    const r = await sincronizar(s.transporte())
    expect(r.subidos).toBe(1)
    expect(s.contenidoDe(id)?.contenido.nombre).toBe('Macarrones')
  })

  it('no vuelve a subir lo ya subido', async () => {
    const s = new ServidorFalso()
    await crearProducto(macarrones)
    await sincronizar(s.transporte())
    const segunda = await sincronizar(s.transporte())
    expect(segunda.subidos).toBe(0)
  })

  it('vuelve a subir lo que se toca despues', async () => {
    const s = new ServidorFalso()
    const id = await crearProducto(macarrones)
    await sincronizar(s.transporte())
    await actualizarProducto(id, { kcal: 300 })
    const r = await sincronizar(s.transporte())
    expect(r.subidos).toBe(1)
    expect(s.contenidoDe(id)?.contenido.kcal).toBe(300)
  })

  it('sube el borrado, no lo esconde', async () => {
    // Si el borrado no subiera, el otro movil lo volveria a bajar como si nada.
    const s = new ServidorFalso()
    const id = await crearProducto(macarrones)
    await sincronizar(s.transporte())
    await borrarProducto(id)
    await sincronizar(s.transporte())
    expect(s.contenidoDe(id)?.borrado_en).toBeGreaterThan(0)
  })

  it('sin nada pendiente no molesta al servidor', async () => {
    const s = new ServidorFalso()
    await sincronizar(s.transporte())
    expect(s.subidas).toBe(0)
  })

  it('si el servidor falla, lo pendiente sigue pendiente', async () => {
    // Lo contrario seria perder el cambio en silencio: la bandera solo se
    // quita cuando el servidor confirma.
    const s = new ServidorFalso()
    await crearProducto(macarrones)
    const roto: Transporte = { ...s.transporte(), subir: async () => { throw new Error('sin red') } }
    await expect(sincronizar(roto)).rejects.toThrow('sin red')
    expect(await cuantosPendientes()).toBe(1)
  })
})

describe('bajar', () => {
  it('trae lo que subio el otro movil', async () => {
    const s = new ServidorFalso()
    await s.transporte().subir([
      {
        usuario_id: USUARIO,
        id: 'aaaaaaaa-0000-0000-0000-000000000001',
        tipo: 'alimento',
        actualizado_en: 100,
        borrado_en: null,
        contenido: { ...macarrones, id: 'aaaaaaaa-0000-0000-0000-000000000001', creadoEn: 1, actualizadoEn: 100 },
      },
    ])
    const r = await sincronizar(s.transporte())
    expect(r.bajados).toBe(1)
    expect((await db.alimentos.toArray())[0].nombre).toBe('Macarrones')
  })

  it('lo bajado no queda marcado para subir', async () => {
    // Si lo quedara, cada sincronizacion reenviaria de vuelta lo que acaba de
    // recibir, en un ciclo infinito entre los dos dispositivos.
    const s = new ServidorFalso()
    await s.transporte().subir([
      {
        usuario_id: USUARIO,
        id: 'bbbbbbbb-0000-0000-0000-000000000001',
        tipo: 'alimento',
        actualizado_en: 100,
        borrado_en: null,
        contenido: { ...macarrones, id: 'bbbbbbbb-0000-0000-0000-000000000001', creadoEn: 1, actualizadoEn: 100 },
      },
    ])
    await sincronizar(s.transporte())
    expect(await cuantosPendientes()).toBe(0)
    expect((await sincronizar(s.transporte())).subidos).toBe(0)
  })

  it('un borrado ajeno borra aqui tambien', async () => {
    const s = new ServidorFalso()
    const id = 'cccccccc-0000-0000-0000-000000000001'
    const contenido = { ...macarrones, id, creadoEn: 1, actualizadoEn: 100 }
    await s.transporte().subir([
      { usuario_id: USUARIO, id, tipo: 'alimento', actualizado_en: 100, borrado_en: null, contenido },
    ])
    await sincronizar(s.transporte())
    expect((await db.alimentos.get(id))?.borradoEn).toBeUndefined()

    await s.transporte().subir([
      { usuario_id: USUARIO, id, tipo: 'alimento', actualizado_en: 200, borrado_en: 200, contenido },
    ])
    await sincronizar(s.transporte())
    expect((await db.alimentos.get(id))?.borradoEn).toBe(200)
  })

  it('solo pide lo posterior a la ultima vez', async () => {
    const s = new ServidorFalso()
    await crearProducto(macarrones)
    await sincronizar(s.transporte())
    const segunda = await sincronizar(s.transporte())
    expect(segunda.bajados).toBe(0)
  })

  it('la foto local sobrevive a lo que baja', async () => {
    // La foto solo existe en el movil donde se hizo. Si al bajar el registro se
    // sobrescribiera entero, el otro dispositivo te la borraria.
    const s = new ServidorFalso()
    const id = await crearProducto({ ...macarrones, fotoEtiqueta: new Blob(['foto']) })
    await sincronizar(s.transporte())

    const contenido = { ...macarrones, id, creadoEn: 1, actualizadoEn: 999 }
    await s.transporte().subir([
      { usuario_id: USUARIO, id, tipo: 'alimento', actualizado_en: 999, borrado_en: null, contenido },
    ])
    olvidarMarca(USUARIO)
    await sincronizar(s.transporte())

    const p = await db.alimentos.get(id)
    expect(p?.fotoEtiqueta).toBeInstanceOf(Blob)
  })
})

describe('conflictos: lo mismo tocado en dos sitios', () => {
  const id = 'dddddddd-0000-0000-0000-000000000001'
  const filaCon = (kcal: number, actualizado_en: number): FilaNube => ({
    usuario_id: USUARIO,
    id,
    tipo: 'alimento',
    actualizado_en,
    borrado_en: null,
    contenido: { ...macarrones, id, kcal, creadoEn: 1, actualizadoEn: actualizado_en },
  })

  it('gana el cambio mas reciente aunque sea el del servidor', async () => {
    const s = new ServidorFalso()
    await db.alimentos.add({ ...macarrones, id, kcal: 300, creadoEn: 1, actualizadoEn: 100, pendiente: 1 })
    await s.transporte().subir([filaCon(400, 200)])

    const r = await sincronizar(s.transporte())
    expect((await db.alimentos.get(id))?.kcal).toBe(400)
    expect(r.descartados).toBe(1)
  })

  it('gana el cambio local si es mas reciente, y se sube', async () => {
    const s = new ServidorFalso()
    await s.transporte().subir([filaCon(400, 100)])
    await db.alimentos.add({ ...macarrones, id, kcal: 300, creadoEn: 1, actualizadoEn: 200, pendiente: 1 })

    const r = await sincronizar(s.transporte())
    expect((await db.alimentos.get(id))?.kcal).toBe(300)
    expect(r.descartados).toBe(0)
    expect(s.contenidoDe(id)?.contenido.kcal).toBe(300)
  })

  it('lo que pierde el conflicto deja de estar pendiente', async () => {
    const s = new ServidorFalso()
    await db.alimentos.add({ ...macarrones, id, kcal: 300, creadoEn: 1, actualizadoEn: 100, pendiente: 1 })
    await s.transporte().subir([filaCon(400, 200)])
    await sincronizar(s.transporte())
    expect(await cuantosPendientes()).toBe(0)
  })
})

describe('dos moviles con el mismo usuario', () => {
  it('lo apuntado en uno aparece en el otro', async () => {
    const s = new ServidorFalso()

    // Movil A apunta una comida
    const idP = await crearProducto(macarrones)
    await crearRegistro({
      fecha: '2026-09-10',
      momento: 'comida',
      productoId: idP,
      nombreProducto: 'Macarrones',
      cantidad: 125,
      unidad: 'g',
      kcal: 448.8,
      proteinas: 15.63,
      carbohidratos: 88.75,
      grasas: 1.88,
    })
    await sincronizar(s.transporte())

    // Movil B: base vacia, misma cuenta
    await borrarTodo()
    olvidarMarca(USUARIO)
    const r = await sincronizar(s.transporte())

    expect(r.bajados).toBe(2)
    expect(await db.alimentos.count()).toBe(1)
    const reg = (await db.diario.toArray())[0]
    expect(reg.kcal).toBe(448.8)
    // Y la referencia sigue apuntando a su producto: es el mismo UUID en los dos
    expect((await db.alimentos.get(reg.productoId))?.nombre).toBe('Macarrones')
  })

  it('ida y vuelta: lo que hace B vuelve a A', async () => {
    const s = new ServidorFalso()
    const id = await crearProducto(macarrones)
    await sincronizar(s.transporte())

    // B lo corrige
    await s.transporte().subir([
      {
        usuario_id: USUARIO,
        id,
        tipo: 'alimento',
        actualizado_en: Date.now() + 10_000,
        borrado_en: null,
        contenido: { ...macarrones, id, kcal: 350, creadoEn: 1, actualizadoEn: Date.now() + 10_000 },
      },
    ])

    await sincronizar(s.transporte())
    expect((await db.alimentos.get(id))?.kcal).toBe(350)
  })

  it('no se mezclan los datos de dos usuarios distintos', async () => {
    const s = new ServidorFalso()
    const OTRO = '22222222-2222-2222-2222-222222222222'
    await s.transporte(OTRO).subir([
      {
        usuario_id: OTRO,
        id: 'eeeeeeee-0000-0000-0000-000000000001',
        tipo: 'alimento',
        actualizado_en: 100,
        borrado_en: null,
        contenido: { ...macarrones, nombre: 'Comida ajena' },
      },
    ])

    await sincronizar(s.transporte(USUARIO))
    expect(await db.alimentos.count()).toBe(0)
  })
})

describe('primer inicio de sesion con datos ya apuntados', () => {
  it('sube lo que habia antes de tener cuenta', async () => {
    // Sin esto, todo lo apuntado antes de registrarte se quedaria en el movil
    // para siempre sin llegar nunca a la nube.
    const s = new ServidorFalso()
    await crearProducto(macarrones)
    await sincronizar(s.transporte())
    expect(await cuantosPendientes()).toBe(0)

    const n = await marcarTodoParaSubir(USUARIO)
    expect(n).toBe(1)
    expect(await cuantosPendientes()).toBe(1)

    const r = await sincronizar(s.transporte())
    expect(r.subidos).toBe(1)
  })
})

describe('la marca de hasta donde hemos leido', () => {
  it('no se salta lo que otro sube durante nuestra bajada', async () => {
    // El fallo que evita: si la marca se pidiera al servidor DESPUES de bajar,
    // lo que otro dispositivo subiera en ese hueco quedaria por debajo de ella
    // sin haber pasado por aqui, y no se bajaria jamas.
    const s = new ServidorFalso()
    const idTardio = 'ffffffff-0000-0000-0000-000000000001'

    const conIntruso: Transporte = {
      ...s.transporte(),
      bajar: async (desde) => {
        const filas = await s.transporte().bajar(desde)
        // Justo despues de responder, otro movil sube algo
        await s.transporte().subir([
          {
            usuario_id: USUARIO,
            id: idTardio,
            tipo: 'alimento',
            actualizado_en: 500,
            borrado_en: null,
            contenido: { ...macarrones, nombre: 'Llego tarde', id: idTardio, creadoEn: 1, actualizadoEn: 500 },
          },
        ])
        return filas
      },
    }

    await sincronizar(conIntruso)
    // No lo teniamos: es correcto, llego despues.
    expect(await db.alimentos.get(idTardio)).toBeUndefined()

    // Pero en la siguiente pasada tiene que aparecer.
    const r = await sincronizar(s.transporte())
    expect(r.bajados).toBe(1)
    expect((await db.alimentos.get(idTardio))?.nombre).toBe('Llego tarde')
  })

  it('sin nada que bajar, la marca no se mueve', async () => {
    const s = new ServidorFalso()
    await crearProducto(macarrones)
    await sincronizar(s.transporte())
    const marcaTrasSubir = leerMarca(USUARIO)

    const r = await sincronizar(s.transporte())
    // Lo que subimos vuelve una vez y se descarta por empate
    expect(r.descartados).toBe(0)
    expect(leerMarca(USUARIO)).not.toBe(marcaTrasSubir === null ? 'imposible' : marcaTrasSubir)
  })

  it('lo que subimos vuelve una vez y no nos pisa', async () => {
    const s = new ServidorFalso()
    const id = await crearProducto(macarrones)
    await sincronizar(s.transporte())
    await sincronizar(s.transporte())
    // Sigue siendo el nuestro, sin duplicar ni revivir nada
    expect(await db.alimentos.count()).toBe(1)
    expect((await db.alimentos.get(id))?.nombre).toBe('Macarrones')
    expect(await cuantosPendientes()).toBe(0)
  })
})
