import Dexie, { type Table } from 'dexie'
import { type Objetivos, type Producto, type Registro, OBJETIVOS_POR_DEFECTO } from './types'
import { hoyISO } from '../lib/fecha'

export class NutriDB extends Dexie {
  productos!: Table<Producto, number>
  registros!: Table<Registro, number>
  objetivos!: Table<Objetivos, number>

  constructor() {
    super('nutrirub')
    this.version(1).stores({
      productos: '++id, nombre, codigoBarras, ultimoUso',
      registros: '++id, fecha, productoId',
      objetivos: '++id, desde',
    })
  }
}

export const db = new NutriDB()

/** Objetivos vigentes en una fecha dada (los mas recientes con desde <= fecha). */
export async function objetivosEn(fecha: string): Promise<Objetivos> {
  const fila = await db.objetivos.where('desde').belowOrEqual(fecha).last()
  return fila ?? { desde: '0000-01-01', ...OBJETIVOS_POR_DEFECTO }
}

export async function objetivosActuales(): Promise<Objetivos> {
  return objetivosEn(hoyISO())
}

/** Un cambio de objetivos crea fila nueva, salvo que ya se hubiese cambiado hoy. */
export async function guardarObjetivos(vals: Omit<Objetivos, 'id' | 'desde'>): Promise<void> {
  const hoy = hoyISO()
  const deHoy = await db.objetivos.where('desde').equals(hoy).first()
  if (deHoy?.id) await db.objetivos.update(deHoy.id, vals)
  else await db.objetivos.add({ desde: hoy, ...vals })
}

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
