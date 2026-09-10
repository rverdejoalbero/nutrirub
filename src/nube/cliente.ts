import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Credenciales del proyecto de Supabase.
 *
 * Estas SI van en el codigo, al reves que la clave de Gemini, y no es un
 * descuido: la clave anon esta pensada para ser publica. Por si sola no da
 * acceso a nada — quien guarda la puerta es el Row Level Security del
 * servidor, que solo deja ver las filas cuyo usuario_id coincide con el de
 * quien pregunta. La clave que nunca puede salir de Supabase es la
 * service_role, que se salta el RLS entero; esa no esta aqui ni debe estarlo.
 */
export const URL_SUPABASE = 'https://ouicuwrhnjnhfaisdivv.supabase.co'
export const CLAVE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91aWN1d3JobmpuaGZhaXNkaXZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5OTE4NjksImV4cCI6MjEwNDU2Nzg2OX0.PakWKHGYWKQIjMzMMJwpcfTMmLY8HJFRtZLTwbgK-bk'

let cliente: SupabaseClient | null = null

/**
 * El cliente, creado una sola vez.
 *
 * `persistSession` y `autoRefreshToken` son lo que responde a "que no tenga que
 * iniciar sesion siempre": la sesion se guarda en localStorage y el token se
 * renueva solo mientras sigas usando la app, asi que entras una vez por
 * dispositivo y no vuelves a pensar en ello.
 *
 * `detectSessionInUrl` va apagado a proposito: con HashRouter el hash es una
 * ruta, no un token, y dejarlo encendido haria que el cliente intentara
 * interpretar "#/hoy" como una respuesta de autenticacion.
 */
export function nube(): SupabaseClient {
  cliente ??= createClient(URL_SUPABASE, CLAVE_ANON, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'nutrirub.sesion',
    },
  })
  return cliente
}

/** Fila tal y como vive en la tabla `datos` del servidor. */
export interface FilaNube {
  usuario_id: string
  id: string
  tipo: 'alimento' | 'registro' | 'objetivo'
  actualizado_en: number
  borrado_en: number | null
  contenido: Record<string, unknown>
}

export type TipoNube = FilaNube['tipo']
