import { useEffect, useRef, type ReactNode } from 'react'
import { IconoAtras } from './Iconos'

/** Hoja que sube desde abajo. Se cierra con Escape o tocando fuera. */
export function Hoja({
  titulo,
  onCerrar,
  children,
}: {
  titulo?: string
  onCerrar: () => void
  children: ReactNode
}) {
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', tecla)
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    caja.current?.focus()
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = previo
    }
  }, [onCerrar])

  return (
    <div
      className="velo"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCerrar()
      }}
    >
      <div
        className="hoja"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        ref={caja}
      >
        <div className="asa" />
        {titulo && <h2>{titulo}</h2>}
        {children}
      </div>
    </div>
  )
}

export function Confirmar({
  titulo,
  mensaje,
  textoOk = 'Confirmar',
  peligro,
  onOk,
  onCancelar,
}: {
  titulo: string
  mensaje: ReactNode
  textoOk?: string
  peligro?: boolean
  onOk: () => void
  onCancelar: () => void
}) {
  return (
    <Hoja titulo={titulo} onCerrar={onCancelar}>
      <p className="nota" style={{ marginTop: 0 }}>
        {mensaje}
      </p>
      <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
        <button className={`boton ancho ${peligro ? 'peligro' : ''}`} onClick={onOk}>
          {textoOk}
        </button>
        <button className="boton secundario ancho" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </Hoja>
  )
}

export function Vacio({ texto, children }: { texto: string; children?: ReactNode }) {
  return (
    <div className="vacio">
      <p>{texto}</p>
      {children}
    </div>
  )
}

export function Cargando({ texto }: { texto?: string }) {
  return (
    <div className="vacio" role="status">
      <span className="cargando" />
      {texto && <p style={{ marginTop: 12 }}>{texto}</p>}
    </div>
  )
}

/** Cabecera con boton de volver. La usan todas las pantallas de segundo nivel. */
export function Cabecera({
  titulo,
  onAtras,
  accion,
}: {
  titulo: string
  onAtras: () => void
  accion?: ReactNode
}) {
  return (
    <header className="cabecera">
      <button className="accion" onClick={onAtras} aria-label="Volver">
        <IconoAtras />
      </button>
      <h1>{titulo}</h1>
      {accion}
    </header>
  )
}
