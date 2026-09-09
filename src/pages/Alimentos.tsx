import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { buscarProductos } from '../lib/buscar'
import { ent } from '../lib/formato'
import { Vacio } from '../components/UI'
import { IconoAdelante, IconoMas } from '../components/Iconos'

type Orden = 'recientes' | 'alfabetico'

export default function Alimentos() {
  const nav = useNavigate()
  const [consulta, setConsulta] = useState('')
  const [orden, setOrden] = useState<Orden>('recientes')

  const productos = useLiveQuery(() => db.productos.toArray(), [], undefined)

  const listados = useMemo(() => {
    const base = buscarProductos(productos ?? [], consulta)
    return [...base].sort((a, b) =>
      orden === 'alfabetico'
        ? a.nombre.localeCompare(b.nombre, 'es')
        : (b.ultimoUso ?? b.creadoEn) - (a.ultimoUso ?? a.creadoEn),
    )
  }, [productos, consulta, orden])

  return (
    <>
      <header className="cabecera">
        <h1>Alimentos</h1>
        <Link className="accion" to="/alimentos/nuevo" aria-label="Nuevo alimento">
          <IconoMas />
        </Link>
      </header>

      <main>
        <div className="contenido" style={{ paddingTop: 14 }}>
          <label className="campo">
            <span style={{ position: 'absolute', left: -9999 }}>Buscar</span>
            <input
              type="search"
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              placeholder="Buscar por nombre o marca"
            />
          </label>
          <div className="chips">
            <button
              className={`chip ${orden === 'recientes' ? 'activo' : ''}`}
              onClick={() => setOrden('recientes')}
            >
              Recientes
            </button>
            <button
              className={`chip ${orden === 'alfabetico' ? 'activo' : ''}`}
              onClick={() => setOrden('alfabetico')}
            >
              A–Z
            </button>
            <span className="chip" style={{ marginLeft: 'auto', border: 'none' }}>
              {listados.length}
            </span>
          </div>
        </div>

        {productos === undefined ? null : productos.length === 0 ? (
          <Vacio texto="Tu biblioteca está vacía. Empieza fotografiando la etiqueta de algo que tengas en la despensa.">
            <Link className="boton" to="/alimentos/nuevo">
              Añadir alimento
            </Link>
          </Vacio>
        ) : listados.length === 0 ? (
          <Vacio texto={`Nada coincide con «${consulta}».`} />
        ) : (
          <ul className="lista">
            {listados.map((p) => (
              <li key={p.id}>
                <button className="fila-item" onClick={() => nav(`/alimentos/${p.id}`)}>
                  <span className="texto">
                    <span className="titulo">{p.nombre}</span>
                    <span className="sub">
                      {p.marca ? `${p.marca} · ` : ''}
                      {p.origen === 'foto' ? 'Leído de etiqueta' : 'A mano'}
                    </span>
                  </span>
                  <span className="derecha">
                    <span className="kcal cifra">{ent(p.kcal)}</span>
                    <span className="u">kcal/100 {p.unidadBase}</span>
                  </span>
                  <IconoAdelante />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Link className="flotante" to="/alimentos/nuevo">
        <IconoMas />
        Añadir
      </Link>
    </>
  )
}
