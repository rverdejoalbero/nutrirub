#!/usr/bin/env node
/**
 * Comprueba que el service worker precachea TODO lo que se ha construido.
 *
 * La app tiene que abrir y dejar registrar comidas sin conexion. Eso solo se
 * cumple si cada fichero de dist/ esta en el manifiesto de precacheo: si
 * alguien anade un tipo de asset nuevo y se olvida de meterlo en globPatterns,
 * la app seguira funcionando con cobertura y fallara justo cuando no la haya,
 * que es cuando nadie lo esta mirando.
 *
 * Se ejecuta despues de construir, en local y en CI.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const DIST = 'dist'

/** Ficheros que no tienen por que estar precacheados. */
const EXENTOS = new Set([
  'sw.js', // el propio service worker
  'workbox-9c191d2f.js', // su runtime, que carga el navegador aparte
])
const esRuntimeWorkbox = (f) => /^workbox-[0-9a-f]+\.js$/.test(f)

function listar(dir) {
  const salida = []
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada)
    if (statSync(ruta).isDirectory()) salida.push(...listar(ruta))
    else salida.push(relative(DIST, ruta).split(sep).join('/'))
  }
  return salida
}

let sw
try {
  sw = readFileSync(join(DIST, 'sw.js'), 'utf8')
} catch {
  console.error('No hay dist/sw.js. Construye antes: npm run build')
  process.exit(1)
}

const ficheros = listar(DIST)
const faltan = ficheros.filter(
  (f) => !EXENTOS.has(f) && !esRuntimeWorkbox(f) && !sw.includes(f),
)

if (faltan.length > 0) {
  console.error('Estos ficheros no estan precacheados y la app los pedira a la red:')
  for (const f of faltan) console.error('  - ' + f)
  console.error('\nRevisa workbox.globPatterns en vite.config.ts.')
  process.exit(1)
}

// El shell tiene que resolverse sin red: con HashRouter bajo un subdirectorio,
// cualquier navegacion cae en este index.html.
if (!/createHandlerBoundToURL\(["'][^"']*index\.html["']\)/.test(sw)) {
  console.error('Falta el navigateFallback a index.html: al recargar sin red saldria un 404.')
  process.exit(1)
}

console.log(`Precacheo correcto: ${ficheros.length - faltan.length} ficheros, ninguno depende de la red.`)
