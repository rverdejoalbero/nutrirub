import { describe, expect, it } from 'vitest'
import { kcalTeoricas, macrosDe, por100, revisarCoherencia, sumar } from './calc'
import type { Producto, Registro } from '../db/types'

const macarrones: Producto = {
  id: 1,
  nombre: 'Macarrones',
  marca: 'Gallo',
  unidadBase: 'g',
  kcal: 359,
  proteinas: 12.5,
  carbohidratos: 71,
  azucares: 3.4,
  grasas: 1.5,
  saturadas: 0.3,
  fibra: 3,
  sal: 0.02,
  origen: 'manual',
  creadoEn: 0,
}

describe('por100', () => {
  it('escala desde la base de 100 g', () => {
    expect(por100(359, 100)).toBe(359)
    expect(por100(359, 50)).toBe(179.5)
    expect(por100(359, 0)).toBe(0)
  })

  it('trata un valor ausente como cero, no como NaN', () => {
    // Los campos opcionales del producto llegan undefined. Si esto devolviese
    // NaN, un solo producto sin fibra envenenaria el total del dia entero.
    expect(por100(undefined, 100)).toBe(0)
  })

  it('admite cantidades por encima de 100', () => {
    expect(por100(100, 250)).toBe(250)
  })
})

describe('macrosDe', () => {
  it('calcula la racion a partir de los valores por 100 g', () => {
    const m = macrosDe(macarrones, 125)
    expect(m.kcal).toBeCloseTo(448.75, 5)
    expect(m.proteinas).toBeCloseTo(15.625, 5)
    expect(m.carbohidratos).toBeCloseTo(88.75, 5)
    expect(m.grasas).toBeCloseTo(1.875, 5)
  })

  it('a 100 g devuelve exactamente la etiqueta', () => {
    expect(macrosDe(macarrones, 100)).toEqual({
      kcal: 359,
      proteinas: 12.5,
      carbohidratos: 71,
      grasas: 1.5,
    })
  })
})

describe('sumar', () => {
  const reg = (kcal: number, p: number, c: number, g: number): Registro => ({
    fecha: '2026-01-01',
    momento: 'comida',
    productoId: 1,
    nombreProducto: 'X',
    cantidad: 100,
    unidad: 'g',
    kcal,
    proteinas: p,
    carbohidratos: c,
    grasas: g,
    creadoEn: 0,
  })

  it('suma los registros del dia', () => {
    const t = sumar([reg(100, 10, 20, 5), reg(250, 30, 5, 12)])
    expect(t).toEqual({ kcal: 350, proteinas: 40, carbohidratos: 25, grasas: 17 })
  })

  it('sin registros devuelve ceros, no undefined', () => {
    expect(sumar([])).toEqual({ kcal: 0, proteinas: 0, carbohidratos: 0, grasas: 0 })
  })
})

describe('kcalTeoricas', () => {
  it('aplica 4/4/9 mas 2 por gramo de fibra', () => {
    // En las etiquetas europeas los hidratos NO incluyen la fibra: sin ese
    // termino, un producto con mucha fibra daria falso positivo.
    expect(kcalTeoricas({ proteinas: 10, carbohidratos: 20, grasas: 5, fibra: 0 })).toBe(165)
    expect(kcalTeoricas({ proteinas: 10, carbohidratos: 20, grasas: 5, fibra: 10 })).toBe(185)
  })

  it('los campos ausentes o nulos cuentan como cero', () => {
    expect(kcalTeoricas({})).toBe(0)
    expect(kcalTeoricas({ proteinas: null, carbohidratos: 10, grasas: null })).toBe(40)
  })
})

describe('revisarCoherencia', () => {
  it('no se queja de una etiqueta que cuadra', () => {
    expect(revisarCoherencia(macarrones)).toEqual([])
  })

  it('avisa cuando las kcal no cuadran con los macros', () => {
    // 4*12,5 + 4*71 + 9*1,5 + 2*3 = 353,5. Poner 500 es un 41% de desvio.
    const avisos = revisarCoherencia({ ...macarrones, kcal: 500 })
    expect(avisos).toHaveLength(1)
    expect(avisos[0].campo).toBe('kcal')
    expect(avisos[0].texto).toContain('354')
  })

  it('tolera hasta un 15% de desvio', () => {
    // Las etiquetas redondean; por debajo del 15% no merece la pena molestar.
    expect(revisarCoherencia({ ...macarrones, kcal: 353.5 * 1.14 })).toEqual([])
    expect(revisarCoherencia({ ...macarrones, kcal: 353.5 * 1.16 })).not.toEqual([])
  })

  it('detecta kcal imposibles por 100 g', () => {
    // Ni la grasa pura llega a 900.
    const avisos = revisarCoherencia({ kcal: 950, grasas: 100 })
    expect(avisos.some((a) => a.texto.includes('900'))).toBe(true)
  })

  it('detecta un macro por encima de 100 g por cada 100 g', () => {
    const avisos = revisarCoherencia({ proteinas: 120 })
    expect(avisos.some((a) => a.campo === 'proteinas')).toBe(true)
  })

  it('detecta valores negativos', () => {
    const avisos = revisarCoherencia({ grasas: -3 })
    expect(avisos.some((a) => a.campo === 'grasas' && a.texto.includes('negativo'))).toBe(true)
  })

  it('detecta que los macros sumen mas de 100 g', () => {
    const avisos = revisarCoherencia({ proteinas: 40, carbohidratos: 40, grasas: 40 })
    expect(avisos.some((a) => a.texto.includes('suman más de 100'))).toBe(true)
  })

  it('detecta azucares por encima de los hidratos', () => {
    const avisos = revisarCoherencia({ carbohidratos: 10, azucares: 20 })
    expect(avisos.some((a) => a.campo === 'azucares')).toBe(true)
  })

  it('acepta azucares iguales a los hidratos', () => {
    // Pasa de verdad: azucar de mesa, miel, refrescos.
    expect(revisarCoherencia({ carbohidratos: 100, azucares: 100, kcal: 400 })).toEqual([])
  })

  it('detecta saturadas por encima de las grasas', () => {
    const avisos = revisarCoherencia({ grasas: 5, saturadas: 9 })
    expect(avisos.some((a) => a.campo === 'saturadas')).toBe(true)
  })

  it('no inventa avisos cuando faltan datos', () => {
    // Un producto a medio rellenar no debe llenarse de rojo mientras se teclea.
    expect(revisarCoherencia({})).toEqual([])
    expect(revisarCoherencia({ kcal: null, proteinas: null })).toEqual([])
  })

  it('no divide por cero cuando solo hay kcal', () => {
    expect(revisarCoherencia({ kcal: 200 })).toEqual([])
  })

  it('un producto de solo grasa cuadra', () => {
    // Aceite de oliva: 9 kcal/g -> 900 no, pero 99,9 g de grasa son 899 kcal.
    expect(revisarCoherencia({ kcal: 899, grasas: 99.9, proteinas: 0, carbohidratos: 0 })).toEqual([])
  })
})
