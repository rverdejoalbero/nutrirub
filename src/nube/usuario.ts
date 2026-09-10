/**
 * Cuentas por nombre de usuario, sin correo ni telefono.
 *
 * Supabase Auth solo sabe autenticar por correo o por telefono: no tiene
 * usuarios a secas. Asi que se fabrica un correo interno a partir del nombre.
 * El usuario nunca lo ve ni lo escribe.
 *
 * De regalo, la unicidad sale gratis: Supabase ya exige que no haya dos
 * cuentas con el mismo correo, asi que no puede haber dos usuarios iguales
 * sin necesidad de comprobarlo por nuestra cuenta.
 *
 * El dominio tiene que existir de verdad en el DNS o Supabase rechaza el alta.
 * Este existe y no tiene servidor de correo, asi que nunca se entregaria nada
 * a nadie aunque se intentara enviar.
 */
export const DOMINIO_INTERNO = 'rverdejoalbero.github.io'

export const LARGO_MINIMO = 3
export const LARGO_MAXIMO = 24
export const CONTRASENA_MINIMA = 6

/**
 * Normaliza el nombre para que sirva de identificador estable.
 *
 * Se hace agresivamente a proposito: si "Rubén", "ruben" y "RUBEN" fuesen
 * cuentas distintas, cualquiera se registraria dos veces sin darse cuenta y
 * no entenderia por que no ve sus datos.
 */
export function normalizarUsuario(nombre: string): string {
  return nombre
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '')
}

export interface ProblemaUsuario {
  campo: 'usuario' | 'contrasena'
  texto: string
}

/** Devuelve el primer problema, o null si esta bien. */
export function revisarCredenciales(
  usuario: string,
  contrasena: string,
): ProblemaUsuario | null {
  const u = normalizarUsuario(usuario)

  if (u.length === 0) return { campo: 'usuario', texto: 'Escribe un nombre de usuario.' }
  if (u.length < LARGO_MINIMO)
    return { campo: 'usuario', texto: `Al menos ${LARGO_MINIMO} caracteres.` }
  if (u.length > LARGO_MAXIMO)
    return { campo: 'usuario', texto: `Como mucho ${LARGO_MAXIMO} caracteres.` }
  if (!/^[a-z0-9._-]+$/.test(u))
    return {
      campo: 'usuario',
      texto: 'Solo letras, números, punto, guion y guion bajo.',
    }
  if (!/^[a-z0-9]/.test(u))
    return { campo: 'usuario', texto: 'Tiene que empezar por una letra o un número.' }

  if (contrasena.length === 0)
    return { campo: 'contrasena', texto: 'Escribe una contraseña.' }
  if (contrasena.length < CONTRASENA_MINIMA)
    return {
      campo: 'contrasena',
      texto: `Al menos ${CONTRASENA_MINIMA} caracteres.`,
    }

  return null
}

/** El correo interno que le corresponde a un nombre de usuario. */
export function correoDe(usuario: string): string {
  return `${normalizarUsuario(usuario)}@${DOMINIO_INTERNO}`
}

/** El camino de vuelta, para poder enseñar el nombre en Ajustes. */
export function usuarioDe(correo: string | null | undefined): string {
  if (!correo) return ''
  const arroba = correo.indexOf('@')
  return arroba > 0 ? correo.slice(0, arroba) : correo
}
