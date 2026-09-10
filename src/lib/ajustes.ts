export type Proveedor = 'gemini' | 'openrouter'

export interface Ajustes {
  proveedor: Proveedor
  apiKey: string
  /**
   * Para leer etiquetas: pocas llamadas al mes, pero un numero mal leido
   * corrompe los datos. Aqui conviene el modelo bueno aunque tenga poca cuota.
   */
  modelo: string
  /**
   * Para el asistente: muchas mas llamadas y menos consecuencias si se explica
   * regular. Aqui conviene el de cuota alta.
   *
   * Estan separados porque los limites gratuitos de Google son POR MODELO, y
   * los mas nuevos traen cuotas diarias muy cortas: usar el mismo para todo
   * hace que cuatro preguntas al chat te dejen sin poder dar de alta un
   * producto.
   */
  modeloAsistente: string
  /** Marca de tiempo de la ultima exportacion, para el aviso de copia. */
  ultimaCopia: number | null
  /** Dias sin copia a partir de los cuales avisar. 0 = no avisar. */
  avisarCopiaCada: number
}

/**
 * La clave vive solo aqui, en el localStorage del movil. Nunca en el repo,
 * nunca en un .env, nunca en import.meta.env. Por eso el repositorio puede
 * ser publico.
 */
const CLAVE = 'nutrirub.ajustes'

const POR_DEFECTO: Ajustes = {
  proveedor: 'gemini',
  apiKey: '',
  // Los IDs de Gemini rotan cada pocos meses. Este es solo el punto de
  // partida: en Ajustes hay un boton que pide la lista real a la API, que es
  // la unica fuente fiable de lo que existe hoy.
  modelo: 'gemini-2.5-flash',
  modeloAsistente: 'gemini-2.5-flash-lite',
  ultimaCopia: null,
  avisarCopiaCada: 14,
}

export function leerAjustes(): Ajustes {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (!crudo) return { ...POR_DEFECTO }
    return { ...POR_DEFECTO, ...(JSON.parse(crudo) as Partial<Ajustes>) }
  } catch {
    return { ...POR_DEFECTO }
  }
}

export function guardarAjustes(a: Partial<Ajustes>): Ajustes {
  const nuevos = { ...leerAjustes(), ...a }
  try {
    localStorage.setItem(CLAVE, JSON.stringify(nuevos))
  } catch {
    /* modo privado o cuota llena: los ajustes duran lo que la sesion */
  }
  avisar()
  return nuevos
}

export const hayClave = (): boolean => leerAjustes().apiKey.trim().length > 0

export const MODELOS_SUGERIDOS: Record<Proveedor, string[]> = {
  // Sugerencias, no verdad: usa el boton de cargar modelos para ver los que
  // existen de verdad ahora mismo con tu clave.
  gemini: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.5-flash'],
  openrouter: [
    'google/gemini-2.0-flash-exp:free',
    'qwen/qwen2.5-vl-72b-instruct:free',
    'meta-llama/llama-3.2-11b-vision-instruct:free',
  ],
}

/** Suscripcion sencilla para que la UI reaccione a un cambio de ajustes. */
type Oyente = () => void
const oyentes = new Set<Oyente>()
const avisar = () => oyentes.forEach((f) => f())
export function alCambiarAjustes(f: Oyente): () => void {
  oyentes.add(f)
  return () => oyentes.delete(f)
}
