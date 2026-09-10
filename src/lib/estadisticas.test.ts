import { describe, expect, it } from 'vitest'
import { cobertura, mediasDeNutrientes } from './estadisticas'
import type { Registro } from '../db/types'
import { unRegistro } from '../pruebas/fabricas'

const reg = (extra: Partial<Registro> = {}): Registro =>
  unRegistro('x', { kcal: 100, proteinas: 5, carbohidratos: 10, grasas: 2, ...extra })

describe('mediasDeNutrientes', () => {
  it('reparte la suma entre los dias con datos', () => {
    const r = mediasDeNutrientes([reg({ fibra: 6 }), reg({ fibra: 4 })], 2)
    expect(r.fibra.media).toBe(5)
  })

  it('no cuenta como cero lo que no se declara', () => {
    // Si un producto no trae la fibra, no es que tenga cero: es que no se
    // sabe. Sumarlo como cero hundiria la media sin avisar.
    const r = mediasDeNutrientes([reg({ fibra: 10 }), reg({})], 1)
    expect(r.fibra.media).toBe(10)
    expect(r.fibra.declarados).toBe(1)
    expect(r.fibra.total).toBe(2)
  })

  it('cuenta un cero declarado de verdad', () => {
    // El atun al natural declara 0 g de fibra, y eso si es informacion.
    const r = mediasDeNutrientes([reg({ fibra: 0 }), reg({ fibra: 10 })], 1)
    expect(r.fibra.declarados).toBe(2)
    expect(r.fibra.media).toBe(10)
  })

  it('trata los tres nutrientes por separado', () => {
    const r = mediasDeNutrientes([reg({ fibra: 3, sal: 1 })], 1)
    expect(r.fibra.declarados).toBe(1)
    expect(r.sal.declarados).toBe(1)
    expect(r.azucares.declarados).toBe(0)
  })

  it('sin dias con datos no divide por cero', () => {
    const r = mediasDeNutrientes([reg({ fibra: 5 })], 0)
    expect(r.fibra.media).toBe(0)
    expect(Number.isFinite(r.fibra.media)).toBe(true)
  })

  it('sin registros devuelve ceros, no NaN', () => {
    const r = mediasDeNutrientes([], 7)
    for (const k of ['fibra', 'azucares', 'sal'] as const) {
      expect(r[k].media).toBe(0)
      expect(r[k].declarados).toBe(0)
      expect(r[k].total).toBe(0)
    }
  })

  it('ignora valores corruptos en vez de propagar NaN', () => {
    const malo = reg({ fibra: NaN as unknown as number })
    const r = mediasDeNutrientes([malo, reg({ fibra: 8 })], 1)
    expect(r.fibra.media).toBe(8)
    expect(r.fibra.declarados).toBe(1)
  })

  it('la media es por dia, no por registro', () => {
    // Tres comidas de 2 g de fibra repartidas en dos dias son 3 g al dia.
    const r = mediasDeNutrientes([reg({ fibra: 2 }), reg({ fibra: 2 }), reg({ fibra: 2 })], 2)
    expect(r.fibra.media).toBe(3)
  })
})

describe('cobertura', () => {
  it('devuelve la fraccion de registros que declaran el nutriente', () => {
    expect(cobertura({ media: 0, declarados: 3, total: 4 })).toBe(0.75)
    expect(cobertura({ media: 0, declarados: 4, total: 4 })).toBe(1)
    expect(cobertura({ media: 0, declarados: 0, total: 4 })).toBe(0)
  })

  it('sin registros no divide por cero', () => {
    expect(cobertura({ media: 0, declarados: 0, total: 0 })).toBe(0)
  })
})
