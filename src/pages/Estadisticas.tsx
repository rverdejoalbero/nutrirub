import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { objetivosEn, registrosEntre } from '../db/db'
import { ent, gr } from '../lib/formato'
import { desdeISO, ultimosDias } from '../lib/fecha'
import { Vacio } from '../components/UI'
import {
  NOMBRE_NUTRIENTE,
  OTROS_NUTRIENTES,
  cobertura,
  mediasDeNutrientes,
} from '../lib/estadisticas'
import type { Registro } from '../db/types'

const DIAS_SEMANA = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

/**
 * Grafica de barras a mano. Son 30 valores y una linea de objetivo: meter una
 * libreria de graficas costaria mas kilobytes que toda la app, y esto ademas
 * hereda la tipografia y los colores del resto.
 */
function GraficaDias({
  dias,
  valores,
  objetivos,
}: {
  dias: string[]
  valores: number[]
  objetivos: number[]
}) {
  const An = 320
  const Al = 130
  const margenAb = 16
  const margenIz = 30
  const tope = Math.max(...valores, ...objetivos, 1) * 1.12
  const anchoUtil = An - margenIz - 4
  const paso = anchoUtil / dias.length
  const ancho = Math.max(2, Math.min(paso * 0.62, 16))
  const y = (v: number) => Al - margenAb - (v / tope) * (Al - margenAb - 6)

  // La linea de objetivo se dibuja por tramos: si cambio de objetivo a mitad
  // de mes, el grafico tiene que enseñar el escalon, no reescribir el pasado.
  const tramos: { x1: number; x2: number; y: number }[] = []
  objetivos.forEach((o, i) => {
    const x1 = margenIz + i * paso
    const x2 = x1 + paso
    const ultimo = tramos[tramos.length - 1]
    if (ultimo && Math.abs(ultimo.y - y(o)) < 0.01) ultimo.x2 = x2
    else tramos.push({ x1, x2, y: y(o) })
  })

  const etiquetas = dias.length <= 7 ? dias.map((_, i) => i) : dias.map((_, i) => i).filter((i) => i % 5 === 0)

  return (
    <svg className="grafica" viewBox={`0 0 ${An} ${Al}`} role="img" aria-label="Calorías por día">
      <line className="eje" x1={margenIz} y1={Al - margenAb} x2={An} y2={Al - margenAb} />
      <text x={0} y={y(tope / 1.12) + 4}>{ent(tope / 1.12)}</text>

      {valores.map((v, i) => {
        const alto = Math.max(v > 0 ? 1.5 : 0, Al - margenAb - y(v))
        const excedido = objetivos[i] > 0 && v > objetivos[i]
        return (
          <rect
            key={i}
            x={margenIz + i * paso + (paso - ancho) / 2}
            y={Al - margenAb - alto}
            width={ancho}
            height={alto}
            rx={Math.min(2, ancho / 2)}
            fill={excedido ? 'var(--grasas)' : 'var(--carbos)'}
            opacity={v > 0 ? 0.92 : 0}
          />
        )
      })}

      {tramos.map((t, i) => (
        <line key={i} className="objetivo" x1={t.x1} y1={t.y} x2={t.x2} y2={t.y} />
      ))}

      {etiquetas.map((i) => (
        <text
          key={i}
          x={margenIz + i * paso + paso / 2}
          y={Al - 4}
          textAnchor="middle"
        >
          {dias.length <= 7 ? DIAS_SEMANA[desdeISO(dias[i]).getDay()] : desdeISO(dias[i]).getDate()}
        </text>
      ))}
    </svg>
  )
}

