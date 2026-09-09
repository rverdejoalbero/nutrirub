import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db, objetivosEn } from '../db/db'
import { MOMENTOS, NOMBRE_MOMENTO, type Momento, type Registro } from '../db/types'
import { sumar } from '../lib/calc'
import { ent, gr } from '../lib/formato'
import { etiquetaFecha, hoyISO, sumarDias } from '../lib/fecha'
import { leerAjustes } from '../lib/ajustes'
import { Resumen } from '../components/BarrasMacro'
import { AnadirComida, momentoPorHora } from '../components/AnadirComida'
import { Confirmar, Vacio } from '../components/UI'
import { diaAnteriorConDatos, duplicarDia } from '../lib/diario'
import { frasePosesiva } from '../lib/fecha'
import {
  IconoAdelante,
  IconoAjustes,
  IconoAtras,
  IconoCerrar,
  IconoCopiar,
  IconoMas,
} from '../components/Iconos'

const DIA_MS = 86_400_000

/** Aviso de copia: el JSON es el unico respaldo que hay. */
function useAvisoCopia(): boolean {
  const { ultimaCopia, avisarCopiaCada } = leerAjustes()
  if (!avisarCopiaCada) return false
  const dias = ultimaCopia ? (Date.now() - ultimaCopia) / DIA_MS : Infinity
  return dias > avisarCopiaCada
}

