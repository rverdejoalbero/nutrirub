import { describe, expect, it } from 'vitest'
import { limpiarJSON, numeroLaxo, parsearEtiqueta } from './etiqueta'
import { ErrorIA } from './provider'

describe('limpiarJSON', () => {
  it('deja pasar un JSON limpio', () => {
    expect(limpiarJSON('{"a":1}')).toBe('{"a":1}')
  })

  it('quita el bloque de codigo con etiqueta json', () => {
    expect(limpiarJSON('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('quita el bloque de codigo sin etiqueta', () => {
    expect(limpiarJSON('```\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('descarta la charla de antes y de despues', () => {
    // Los modelos pequeños hacen esto constantemente por mucho que el
    // prompt pida "solo JSON".
    expect(limpiarJSON('Claro, aquí tienes:\n{"a":1}\nEspero que te sirva.')).toBe('{"a":1}')
  })

  it('se queda con el objeto completo aunque lleve llaves anidadas', () => {
    expect(limpiarJSON('ruido {"a":{"b":2}} mas ruido')).toBe('{"a":{"b":2}}')
  })
})

describe('numeroLaxo', () => {
  it('acepta numeros tal cual', () => {
    expect(numeroLaxo(12.5)).toBe(12.5)
    expect(numeroLaxo(0)).toBe(0)
  })

  it('acepta la coma decimal española', () => {
    // El prompt pide punto, pero la etiqueta lleva coma y el modelo la arrastra.
    expect(numeroLaxo('1,2')).toBe(1.2)
    expect(numeroLaxo('0,02')).toBe(0.02)
  })

  it('acepta el punto decimal', () => {
    expect(numeroLaxo('12.5')).toBe(12.5)
  })

  it('quita las unidades pegadas', () => {
    expect(numeroLaxo('12.5 g')).toBe(12.5)
    expect(numeroLaxo('359 kcal')).toBe(359)
  })

  it('entiende el formato con miles y decimales', () => {
    expect(numeroLaxo('1.234,5')).toBe(1234.5)
  })

  it('devuelve null en vez de NaN para lo que no es un numero', () => {
    // Un NaN colado aqui acaba guardado en la base y rompe todas las sumas.
    for (const v of [null, undefined, '', '   ', 'null', 'n/a', '-', 'trazas', {}, []]) {
      expect(numeroLaxo(v)).toBeNull()
    }
  })

  it('rechaza infinitos', () => {
    expect(numeroLaxo(Infinity)).toBeNull()
    expect(numeroLaxo(NaN)).toBeNull()
  })
})

const respuestaBuena = JSON.stringify({
  nombre: 'Macarrones',
  marca: 'Gallo',
  unidad_base: 'g',
  por_100: {
    kcal: 359,
    grasas: 1.5,
    saturadas: 0.3,
    carbohidratos: 71,
    azucares: 3.4,
    fibra: 3,
    proteinas: 12.5,
    sal: 0.02,
  },
  racion_g: 80,
  confianza: 'alta',
  notas: null,
})

describe('parsearEtiqueta', () => {
  it('lee una respuesta correcta', () => {
    const e = parsearEtiqueta(respuestaBuena)
    expect(e.nombre).toBe('Macarrones')
    expect(e.marca).toBe('Gallo')
    expect(e.unidadBase).toBe('g')
    expect(e.kcal).toBe(359)
    expect(e.sal).toBe(0.02)
    expect(e.racionG).toBe(80)
    expect(e.confianza).toBe('alta')
    expect(e.notas).toBeNull()
  })

  it('lee la misma respuesta envuelta en markdown', () => {
    expect(parsearEtiqueta('```json\n' + respuestaBuena + '\n```').kcal).toBe(359)
  })

  it('lanza un ErrorIA con mensaje util si el JSON esta roto', () => {
    // Nunca una excepcion cruda de JSON.parse en la cara del usuario.
    expect(() => parsearEtiqueta('esto no es json')).toThrow(ErrorIA)
    expect(() => parsearEtiqueta('{"a":')).toThrow(/no se ha entendido/i)
  })

  it('convierte los nulos del modelo en null, no en cero', () => {
    // Un cero aqui seria mentir: "no lo he leido" no es "no tiene".
    const e = parsearEtiqueta(
      JSON.stringify({ nombre: 'X', por_100: { kcal: 100, fibra: null, sal: null } }),
    )
    expect(e.fibra).toBeNull()
    expect(e.sal).toBeNull()
    expect(e.kcal).toBe(100)
  })

  it('aguanta que falte por_100 entero', () => {
    const e = parsearEtiqueta(JSON.stringify({ nombre: 'X' }))
    expect(e.kcal).toBeNull()
    expect(e.nombre).toBe('X')
  })

  it('pone un nombre de reserva si no viene ninguno', () => {
    expect(parsearEtiqueta('{}').nombre).toBe('Producto sin nombre')
  })

  it('normaliza la unidad base y cae en gramos ante algo raro', () => {
    expect(parsearEtiqueta('{"unidad_base":"ml"}').unidadBase).toBe('ml')
    expect(parsearEtiqueta('{"unidad_base":"ML"}').unidadBase).toBe('ml')
    expect(parsearEtiqueta('{"unidad_base":"litros"}').unidadBase).toBe('g')
    expect(parsearEtiqueta('{}').unidadBase).toBe('g')
  })

  it('cae en confianza media si el modelo se inventa el valor', () => {
    expect(parsearEtiqueta('{"confianza":"baja"}').confianza).toBe('baja')
    expect(parsearEtiqueta('{"confianza":"altisima"}').confianza).toBe('media')
    expect(parsearEtiqueta('{}').confianza).toBe('media')
  })

  it('trata la cadena "null" como ausencia', () => {
    // Algunos modelos devuelven la palabra en vez del literal.
    expect(parsearEtiqueta('{"marca":"null"}').marca).toBeNull()
  })

  it('lee una etiqueta con comas decimales de punta a punta', () => {
    const e = parsearEtiqueta(
      JSON.stringify({
        nombre: 'Leche',
        unidad_base: 'ml',
        por_100: { kcal: '46', grasas: '1,6', proteinas: '3,1', carbohidratos: '4,7' },
      }),
    )
    expect(e.grasas).toBe(1.6)
    expect(e.proteinas).toBe(3.1)
    expect(e.carbohidratos).toBe(4.7)
    expect(e.unidadBase).toBe('ml')
  })

  it('rechaza una respuesta que no es un objeto', () => {
    expect(() => parsearEtiqueta('[1,2,3]')).toThrow(ErrorIA)
    expect(() => parsearEtiqueta('"solo texto"')).toThrow(ErrorIA)
  })
})
