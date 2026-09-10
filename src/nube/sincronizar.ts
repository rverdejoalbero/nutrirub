import { db } from '../db/db'
import type { Objetivos, Producto, Registro, Sincronizable } from '../db/types'
import type { FilaNube, TipoNube } from './cliente'

/**
 * El transporte es lo unico que habla con la red. La logica de sincronizacion
 * vive fuera de el, contra esta interfaz, para poder probarla entera sin
 * servidor: los fallos de sincronizacion son de los que no se ven hasta que ya
 * has perdido datos, asi que conviene poder reproducirlos en un test.
 */
export interface Transporte {
  usuarioId: string
  /** Todo lo que el servidor haya recibido despues de esta marca suya. */
  bajar(desde: string | null): Promise<FilaNube[]>
  /** Sube o pisa filas. */
  subir(filas: FilaNube[]): Promise<void>
}

export interface ResultadoSync {
  bajados: number
  subidos: number
  /** Cambios locales descartados porque el servidor tenia algo mas reciente. */
  descartados: number
}

const TABLAS = {
  alimento: () => db.alimentos,
  registro: () => db.diario,
  objetivo: () => db.objetivosPorFecha,
} as const

const TIPO_DE_TABLA: Record<TipoNube, TipoNube> = {
  alimento: 'alimento',
  registro: 'registro',
  objetivo: 'objetivo',
}

/** Donde se guarda hasta donde llego la ultima sincronizacion, por usuario. */
const claveMarca = (usuarioId: string) => `nutrirub.sync.${usuarioId}`

export function leerMarca(usuarioId: string): string | null {
  try {
    return localStorage.getItem(claveMarca(usuarioId))
  } catch {
    return null
  }
}

export function guardarMarca(usuarioId: string, marca: string): void {
  try {
    localStorage.setItem(claveMarca(usuarioId), marca)
  } catch {
    /* modo privado: se resincronizara entero la proxima vez, que es lento
       pero correcto */
  }
}

export function olvidarMarca(usuarioId: string): void {
  try {
    localStorage.removeItem(claveMarca(usuarioId))
  } catch {
    /* da igual: la marca es una optimizacion, no un dato */
  }
}

/**
 * Del registro local a la fila que viaja.
 *
 * La foto de la etiqueta se queda en tierra a proposito: son unos 200 KB que
 * en JSON inflan un tercio mas, y subirlas haria lenta cada sincronizacion
 * ademas de comerse la cuota. Se queda en el movil donde la hiciste.
 */
export function aFila(
  registro: Sincronizable & Record<string, unknown>,
  tipo: TipoNube,
  usuarioId: string,
): FilaNube {
  const { pendiente, fotoEtiqueta, ...contenido } = registro
  void pendiente
  void fotoEtiqueta
  return {
    usuario_id: usuarioId,
    id: registro.id,
    tipo,
    actualizado_en: registro.actualizadoEn,
    borrado_en: registro.borradoEn ?? null,
    contenido,
  }
}

/** De la fila que llega al registro local. */
export function deFila(fila: FilaNube): Sincronizable & Record<string, unknown> {
  const registro = { ...fila.contenido } as Sincronizable & Record<string, unknown>
  registro.id = fila.id
  registro.actualizadoEn = fila.actualizado_en
  if (fila.borrado_en !== null && fila.borrado_en !== undefined) {
    registro.borradoEn = fila.borrado_en
  } else {
    delete registro.borradoEn
  }
  // Llega del servidor: no hay nada que subir de vuelta.
  delete registro.pendiente
  return registro
}

/**
 * Una pasada completa: bajar lo que haya cambiado fuera, aplicar, y subir lo
 * que se haya cambiado aqui.
 *
 * Ante el mismo registro tocado en dos sitios gana el `actualizadoEn` mas alto.
 * Para un diario de comidas de una sola persona con varios dispositivos, los
 * conflictos de verdad son rarisimos, y perder la edicion mas antigua es la
 * respuesta razonable.
 */
