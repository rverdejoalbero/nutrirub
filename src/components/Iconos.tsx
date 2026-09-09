/** Trazos sueltos dentro de un <svg> comun. Todos en la misma rejilla de 24. */
type Props = { className?: string }

const svg = (hijos: React.ReactNode) =>
  function Icono({ className }: Props) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        {hijos}
      </svg>
    )
  }

export const IconoHoy = svg(
  <>
    <path d="M4 19V9m5 10V5m5 14v-7m5 7V8" />
  </>,
)

export const IconoAlimentos = svg(
  <>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </>,
)

export const IconoEstadisticas = svg(
  <>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <path d="m7 15 4-5 3 3 5-7" />
  </>,
)

export const IconoAsistente = svg(
  <>
    <path d="M20 12a8 8 0 1 0-3.2 6.4L20 20l-1-3.4A7.9 7.9 0 0 0 20 12Z" />
  </>,
)

export const IconoAjustes = svg(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2m0 14v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M3 12h2m14 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
  </>,
)

export const IconoMas = svg(<path d="M12 5v14M5 12h14" />)
export const IconoAtras = svg(<path d="m15 5-7 7 7 7" />)
export const IconoAdelante = svg(<path d="m9 5 7 7-7 7" />)
export const IconoCerrar = svg(<path d="M6 6l12 12M18 6 6 18" />)
export const IconoBuscar = svg(
  <>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-4.2-4.2" />
  </>,
)
export const IconoCamara = svg(
  <>
    <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5Z" />
    <circle cx="12" cy="13" r="3.4" />
  </>,
)
export const IconoLapiz = svg(
  <>
    <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
  </>,
)
export const IconoEnviar = svg(<path d="M4 12h15m0 0-6-6m6 6-6 6" />)
