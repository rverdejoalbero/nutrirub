import type { EtiquetaLeida } from '../ai/etiqueta'

/**
 * Lo que la IA acaba de leer, esperando a la pantalla de revision.
 * Va en memoria y no en el state del router porque lleva la foto como Blob:
 * en el historial abultaria y se clonaria en cada navegacion.
 *
 * Se pierde al recargar. Es intencionado: nunca se guarda un producto
 * extraido por IA sin que haya pasado por la pantalla de revision.
 */
export interface Borrador {
  etiqueta: EtiquetaLeida
  foto?: Blob
}

let actual: Borrador | null = null

export const guardarBorrador = (b: Borrador): void => {
  actual = b
}

export const tomarBorrador = (): Borrador | null => actual

export const limpiarBorrador = (): void => {
  actual = null
}
