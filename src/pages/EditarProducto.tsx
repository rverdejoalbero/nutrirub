import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../db/db'
import {
  FormularioProducto,
  valoresDesdeProducto,
  type DatosProducto,
} from '../components/FormularioProducto'
import { Cabecera, Cargando, Confirmar, Vacio } from '../components/UI'

export default function EditarProducto() {
  const { id } = useParams()
  const nav = useNavigate()
  const idNum = Number(id)
  const producto = useLiveQuery(
    () => (isFinite(idNum) ? db.productos.get(idNum) : undefined),
    [idNum],
    undefined,
  )
  const [borrando, setBorrando] = useState(false)
  const [urlFoto, setUrlFoto] = useState<string | null>(null)
  const [fotoAbierta, setFotoAbierta] = useState(false)
  const [nRegistros, setNRegistros] = useState<number | null>(null)

  useEffect(() => {
    if (!isFinite(idNum)) return
    db.registros
      .where('productoId')
      .equals(idNum)
      .count()
      .then(setNRegistros)
  }, [idNum])

  useEffect(() => {
    if (!producto?.fotoEtiqueta) return
    const u = URL.createObjectURL(producto.fotoEtiqueta)
    setUrlFoto(u)
    return () => URL.revokeObjectURL(u)
  }, [producto])

  const inicial = useMemo(() => valoresDesdeProducto(producto), [producto])

  async function guardar(datos: DatosProducto) {
    if (!producto?.id) return
    // Solo cambia la ficha del producto. Los registros ya escritos llevan sus
    // macros congelados, asi que el historial no se mueve.
    await db.productos.update(producto.id, datos)
    nav(-1)
  }

  if (producto === undefined) return <Cargando />
  if (producto === null || !producto) {
    return (
      <>
        <Cabecera titulo="Alimento" onAtras={() => nav('/alimentos')} />
        <main>
          <Vacio texto="Este alimento ya no existe." />
        </main>
      </>
    )
  }

  return (
    <>
      <Cabecera titulo={producto.nombre} onAtras={() => nav(-1)} />
      <main>
        <FormularioProducto
          inicial={inicial}
          textoBoton="Guardar cambios"
          onGuardar={guardar}
          extraSuperior={
            urlFoto ? (
              <div style={{ marginTop: 16 }}>
                {fotoAbierta && (
                  <img className="foto-etiqueta" src={urlFoto} alt="Etiqueta fotografiada" />
                )}
                <button
                  className="boton secundario ancho"
                  style={{ marginBottom: 20 }}
                  onClick={() => setFotoAbierta((x) => !x)}
                >
                  {fotoAbierta ? 'Ocultar la foto' : 'Ver la foto de la etiqueta'}
                </button>
              </div>
            ) : null
          }
          extraInferior={
            <button className="boton peligro ancho" onClick={() => setBorrando(true)}>
              Borrar alimento
            </button>
          }
        />
      </main>

      {borrando && (
        <Confirmar
          titulo="Borrar alimento"
          mensaje={
            nRegistros
              ? `Se quita de la biblioteca. Los ${nRegistros} registros del diario que lo usan se conservan tal cual: guardan sus propios macros.`
              : 'Se quita de la biblioteca. Los registros antiguos del diario se conservan.'
          }
          textoOk="Borrar"
          peligro
          onOk={async () => {
            if (producto.id) await db.productos.delete(producto.id)
            nav('/alimentos', { replace: true })
          }}
          onCancelar={() => setBorrando(false)}
        />
      )}
    </>
  )
}