export async function sincronizar(transporte: Transporte): Promise<ResultadoSync> {
  const { usuarioId } = transporte
  let bajados = 0
  let descartados = 0

  // ---- 1. Bajar lo que ha cambiado fuera desde la ultima vez
  const desde = leerMarca(usuarioId)
  const entrantes = await transporte.bajar(desde)

  // La marca nueva sale de las filas que hemos recibido, NO de preguntarle la
  // hora al servidor despues. Preguntandola despues, cualquier cosa que otro
  // dispositivo subiera entre la bajada y la pregunta quedaria por debajo de
  // la marca sin haber pasado por aqui: no se bajaria nunca.
  let marcaNueva = desde
  for (const fila of entrantes) {
    if (fila.subido_en && (marcaNueva === null || fila.subido_en > marcaNueva)) {
      marcaNueva = fila.subido_en
    }
  }

  for (const fila of entrantes) {
    const tabla = TABLAS[TIPO_DE_TABLA[fila.tipo]]?.()
    if (!tabla) continue // tipo desconocido: una version mas nueva de la app

    const actual = (await tabla.get(fila.id)) as (Sincronizable & Record<string, unknown>) | undefined

    // El servidor solo gana si es ESTRICTAMENTE mas nuevo. Ante un empate se
    // queda lo local: la fila entrante no aporta nada nuevo, y aplicarla
    // borraria la bandera de pendiente, y con ella un cambio que todavia no
    // se ha subido.
    if (actual && actual.actualizadoEn >= fila.actualizado_en) continue

    if (actual?.pendiente) descartados++

    const entrante = deFila(fila)
    // La foto solo existe en el movil que la hizo; que no la borre el de al lado.
    if (actual && 'fotoEtiqueta' in actual && actual.fotoEtiqueta) {
      entrante.fotoEtiqueta = actual.fotoEtiqueta
    }
    await tabla.put(entrante as never)
    bajados++
  }

  // ---- 2. Subir lo cambiado aqui
  // Se lee DESPUES de aplicar lo entrante: si algo entrante gano, ya no esta
  // pendiente y no se sube; si perdio, sigue pendiente y se sube ahora.
  const pendientes: FilaNube[] = []
  const porTabla: { tipo: TipoNube; filas: (Sincronizable & Record<string, unknown>)[] }[] = [
    { tipo: 'alimento', filas: (await db.alimentos.toArray()) as never },
    { tipo: 'registro', filas: (await db.diario.toArray()) as never },
    { tipo: 'objetivo', filas: (await db.objetivosPorFecha.toArray()) as never },
  ]
  for (const { tipo, filas } of porTabla) {
    for (const r of filas) {
      if (r.pendiente) pendientes.push(aFila(r, tipo, usuarioId))
    }
  }

  if (pendientes.length > 0) {
    await transporte.subir(pendientes)
    // Solo despues de que el servidor confirme se quita la bandera.
    for (const { tipo, filas } of porTabla) {
      const tabla = TABLAS[tipo]()
      for (const r of filas) {
        if (r.pendiente) await tabla.update(r.id, { pendiente: undefined } as never)
      }
    }
  }

  // Lo que acabamos de subir tendra una marca posterior, asi que volvera en la
  // proxima bajada. No pasa nada: llega empatado en fecha y se descarta solo.
  if (marcaNueva !== null && marcaNueva !== desde) guardarMarca(usuarioId, marcaNueva)
  return { bajados, subidos: pendientes.length, descartados }
}

/** Cuantos cambios locales esperan a subir. */
export async function cuantosPendientes(): Promise<number> {
  const listas = await Promise.all([
    db.alimentos.toArray(),
    db.diario.toArray(),
    db.objetivosPorFecha.toArray(),
  ])
  return listas.flat().filter((r) => r.pendiente).length
}

/**
 * Marca todo lo local como pendiente y olvida la marca del servidor.
 *
 * Es lo que hay que hacer al iniciar sesion por primera vez en un dispositivo
 * que ya tenia datos sueltos: sin esto, lo que hubieras apuntado antes de tener
 * cuenta se quedaria aqui para siempre sin llegar a la nube.
 */
export async function marcarTodoParaSubir(usuarioId: string): Promise<number> {
  olvidarMarca(usuarioId)
  let n = 0
  for (const tabla of [db.alimentos, db.diario, db.objetivosPorFecha]) {
    const filas = await tabla.toArray()
    for (const r of filas) {
      await tabla.update(r.id, { pendiente: 1 } as never)
      n++
    }
  }
  return n
}

export type { Producto, Registro, Objetivos }
