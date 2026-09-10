import { useEffect, useMemo, useState } from 'react'
import type { PorcionRapida, Producto, Sincronizable, Unidad } from '../db/types'
import { revisarCoherencia } from '../lib/calc'
import { aNumero } from '../lib/formato'
import { IconoCerrar, IconoMas } from './Iconos'

/** Lo que el formulario entrega ya validado y en numeros. */
export type DatosProducto = Omit<
  Producto,
  keyof Sincronizable | 'origen' | 'fotoEtiqueta' | 'ultimoUso'
>

/** Campos numericos como texto: hay que poder escribir "12,5" mientras se teclea. */
export interface ValoresProducto {
  nombre: string
  marca: string
  unidadBase: Unidad
  kcal: string
  proteinas: string
  carbohidratos: string
  azucares: string
  grasas: string
  saturadas: string
  fibra: string
  sal: string
  porciones: PorcionRapida[]
}

const txt = (n: number | null | undefined): string =>
  n === null || n === undefined ? '' : String(n).replace('.', ',')

export function valoresDesdeProducto(p?: Partial<Producto>): ValoresProducto {
  return {
    nombre: p?.nombre ?? '',
    marca: p?.marca ?? '',
    unidadBase: p?.unidadBase ?? 'g',
    kcal: txt(p?.kcal),
    proteinas: txt(p?.proteinas),
    carbohidratos: txt(p?.carbohidratos),
    azucares: txt(p?.azucares),
    grasas: txt(p?.grasas),
    saturadas: txt(p?.saturadas),
    fibra: txt(p?.fibra),
    sal: txt(p?.sal),
    porciones: p?.porcionesRapidas ? [...p.porcionesRapidas] : [],
  }
}

// Mismo orden que la tabla de una etiqueta espanola, y cada "de las cuales"
// pegado a su padre: se transcribe de arriba abajo sin saltar la vista.
const NUMERICOS: { k: keyof ValoresProducto; etiqueta: string; ancho?: boolean }[] = [
  { k: 'kcal', etiqueta: 'Energía (kcal)', ancho: true },
  { k: 'grasas', etiqueta: 'Grasas (g)' },
  { k: 'saturadas', etiqueta: 'de las cuales saturadas (g)' },
  { k: 'carbohidratos', etiqueta: 'Hidratos de carbono (g)' },
  { k: 'azucares', etiqueta: 'de los cuales azúcares (g)' },
  { k: 'fibra', etiqueta: 'Fibra alimentaria (g)' },
  { k: 'proteinas', etiqueta: 'Proteínas (g)' },
  { k: 'sal', etiqueta: 'Sal (g)' },
]

