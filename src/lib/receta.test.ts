import { describe, expect, it } from 'vitest'
import { camposConocidos, componer, pesoCrudo, valoresDelPlato } from './receta'
import type { Ingrediente, Producto } from '../db/types'
import { unProducto } from '../pruebas/fabricas'

const prod = (nombre: string, v: Partial<Producto>): Producto =>
  unProducto(nombre, { kcal: 0, proteinas: 0, carbohidratos: 0, grasas: 0, ...v })

const macarrones = prod('Macarrones', {
  id: 'macarrones',
  kcal: 359,
  proteinas: 12.5,
  carbohidratos: 71,
  grasas: 1.5,
  fibra: 3,
  sal: 0.02,
})
const tomate = prod('Tomate frito', {
  id: 'tomate',
  kcal: 82,
  proteinas: 1.5,
  carbohidratos: 9,
  grasas: 4,
  fibra: 1.5,
  sal: 1.1,
})

const ing = (productoId: string, nombre: string, cantidad: number): Ingrediente => ({
  productoId,
  nombre,
  cantidad,
  unidad: 'g',
})

const plato = [
  { ingrediente: ing('macarrones', 'Macarrones', 200), producto: macarrones },
  { ingrediente: ing('tomate', 'Tomate frito', 100), producto: tomate },
]

describe('pesoCrudo', () => {
  it('suma los ingredientes', () => {
    expect(pesoCrudo([ing('a', 'a', 200), ing('b', 'b', 100)])).toBe(300)
  })

  it('con la lista vacia da cero', () => {
    expect(pesoCrudo([])).toBe(0)
  })
})

describe('componer', () => {
  it('suma los totales del plato', () => {
    const { totales } = componer(plato, 300)
    // 200 g de macarrones + 100 g de tomate
    expect(totales.kcal).toBeCloseTo(359 * 2 + 82, 5)
    expect(totales.proteinas).toBeCloseTo(12.5 * 2 + 1.5, 5)
    expect(totales.sal).toBeCloseTo(0.02 * 2 + 1.1, 5)
  })

  it('divide por el peso final, no por la suma de los ingredientes', () => {
    // Este es el nucleo del asunto: 300 g de ingredientes crudos dan unos
    // 560 g de plato cocinado porque la pasta absorbe agua. Dividir por 300
    // daria un plato casi el doble de calorico de lo que realmente es.
    const crudo = componer(plato, 300).por100
    const cocinado = componer(plato, 560).por100
    expect(crudo.kcal).toBeCloseTo(266.67, 1)
    expect(cocinado.kcal).toBeCloseTo(142.86, 1)
    expect(cocinado.kcal!).toBeLessThan(crudo.kcal)
  })

  it('los totales no cambian aunque cambie el peso final', () => {
    // Cocinar no crea ni destruye calorias, solo agua.
    expect(componer(plato, 300).totales.kcal).toBeCloseTo(componer(plato, 900).totales.kcal, 5)
  })

  it('con peso final cero no divide por cero', () => {
    const { por100 } = componer(plato, 0)
    expect(por100.kcal).toBe(0)
    expect(Number.isFinite(por100.kcal)).toBe(true)
  })

  it('avisa de los ingredientes cuyo producto ya no existe', () => {
    const conHueco = [...plato, { ingrediente: ing('fantasma', 'Borrado', 50), producto: undefined }]
    const { faltan, totales } = componer(conHueco, 300)
    expect(faltan).toHaveLength(1)
    expect(faltan[0].nombre).toBe('Borrado')
    // Y no lo cuenta como si fuese cero calorias sin decir nada.
    expect(totales.kcal).toBeCloseTo(359 * 2 + 82, 5)
  })

  it('un plato de un solo ingrediente sin merma reproduce su etiqueta', () => {
    const solo = [{ ingrediente: ing('macarrones', 'Macarrones', 100), producto: macarrones }]
    const { por100 } = componer(solo, 100)
    expect(por100.kcal).toBeCloseTo(359, 2)
    expect(por100.proteinas).toBeCloseTo(12.5, 2)
  })

  it('escala bien si se dobla la receta', () => {
    const doble = [
      { ingrediente: ing('macarrones', 'Macarrones', 400), producto: macarrones },
      { ingrediente: ing('tomate', 'Tomate frito', 200), producto: tomate },
    ]
    expect(componer(doble, 1120).por100.kcal).toBeCloseTo(componer(plato, 560).por100.kcal, 5)
  })
})

describe('camposConocidos', () => {
  it('los cuatro basicos siempre estan', () => {
    const c = camposConocidos([])
    expect([...c].sort()).toEqual(['carbohidratos', 'grasas', 'kcal', 'proteinas'])
  })

  it('incluye un opcional si algun ingrediente lo declara', () => {
    expect(camposConocidos(plato).has('fibra')).toBe(true)
    expect(camposConocidos(plato).has('sal')).toBe(true)
  })

  it('no incluye un opcional que no declara nadie', () => {
    expect(camposConocidos(plato).has('azucares')).toBe(false)
  })
})

describe('valoresDelPlato', () => {
  it('no inventa un cero para lo que nadie sabe', () => {
    // Poner azucares: 0 diria "este plato no lleva azucar", cuando lo cierto
    // es que ninguna etiqueta lo declaraba.
    const v = valoresDelPlato(plato, 560)
    expect(v.azucares).toBeUndefined()
    expect(v.saturadas).toBeUndefined()
  })

  it('si conoce el campo lo incluye aunque salga cero', () => {
    const v = valoresDelPlato(plato, 560)
    expect(v.fibra).toBeGreaterThan(0)
    expect(v.sal).toBeGreaterThan(0)
  })

  it('siempre trae los cuatro basicos', () => {
    const v = valoresDelPlato([], 100)
    expect(v.kcal).toBe(0)
    expect(v.proteinas).toBe(0)
    expect(v.carbohidratos).toBe(0)
    expect(v.grasas).toBe(0)
  })

  it('el resultado cuadra con la comprobacion de coherencia', () => {
    // Un plato compuesto a partir de etiquetas coherentes tiene que salir
    // coherente el tambien, si no la pantalla de revision se llenaria de rojo.
    const v = valoresDelPlato(plato, 560)
    const teoricas = 4 * v.proteinas! + 4 * v.carbohidratos! + 9 * v.grasas! + 2 * (v.fibra ?? 0)
    expect(Math.abs(v.kcal - teoricas) / teoricas).toBeLessThan(0.15)
  })
})
