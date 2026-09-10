import { beforeEach, describe, expect, it } from 'vitest'
import {
  actualizarProducto,
  borrarProducto,
  borrarRegistro,
  crearProducto,
  crearRegistro,
  db,
  objetivosEn,
  productosVivos,
  registrosDe,
  registrosEntre,
  soloVivos,
  vivo,
} from './db'
import { borrarTodo } from '../lib/copia'
import { unObjetivo } from '../pruebas/fabricas'

const unosMacarrones = {
  nombre: 'Macarrones',
  unidadBase: 'g' as const,
  kcal: 359,
  proteinas: 12.5,
  carbohidratos: 71,
  grasas: 1.5,
  origen: 'manual' as const,
}

const unaComida = (productoId: string, fecha = '2026-09-09') => ({
  fecha,
  momento: 'comida' as const,
  productoId,
  nombreProducto: 'Macarrones',
  cantidad: 100,
  unidad: 'g' as const,
  kcal: 359,
  proteinas: 12.5,
  carbohidratos: 71,
  grasas: 1.5,
})

beforeEach(async () => {
  await borrarTodo()
})

describe('escrituras', () => {
  it('crear pone id, creadoEn y actualizadoEn', async () => {
    const id = await crearProducto(unosMacarrones)
    const p = (await db.alimentos.get(id))!
    expect(typeof p.id).toBe('string')
    expect(p.creadoEn).toBeGreaterThan(0)
    expect(p.actualizadoEn).toBeGreaterThan(0)
    expect(p.borradoEn).toBeUndefined()
  })

  it('actualizar mueve actualizadoEn pero no creadoEn', async () => {
    // Sin esa marca el cambio no llegaria nunca al otro movil.
    const id = await crearProducto(unosMacarrones)
    const antes = (await db.alimentos.get(id))!
    await new Promise((r) => setTimeout(r, 5))
    await actualizarProducto(id, { kcal: 300 })
    const despues = (await db.alimentos.get(id))!
    expect(despues.kcal).toBe(300)
    expect(despues.creadoEn).toBe(antes.creadoEn)
    expect(despues.actualizadoEn).toBeGreaterThan(antes.actualizadoEn)
  })

  it('dos cosas creadas seguidas no comparten id', async () => {
    const a = await crearProducto(unosMacarrones)
    const b = await crearProducto(unosMacarrones)
    expect(a).not.toBe(b)
  })
})

describe('borrado logico', () => {
  it('la fila sobrevive al borrado, marcada', async () => {
    // Si desapareciese sin mas, el otro dispositivo la volveria a subir
    // creyendo que es nueva y reapareceria sola.
    const id = await crearProducto(unosMacarrones)
    await borrarProducto(id)
    const p = await db.alimentos.get(id)
    expect(p).toBeDefined()
    expect(typeof p!.borradoEn).toBe('number')
  })

  it('borrar cuenta como cambio, para que se propague', async () => {
    const id = await crearProducto(unosMacarrones)
    const antes = (await db.alimentos.get(id))!.actualizadoEn
    await new Promise((r) => setTimeout(r, 5))
    await borrarProducto(id)
    expect((await db.alimentos.get(id))!.actualizadoEn).toBeGreaterThan(antes)
  })

  it('para leer, lo borrado no existe', async () => {
    const vivoId = await crearProducto(unosMacarrones)
    const muertoId = await crearProducto({ ...unosMacarrones, nombre: 'Ya no lo compro' })
    await borrarProducto(muertoId)

    const nombres = (await productosVivos()).map((p) => p.nombre)
    expect(nombres).toEqual(['Macarrones'])
    expect(nombres).not.toContain('Ya no lo compro')
    expect(vivoId).toBeDefined()
  })

  it('un registro borrado desaparece del dia', async () => {
    const idP = await crearProducto(unosMacarrones)
    await crearRegistro(unaComida(idP))
    const idR = await crearRegistro(unaComida(idP))
    await borrarRegistro(idR)

    expect(await registrosDe('2026-09-09')).toHaveLength(1)
  })

  it('tampoco aparece en un rango de fechas', async () => {
    // Estadisticas lee por rango: si no filtrase, un dia borrado seguiria
    // contando en las medias.
    const idP = await crearProducto(unosMacarrones)
    const idR = await crearRegistro(unaComida(idP, '2026-09-05'))
    await crearRegistro(unaComida(idP, '2026-09-06'))
    await borrarRegistro(idR)

    const rango = await registrosEntre('2026-09-01', '2026-09-30')
    expect(rango).toHaveLength(1)
    expect(rango[0].fecha).toBe('2026-09-06')
  })

  it('unos objetivos borrados no cuentan como vigentes', async () => {
    await db.objetivosPorFecha.add(unObjetivo('2026-01-01', { kcal: 2000 }))
    await db.objetivosPorFecha.add(
      unObjetivo('2026-06-01', { kcal: 9999, borradoEn: Date.now(), actualizadoEn: Date.now() }),
    )
    expect((await objetivosEn('2026-09-09')).kcal).toBe(2000)
  })
})

describe('vivo y soloVivos', () => {
  it('distinguen por borradoEn', () => {
    const base = { id: 'x', creadoEn: 1, actualizadoEn: 1 }
    expect(vivo(base)).toBe(true)
    expect(vivo({ ...base, borradoEn: 5 })).toBe(false)
  })

  it('un borradoEn de cero tambien cuenta como borrado', () => {
    // Poco probable, pero 0 es falsy y un `if (x.borradoEn)` lo dejaria pasar.
    const base = { id: 'x', creadoEn: 1, actualizadoEn: 1, borradoEn: 0 }
    expect(vivo(base)).toBe(false)
  })

  it('soloVivos filtra la lista', () => {
    const base = { id: 'a', creadoEn: 1, actualizadoEn: 1 }
    const lista = [base, { ...base, id: 'b', borradoEn: 9 }, { ...base, id: 'c' }]
    expect(soloVivos(lista).map((x) => x.id)).toEqual(['a', 'c'])
  })
})