export function FormularioProducto({
  inicial,
  textoBoton,
  onGuardar,
  extraSuperior,
  extraInferior,
}: {
  inicial: ValoresProducto
  textoBoton: string
  onGuardar: (datos: DatosProducto) => Promise<void> | void
  extraSuperior?: React.ReactNode
  extraInferior?: React.ReactNode
}) {
  const [v, setV] = useState<ValoresProducto>(inicial)
  const [guardando, setGuardando] = useState(false)
  const [tocado, setTocado] = useState(false)

  useEffect(() => setV(inicial), [inicial])

  const set = <K extends keyof ValoresProducto>(k: K, val: ValoresProducto[K]) =>
    setV((x) => ({ ...x, [k]: val }))

  const numeros = useMemo(
    () => ({
      kcal: aNumero(v.kcal),
      proteinas: aNumero(v.proteinas),
      carbohidratos: aNumero(v.carbohidratos),
      azucares: aNumero(v.azucares),
      grasas: aNumero(v.grasas),
      saturadas: aNumero(v.saturadas),
      fibra: aNumero(v.fibra),
      sal: aNumero(v.sal),
    }),
    [v],
  )

  // Los avisos se recalculan mientras se escribe: corriges y ves que se apaga.
  const avisos = useMemo(() => revisarCoherencia(numeros), [numeros])
  const avisoDe = (campo: string) => avisos.filter((a) => a.campo === campo)

  const faltaNombre = v.nombre.trim() === ''
  const faltanBasicos =
    numeros.kcal === null ||
    numeros.proteinas === null ||
    numeros.carbohidratos === null ||
    numeros.grasas === null

  async function guardar() {
    setTocado(true)
    if (faltaNombre || faltanBasicos) return
    setGuardando(true)
    try {
      await onGuardar({
        nombre: v.nombre.trim(),
        marca: v.marca.trim() || undefined,
        unidadBase: v.unidadBase,
        kcal: numeros.kcal!,
        proteinas: numeros.proteinas!,
        carbohidratos: numeros.carbohidratos!,
        grasas: numeros.grasas!,
        azucares: numeros.azucares ?? undefined,
        saturadas: numeros.saturadas ?? undefined,
        fibra: numeros.fibra ?? undefined,
        sal: numeros.sal ?? undefined,
        porcionesRapidas: v.porciones.filter((p) => p.nombre.trim() && p.cantidad > 0),
      })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="contenido">
      {extraSuperior}

      <label className={`campo ${tocado && faltaNombre ? 'aviso' : ''}`}>
        <span>Nombre del producto</span>
        <input
          type="text"
          value={v.nombre}
          onChange={(e) => set('nombre', e.target.value)}
          placeholder="Macarrones"
          autoCapitalize="sentences"
        />
        {tocado && faltaNombre && <span className="texto-aviso">Hace falta un nombre.</span>}
      </label>

      <div className="rejilla-2">
        <label className="campo">
          <span>Marca</span>
          <input
            type="text"
            value={v.marca}
            onChange={(e) => set('marca', e.target.value)}
            placeholder="Opcional"
          />
        </label>
        <label className="campo">
          <span>Se mide en</span>
          <select
            value={v.unidadBase}
            onChange={(e) => set('unidadBase', e.target.value as Unidad)}
          >
            <option value="g">Gramos (sólido)</option>
            <option value="ml">Mililitros (líquido)</option>
          </select>
        </label>
      </div>

      <div className="seccion">
        <h2>Por 100 {v.unidadBase}</h2>
      </div>

      <div className="rejilla-2">
        {NUMERICOS.map(({ k, etiqueta, ancho }) => {
          const clave = k as keyof typeof numeros
          const av = avisoDe(k)
          const vacioObligatorio =
            tocado &&
            numeros[clave] === null &&
            ['kcal', 'proteinas', 'carbohidratos', 'grasas'].includes(k)
          return (
            <label
              key={k}
              className={`campo ${av.length || vacioObligatorio ? 'aviso' : ''}`}
              style={ancho ? { gridColumn: '1 / -1' } : undefined}
            >
              <span>{etiqueta}</span>
              <input
                type="text"
                inputMode="decimal"
                value={v[clave]}
                onChange={(e) => set(clave, e.target.value)}
                placeholder="—"
              />
              {vacioObligatorio && <span className="texto-aviso">Este valor hace falta.</span>}
              {av.map((a, i) => (
                <span className="texto-aviso" key={i}>
                  {a.texto}
                </span>
              ))}
            </label>
          )
        })}
      </div>

      <div className="seccion">
        <h2>Porciones rápidas</h2>
        <p className="nota" style={{ marginTop: -6, marginBottom: 12 }}>
          Atajos para registrar sin pesar. Por ejemplo «1 plato = 125 g».
        </p>
        {v.porciones.map((p, i) => (
          <div key={i} className="rejilla-2" style={{ gridTemplateColumns: '1fr 96px 44px' }}>
            <label className="campo">
              <span>Nombre</span>
              <input
                type="text"
                value={p.nombre}
                onChange={(e) =>
                  set(
                    'porciones',
                    v.porciones.map((x, j) => (i === j ? { ...x, nombre: e.target.value } : x)),
                  )
                }
                placeholder="1 plato"
              />
            </label>
            <label className="campo">
              <span>{v.unidadBase}</span>
              <input
                type="text"
                inputMode="decimal"
                value={p.cantidad ? String(p.cantidad).replace('.', ',') : ''}
                onChange={(e) =>
                  set(
                    'porciones',
                    v.porciones.map((x, j) =>
                      i === j ? { ...x, cantidad: aNumero(e.target.value) ?? 0 } : x,
                    ),
                  )
                }
                placeholder="125"
              />
            </label>
            <button
              className="borrar"
              style={{ marginTop: 20 }}
              aria-label={`Quitar porción ${p.nombre || i + 1}`}
              onClick={() =>
                set(
                  'porciones',
                  v.porciones.filter((_, j) => j !== i),
                )
              }
            >
              <IconoCerrar />
            </button>
          </div>
        ))}
        <button
          className="boton secundario"
          onClick={() => set('porciones', [...v.porciones, { nombre: '', cantidad: 0 }])}
        >
          <IconoMas />
          Añadir porción
        </button>
      </div>

      <div style={{ display: 'grid', gap: 10, margin: '28px 0 8px' }}>
        <button className="boton ancho" onClick={guardar} disabled={guardando}>
          {guardando ? <span className="cargando" /> : textoBoton}
        </button>
        {extraInferior}
      </div>
    </div>
  )
}
