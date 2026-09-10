import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { actualizarProducto, actualizarRegistro, crearRegistro, db, soloVivos } from '../db/db'
import { MOMENTOS, NOMBRE_MOMENTO, type Momento, type Producto, type Registro } from '../db/types'
import { macrosDe } from '../lib/calc'
import { aNumero, ent, gr, redondear } from '../lib/formato'
import { Hoja } from './UI'
import { IconoAdelante, IconoEstrella, IconoEstrellaLlena } from './Iconos'
import { buscarProductos } from '../lib/buscar'

/** El momento mas probable segun la hora, para no tener que elegirlo casi nunca. */
export function momentoPorHora(d = new Date()): Momento {
  const h = d.getHours()
  if (h < 11) return 'desayuno'
  if (h < 13) return 'almuerzo'
  if (h < 16) return 'comida'
  if (h < 19) return 'merienda'
  if (h < 24) return 'cena'
  return 'otro'
}

export function AnadirComida({
  fecha,
  momentoInicial,
  registro,
  onCerrar,
}: {
  fecha: string
  momentoInicial?: Momento
  /** Si viene, se edita ese registro en vez de crear uno nuevo. */
  registro?: Registro
  onCerrar: () => void
}) {
  const productos = useLiveQuery(async () => {
    const todos = soloVivos(await db.alimentos.toArray())
    // Favoritos primero, luego por uso reciente: en el dia a dia repites
    // casi siempre las mismas cosas y quieres tenerlas arriba sin buscar.
    return todos.sort((a, b) => {
      if (!!a.favorito !== !!b.favorito) return a.favorito ? -1 : 1
      return (b.ultimoUso ?? b.creadoEn) - (a.ultimoUso ?? a.creadoEn)
    })
  }, [], undefined)
  const [consulta, setConsulta] = useState('')
  const [elegido, setElegido] = useState<Producto | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [momento, setMomento] = useState<Momento>(
    registro?.momento ?? momentoInicial ?? momentoPorHora(),
  )
  const [guardando, setGuardando] = useState(false)

  // Al editar, arrancamos ya en el paso de cantidad con el producto cargado.
  useEffect(() => {
    if (!registro) return
    let vivo = true
    db.alimentos.get(registro.productoId).then((p) => {
      if (!vivo) return
      if (p) setElegido(p)
      setCantidad(String(registro.cantidad).replace('.', ','))
    })
    return () => {
      vivo = false
    }
  }, [registro])

  const listados = useMemo(
    () => buscarProductos(productos ?? [], consulta).slice(0, 60),
    [productos, consulta],
  )

  const num = aNumero(cantidad)
  const previo = elegido && num !== null && num > 0 ? macrosDe(elegido, num) : null

  async function guardar() {
    if (!elegido?.id || num === null || num <= 0) return
    setGuardando(true)
    try {
      const m = macrosDe(elegido, num)
      const datos = {
        fecha,
        momento,
        productoId: elegido.id,
        nombreProducto: elegido.marca ? `${elegido.nombre} · ${elegido.marca}` : elegido.nombre,
        cantidad: num,
        unidad: elegido.unidadBase,
        // Macros congelados: si manana corrijo la etiqueta, esto no cambia.
        kcal: redondear(m.kcal, 1),
        proteinas: redondear(m.proteinas, 2),
        carbohidratos: redondear(m.carbohidratos, 2),
        grasas: redondear(m.grasas, 2),
        azucares: elegido.azucares !== undefined ? redondear((elegido.azucares * num) / 100, 2) : undefined,
        fibra: elegido.fibra !== undefined ? redondear((elegido.fibra * num) / 100, 2) : undefined,
        sal: elegido.sal !== undefined ? redondear((elegido.sal * num) / 100, 3) : undefined,
      }
      if (registro) await actualizarRegistro(registro.id, datos)
      else await crearRegistro(datos)
      await actualizarProducto(elegido.id, { ultimoUso: Date.now() })
      onCerrar()
    } finally {
      setGuardando(false)
    }
  }

  // ---- paso 1: elegir producto
  if (!elegido) {
    return (
      <Hoja titulo="Añadir comida" onCerrar={onCerrar}>
        <label className="campo" style={{ position: 'relative' }}>
          <span className="visualmente-oculto" style={{ position: 'absolute', left: -9999 }}>
            Buscar producto
          </span>
          <input
            type="search"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Buscar en tus alimentos"
            autoFocus
            enterKeyHint="search"
          />
        </label>

        {productos === undefined ? null : productos.length === 0 ? (
          <div className="vacio">
            <p>Todavía no tienes alimentos.</p>
            <Link className="boton" to="/alimentos/nuevo" onClick={onCerrar}>
              Añadir el primero
            </Link>
          </div>
        ) : listados.length === 0 ? (
          <div className="vacio">
            <p>Nada coincide con «{consulta}».</p>
            <Link className="boton secundario" to="/alimentos/nuevo" onClick={onCerrar}>
              Dar de alta un producto
            </Link>
          </div>
        ) : (
          <ul className="lista">
            {listados.map((p) => (
              <li key={p.id} style={{ display: 'flex', alignItems: 'center' }}>
                <button
                  className="fila-item"
                  onClick={() => {
                    setElegido(p)
                    setCantidad(String(p.porcionesRapidas?.[0]?.cantidad ?? 100))
                  }}
                >
                  <span className="texto">
                    <span className="titulo">{p.nombre}</span>
                    <span className="sub">
                      {p.marca ? `${p.marca} · ` : ''}
                      {ent(p.kcal)} kcal/100 {p.unidadBase}
                    </span>
                  </span>
                  <IconoAdelante />
                </button>
                <button
                  className={`borrar ${p.favorito ? 'favorito' : ''}`}
                  style={{ marginRight: 4 }}
                  aria-pressed={!!p.favorito}
                  aria-label={
                    p.favorito
                      ? `Quitar ${p.nombre} de favoritos`
                      : `Marcar ${p.nombre} como favorito`
                  }
                  onClick={() => actualizarProducto(p.id, { favorito: !p.favorito })}
                >
                  {p.favorito ? <IconoEstrellaLlena /> : <IconoEstrella />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Hoja>
    )
  }

  // ---- paso 2: cantidad
  const porciones = elegido.porcionesRapidas ?? []
  return (
    <Hoja titulo={elegido.nombre} onCerrar={onCerrar}>
      <p className="nota" style={{ marginTop: -8, marginBottom: 16 }}>
        {elegido.marca ? `${elegido.marca} · ` : ''}
        {ent(elegido.kcal)} kcal por 100 {elegido.unidadBase}
      </p>

      {porciones.length > 0 && (
        <div className="chips">
          {porciones.map((p, i) => (
            <button
              key={i}
              className={`chip ${aNumero(cantidad) === p.cantidad ? 'activo' : ''}`}
              onClick={() => setCantidad(String(p.cantidad))}
            >
              {p.nombre} · {gr(p.cantidad)} {elegido.unidadBase}
            </button>
          ))}
        </div>
      )}

      <label className="campo">
        <span>Cantidad en {elegido.unidadBase}</span>
        <input
          type="text"
          inputMode="decimal"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          placeholder="100"
          autoFocus={!registro}
          enterKeyHint="done"
          onKeyDown={(e) => e.key === 'Enter' && guardar()}
        />
      </label>

      <div className="previo">
        <div>
          <span className="v cifra">{previo ? ent(previo.kcal) : '—'}</span>
          <span className="n">kcal</span>
        </div>
        <div className="p">
          <span className="v cifra">{previo ? gr(previo.proteinas) : '—'}</span>
          <span className="n">Prot</span>
        </div>
        <div className="c">
          <span className="v cifra">{previo ? gr(previo.carbohidratos) : '—'}</span>
          <span className="n">Hidr</span>
        </div>
        <div className="g">
          <span className="v cifra">{previo ? gr(previo.grasas) : '—'}</span>
          <span className="n">Gras</span>
        </div>
      </div>

      <label className="campo">
        <span>Momento</span>
        <select value={momento} onChange={(e) => setMomento(e.target.value as Momento)}>
          {MOMENTOS.map((m) => (
            <option key={m} value={m}>
              {NOMBRE_MOMENTO[m]}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
        <button className="boton ancho" onClick={guardar} disabled={!previo || guardando}>
          {guardando ? <span className="cargando" /> : registro ? 'Guardar cambios' : 'Añadir'}
        </button>
        {!registro && (
          <button className="boton secundario ancho" onClick={() => setElegido(null)}>
            Elegir otro producto
          </button>
        )}
      </div>
    </Hoja>
  )
}
