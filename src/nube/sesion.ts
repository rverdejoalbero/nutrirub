import type { Session, User } from '@supabase/supabase-js'
import { nube } from './cliente'
import { marcarTodoParaSubir, olvidarMarca } from './sincronizar'

export interface Cuenta {
  id: string
  correo: string
}

const aCuenta = (u: User): Cuenta => ({ id: u.id, correo: u.email ?? '' })

export class ErrorSesion extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorSesion'
  }
}

/** Traduce los errores de Supabase, que llegan en ingles y de sistema. */
function traducir(mensaje: string): string {
  const m = mensaje.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (m.includes('email not confirmed'))
    return 'Todavía no has confirmado la cuenta. Abre el correo que te mandamos.'
  if (m.includes('user already registered') || m.includes('already been registered'))
    return 'Ya hay una cuenta con ese correo. Inicia sesión en vez de registrarte.'
  if (m.includes('password should be at least'))
    return 'La contraseña es demasiado corta: mínimo 6 caracteres.'
  if (m.includes('unable to validate email') || m.includes('invalid email'))
    return 'Ese correo no parece válido.'
  if (m.includes('email rate limit') || m.includes('over_email_send_rate_limit'))
    return 'Se han mandado demasiados correos seguidos. Espera un rato y vuelve a intentarlo.'
  if (m.includes('failed to fetch') || m.includes('network'))
    return 'No hay conexión. Puedes seguir usando la app; se sincronizará cuando vuelva.'
  return mensaje
}

export async function sesionActual(): Promise<Session | null> {
  const { data } = await nube().auth.getSession()
  return data.session
}

export async function cuentaActual(): Promise<Cuenta | null> {
  const s = await sesionActual()
  return s?.user ? aCuenta(s.user) : null
}

export interface ResultadoRegistro {
  /** Si es false, hace falta confirmar el correo antes de poder entrar. */
  yaDentro: boolean
  cuenta: Cuenta | null
}

export async function registrarse(correo: string, contrasena: string): Promise<ResultadoRegistro> {
  const { data, error } = await nube().auth.signUp({
    email: correo.trim(),
    password: contrasena,
    options: {
      // A donde devuelve el enlace del correo de confirmacion. Se calcula solo
      // para que funcione igual en local que en Pages.
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  })
  if (error) throw new ErrorSesion(traducir(error.message))

  // Con la confirmacion de correo encendida, signUp devuelve usuario pero no
  // sesion: la cuenta existe y espera a que se pinche el enlace.
  const yaDentro = !!data.session
  if (yaDentro && data.user) await alEntrar(data.user.id)
  return { yaDentro, cuenta: data.user ? aCuenta(data.user) : null }
}

export async function entrar(correo: string, contrasena: string): Promise<Cuenta> {
  const { data, error } = await nube().auth.signInWithPassword({
    email: correo.trim(),
    password: contrasena,
  })
  if (error) throw new ErrorSesion(traducir(error.message))
  if (!data.user) throw new ErrorSesion('No se ha podido iniciar sesión.')
  await alEntrar(data.user.id)
  return aCuenta(data.user)
}

/**
 * Al entrar, lo que ya hubiera en este movil se marca para subir.
 *
 * Si no, todo lo que hubieses apuntado antes de tener cuenta se quedaria aqui
 * para siempre sin llegar nunca a la nube ni a tus otros dispositivos.
 */
async function alEntrar(usuarioId: string): Promise<void> {
  await marcarTodoParaSubir(usuarioId)
}

export async function reenviarConfirmacion(correo: string): Promise<void> {
  const { error } = await nube().auth.resend({ type: 'signup', email: correo.trim() })
  if (error) throw new ErrorSesion(traducir(error.message))
}

export async function recuperarContrasena(correo: string): Promise<void> {
  const { error } = await nube().auth.resetPasswordForEmail(correo.trim(), {
    redirectTo: window.location.origin + window.location.pathname,
  })
  if (error) throw new ErrorSesion(traducir(error.message))
}

/**
 * Cerrar sesion NO borra los datos locales.
 *
 * Estan en tu movil y son tuyos; borrarlos por cerrar sesion seria una sorpresa
 * desagradable, sobre todo si cierras sin querer. Lo que si se olvida es hasta
 * donde llego la sincronizacion, para que al volver a entrar se compruebe todo.
 */
export async function salir(usuarioId?: string): Promise<void> {
  if (usuarioId) olvidarMarca(usuarioId)
  const { error } = await nube().auth.signOut()
  if (error) throw new ErrorSesion(traducir(error.message))
}

/** Avisa cuando se entra, se sale o el token se renueva solo. */
export function alCambiarSesion(f: (cuenta: Cuenta | null) => void): () => void {
  const { data } = nube().auth.onAuthStateChange((_evento, sesion) => {
    f(sesion?.user ? aCuenta(sesion.user) : null)
  })
  return () => data.subscription.unsubscribe()
}
