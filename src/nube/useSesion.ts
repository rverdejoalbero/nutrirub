import { useEffect, useRef, useState } from 'react'
import { alCambiarSesion, cuentaActual, type Cuenta } from './sesion'
import { cuantosPendientes, sincronizar } from './sincronizar'
import { transporteSupabase } from './transporte'

export interface EstadoSesion {
  cuenta: Cuenta | null
  /** Mientras se comprueba si hay sesion guardada. */
  comprobando: boolean
}

/**
 * Si hay sesion, quien es.
 *
 * Al arrancar hay un momento en que no se sabe: la sesion vive en
 * localStorage y comprobarla es asincrono. Distinguir "comprobando" de "no hay
 * sesion" evita el parpadeo de enseñar la pantalla de entrada a alguien que ya
 * habia entrado.
 */
export function useSesion(): EstadoSesion {
  const [cuenta, setCuenta] = useState<Cuenta | null>(null)
  const [comprobando, setComprobando] = useState(true)

  useEffect(() => {
    let vivo = true
    cuentaActual()
      .then((c) => {
        if (!vivo) return
        setCuenta(c)
        setComprobando(false)
      })
      .catch(() => vivo && setComprobando(false))

    // Cubre entrar, salir y la renovacion automatica del token.
    const dejar = alCambiarSesion((c) => {
      if (!vivo) return
      setCuenta(c)
      setComprobando(false)
    })
    return () => {
      vivo = false
      dejar()
    }
  }, [])

  return { cuenta, comprobando }
}

export type EstadoSync = 'reposo' | 'sincronizando' | 'sin-conexion' | 'error'

export interface Sincronizacion {
  estado: EstadoSync
  pendientes: number
  ultimoError: string | null
  ultimaVez: number | null
  ahora: () => void
}

/** Cada cuanto se comprueba por su cuenta, estando la app abierta. */
const CADA = 3 * 60 * 1000

/**
 * Mantiene el movil al dia sin que haya que pedirlo.
 *
 * Sincroniza al entrar, al volver la conexion, al volver a primer plano y cada
 * pocos minutos. Nunca bloquea la interfaz: si no hay red, los cambios se
 * quedan marcados y suben cuando vuelva, que es justo lo que permite seguir
 * apuntando comidas en el super sin cobertura.
 */
export function useSincronizacion(usuarioId: string | null): Sincronizacion {
  const [estado, setEstado] = useState<EstadoSync>('reposo')
  const [pendientes, setPendientes] = useState(0)
  const [ultimoError, setUltimoError] = useState<string | null>(null)
  const [ultimaVez, setUltimaVez] = useState<number | null>(null)
  const enMarcha = useRef(false)

  const idRef = useRef(usuarioId)
  idRef.current = usuarioId

  const pasada = useRef(async () => {})
  pasada.current = async () => {
    const id = idRef.current
    if (!id || enMarcha.current) return
    if (!navigator.onLine) {
      setEstado('sin-conexion')
      setPendientes(await cuantosPendientes())
      return
    }
    enMarcha.current = true
    setEstado('sincronizando')
    try {
      await sincronizar(transporteSupabase(id))
      setUltimoError(null)
      setUltimaVez(Date.now())
      setEstado('reposo')
    } catch (e) {
      setUltimoError(e instanceof Error ? e.message : 'No se ha podido sincronizar.')
      setEstado(navigator.onLine ? 'error' : 'sin-conexion')
    } finally {
      enMarcha.current = false
      setPendientes(await cuantosPendientes())
    }
  }

  useEffect(() => {
    if (!usuarioId) {
      setEstado('reposo')
      setPendientes(0)
      return
    }
    const disparar = () => void pasada.current()
    disparar()

    const reloj = setInterval(disparar, CADA)
    const alVolver = () => document.visibilityState === 'visible' && disparar()
    window.addEventListener('online', disparar)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearInterval(reloj)
      window.removeEventListener('online', disparar)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [usuarioId])

  // Cuenta lo pendiente aunque no se sincronice, para poder avisar.
  useEffect(() => {
    let vivo = true
    const contar = () => cuantosPendientes().then((n) => vivo && setPendientes(n))
    contar()
    const reloj = setInterval(contar, 15_000)
    return () => {
      vivo = false
      clearInterval(reloj)
    }
  }, [usuarioId])

  return { estado, pendientes, ultimoError, ultimaVez, ahora: () => void pasada.current() }
}
