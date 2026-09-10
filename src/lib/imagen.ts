export const LADO_MAX = 1000
export const CALIDAD = 0.8

/**
 * Decodifica respetando la orientacion EXIF. createImageBitmap es la via
 * limpia, pero en iOS puede no tragar un HEIC de la fototeca, asi que
 * dejamos el <img> de reserva: Safari si sabe pintar HEIC en un elemento.
 */
async function decodificar(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.decoding = 'async'
      await new Promise<void>((ok, fallo) => {
        img.onload = () => ok()
        img.onerror = () => fallo(new Error('no se pudo decodificar la imagen'))
        img.src = url
      })
      if ('decode' in img) await img.decode().catch(() => {})
      return img
    } finally {
      // el bitmap ya esta en memoria; liberar la URL no lo invalida
      setTimeout(() => URL.revokeObjectURL(url), 0)
    }
  }
}

export interface ImagenPreparada {
  blob: Blob
  base64: string
  mime: string
  ancho: number
  alto: number
}

/**
 * Reduce la foto antes de mandarla al modelo: lado mayor a 1000 px y JPEG 0.8.
 * Una foto de iPhone son 3-4 MB; asi baja a 100-250 KB. Ahorra tokens, ahorra
 * espera, y es tambien lo que se guarda como fotoEtiqueta.
 */
export async function prepararImagen(file: Blob, ladoMax = LADO_MAX): Promise<ImagenPreparada> {
  const img = await decodificar(file)
  const wo = 'width' in img ? img.width : (img as HTMLImageElement).naturalWidth
  const ho = 'height' in img ? img.height : (img as HTMLImageElement).naturalHeight
  if (!wo || !ho) throw new Error('la imagen no tiene dimensiones')

  const escala = Math.min(1, ladoMax / Math.max(wo, ho))
  const ancho = Math.max(1, Math.round(wo * escala))
  const alto = Math.max(1, Math.round(ho * escala))

  const canvas = document.createElement('canvas')
  canvas.width = ancho
  canvas.height = alto
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no hay contexto 2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img as CanvasImageSource, 0, 0, ancho, alto)
  if ('close' in img) img.close()

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', CALIDAD))

  // Soltar el lienzo antes de construir el base64. Una foto de iPhone son 12
  // megapixeles y su mapa de bits ocupa decenas de megas; si se queda vivo
  // mientras se monta la cadena en base64, Safari puede quedarse sin memoria
  // en la pestaña, y lo primero que corta son las peticiones de red.
  canvas.width = 0
  canvas.height = 0

  if (!blob) throw new Error('no se pudo comprimir la imagen')

  return { blob, base64: await aBase64(blob), mime: 'image/jpeg', ancho, alto }
}

/**
 * Solo la carga util, sin el prefijo data:...;base64,
 * Con arrayBuffer en vez de FileReader: la API moderna funciona igual en el
 * navegador y en Node, asi que la exportacion se puede probar sin navegador.
 */
export async function aBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  // Por trozos: String.fromCharCode con cientos de miles de argumentos
  // desborda la pila, y una foto de etiqueta pasa de largo ese limite.
  const TROZO = 0x8000
  let binario = ''
  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO))
  }
  return btoa(binario)
}

export function deBase64(base64: string, mime = 'image/jpeg'): Blob {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
