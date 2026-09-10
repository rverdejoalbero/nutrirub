import Dexie, { type Table } from 'dexie'
import {
  type Id,
  type Objetivos,
  type Producto,
  type Registro,
  type Sincronizable,
  OBJETIVOS_POR_DEFECTO,
  nuevoId,
} from './types'
import { hoyISO } from '../lib/fecha'

/**
 * Las tablas cambiaron de nombre en la version 2 y no por capricho: IndexedDB
 * no deja cambiar la clave primaria de una tabla que ya existe, y habia que
 * pasar de enteros autoincrementales a UUIDs para poder sincronizar entre
 * dispositivos. Al tener que crear tablas nuevas de todas formas, se
 * aprovecho para ponerles el nombre que usa la interfaz: "Alimentos" y "el
 * diario del dia". Los tipos siguen llamandose Producto y Registro porque
 * renombrarlos habria removido el proyecto entero sin ganar nada.
 */
export class NutriDB extends Dexie {
  alimentos!: Table<Producto, Id>
  diario!: Table<Registro, Id>
  objetivosPorFecha!: Table<Objetivos, Id>

  constructor(nombre = 'nutrirub') {
    super(nombre)

    // v1: como nacio la app, con ids enteros y sin nada de sincronizacion.
    this.version(1).stores({
      productos: '++id, nombre, codigoBarras, ultimoUso',
      registros: '++id, fecha, productoId',
      objetivos: '++id, desde',
    })

    // v2: tablas nuevas con UUID, marca de tiempo y borrado logico.
    this.version(2)
      .stores({
        productos: '++id, nombre, codigoBarras, ultimoUso',
        registros: '++id, fecha, productoId',
        objetivos: '++id, desde',
        alimentos: 'id, nombre, ultimoUso, actualizadoEn',
        diario: 'id, fecha, productoId, actualizadoEn',
        objetivosPorFecha: 'id, desde, actualizadoEn',
      })
      .upgrade(migrarAUuids)

    // v3: fuera las viejas, ya vaciadas en el paso anterior.
    this.version(3).stores({
      productos: null,
      registros: null,
      objetivos: null,
      alimentos: 'id, nombre, ultimoUso, actualizadoEn',
      diario: 'id, fecha, productoId, actualizadoEn',
      objetivosPorFecha: 'id, desde, actualizadoEn',
    })
  }
}

/**
 * Pasa los datos de la v1 a las tablas nuevas.
 *
 * Lo unico realmente delicado son las referencias: un registro apunta a su
 * producto por id, y un plato compuesto apunta a sus ingredientes igual. Si el
 * mapa de ids viejos a nuevos se aplica mal, un registro de macarrones acaba
 * colgando de otra cosa y sus macros dejan de tener sentido.
 *
 * Una referencia a algo que ya no existe se conserva como texto: ya estaba
 * rota antes de migrar, y la interfaz sabe decir "este alimento ya no existe".
 */
export async function migrarAUuids(tx: {
  table: (nombre: string) => Table<Record<string, unknown>, unknown>
}): Promise<void> {
  const ahora = Date.now()
  const viejosProductos = (await tx.table('productos').toArray()) as unknown as (Producto & {
    id: number
  })[]
  const viejosRegistros = (await tx.table('registros').toArray()) as unknown as (Registro & {
    id: number
    productoId: number
  })[]
  const viejosObjetivos = (await tx.table('objetivos').toArray()) as unknown as (Objetivos & {
    id: number
  })[]

  const mapa = new Map<number, Id>()
  for (const p of viejosProductos) mapa.set(p.id, nuevoId())

  /** Referencia traducida, o el id viejo como texto si ya estaba colgando. */
  const ref = (viejo: number): Id => mapa.get(viejo) ?? String(viejo)

  const alimentos = viejosProductos.map((p) => {
    const { id, ingredientes, ...resto } = p
    return {
      ...resto,
      id: mapa.get(id)!,
      creadoEn: p.creadoEn ?? ahora,
      actualizadoEn: ahora,
      ...(ingredientes
        ? {
            ingredientes: ingredientes.map((i) => ({
              ...i,
              productoId: ref(i.productoId as unknown as number),
            })),
          }
        : {}),
    } as Producto
  })

  const diario = viejosRegistros.map((r) => {
    const { id, ...resto } = r
    void id
    return {
      ...resto,
      id: nuevoId(),
      productoId: ref(r.productoId),
      creadoEn: r.creadoEn ?? ahora,
      actualizadoEn: ahora,
    } as Registro
  })

  const objetivos = viejosObjetivos.map((o) => {
    const { id, ...resto } = o
    void id
    return {
      ...resto,
      id: nuevoId(),
      creadoEn: (o as { creadoEn?: number }).creadoEn ?? ahora,
      actualizadoEn: ahora,
    } as Objetivos
  })

  if (alimentos.length) await tx.table('alimentos').bulkAdd(alimentos as never[])
  if (diario.length) await tx.table('diario').bulkAdd(diario as never[])
  if (objetivos.length) await tx.table('objetivosPorFecha').bulkAdd(objetivos as never[])
}

export const db = new NutriDB()

// ------------------------------------------------------------ borrados

