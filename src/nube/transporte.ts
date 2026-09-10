import { nube, type FilaNube } from './cliente'
import type { Transporte } from './sincronizar'

const TABLA = 'datos'
/** Supabase corta las respuestas largas; se pagina para no perder filas. */
const POR_PAGINA = 1000

export class ErrorNube extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorNube'
  }
}

function traducir(mensaje: string): string {
  const m = mensaje.toLowerCase()
  if (m.includes('failed to fetch') || m.includes('networkerror'))
    return 'No hay conexión. Tus cambios se guardan aquí y subirán cuando vuelva.'
  if (m.includes('jwt') || m.includes('expired'))
    return 'La sesión ha caducado. Vuelve a iniciar sesión.'
  if (m.includes('row-level security') || m.includes('violates'))
    return 'El servidor ha rechazado el cambio. Vuelve a iniciar sesión.'
  return mensaje
}

/** El transporte de verdad: lo unico de la sincronizacion que toca la red. */
export function transporteSupabase(usuarioId: string): Transporte {
  const cliente = nube()

  return {
    usuarioId,

    async bajar(desde) {
      const filas: FilaNube[] = []
      let pagina = 0
      for (;;) {
        let q = cliente
          .from(TABLA)
          .select('usuario_id,id,tipo,actualizado_en,borrado_en,contenido,subido_en')
          // El orden importa: se pagina por subido_en, asi que sin ordenar
          // podrian repetirse o saltarse filas entre paginas.
          .order('subido_en', { ascending: true })
          .range(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA - 1)
        if (desde) q = q.gt('subido_en', desde)

        const { data, error } = await q
        if (error) throw new ErrorNube(traducir(error.message))
        filas.push(...((data ?? []) as FilaNube[]))
        if (!data || data.length < POR_PAGINA) break
        pagina++
      }
      return filas
    },

    async subir(nuevas) {
      // subido_en la pone el servidor: mandarla desde aqui la pisaria con el
      // reloj del movil, que es justo lo que se quiere evitar.
      const limpias = nuevas.map(({ subido_en, ...f }) => {
        void subido_en
        return f
      })
      // Por lotes: una subida enorme en una sola peticion se corta.
      for (let i = 0; i < limpias.length; i += POR_PAGINA) {
        const lote = limpias.slice(i, i + POR_PAGINA)
        const { error } = await cliente
          .from(TABLA)
          .upsert(lote, { onConflict: 'usuario_id,id' })
        if (error) throw new ErrorNube(traducir(error.message))
      }
    },

  }
}
