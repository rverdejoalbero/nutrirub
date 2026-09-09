export type Unidad = 'g' | 'ml'

export type Momento = 'desayuno' | 'almuerzo' | 'comida' | 'merienda' | 'cena' | 'otro'

export const MOMENTOS: Momento[] = ['desayuno', 'almuerzo', 'comida', 'merienda', 'cena', 'otro']

export const NOMBRE_MOMENTO: Record<Momento, string> = {
  desayuno: 'Desayuno',
  almuerzo: 'Almuerzo',
  comida: 'Comida',
  merienda: 'Merienda',
  cena: 'Cena',
  otro: 'Otro',
}

export interface PorcionRapida {
  nombre: string
  cantidad: number
}

/** Biblioteca de alimentos. TODOS los valores son por 100 g / 100 ml. */
export interface Producto {
  id?: number
  nombre: string
  marca?: string
  codigoBarras?: string
  unidadBase: Unidad
  kcal: number
  proteinas: number
  carbohidratos: number
  azucares?: number
  grasas: number
  saturadas?: number
  fibra?: number
  sal?: number
  porcionesRapidas?: PorcionRapida[]
  origen: 'foto' | 'manual'
  fotoEtiqueta?: Blob
  creadoEn: number
  ultimoUso?: number
}

/**
 * Diario de comidas. Los macros van CONGELADOS: se calculan al registrar y no
 * se vuelven a tocar. Si mañana corrijo la etiqueta de un producto porque la IA
 * leyo mal un numero, el historial de la semana pasada no cambia.
 *
 * Por eso se congelan tambien fibra, azucares y sal aunque hoy no se muestren:
 * son campos que no se pueden reconstruir despues.
 */
export interface Registro {
  id?: number
  fecha: string // 'YYYY-MM-DD'
  momento: Momento
  productoId: number
  nombreProducto: string
  cantidad: number
  unidad: Unidad
  kcal: number
  proteinas: number
  carbohidratos: number
  grasas: number
  azucares?: number
  fibra?: number
  sal?: number
  creadoEn: number
}

/**
 * Objetivos con historico. Guardar solo una fila haria que al cambiar de
 * objetivo la linea de referencia de Estadisticas se reescribiese hacia atras,
 * que es justo lo que evitamos congelando los macros. Cada cambio crea una fila
 * nueva y cada dia se compara con el objetivo que estaba vigente ese dia.
 */
export interface Objetivos {
  id?: number
  desde: string // 'YYYY-MM-DD'
  kcal: number
  proteinas: number
  carbohidratos: number
  grasas: number
}

export const OBJETIVOS_POR_DEFECTO: Omit<Objetivos, 'id' | 'desde'> = {
  kcal: 2200,
  proteinas: 140,
  carbohidratos: 220,
  grasas: 70,
}
