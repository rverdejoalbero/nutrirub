#!/usr/bin/env node
/**
 * Mide el contraste de la paleta contra el minimo de la WCAG 2.1 AA.
 *
 * Lee los tokens del CSS de verdad, no una copia: si alguien retoca un color
 * para que "quede mejor" y se carga la legibilidad, esto lo dice. Importa mas
 * de lo normal porque la app se consulta de noche y de un vistazo.
 *
 *   texto normal   4,5:1
 *   texto grande   3:1   (>=24px, o >=18,66px en negrita)
 *   controles      3:1   (limites de un elemento interactivo, WCAG 1.4.11)
 */
import { readFileSync } from 'node:fs'

const css = readFileSync('src/styles.css', 'utf8')

/** Saca los tokens de color de :root. */
function leerPaleta() {
  const raiz = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')))
  const paleta = {}
  for (const [, nombre, valor] of raiz.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    paleta[nombre] = valor
  }
  return paleta
}

const canal = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const luminancia = (hex) =>
  [1, 3, 5]
    .map((i) => canal(parseInt(hex.slice(i, i + 2), 16) / 255))
    .reduce((a, v, i) => a + [0.2126, 0.7152, 0.0722][i] * v, 0)

function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const C = leerPaleta()
const MINIMOS = { normal: 4.5, grande: 3, control: 3 }

// [descripcion, primer plano, fondo, tipo]
const CASOS = [
  ['Texto principal sobre el fondo', C.texto, C.fondo, 'normal'],
  ['Texto principal sobre superficie', C.texto, C.superficie, 'normal'],
  ['Apagado: etiquetas y unidades', C.apagado, C.fondo, 'normal'],
  ['Apagado dentro de un campo', C.apagado, C.superficie, 'normal'],
  ['El numero grande de kcal', C.texto, C.fondo, 'grande'],
  ['kcal en rojo al pasarse del objetivo', C.grasas, C.fondo, 'grande'],
  ['Aviso de validacion', C.alerta, C.fondo, 'normal'],
  ['Texto de error', C.grasas, C.fondo, 'normal'],
  ['Mensaje de confirmacion', C.carbos, C.fondo, 'normal'],
  ['Estrella de favorito', C.proteina, C.fondo, 'normal'],
  ['Anillo de foco', C.proteina, C.fondo, 'control'],
  ['Borde de campo sobre el fondo', C['borde-control'], C.fondo, 'control'],
  ['Borde de campo sobre su relleno', C['borde-control'], C.superficie, 'control'],
  ['Barra de proteinas sobre su canal', C.proteina, C.borde, 'control'],
  ['Barra de hidratos sobre su canal', C.carbos, C.borde, 'control'],
  ['Barra de grasas sobre su canal', C.grasas, C.borde, 'control'],
]

let fallos = 0
console.log('Contraste (WCAG 2.1 AA)\n')
for (const [nombre, frente, fondo, tipo] of CASOS) {
  if (!frente || !fondo) {
    console.error(`FALTA  no encuentro el color de: ${nombre}`)
    fallos++
    continue
  }
  const r = contraste(frente, fondo)
  const min = MINIMOS[tipo]
  const pasa = r >= min
  if (!pasa) fallos++
  console.log(
    `${pasa ? 'PASA ' : 'FALLA'}  ${r.toFixed(2).padStart(5)}:1  (min ${min})  ${nombre}`,
  )
}

if (fallos > 0) {
  console.error(`\n${fallos} caso(s) por debajo del minimo.`)
  process.exit(1)
}
console.log(`\nLos ${CASOS.length} casos pasan.`)
