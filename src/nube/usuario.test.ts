import { describe, expect, it } from 'vitest'
import { correoDe, normalizarUsuario, revisarCredenciales, usuarioDe } from './usuario'

describe('normalizarUsuario', () => {
  it('pasa a minusculas', () => {
    expect(normalizarUsuario('RUBEN')).toBe('ruben')
  })

  it('quita las tildes', () => {
    // Si "Rubén" y "ruben" fuesen cuentas distintas, cualquiera se registraria
    // dos veces sin darse cuenta y no entenderia por que no ve sus datos.
    expect(normalizarUsuario('Rubén')).toBe('ruben')
    expect(normalizarUsuario('María')).toBe('maria')
  })

  it('reduce la eñe', () => {
    expect(normalizarUsuario('Begoña')).toBe('begona')
  })

  it('quita los espacios, tambien los de en medio', () => {
    expect(normalizarUsuario('  ruben  ')).toBe('ruben')
    expect(normalizarUsuario('ruben verdejo')).toBe('rubenverdejo')
  })

  it('todas las formas de escribir lo mismo dan el mismo usuario', () => {
    const formas = ['Rubén', 'ruben', ' RUBEN ', 'RuBéN']
    const normalizados = new Set(formas.map(normalizarUsuario))
    expect(normalizados.size).toBe(1)
  })
})

describe('correoDe', () => {
  it('fabrica el correo interno', () => {
    expect(correoDe('Rubén')).toBe('ruben@rverdejoalbero.github.io')
  })

  it('el mismo usuario da siempre el mismo correo', () => {
    expect(correoDe('  RUBÉN ')).toBe(correoDe('ruben'))
  })

  it('usuarios distintos dan correos distintos', () => {
    expect(correoDe('ruben')).not.toBe(correoDe('maria'))
  })
})

describe('usuarioDe', () => {
  it('recupera el nombre para poder enseñarlo', () => {
    expect(usuarioDe('ruben@rverdejoalbero.github.io')).toBe('ruben')
  })

  it('aguanta que no haya correo', () => {
    expect(usuarioDe(null)).toBe('')
    expect(usuarioDe(undefined)).toBe('')
    expect(usuarioDe('')).toBe('')
  })

  it('ida y vuelta', () => {
    expect(usuarioDe(correoDe('Rubén'))).toBe('ruben')
  })
})

describe('revisarCredenciales', () => {
  const ok = (u: string, c = 'contrasena') => revisarCredenciales(u, c)

  it('acepta lo razonable', () => {
    expect(ok('ruben')).toBeNull()
    expect(ok('maria_23')).toBeNull()
    expect(ok('juan.perez')).toBeNull()
    expect(ok('a1b')).toBeNull()
  })

  it('acepta un nombre con tildes, porque se normaliza', () => {
    expect(ok('Rubén')).toBeNull()
  })

  it('pide un nombre', () => {
    expect(ok('')?.campo).toBe('usuario')
    expect(ok('   ')?.campo).toBe('usuario')
  })

  it('rechaza nombres demasiado cortos o largos', () => {
    expect(ok('ab')?.texto).toContain('3')
    expect(ok('a'.repeat(25))?.texto).toContain('24')
  })

  it('rechaza caracteres que romperian el correo interno', () => {
    // Una arroba o un espacio dentro del nombre generarian un correo invalido
    // y el alta fallaria con un error incomprensible.
    for (const malo of ['ruben@casa', 'ruben!', 'ruben/perez', 'ruben+1', 'ruben#']) {
      expect(ok(malo)?.campo).toBe('usuario')
    }
  })

  it('exige empezar por letra o numero', () => {
    expect(ok('_ruben')?.campo).toBe('usuario')
    expect(ok('.ruben')?.campo).toBe('usuario')
    expect(ok('-ruben')?.campo).toBe('usuario')
  })

  it('pide contraseña y con largo minimo', () => {
    expect(revisarCredenciales('ruben', '')?.campo).toBe('contrasena')
    expect(revisarCredenciales('ruben', '12345')?.campo).toBe('contrasena')
    expect(revisarCredenciales('ruben', '123456')).toBeNull()
  })

  it('se queja primero del usuario y luego de la contraseña', () => {
    // Ir de arriba abajo: senalar la contraseña mientras el nombre esta mal
    // haria que arreglases lo de abajo y siguiera sin funcionar.
    expect(revisarCredenciales('', '')?.campo).toBe('usuario')
  })

  it('todo lo que acepta produce un correo valido', () => {
    for (const u of ['ruben', 'María', 'juan.perez', 'a_b-c', 'usuario123']) {
      expect(revisarCredenciales(u, 'contrasena')).toBeNull()
      expect(correoDe(u)).toMatch(/^[a-z0-9._-]+@[a-z0-9.-]+$/)
    }
  })
})
