import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../db/db'
import type { Ingrediente, Producto } from '../db/types'
import { buscarProductos } from '../lib/buscar'
import { aNumero, ent, gr } from '../lib/formato'
import { componer, pesoCrudo, valoresDelPlato, type IngredienteResuelto } from '../lib/receta'
import { revisarCoherencia } from '../lib/calc'
import { Cabecera, Cargando, Confirmar, Hoja } from '../components/UI'
import { IconoAdelante, IconoCerrar, IconoMas } from '../components/Iconos'

export default function EditarPlato() {
  const { id } = useParams()
  const nav = useNavigate()
  const idNum = id ? Number(id) : NaN
  const editando = isFinite(idNum)

  const existente = useLiveQuery(
    async () => (editando ? ((await db.productos.get(idNum)) ?? null) : null),
    [idNum, editando],
    undefined,
  )
  const productos = useLiveQuery(() => db.productos.toArray(), [], undefined)

  const [nombre, setNombre] = useState('')
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([])
  const [pesoFinal, setPesoFinal] = useState('')
  const [tocoPeso, setTocoPeso] = useState(false)
  const [eligiendo, setEligiendo] = useState(false)
  const [consulta, setConsulta] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [tocado, setTocado] = useState(false)

  // Cargar el plato al editar
  useEffect(() => {
    if (!existente) return
    setNombre(existente.nombre)
    setIngredientes(existente.ingredientes ?? [])
    setPesoFinal(String(existente.pesoFinal ?? '').replace('.', ','))
    setTocoPeso(true)
  }, [existente])

  const crudo = pesoCrudo(ingredientes)

  // Mientras no lo toques, el peso final sigue a los ingredientes. En cuanto
  // pones el peso de la olla, deja de moverse solo.
  useEffect(() => {
    if (!tocoPeso) setPesoFinal(crudo > 0 ? String(crudo) : '')
  }, [crudo, tocoPeso])

  const porId = useMemo(() => new Map((productos ?? []).map((p) => [p.id!, p])), [productos])

  const resueltos: IngredienteResuelto[] = useMemo(
    () => ingredientes.map((i) => ({ ingrediente: i, producto: porId.get(i.productoId) })),
    [ingredientes, porId],
  )

  const peso = aNumero(pesoFinal) ?? 0
  const { por100, totales, faltan } = useMemo(
    () => componer(resueltos, peso),
    [resueltos, peso],
  )
  const avisos = useMemo(() => revisarCoherencia(por100), [por100])

  // No se puede meter un plato dentro de si mismo.
  const candidatos = useMemo(() => {
    const lista = (productos ?? []).filter((p) => p.id !== idNum)
    return buscarProductos(lista, consulta).slice(0, 60)
  }, [productos, consulta, idNum])

  const sinNombre = nombre.trim() === ''
  const sinIngredientes = ingredientes.length === 0
  const sinPeso = peso <= 0
  const puedeGuardar = !sinNombre && !sinIngredientes && !sinPeso

  function anadir(p: Producto) {
    setIngredientes((xs) => [
      ...xs,
      { productoId: p.id!, nombre: p.nombre, cantidad: 100, unidad: p.unidadBase },
    ])
    setEligiendo(false)
    setConsulta('')
  }

  async function guardar() {
    setTocado(true)
    if (!puedeGuardar) return
    setGuardando(true)
    try {
      const valores = valoresDelPlato(resueltos, peso)
      const datos = {
        nombre: nombre.trim(),
        unidadBase: 'g' as const,
        ...valores,
        // Una racion por defecto: el plato entero partido en dos.
        porcionesRapidas: [{ nombre: 'Todo el plato', cantidad: peso }],
        origen: 'receta' as const,
        ingredientes,
        pesoFinal: peso,
      }
      if (editando && existente?.id) {
        // Solo cambia la ficha. Los registros ya escritos llevan sus macros
        // congelados, asi que el historial no se mueve.
        await db.productos.update(existente.id, datos)
      } else {
        await db.productos.add({ ...datos, creadoEn: Date.now(), ultimoUso: Date.now() })
      }
      nav('/alimentos', { replace: true })
    } finally {
      setGuardando(false)
    }
  }

  if (editando && existente === undefined) return <Cargando />

  return (
    <>
      <Cabecera
        titulo={editando ? nombre || 'Plato' : 'Nuevo plato'}
        onAtras={() => nav(-1)}
      />
      <main>
        <div className="contenido">
          <p className="nota" style={{ margin: '16px 0 20px' }}>
            Junta varios alimentos en un plato. Se guarda como un alimento más, con sus macros ya
            calculados, y luego lo registras por gramos como cualquier otra cosa.
          </p>

          <label className={`campo ${tocado && sinNombre ? 'aviso' : ''}`}>
            <span>Nombre del plato</span>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Macarrones con tomate"
              autoCapitalize="sentences"
            />
            {tocado && sinNombre && <span className="texto-aviso">Hace falta un nombre.</span>}
          </label>

          <div className="seccion">
            <h2>Ingredientes</h2>
          </div>

          {sinIngredientes ? (
            <p className="nota" style={{ marginBottom: 14 }}>
              Todavía no has añadido nada.
            </p>
          ) : (
            <ul className="lista" style={{ marginBottom: 14 }}>
              {resueltos.map(({ ingrediente, producto }, i) => (
                <li key={i}>
                  <div className="fila-item" style={{ gap: 8 }}>
                    <span className="texto">
                      <span className="titulo">{ingrediente.nombre}</span>
                      <span className="sub">
                        {producto
                          ? `${ent(producto.kcal)} kcal/100 ${producto.unidadBase}`
                          : 'Este alimento ya no existe'}
                      </span>
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`Cantidad de ${ingrediente.nombre}`}
                      value={String(ingrediente.cantidad).replace('.', ',')}
                      onChange={(e) =>
                        setIngredientes((xs) =>
                          xs.map((x, j) =>
                            i === j ? { ...x, cantidad: aNumero(e.target.value) ?? 0 } : x,
                          ),
                        )
                      }
                      style={{ width: 84, minHeight: 40, textAlign: 'right' }}
                    />
                    <span className="u" style={{ color: 'var(--apagado)', fontSize: '0.78rem' }}>
                      {ingrediente.unidad}
                    </span>
                    <button
                      className="borrar"
                      aria-label={`Quitar ${ingrediente.nombre}`}
                      onClick={() => setIngredientes((xs) => xs.filter((_, j) => j !== i))}
                    >
                      <IconoCerrar />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {faltan.length > 0 && (
            <div className="aviso-caja">
              {faltan.length === 1
                ? 'Un ingrediente ya no existe en tu biblioteca y no cuenta en el total.'
                : `${faltan.length} ingredientes ya no existen en tu biblioteca y no cuentan en el total.`}{' '}
              Quítalos o vuelve a darlos de alta.
            </div>
          )}

          <button className="boton secundario ancho" onClick={() => setEligiendo(true)}>
            <IconoMas />
            Añadir ingrediente
          </button>

          <div className="seccion">
            <h2>Peso del plato terminado</h2>
          </div>
          <label className={`campo ${tocado && sinPeso ? 'aviso' : ''}`}>
            <span>Gramos, ya cocinado</span>
            <input
              type="text"
              inputMode="decimal"
              value={pesoFinal}
              onChange={(e) => {
                setTocoPeso(true)
                setPesoFinal(e.target.value)
              }}
              placeholder={crudo ? String(crudo) : '0'}
            />
            {tocado && sinPeso && <span className="texto-aviso">Hace falta el peso final.</span>}
          </label>
          <p className="nota" style={{ marginTop: -6 }}>
            Los ingredientes suman {gr(crudo)} g en crudo. Pesa la olla al terminar y pon ese
            número: la pasta y el arroz absorben agua, los guisos reducen. Es lo que hace que los
            macros por 100 g del plato salgan bien.
          </p>

          <div className="seccion">
            <h2>El plato entero</h2>
          </div>
          <div className="previo">
            <div>
              <span className="v cifra">{ent(totales.kcal)}</span>
              <span className="n">kcal</span>
            </div>
            <div className="p">
              <span className="v cifra">{gr(totales.proteinas)}</span>
              <span className="n">Prot</span>
            </div>
            <div className="c">
              <span className="v cifra">{gr(totales.carbohidratos)}</span>
              <span className="n">Hidr</span>
            </div>
            <div className="g">
              <span className="v cifra">{gr(totales.grasas)}</span>
              <span className="n">Gras</span>
            </div>
          </div>

          <div className="seccion">
            <h2>Por 100 g de plato</h2>
          </div>
          <div className="previo">
            <div>
              <span className="v cifra">{peso > 0 ? ent(por100.kcal ?? 0) : '—'}</span>
              <span className="n">kcal</span>
            </div>
            <div className="p">
              <span className="v cifra">{peso > 0 ? gr(por100.proteinas ?? 0) : '—'}</span>
              <span className="n">Prot</span>
            </div>
            <div className="c">
              <span className="v cifra">{peso > 0 ? gr(por100.carbohidratos ?? 0) : '—'}</span>
              <span className="n">Hidr</span>
            </div>
            <div className="g">
              <span className="v cifra">{peso > 0 ? gr(por100.grasas ?? 0) : '—'}</span>
              <span className="n">Gras</span>
            </div>
          </div>

          {avisos.length > 0 && (
            <div className="aviso-caja">
              {avisos.map((a, i) => (
                <div key={i}>{a.texto}</div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gap: 10, margin: '24px 0 8px' }}>
            <button className="boton ancho" onClick={guardar} disabled={guardando}>
              {guardando ? <span className="cargando" /> : editando ? 'Guardar cambios' : 'Guardar plato'}
            </button>
            {editando && (
              <button className="boton peligro ancho" onClick={() => setBorrando(true)}>
                Borrar plato
              </button>
            )}
          </div>
        </div>
      </main>

      {eligiendo && (
        <Hoja titulo="Añadir ingrediente" onCerrar={() => setEligiendo(false)}>
          <label className="campo">
            <span style={{ position: 'absolute', left: -9999 }}>Buscar</span>
            <input
              type="search"
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              placeholder="Buscar en tus alimentos"
              autoFocus
            />
          </label>
          {candidatos.length === 0 ? (
            <div className="vacio">
              <p>Nada coincide.</p>
            </div>
          ) : (
            <ul className="lista">
              {candidatos.map((p) => (
                <li key={p.id}>
                  <button className="fila-item" onClick={() => anadir(p)}>
                    <span className="texto">
                      <span className="titulo">{p.nombre}</span>
                      <span className="sub">
                        {p.marca ? `${p.marca} · ` : ''}
                        {ent(p.kcal)} kcal/100 {p.unidadBase}
                      </span>
                    </span>
                    <IconoAdelante />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Hoja>
      )}

      {borrando && existente && (
        <Confirmar
          titulo="Borrar plato"
          mensaje="Se quita de la biblioteca. Los registros del diario que lo usan se conservan tal cual: guardan sus propios macros."
          textoOk="Borrar"
          peligro
          onOk={async () => {
            if (existente.id) await db.productos.delete(existente.id)
            nav('/alimentos', { replace: true })
          }}
          onCancelar={() => setBorrando(false)}
        />
      )}
    </>
  )
}
