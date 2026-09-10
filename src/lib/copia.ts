import { db, soloVivos } from '../db/db'
import { type Id, type Objetivos, type Producto, type Registro, nuevoId } from '../db/types'
import { aBase64, deBase64 } from './imagen'
import { guardarAjustes } from './ajustes'
import { hoyISO } from './fecha'

/** 1: ids enteros. 2: UUIDs, marcas de tiempo y borrado logico. */
const FORMATO = 2

interface ProductoExportado extends Omit<Producto, 'fotoEtiqueta'> {
  fotoEtiqueta?: string // base64 JPEG
}

export interface Copia {
  app: 'nutrirub'
  formato: number
  exportadoEn: number
  incluyeFotos: boolean
  productos: ProductoExportado[]
  registros: Registro[]
  objetivos: Objetivos[]
}

/**
 * Esta es la unica copia de seguridad que existe. Las fotos van aparte porque
 * en base64 inflan un 33% y convertirian el fichero del dia a dia en algo de
 * decenas de megas que no exportarias nunca.
 *
 * Solo se exporta lo vivo: una copia es tu comida, no un registro de lo que
 * borraste. Fusionar una copia antigua tampoco resucita nada, porque el
 * borrado local es mas reciente y gana.
 */
export async function construirCopia(incluirFotos: boolean): Promise<Copia> {
  const [productos, registros, objetivos] = await Promise.all([
    db.alimentos.toArray().then(soloVivos),
    db.diario.toArray().then(soloVivos),
    db.objetivosPorFecha.toArray().then(soloVivos),
  ])

  const exportados: ProductoExportado[] = []
  for (const p of productos) {
    const { fotoEtiqueta, ...resto } = p
    exportados.push(
      incluirFotos && fotoEtiqueta
        ? { ...resto, fotoEtiqueta: await aBase64(fotoEtiqueta) }
        : resto,
    )
  }

  return {
    app: 'nutrirub',
    formato: FORMATO,
    exportadoEn: Date.now(),
    incluyeFotos: incluirFotos,
    productos: exportados,
    registros,
    objetivos,
  }
}

export function nombreFichero(incluyeFotos: boolean): string {
  return `nutrirub-${hoyISO()}${incluyeFotos ? '-con-fotos' : ''}.json`
}

/**
 * En iOS, dentro de una PWA instalada, el <a download> es poco de fiar.
 * La hoja de compartir si funciona y ademas deja guardar en Archivos o
 * mandarselo a uno mismo, asi que va primero.
 */
export async function exportar(incluirFotos: boolean): Promise<'compartido' | 'descargado'> {
  const copia = await construirCopia(incluirFotos)
  const texto = JSON.stringify(copia, null, incluirFotos ? 0 : 2)
  const blob = new Blob([texto], { type: 'application/json' })
  const nombre = nombreFichero(incluirFotos)

  try {
    const fichero = new File([blob], nombre, { type: 'application/json' })
    if (navigator.canShare?.({ files: [fichero] })) {
      await navigator.share({ files: [fichero], title: 'Copia de NutriRub' })
      guardarAjustes({ ultimaCopia: Date.now() })
      return 'compartido'
    }
  } catch (e) {
    // Si el usuario cancela la hoja de compartir, no seguimos a la descarga.
    if (e instanceof DOMException && e.name === 'AbortError') throw e
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  guardarAjustes({ ultimaCopia: Date.now() })
  return 'descargado'
}

export interface ResultadoImportacion {
  productos: number
  registros: number
  objetivos: number
}

function validar(datos: unknown): Copia {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos))
    throw new Error('El fichero no contiene un objeto JSON.')
  const c = datos as Partial<Copia>
  if (c.app !== 'nutrirub') throw new Error('Este fichero no es una copia de NutriRub.')
  if (!Array.isArray(c.productos) || !Array.isArray(c.registros))
    throw new Error('A la copia le faltan productos o registros.')
  if (typeof c.formato !== 'number' || c.formato > FORMATO)
    throw new Error('La copia es de una versión más nueva de la app.')
  return { ...(c as Copia), objetivos: Array.isArray(c.objetivos) ? c.objetivos : [] }
}

/**
 * Sube una copia del formato 1 al 2: ids enteros a UUIDs, con las referencias
 * traducidas. Es la misma operacion que hace la base al abrirse por primera
 * vez, pero sobre un fichero: sin esto, una copia guardada antes del cambio
 * seria papel mojado justo el dia que la necesitas.
 */