export default function Hoy() {
  const [fecha, setFecha] = useState(hoyISO())
  const [anadiendo, setAnadiendo] = useState<Momento | true | null>(null)
  const [editando, setEditando] = useState<Registro | null>(null)
  const [borrando, setBorrando] = useState<Registro | null>(null)
  const [duplicando, setDuplicando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const registros = useLiveQuery(
    () => db.registros.where('fecha').equals(fecha).toArray(),
    [fecha],
    undefined,
  )
  const objetivo = useLiveQuery(() => objetivosEn(fecha), [fecha], undefined)
  const nProductos = useLiveQuery(() => db.productos.count(), [], undefined)
  // De donde copiar: el ultimo dia anterior que tenga algo registrado.
  const diaFuente = useLiveQuery(() => diaAnteriorConDatos(fecha), [fecha], undefined)
  const avisoCopia = useAvisoCopia() && (registros?.length ?? 0) > 0

  const total = useMemo(() => sumar(registros ?? []), [registros])

  const porMomento = useMemo(() => {
    const m = new Map<Momento, Registro[]>()
    for (const r of registros ?? []) {
      const lista = m.get(r.momento)
      if (lista) lista.push(r)
      else m.set(r.momento, [r])
    }
    for (const lista of m.values()) lista.sort((a, b) => a.creadoEn - b.creadoEn)
    return m
  }, [registros])

  const esHoy = fecha === hoyISO()

  return (
    <>
      <header className="cabecera">
        <div className="navegador-dia" style={{ flex: 1 }}>
          <button
            className="flecha"
            onClick={() => setFecha(sumarDias(fecha, -1))}
            aria-label="Día anterior"
          >
            <IconoAtras />
          </button>
          <label className="dia">
            {etiquetaFecha(fecha)}
            <input
              type="date"
              value={fecha}
              max={sumarDias(hoyISO(), 365)}
              onChange={(e) => e.target.value && setFecha(e.target.value)}
              aria-label="Elegir fecha"
            />
          </label>
          <button
            className="flecha"
            onClick={() => setFecha(sumarDias(fecha, 1))}
            disabled={esHoy}
            aria-label="Día siguiente"
          >
            <IconoAdelante />
          </button>
        </div>
        <Link className="accion" to="/ajustes" aria-label="Ajustes">
          <IconoAjustes />
        </Link>
      </header>

      <main>
        {objetivo && <Resumen consumido={total} objetivo={objetivo} />}

        {aviso && (
          <div className="contenido">
            <p className="nota" style={{ color: 'var(--carbos)', marginTop: 12 }} role="status">
              {aviso}
            </p>
          </div>
        )}

        {avisoCopia && (
          <div className="contenido">
            <div className="aviso-caja">
              Hace tiempo que no haces copia. Es el único respaldo de tus datos.{' '}
              <Link to="/ajustes">Exportar ahora</Link>
            </div>
          </div>
        )}

        {registros === undefined ? null : registros.length === 0 ? (
          <Vacio texto={esHoy ? 'Aún no has registrado nada hoy.' : 'Nada registrado este día.'}>
            {nProductos === 0 ? (
              <Link className="boton secundario" to="/alimentos/nuevo">
                Dar de alta tu primer alimento
              </Link>
            ) : (
              diaFuente && (
                <button className="boton secundario" onClick={() => setDuplicando(true)}>
                  <IconoCopiar />
                  Copiar {frasePosesiva(diaFuente)}
                </button>
              )
            )}
          </Vacio>
        ) : (
          MOMENTOS.filter((m) => porMomento.has(m)).map((m) => {
            const lista = porMomento.get(m)!
            const kcal = lista.reduce((a, r) => a + r.kcal, 0)
            return (
              <section key={m}>
                <h2 className="grupo-titulo">
                  <span>{NOMBRE_MOMENTO[m]}</span>
                  <span className="cifra">{ent(kcal)} kcal</span>
                </h2>
                <ul className="lista">
                  {lista.map((r) => (
                    <li key={r.id} style={{ display: 'flex', alignItems: 'center' }}>
                      <button
                        className="fila-item"
                        onClick={() => setEditando(r)}
                        aria-label={`Editar ${r.nombreProducto}`}
                      >
                        <span className="texto">
                          <span className="titulo">{r.nombreProducto}</span>
                          <span className="sub">
                            {gr(r.cantidad)} {r.unidad} · P {gr(r.proteinas)} · H{' '}
                            {gr(r.carbohidratos)} · G {gr(r.grasas)}
                          </span>
                        </span>
                        <span className="derecha">
                          <span className="kcal cifra">{ent(r.kcal)}</span>
                          <span className="u">kcal</span>
                        </span>
                      </button>
                      <button
                        className="borrar"
                        onClick={() => setBorrando(r)}
                        aria-label={`Borrar ${r.nombreProducto}`}
                        style={{ marginRight: 8 }}
                      >
                        <IconoCerrar />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })
        )}
      </main>

      <button className="flotante" onClick={() => setAnadiendo(true)}>
        <IconoMas />
        Añadir comida
      </button>

      {anadiendo && (
        <AnadirComida
          fecha={fecha}
          momentoInicial={anadiendo === true ? (esHoy ? momentoPorHora() : 'comida') : anadiendo}
          onCerrar={() => setAnadiendo(null)}
        />
      )}

      {editando && (
        <AnadirComida fecha={fecha} registro={editando} onCerrar={() => setEditando(null)} />
      )}

      {duplicando && diaFuente && (
        <Confirmar
          titulo="Copiar un día entero"
          mensaje={`Se añade ${frasePosesiva(diaFuente)} a ${frasePosesiva(fecha).replace(/^lo de[l]? /, '')}, sin borrar lo que ya haya. Los macros se recalculan con las etiquetas de ahora.`}
          textoOk="Copiar"
          onOk={async () => {
            const n = await duplicarDia(diaFuente, fecha)
            setDuplicando(false)
            setAviso(n === 1 ? 'Copiada 1 comida.' : `Copiadas ${n} comidas.`)
          }}
          onCancelar={() => setDuplicando(false)}
        />
      )}

      {borrando && (
        <Confirmar
          titulo="Borrar del diario"
          mensaje={`Se quita "${borrando.nombreProducto}" de ${NOMBRE_MOMENTO[borrando.momento].toLowerCase()}. El producto sigue en tu biblioteca.`}
          textoOk="Borrar"
          peligro
          onOk={async () => {
            if (borrando.id) await db.registros.delete(borrando.id)
            setBorrando(null)
          }}
          onCancelar={() => setBorrando(null)}
        />
      )}
    </>
  )
}