/** Una fila borrada sigue ahi para propagar el borrado; para leer, no existe. */
export const vivo = <T extends Sincronizable>(x: T): boolean => x.borradoEn === undefined

export const soloVivos = <T extends Sincronizable>(xs: T[]): T[] => xs.filter(vivo)

// -------------------------------------------------------- escrituras
// Todas las escrituras pasan por aqui para que nadie se olvide de poner
// actualizadoEn: sin esa marca, el cambio no llegaria nunca al otro movil.

/**
 * Aviso de que algo ha cambiado en local.
 *
 * Lo escucha la sincronizacion para subirlo enseguida en vez de esperar al
 * siguiente temporizador. Sin esto, apuntar una comida y cerrar la app deja el
 * cambio ahi hasta la proxima vez que la abras, que puede ser al dia siguiente.
 */
const oyentesCambio = new Set<() => void>()

export function alCambiarDatos(f: () => void): () => void {
  oyentesCambio.add(f)
  return () => oyentesCambio.delete(f)
}

const avisarCambio = () => oyentesCambio.forEach((f) => f())

export type NuevoProducto = Omit<Producto, keyof Sincronizable>
export type NuevoRegistro = Omit<Registro, keyof Sincronizable>

export async function crearProducto(datos: NuevoProducto): Promise<Id> {
  const ahora = Date.now()
  const id = nuevoId()
  await db.alimentos.add({ ...datos, id, creadoEn: ahora, actualizadoEn: ahora, pendiente: 1 })
  avisarCambio()
  return id
}

export async function actualizarProducto(id: Id, cambios: Partial<NuevoProducto>): Promise<void> {
  await db.alimentos.update(id, { ...cambios, actualizadoEn: Date.now(), pendiente: 1 })
  avisarCambio()
}

export async function borrarProducto(id: Id): Promise<void> {
  const ahora = Date.now()
  await db.alimentos.update(id, { borradoEn: ahora, actualizadoEn: ahora, pendiente: 1 })
  avisarCambio()
}

export async function crearRegistro(datos: NuevoRegistro): Promise<Id> {
  const ahora = Date.now()
  const id = nuevoId()
  await db.diario.add({ ...datos, id, creadoEn: ahora, actualizadoEn: ahora, pendiente: 1 })
  avisarCambio()
  return id
}

export async function actualizarRegistro(id: Id, cambios: Partial<NuevoRegistro>): Promise<void> {
  await db.diario.update(id, { ...cambios, actualizadoEn: Date.now(), pendiente: 1 })
  avisarCambio()
}

export async function borrarRegistro(id: Id): Promise<void> {
  const ahora = Date.now()
  await db.diario.update(id, { borradoEn: ahora, actualizadoEn: ahora, pendiente: 1 })
  avisarCambio()
}

// --------------------------------------------------------- lecturas

export async function productosVivos(): Promise<Producto[]> {
  return soloVivos(await db.alimentos.toArray())
}

export async function registrosDe(fecha: string): Promise<Registro[]> {
  return soloVivos(await db.diario.where('fecha').equals(fecha).toArray())
}

export async function registrosEntre(desde: string, hasta: string): Promise<Registro[]> {
  return soloVivos(await db.diario.where('fecha').between(desde, hasta, true, true).toArray())
}

// --------------------------------------------------------- objetivos

/** Objetivos vigentes en una fecha dada (los mas recientes con desde <= fecha). */
export async function objetivosEn(fecha: string): Promise<Objetivos> {
  const filas = soloVivos(await db.objetivosPorFecha.where('desde').belowOrEqual(fecha).toArray())
  const ultima = filas.sort((a, b) => a.desde.localeCompare(b.desde)).at(-1)
  return (
    ultima ?? {
      id: 'por-defecto',
      desde: '0000-01-01',
      creadoEn: 0,
      actualizadoEn: 0,
      ...OBJETIVOS_POR_DEFECTO,
    }
  )
}

export const objetivosActuales = (): Promise<Objetivos> => objetivosEn(hoyISO())

/** Un cambio de objetivos crea fila nueva, salvo que ya se hubiese cambiado hoy. */
export async function guardarObjetivos(
  vals: Omit<Objetivos, keyof Sincronizable | 'desde'>,
): Promise<void> {
  const hoy = hoyISO()
  const ahora = Date.now()
  const deHoy = soloVivos(await db.objetivosPorFecha.where('desde').equals(hoy).toArray())[0]
  if (deHoy)
    await db.objetivosPorFecha.update(deHoy.id, { ...vals, actualizadoEn: ahora, pendiente: 1 })
  else
    await db.objetivosPorFecha.add({
      ...vals,
      id: nuevoId(),
      desde: hoy,
      creadoEn: ahora,
      actualizadoEn: ahora,
      pendiente: 1,
    })
  avisarCambio()
}

// ------------------------------------------------------------- varios

/**
 * Pide almacenamiento persistente. Sin esto el navegador puede desalojar
 * IndexedDB cuando ande justo de espacio y llevarse meses de registros.
 * En iOS el soporte es irregular, asi que nunca dependemos de que diga que si:
 * la copia de seguridad real es la exportacion a JSON.
 */
export async function pedirPersistencia(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
