import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { actualizarProducto, productosVivos } from '../db/db'
import { buscarProductos } from '../lib/buscar'
import { ent } from '../lib/formato'
import { Vacio } from '../components/UI'
import {
  IconoAdelante,
  IconoEstrella,
  IconoEstrellaLlena,
  IconoMas,
} from '../components/Iconos'
import type { Producto } from '../db/types'

type Orden = 'recientes' | 'alfabetico'
type Filtro = 'todos' | 'favoritos' | 'platos'

const DESCRIPCION_ORIGEN: Record<Producto['origen'], string> = {
  foto: 'Leído de etiqueta',
  manual: 'A mano',
  receta: 'Plato compuesto',
}

/** Un plato se edita en su propia pantalla, que sabe de ingredientes. */
export const rutaDe = (p: Producto): string =>
  p.origen === 'receta' ? `/platos/${p.id}` : `/alimentos/${p.id}`

export async function alternarFavorito(p: Producto): Promise<void> {
  await actualizarProducto(p.id, { favorito: !p.favorito })
}

export default function Alimentos() {
  const nav = useNavigate()
  const [consulta, setConsulta] = useState('')
  const [orden, setOrden] = useState<Orden>('recientes')
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const productos = useLiveQuery(() => productosVivos(), [], undefined)
  const nFavoritos = (productos ?? []).filter((p) => p.favorito).length
  const nPlatos = (productos ?? []).filter((p) => p.origen === 'receta').length

  const listados = useMemo(() => {
    let base = productos ?? []
    if (filtro === 'favoritos') base = base.filter((p) => p.favorito)
    if (filtro === 'platos') base = base.filter((p) => p.origen === 'receta')
    base = buscarProductos(base, consulta)
    return [...base].sort((a, b) => {
      // Los favoritos primero siempre: es su razon de ser.
      if (!!a.favorito !== !!b.favorito) return a.favorito ? -1 : 1
      return orden === 'alfabetico'
        ? a.nombre.localeCompare(b.nombre, 'es')
        : (b.ultimoUso ?? b.creadoEn) - (a.ultimoUso ?? a.creadoEn)
    })
  }, [productos, consulta, orden, filtro])

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
              className={`chip ${filtro === 'todos' ? 'activo' : ''}`}
              onClick={() => setFiltro('todos')}
            >
              Todos
            </button>
            {nFavoritos > 0 && (
              <button
                className={`chip ${filtro === 'favoritos' ? 'activo' : ''}`}
                onClick={() => setFiltro('favoritos')}
              >
                Favoritos · {nFavoritos}
              </button>
            )}
            {nPlatos > 0 && (
              <button
                className={`chip ${filtro === 'platos' ? 'activo' : ''}`}
                onClick={() => setFiltro('platos')}
              >
                Platos · {nPlatos}
              </button>
            )}
          </div>

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
          <Vacio texto={consulta ? `Nada coincide con «${consulta}».` : 'Nada por aquí.'} />
        ) : (
          <ul className="lista">
            {listados.map((p) => (
              <li key={p.id} style={{ display: 'flex', alignItems: 'center' }}>
                <button className="fila-item" onClick={() => nav(rutaDe(p))}>
                  <span className="texto">
                    <span className="titulo">{p.nombre}</span>
                    <span className="sub">
                      {p.marca ? `${p.marca} · ` : ''}
                      {DESCRIPCION_ORIGEN[p.origen]}
                    </span>
                  </span>
                  <span className="derecha">
                    <span className="kcal cifra">{ent(p.kcal)}</span>
                    <span className="u">kcal/100 {p.unidadBase}</span>
                  </span>
                  <IconoAdelante />
                </button>
                <button
                  className={`borrar ${p.favorito ? 'favorito' : ''}`}
                  style={{ marginRight: 8 }}
                  aria-pressed={!!p.favorito}
                  aria-label={
                    p.favorito ? `Quitar ${p.nombre} de favoritos` : `Marcar ${p.nombre} como favorito`
                  }
                  onClick={() => alternarFavorito(p)}
                >
                  {p.favorito ? <IconoEstrellaLlena /> : <IconoEstrella />}
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