function RepartoMacros({ p, c, g }: { p: number; c: number; g: number }) {
  const kp = p * 4
  const kc = c * 4
  const kg = g * 9
  const total = kp + kc + kg
  if (total <= 0) return null
  const pct = (x: number) => (x / total) * 100
  const partes = [
    { k: 'Proteínas', v: pct(kp), gramos: p, color: 'var(--proteina)' },
    { k: 'Hidratos', v: pct(kc), gramos: c, color: 'var(--carbos)' },
    { k: 'Grasas', v: pct(kg), gramos: g, color: 'var(--grasas)' },
  ]
  return (
    <>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }}>
        {partes.map((x) => (
          <div key={x.k} style={{ width: `${x.v}%`, background: x.color }} />
        ))}
      </div>
      <ul className="lista" style={{ borderTop: 'none', marginTop: 14 }}>
        {partes.map((x) => (
          <li key={x.k}>
            <div className="fila-item" style={{ padding: '10px 0', minHeight: 44 }}>
              <span
                aria-hidden
                style={{ width: 9, height: 9, borderRadius: 2, background: x.color, flex: 'none' }}
              />
              <span className="texto">
                <span className="titulo">{x.k}</span>
              </span>
              <span className="derecha">
                <span className="kcal cifra">{Math.round(x.v)}%</span>
                <span className="u">{gr(x.gramos)} g/día</span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

export default function Estadisticas() {
  const [rango, setRango] = useState<7 | 30>(7)
  const dias = useMemo(() => ultimosDias(rango), [rango])
  const desde = dias[0]
  const hasta = dias[dias.length - 1]

  const registros = useLiveQuery(
    () => registrosEntre(desde, hasta),
    [desde, hasta],
    undefined,
  )
  const objetivos = useLiveQuery(
    () => Promise.all(dias.map((d) => objetivosEn(d))),
    [dias],
    undefined,
  )

  const porDia = useMemo(() => {
    const m = new Map<string, Registro[]>()
    for (const r of registros ?? []) {
      const l = m.get(r.fecha)
      if (l) l.push(r)
      else m.set(r.fecha, [r])
    }
    return m
  }, [registros])

  const kcalPorDia = dias.map((d) => (porDia.get(d) ?? []).reduce((a, r) => a + r.kcal, 0))
  const diasConDatos = kcalPorDia.filter((k) => k > 0).length

  const medias = useMemo(() => {
    if (!diasConDatos) return null
    const t = (registros ?? []).reduce(
      (a, r) => ({
        kcal: a.kcal + r.kcal,
        p: a.p + r.proteinas,
        c: a.c + r.carbohidratos,
        g: a.g + r.grasas,
      }),
      { kcal: 0, p: 0, c: 0, g: 0 },
    )
    return {
      kcal: t.kcal / diasConDatos,
      p: t.p / diasConDatos,
      c: t.c / diasConDatos,
      g: t.g / diasConDatos,
    }
  }, [registros, diasConDatos])

  // Fibra, azucares y sal se congelan en cada registro pero no salen en Hoy,
  // que se queda con las kcal y los tres macros. Aqui si tienen sitio.
  const otros = useMemo(
    () => mediasDeNutrientes(registros ?? [], diasConDatos),
    [registros, diasConDatos],
  )

  const masUsados = useMemo(() => {
    const cuenta = new Map<string, { n: number; kcal: number }>()
    for (const r of registros ?? []) {
      const a = cuenta.get(r.nombreProducto) ?? { n: 0, kcal: 0 }
      a.n++
      a.kcal += r.kcal
      cuenta.set(r.nombreProducto, a)
    }
    return [...cuenta.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8)
  }, [registros])

  const cargando = registros === undefined || objetivos === undefined

  return (
    <>
      <header className="cabecera">
        <h1>Datos</h1>
      </header>

      <main>
        <div className="contenido" style={{ paddingTop: 14 }}>
          <div className="chips">
            {([7, 30] as const).map((n) => (
              <button
                key={n}
                className={`chip ${rango === n ? 'activo' : ''}`}
                onClick={() => setRango(n)}
              >
                {n} días
              </button>
            ))}
          </div>
        </div>

        {cargando ? null : diasConDatos === 0 ? (
          <Vacio texto="Todavía no hay suficientes registros. Apunta unos días y aquí verás la evolución." />
        ) : (
          <>
            <div className="contenido">
              <div className="seccion">
                <h2>Calorías por día</h2>
                <div className="desplaza-x">
                  <GraficaDias
                    dias={dias}
                    valores={kcalPorDia}
                    objetivos={objetivos.map((o) => o.kcal)}
                  />
                </div>
                <p className="nota" style={{ marginTop: 8 }}>
                  Media de {ent(medias?.kcal ?? 0)} kcal en los {diasConDatos} días con registros.
                  La línea de puntos es tu objetivo.
                </p>
              </div>

              <div className="seccion">
                <h2>Reparto medio</h2>
                {medias && <RepartoMacros p={medias.p} c={medias.c} g={medias.g} />}
              </div>

              {OTROS_NUTRIENTES.some((k) => otros[k].declarados > 0) && (
                <div className="seccion">
                  <h2>Fibra, azúcares y sal</h2>
                  <ul className="lista" style={{ borderTop: 'none' }}>
                    {OTROS_NUTRIENTES.filter((k) => otros[k].declarados > 0).map((k) => {
                      const r = otros[k]
                      const cob = cobertura(r)
                      return (
                        <li key={k}>
                          <div className="fila-item" style={{ padding: '10px 0', minHeight: 44 }}>
                            <span className="texto">
                              <span className="titulo">{NOMBRE_NUTRIENTE[k]}</span>
                              {cob < 0.95 && (
                                <span className="sub">
                                  Solo {r.declarados} de {r.total} registros lo declaran
                                </span>
                              )}
                            </span>
                            <span className="derecha">
                              <span className="kcal cifra">{gr(r.media)}</span>
                              <span className="u">g/día</span>
                            </span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  <p className="nota" style={{ marginTop: 10 }}>
                    Lo que no venía en la etiqueta no cuenta como cero: sencillamente no suma, así
                    que estas cifras se quedan cortas si tienes productos sin estos datos.
                  </p>
                </div>
              )}
            </div>

            <div className="contenido">
              <div className="seccion">
                <h2>Lo que más repites</h2>
              </div>
            </div>
            <ul className="lista">
              {masUsados.map(([nombre, d]) => (
                <li key={nombre}>
                  <div className="fila-item">
                    <span className="texto">
                      <span className="titulo">{nombre}</span>
                      <span className="sub">
                        {d.n} {d.n === 1 ? 'vez' : 'veces'}
                      </span>
                    </span>
                    <span className="derecha">
                      <span className="kcal cifra">{ent(d.kcal)}</span>
                      <span className="u">kcal en total</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  )
}
