import { ent, gr } from '../lib/formato'
import type { Macros } from '../lib/calc'
import type { Objetivos } from '../db/types'

const CLAVES = [
  { k: 'proteinas', nombre: 'Proteínas' },
  { k: 'carbohidratos', nombre: 'Hidratos' },
  { k: 'grasas', nombre: 'Grasas' },
] as const

export function BarrasMacro({ consumido, objetivo }: { consumido: Macros; objetivo: Objetivos }) {
  return (
    <div className="barras">
      {CLAVES.map(({ k, nombre }) => {
        const val = consumido[k]
        const obj = objetivo[k]
        const pct = obj > 0 ? (val / obj) * 100 : 0
        const excedido = pct > 100
        return (
          <div key={k} className={`barra ${k} ${excedido ? 'excedido' : ''}`}>
            <div className="fila">
              <span className="nombre">{nombre}</span>
              <span className="cifras">
                {gr(val)} <span className="obj">/ {gr(obj)} g</span>
              </span>
            </div>
            <div
              className="canal"
              role="progressbar"
              aria-label={nombre}
              aria-valuenow={Math.round(val)}
              aria-valuemin={0}
              aria-valuemax={Math.round(obj)}
            >
              <div className="relleno" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Resumen({ consumido, objetivo }: { consumido: Macros; objetivo: Objetivos }) {
  const restante = objetivo.kcal - consumido.kcal
  const pasado = restante < 0

  return (
    <section className="resumen">
      <span className="etiqueta">{pasado ? 'Te has pasado' : 'Te quedan'}</span>
      <div className={`restante ${pasado ? 'pasado' : ''}`}>
        <span className="valor">{ent(Math.abs(restante))}</span>
        <span className="unidad">kcal</span>
      </div>
      <p className="pie cifra">
        {ent(consumido.kcal)} de {ent(objetivo.kcal)} kcal
      </p>
      <BarrasMacro consumido={consumido} objetivo={objetivo} />
    </section>
  )
}