function subirDelFormato1(c: Copia): Copia {
  const ahora = Date.now()
  const mapa = new Map<string, Id>()
  const clave = (v: unknown) => String(v)

  for (const p of c.productos) mapa.set(clave(p.id), nuevoId())
  const ref = (viejo: unknown): Id => mapa.get(clave(viejo)) ?? clave(viejo)

  return {
    ...c,
    formato: FORMATO,
    productos: c.productos.map((p) => ({
      ...p,
      id: mapa.get(clave(p.id))!,
      creadoEn: p.creadoEn ?? ahora,
      actualizadoEn: ahora,
      ...(p.ingredientes
        ? { ingredientes: p.ingredientes.map((i) => ({ ...i, productoId: ref(i.productoId) })) }
        : {}),
    })),
    registros: c.registros.map((r) => ({
      ...r,
      id: nuevoId(),
      productoId: ref(r.productoId),
      creadoEn: r.creadoEn ?? ahora,
      actualizadoEn: ahora,
    })),
    objetivos: c.objetivos.map((o) => ({
      ...o,
      id: nuevoId(),
      creadoEn: o.creadoEn ?? ahora,
      actualizadoEn: ahora,
    })),
  }
}

function aProducto(p: ProductoExportado): Producto {
  const { fotoEtiqueta, ...resto } = p
  const producto: Producto = { ...resto }
  if (typeof fotoEtiqueta === 'string' && fotoEtiqueta) {
    try {
      producto.fotoEtiqueta = deBase64(fotoEtiqueta)
    } catch {
      /* una foto ilegible no debe tumbar la importacion entera */
    }
  }
  return producto
}

/**
 * 'reemplazar' es la restauracion de verdad: deja la base igual que el fichero.
 * 'fusionar' añade lo que falte y, si algo esta en los dos sitios, se queda la
 * version mas reciente.
 *
 * Con UUIDs no hace falta remapear nada: un id identifica lo mismo en todos los
 * dispositivos, que es justo para lo que se cambiaron.
 */
export async function importar(
  texto: string,
  modo: 'reemplazar' | 'fusionar',
): Promise<ResultadoImportacion> {
  let datos: unknown
  try {
    datos = JSON.parse(texto)
  } catch {
    throw new Error('El fichero no es un JSON válido.')
  }
  let copia = validar(datos)
  if (copia.formato < FORMATO) copia = subirDelFormato1(copia)

  return db.transaction('rw', db.alimentos, db.diario, db.objetivosPorFecha, async () => {
    if (modo === 'reemplazar') {
      await Promise.all([db.alimentos.clear(), db.diario.clear(), db.objetivosPorFecha.clear()])
      await db.alimentos.bulkAdd(copia.productos.map(aProducto))
      await db.diario.bulkAdd(copia.registros)
      if (copia.objetivos.length) await db.objetivosPorFecha.bulkAdd(copia.objetivos)
      return {
        productos: copia.productos.length,
        registros: copia.registros.length,
        objetivos: copia.objetivos.length,
      }
    }

    /** Se queda el mas reciente; ante empate, lo que ya habia. */
    async function fusionarEn<T extends { id: Id; actualizadoEn: number }>(
      tabla: { get: (id: Id) => Promise<T | undefined>; put: (x: T) => Promise<unknown> },
      entrantes: T[],
    ): Promise<number> {
      let n = 0
      for (const nuevo of entrantes) {
        const actual = await tabla.get(nuevo.id)
        if (actual && actual.actualizadoEn >= nuevo.actualizadoEn) continue
        await tabla.put(nuevo)
        if (!actual) n++
      }
      return n
    }

    return {
      productos: await fusionarEn(db.alimentos, copia.productos.map(aProducto)),
      registros: await fusionarEn(db.diario, copia.registros),
      objetivos: await fusionarEn(db.objetivosPorFecha, copia.objetivos),
    }
  })
}

/** Borrado local de verdad, no logico: es el boton de "empezar de cero". */
export async function borrarTodo(): Promise<void> {
  await db.transaction('rw', db.alimentos, db.diario, db.objetivosPorFecha, async () => {
    await Promise.all([db.alimentos.clear(), db.diario.clear(), db.objetivosPorFecha.clear()])
  })
}
