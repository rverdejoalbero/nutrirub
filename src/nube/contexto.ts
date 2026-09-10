import { createContext, useContext } from 'react'
import type { Cuenta } from './sesion'
import type { Sincronizacion } from './useSesion'

export interface ValorSync {
  cuenta: Cuenta
  sync: Sincronizacion
}

export const ContextoSync = createContext<ValorSync | null>(null)

/**
 * Quien eres y como va la sincronizacion.
 *
 * Solo existe dentro de la app ya con sesion, asi que dentro nunca es null y
 * las pantallas no tienen que comprobarlo en cada uso.
 */
export function useCuentaYSync(): ValorSync {
  const v = useContext(ContextoSync)
  if (!v) throw new Error('useCuentaYSync fuera de la app con sesion')
  return v
}
