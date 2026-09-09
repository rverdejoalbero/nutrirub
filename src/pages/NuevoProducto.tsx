import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { prepararImagen } from '../lib/imagen'
import { leerEtiqueta } from '../ai/etiqueta'
import { guardarBorrador } from '../lib/borrador'
import { hayClave } from '../lib/ajustes'
import { ErrorIA } from '../ai/provider'
import { Cabecera } from '../components/UI'
import { IconoCamara, IconoLapiz, IconoPlato } from '../components/Iconos'

type Estado = 'elegir' | 'preparando' | 'leyendo'

export default function NuevoProducto() {
  const nav = useNavigate()
  const entrada = useRef<HTMLInputElement>(null)
  const [estado, setEstado] = useState<Estado>('elegir')
  const [error, setError] = useState<string | null>(null)
  const conClave = hayClave()

  async function alElegirFoto(file: File) {
    setError(null)
    try {
      setEstado('preparando')
      // Reducir antes de enviar: una foto de iPhone son 3-4 MB.
      const img = await prepararImagen(file)
      setEstado('leyendo')
      const etiqueta = await leerEtiqueta({ base64: img.base64, mime: img.mime })
      // Se guarda la foto ya reducida: sirve para revisar un numero raro
      // dentro de tres semanas.
      guardarBorrador({ etiqueta, foto: img.blob })
      nav('/alimentos/revisar', { replace: true })
    } catch (e) {
      setEstado('elegir')
      setError(
        e instanceof ErrorIA
          ? e.message
          : 'No se ha podido leer la etiqueta. Prueba con más luz o introduce los datos a mano.',
      )
    } finally {
      if (entrada.current) entrada.current.value = ''
    }
  }

  if (estado !== 'elegir') {
    return (
      <>
        <Cabecera titulo="Leyendo etiqueta" onAtras={() => nav(-1)} />
        <main>
          <div className="vacio" role="status" aria-live="polite">
            <span className="cargando" />
            <p style={{ marginTop: 14 }}>
              {estado === 'preparando' ? 'Preparando la foto…' : 'Leyendo los valores…'}
            </p>
            <p className="nota">Tarda unos segundos. No cierres la app.</p>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <Cabecera titulo="Nuevo alimento" onAtras={() => nav(-1)} />
      <main>
        <div className="contenido">
          {error && <p className="error">{error}</p>}

          {!conClave && (
            <div className="aviso-caja">
              Para leer etiquetas con la cámara hace falta una clave de API.{' '}
              <Link to="/ajustes">Ponerla en Ajustes</Link>. Mientras tanto puedes añadir el
              producto a mano.
            </div>
          )}

          <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
            <button
              className="boton ancho"
              disabled={!conClave}
              onClick={() => entrada.current?.click()}
              style={{ minHeight: 64 }}
            >
              <IconoCamara />
              Foto de la etiqueta
            </button>
            {/* Sin capture: en iOS asi sale el menu con Cámara / Fototeca / Archivos */}
            <input
              ref={entrada}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void alElegirFoto(f)
              }}
            />

            <Link className="boton secundario ancho" to="/alimentos/revisar" style={{ minHeight: 64 }}>
              <IconoLapiz />
              Meterlo a mano
            </Link>

            <Link className="boton secundario ancho" to="/platos/nuevo" style={{ minHeight: 64 }}>
              <IconoPlato />
              Plato de varios alimentos
            </Link>
          </div>

          <p className="nota" style={{ marginTop: 24 }}>
            Fotografía la tabla de información nutricional, no el paquete entero. Enfoca de cerca,
            con la tabla recta y bien iluminada. Los valores salen siempre por 100 g o 100 ml.
          </p>
        </div>
      </main>
    </>
  )
}
