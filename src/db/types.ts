export type Unidad = 'g' | 'ml'

/**
 * Identificador global. UUID y no autoincremental: dos moviles sin conexion
 * generarian el id 1 para cosas distintas y al sincronizar se pisarian.
 */
export type Id = string

export const nuevoId = (): Id => crypto.randomUUID()

/**
 * Lo que todo lo sincronizable necesita ademas de sus datos.
 *
 * `actualizadoEn` decide quien gana cuando el mismo registro se toca en dos
 * sitios: el mas reciente. `borradoEn` existe porque un borrado tambien es un
 * cambio que hay que propagar; si la fila desapareciese sin mas, el otro
 * dispositivo la volveria a subir creyendo que es nueva.
 */
export interface Sincronizable {
  id: Id
  creadoEn: number
  actualizadoEn: number
  /** Si esta puesto, la fila esta borrada y solo sobrevive para propagarlo. */
  borradoEn?: number
}

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

/** Un ingrediente dentro de un plato compuesto. */
export interface Ingrediente {
  productoId: Id
  /** Copia del nombre, para que el plato siga legible si se borra el producto. */
  nombre: string
  cantidad: number
  unidad: Unidad
}

/** Biblioteca de alimentos. TODOS los valores son por 100 g / 100 ml. */
export interface Producto extends Sincronizable {
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
  origen: 'foto' | 'manual' | 'receta'
  fotoEtiqueta?: Blob
  ultimoUso?: number
  /** Se ordenan primero en el buscador. */
  favorito?: boolean

  // --- solo en los platos compuestos (origen 'receta') ---
  /**
   * Un plato compuesto se guarda como un producto normal, con sus valores ya
   * calculados por 100 g. Asi el buscador, el registro, las porciones rapidas
   * y las estadisticas funcionan sin enterarse de que es una receta.
   * Estos campos son la memoria de como se calculo, para poder reeditarlo.
   */
  ingredientes?: Ingrediente[]
  /**
   * Lo que pesa el plato terminado. No es la suma de los ingredientes: la
   * pasta absorbe agua y el guiso reduce. Sin este numero, los macros por
   * 100 g del plato cocinado salen mal.
   */
  pesoFinal?: number
}

/**
 * Diario de comidas. Los macros van CONGELADOS: se calculan al registrar y no
 * se vuelven a tocar. Si mañana corrijo la etiqueta de un producto porque la IA
 * leyo mal un numero, el historial de la semana pasada no cambia.
 *
 * Por eso se congelan tambien fibra, azucares y sal aunque no salgan en Hoy:
 * son campos que no se pueden reconstruir despues.
 */
export interface Registro extends Sincronizable {
  fecha: string // 'YYYY-MM-DD'
  momento: Momento
  productoId: Id
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
}

/**
 * Objetivos con historico. Guardar solo una fila haria que al cambiar de
 * objetivo la linea de referencia de Estadisticas se reescribiese hacia atras,
 * que es justo lo que evitamos congelando los macros. Cada cambio crea una fila
 * nueva y cada dia se compara con el objetivo que estaba vigente ese dia.
 */
export interface Objetivos extends Sincronizable {
  desde: string // 'YYYY-MM-DD'
  kcal: number
  proteinas: number
  carbohidratos: number
  grasas: number
}

export const OBJETIVOS_POR_DEFECTO: Omit<Objetivos, keyof Sincronizable | 'desde'> = {
  kcal: 2200,
  proteinas: 140,
  carbohidratos: 220,
  grasas: 70,
}
