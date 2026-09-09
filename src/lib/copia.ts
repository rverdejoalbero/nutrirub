import { db } from '../db/db'
import type { Objetivos, Producto, Registro } from '../db/types'
import { aBase64, deBase64 } from './imagen'
import { guardarAjustes } from './ajustes'
import { hoyISO } from './fecha'

const FORMATO = 1

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
 */
export async function construirCopia(incluirFotos: boolean): Promise<Copia> {
  const [productos, registros, objetivos] = await Promise.all([
    db.productos.toArray(),
    db.registros.toArray(),
    db.objetivos.toArray(),
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
  if (!datos || typeof datos !== 'object') throw new Error('El fichero no contiene un objeto JSON.')
  const c = datos as Partial<Copia>
  if (c.app !== 'nutrirub') throw new Error('Este fichero no es una copia de NutriRub.')
  if (!Array.isArray(c.productos) || !Array.isArray(c.registros))
    throw new Error('A la copia le faltan productos o registros.')
  if (typeof c.formato !== 'number' || c.formato > FORMATO)
    throw new Error('La copia es de una versión más nueva de la app.')
  return { ...(c as Copia), objetivos: Array.isArray(c.objetivos) ? c.objetivos : [] }
}

async function aProducto(p: ProductoExportado): Promise<Producto> {
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
 * 'fusionar' anade lo que no estaba, remapeando los ids para no pisar nada.
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
  const copia = validar(datos)

  return db.transaction('rw', db.productos, db.registros, db.objetivos, async () => {
    if (modo === 'reemplazar') {
      await Promise.all([db.productos.clear(), db.registros.clear(), db.objetivos.clear()])
      for (const p of copia.productos) await db.productos.add(await aProducto(p))
      await db.registros.bulkAdd(copia.registros)
      if (copia.objetivos.length) await db.objetivos.bulkAdd(copia.objetivos)
      return {
        productos: copia.productos.length,
        registros: copia.registros.length,
        objetivos: copia.objetivos.length,
      }
    }

    // Fusionar: id viejo -> id nuevo, para que los registros sigan apuntando bien.
    const mapa = new Map<number, number>()
    const existentes = await db.productos.toArray()
    const clave = (n: string, m?: string) => `${n.trim().toLowerCase()}|${(m ?? '').trim().toLowerCase()}`
    const porClave = new Map(existentes.map((p) => [clave(p.nombre, p.marca), p.id!]))

    let nuevosProductos = 0
    for (const p of copia.productos) {
      const k = clave(p.nombre, p.marca)
      const yaEsta = porClave.get(k)
      if (yaEsta !== undefined) {
        if (p.id !== undefined) mapa.set(p.id, yaEsta)
        continue
      }
      const { id, ...sinId } = await aProducto(p)
      void id
      const nuevoId = await db.productos.add(sinId as Producto)
      if (p.id !== undefined) mapa.set(p.id, nuevoId)
      porClave.set(k, nuevoId)
      nuevosProductos++
    }

    // Los platos compuestos guardan ids de ingredientes, que tambien se han
    // movido. Sin este paso, tras fusionar una copia un plato apuntaria a
    // productos equivocados y sus macros dejarian de tener nada que ver.
    for (const nuevoId of mapa.values()) {
      const p = await db.productos.get(nuevoId)
      if (!p?.ingredientes?.length) continue
      const remapeados = p.ingredientes.map((i) => ({
        ...i,
        productoId: mapa.get(i.productoId) ?? i.productoId,
      }))
      if (remapeados.some((i, k) => i.productoId !== p.ingredientes![k].productoId)) {
        await db.productos.update(nuevoId, { ingredientes: remapeados })
      }
    }

    const yaRegistrados = new Set(
      (await db.registros.toArray()).map((r) => `${r.fecha}|${r.momento}|${r.nombreProducto}|${r.cantidad}|${r.creadoEn}`),
    )
    let nuevosRegistros = 0
    for (const r of copia.registros) {
      const huella = `${r.fecha}|${r.momento}|${r.nombreProducto}|${r.cantidad}|${r.creadoEn}`
      if (yaRegistrados.has(huella)) continue
      const { id, ...sinId } = r
      void id
      await db.registros.add({ ...sinId, productoId: mapa.get(r.productoId) ?? r.productoId })
      nuevosRegistros++
    }

    let nuevosObjetivos = 0
    const desdes = new Set((await db.objetivos.toArray()).map((o) => o.desde))
    for (const o of copia.objetivos) {
      if (desdes.has(o.desde)) continue
      const { id, ...sinId } = o
      void id
      await db.objetivos.add(sinId as Objetivos)
      nuevosObjetivos++
    }

    return { productos: nuevosProductos, registros: nuevosRegistros, objetivos: nuevosObjetivos }
  })
}

export async function borrarTodo(): Promise<void> {
  await db.transaction('rw', db.productos, db.registros, db.objetivos, async () => {
    await Promise.all([db.productos.clear(), db.registros.clear(), db.objetivos.clear()])
  })
}
