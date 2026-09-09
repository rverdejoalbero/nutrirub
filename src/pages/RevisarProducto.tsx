import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { limpiarBorrador, tomarBorrador } from '../lib/borrador'
import {
  FormularioProducto,
  valoresDesdeProducto,
  type DatosProducto,
  type ValoresProducto,
} from '../components/FormularioProducto'
import { Cabecera } from '../components/UI'
import type { Producto } from '../db/types'

const AVISO_CONFIANZA: Record<string, string> = {
  media: 'El modelo no lo ha visto todo claro. Contrasta los números con la etiqueta.',
  baja: 'El modelo ha leído la etiqueta con dificultad. Revísalo bien antes de guardar.',
}

export default function RevisarProducto() {
  const nav = useNavigate()
  // Se coge una sola vez: si se recarga la pagina, el borrador ya no esta y
  // esto queda como un alta manual en blanco, que es el comportamiento correcto.
  const [borrador] = useState(() => tomarBorrador())
  const [urlFoto, setUrlFoto] = useState<string | null>(null)

  useEffect(() => {
    if (!borrador?.foto) return
    const u = URL.createObjectURL(borrador.foto)
    setUrlFoto(u)
    return () => URL.revokeObjectURL(u)
  }, [borrador])

  useEffect(() => () => limpiarBorrador(), [])

  const inicial: ValoresProducto = useMemo(() => {
    const e = borrador?.etiqueta
    if (!e) return valoresDesdeProducto()
    const base = valoresDesdeProducto({
      nombre: e.nombre,
      marca: e.marca ?? undefined,
      unidadBase: e.unidadBase,
      kcal: e.kcal ?? undefined,
      proteinas: e.proteinas ?? undefined,
      carbohidratos: e.carbohidratos ?? undefined,
      azucares: e.azucares ?? undefined,
      grasas: e.grasas ?? undefined,
      saturadas: e.saturadas ?? undefined,
      fibra: e.fibra ?? undefined,
      sal: e.sal ?? undefined,
    })
    // Si la etiqueta daba una racion, ya vale como porcion rapida.
    if (e.racionG && e.racionG > 0) {
      base.porciones = [{ nombre: '1 ración', cantidad: e.racionG }]
    }
    return base
  }, [borrador])

  const deIA = !!borrador
  const confianza = borrador?.etiqueta.confianza
  // Con confianza baja la foto se abre grande al lado del formulario.
  const [fotoAbierta, setFotoAbierta] = useState(confianza === 'baja')

  async function guardar(datos: DatosProducto) {
    const producto: Producto = {
      ...datos,
      origen: deIA ? 'foto' : 'manual',
      fotoEtiqueta: borrador?.foto,
      creadoEn: Date.now(),
      ultimoUso: Date.now(),
    }
    await db.productos.add(producto)
    limpiarBorrador()
    nav('/alimentos', { replace: true })
  }

  return (
    <>
      <Cabecera titulo={deIA ? 'Revisar etiqueta' : 'Nuevo alimento'} onAtras={() => nav(-1)} />
      <main>
        <FormularioProducto
          inicial={inicial}
          textoBoton="Guardar producto"
          onGuardar={guardar}
          extraSuperior={
            <>
              {confianza && AVISO_CONFIANZA[confianza] && (
                <div className="aviso-caja" style={{ marginTop: 16 }}>
                  {AVISO_CONFIANZA[confianza]}
                  {borrador?.etiqueta.notas && <> {borrador.etiqueta.notas}</>}
                </div>
              )}
              {urlFoto && (
                <>
                  {fotoAbierta ? (
                    <img className="foto-etiqueta" src={urlFoto} alt="Etiqueta fotografiada" />
                  ) : null}
                  <button
                    className="boton secundario ancho"
                    style={{ marginBottom: 20 }}
                    onClick={() => setFotoAbierta((x) => !x)}
                  >
                    {fotoAbierta ? 'Ocultar la foto' : 'Ver la foto de la etiqueta'}
                  </button>
                </>
              )}
            </>
          }
        />
      </main>
    </>
  )
}
