import { describe, expect, it } from 'vitest'
import { buscarProductos, normalizar } from './buscar'
import { unProducto } from '../pruebas/fabricas'

const p = (nombre: string, marca?: string) => unProducto(nombre, { marca, kcal: 100 })

const biblioteca = [
  p('Macarrones', 'Gallo'),
  p('Plátano'),
  p('Yogur griego', 'Danone'),
  p('Atún en aceite', 'Calvo'),
  p('Leche semidesnatada', 'Pascual'),
]

describe('normalizar', () => {
  it('pasa a minusculas', () => {
    expect(normalizar('MACARRONES')).toBe('macarrones')
  })

  it('quita las tildes', () => {
    expect(normalizar('plátano')).toBe('platano')
    expect(normalizar('atún')).toBe('atun')
    expect(normalizar('jamón serrano')).toBe('jamon serrano')
  })

  it('reduce la eñe, para poder buscar sin teclearla', () => {
    expect(normalizar('piña')).toBe('pina')
  })
})

describe('buscarProductos', () => {
  it('sin consulta devuelve todo', () => {
    expect(buscarProductos(biblioteca, '')).toHaveLength(5)
    expect(buscarProductos(biblioteca, '   ')).toHaveLength(5)
  })

  it('busca por nombre', () => {
    const r = buscarProductos(biblioteca, 'macarrones')
    expect(r.map((x) => x.nombre)).toEqual(['Macarrones'])
  })

  it('busca por marca', () => {
    expect(buscarProductos(biblioteca, 'danone').map((x) => x.nombre)).toEqual(['Yogur griego'])
  })

  it('encuentra sin escribir las tildes', () => {
    expect(buscarProductos(biblioteca, 'platano')).toHaveLength(1)
    expect(buscarProductos(biblioteca, 'atun')).toHaveLength(1)
  })

  it('encuentra tambien escribiendolas', () => {
    expect(buscarProductos(biblioteca, 'plátano')).toHaveLength(1)
  })

  it('ignora mayusculas', () => {
    expect(buscarProductos(biblioteca, 'MaCaRrOnEs')).toHaveLength(1)
  })

  it('busca por trozos sueltos', () => {
    expect(buscarProductos(biblioteca, 'yog')).toHaveLength(1)
    expect(buscarProductos(biblioteca, 'leche')).toHaveLength(1)
  })

  it('exige todas las palabras, en cualquier orden', () => {
    expect(buscarProductos(biblioteca, 'yogur danone')).toHaveLength(1)
    expect(buscarProductos(biblioteca, 'danone yogur')).toHaveLength(1)
    expect(buscarProductos(biblioteca, 'yogur pascual')).toHaveLength(0)
  })

  it('no se atraganta con espacios de mas', () => {
    expect(buscarProductos(biblioteca, '  yogur   danone  ')).toHaveLength(1)
  })

  it('devuelve vacio si no hay coincidencias', () => {
    expect(buscarProductos(biblioteca, 'pizza')).toEqual([])
  })

  it('no revienta con productos sin marca', () => {
    expect(() => buscarProductos(biblioteca, 'platano')).not.toThrow()
  })
})
