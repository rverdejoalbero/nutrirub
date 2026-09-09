import { afterEach, describe, expect, it, vi } from 'vitest'
import { aISO, desdeISO, etiquetaFecha, hoyISO, sumarDias, ultimosDias } from './fecha'

afterEach(() => vi.useRealTimers())

/** Fija el reloj a una fecha y hora LOCAL concreta. */
function reloj(iso: string, hora = 12) {
  const [a, m, d] = iso.split('-').map(Number)
  vi.useFakeTimers()
  vi.setSystemTime(new Date(a, m - 1, d, hora, 0, 0))
}

describe('aISO', () => {
  it('formatea con ceros a la izquierda', () => {
    expect(aISO(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(aISO(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('usa la fecha local, no UTC', () => {
    // A las 23:30 en Madrid (UTC+1/+2), toISOString() ya seria el dia siguiente
    // y registrarias la cena en la fecha equivocada.
    const nocheCerrada = new Date(2026, 5, 15, 23, 30)
    expect(aISO(nocheCerrada)).toBe('2026-06-15')
  })

  it('la madrugada sigue siendo su propio dia', () => {
    expect(aISO(new Date(2026, 5, 15, 0, 30))).toBe('2026-06-15')
  })
})

describe('desdeISO', () => {
  it('da la vuelta a aISO', () => {
    const d = desdeISO('2026-03-08')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(2)
    expect(d.getDate()).toBe(8)
  })

  it('ida y vuelta sin perder el dia', () => {
    for (const iso of ['2026-01-01', '2026-02-28', '2026-12-31', '2024-02-29']) {
      expect(aISO(desdeISO(iso))).toBe(iso)
    }
  })
})

describe('sumarDias', () => {
  it('suma y resta', () => {
    expect(sumarDias('2026-03-10', 1)).toBe('2026-03-11')
    expect(sumarDias('2026-03-10', -1)).toBe('2026-03-09')
    expect(sumarDias('2026-03-10', 0)).toBe('2026-03-10')
  })

  it('cruza el cambio de mes', () => {
    expect(sumarDias('2026-01-31', 1)).toBe('2026-02-01')
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('cruza el cambio de año', () => {
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('acierta con el año bisiesto', () => {
    expect(sumarDias('2024-02-28', 1)).toBe('2024-02-29')
    expect(sumarDias('2024-03-01', -1)).toBe('2024-02-29')
    expect(sumarDias('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('sobrevive al cambio de hora', () => {
    // El ultimo domingo de marzo el dia tiene 23 horas. Sumando milisegundos
    // en vez de dias, aqui saldria el 28 otra vez.
    expect(sumarDias('2026-03-28', 1)).toBe('2026-03-29')
    expect(sumarDias('2026-03-29', 1)).toBe('2026-03-30')
    // Y en octubre tiene 25.
    expect(sumarDias('2026-10-24', 1)).toBe('2026-10-25')
    expect(sumarDias('2026-10-25', 1)).toBe('2026-10-26')
  })
})

describe('ultimosDias', () => {
  it('devuelve n dias acabando en la fecha dada', () => {
    expect(ultimosDias(3, '2026-03-10')).toEqual(['2026-03-08', '2026-03-09', '2026-03-10'])
  })

  it('va del mas antiguo al mas reciente', () => {
    const d = ultimosDias(7, '2026-03-10')
    expect(d).toHaveLength(7)
    expect(d[0] < d[6]).toBe(true)
    expect(d[6]).toBe('2026-03-10')
  })

  it('con 30 dias no repite ninguno', () => {
    const d = ultimosDias(30, '2026-03-10')
    expect(new Set(d).size).toBe(30)
  })

  it('por defecto acaba hoy', () => {
    reloj('2026-07-04')
    expect(ultimosDias(2)).toEqual(['2026-07-03', '2026-07-04'])
  })
})

describe('hoyISO', () => {
  it('sigue al reloj local', () => {
    reloj('2026-09-09', 23)
    expect(hoyISO()).toBe('2026-09-09')
  })
})

describe('etiquetaFecha', () => {
  it('usa nombres relativos para los dias cercanos', () => {
    reloj('2026-09-09')
    expect(etiquetaFecha('2026-09-09')).toBe('Hoy')
    expect(etiquetaFecha('2026-09-08')).toBe('Ayer')
    expect(etiquetaFecha('2026-09-10')).toBe('Mañana')
  })

  it('para el resto pone dia de la semana y fecha, con mayuscula', () => {
    reloj('2026-09-09')
    // 2026-09-05 es sabado
    expect(etiquetaFecha('2026-09-05')).toBe('Sábado 5 sep')
  })

  it('añade el año cuando no es el actual', () => {
    reloj('2026-09-09')
    expect(etiquetaFecha('2025-09-05')).toMatch(/2025$/)
    expect(etiquetaFecha('2026-09-05')).not.toMatch(/2026$/)
  })
})
