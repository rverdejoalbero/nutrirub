import { describe, expect, it } from 'vitest'
import { aNumero, ent, gr, redondear } from './formato'

describe('aNumero', () => {
  it('acepta punto y coma decimal', () => {
    expect(aNumero('12.5')).toBe(12.5)
    expect(aNumero('12,5')).toBe(12.5)
  })

  it('ignora los espacios', () => {
    expect(aNumero('  80  ')).toBe(80)
    expect(aNumero('1 2 5')).toBe(125)
  })

  it('devuelve null para el campo vacio, no cero', () => {
    // Un campo a medio escribir no es un cero: si devolviese 0, el preview
    // de macros parpadearia a cero mientras tecleas.
    expect(aNumero('')).toBeNull()
    expect(aNumero('   ')).toBeNull()
  })

  it('devuelve null en vez de NaN para basura', () => {
    expect(aNumero('abc')).toBeNull()
    expect(aNumero(',')).toBeNull()
    expect(aNumero('.')).toBeNull()
  })

  it('acepta el cero de verdad', () => {
    expect(aNumero('0')).toBe(0)
    expect(aNumero('0,0')).toBe(0)
  })

  it('acepta negativos, para que la validacion pueda quejarse luego', () => {
    expect(aNumero('-5')).toBe(-5)
  })
})

describe('redondear', () => {
  it('redondea a los decimales pedidos', () => {
    expect(redondear(1.2345, 2)).toBe(1.23)
    expect(redondear(1.2355, 2)).toBe(1.24)
    expect(redondear(448.75, 1)).toBe(448.8)
  })

  it('por defecto va a un decimal', () => {
    expect(redondear(1.26)).toBe(1.3)
  })

  it('devuelve numero, no cadena', () => {
    expect(typeof redondear(1.5)).toBe('number')
  })
})

describe('ent', () => {
  it('redondea a entero', () => {
    expect(ent(448.8)).toBe('449')
    expect(ent(448.2)).toBe('448')
  })

  it('no agrupa los numeros de cuatro cifras', () => {
    // El español escribe 2200 sin separador; a partir de cinco cifras si.
    // Es justo el rango de las kcal diarias, asi que conviene fijarlo.
    expect(ent(2200)).toBe('2200')
  })

  it('agrupa a partir de cinco cifras con punto, no con coma', () => {
    expect(ent(22000)).toBe('22.000')
    expect(ent(22000)).not.toContain(',')
  })
})

describe('gr', () => {
  it('usa coma decimal', () => {
    expect(gr(12.5)).toBe('12,5')
  })

  it('no arrastra decimales inutiles', () => {
    expect(gr(12)).toBe('12')
    expect(gr(12.0)).toBe('12')
  })

  it('corta a un decimal', () => {
    expect(gr(15.625)).toBe('15,6')
  })

  it('el cero se ve como cero', () => {
    expect(gr(0)).toBe('0')
  })
})
