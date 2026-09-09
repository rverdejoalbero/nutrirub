# NutriRub

Seguimiento de macros para una sola persona. Sin cuentas, sin servidor, sin suscripción.
Todo vive en el móvil.

La idea: fotografías la etiqueta nutricional de un producto **una vez**, una IA lee los macros
por 100 g y los guarda. A partir de ahí registrar una comida es elegir el producto y poner los
gramos. Sin IA, sin internet, instantáneo.

> **Regla de oro:** la IA solo interviene al dar de alta un producto. Nunca al registrar una
> comida. Todo el uso diario es aritmética local.

## Puesta en marcha

```bash
npm install
npm run dev
```

Se abre en `http://localhost:5173/nutrirub/` (la ruta lleva el nombre del repo porque así es
como se sirve en Pages).

## Publicar en GitHub Pages

1. Sube el repo a GitHub. Puede ser público: **la clave de la API no está aquí dentro.**
2. En *Settings → Pages*, pon **Source: GitHub Actions**.
3. Haz push a `main`. El workflow construye y publica solo.

El `base` de Vite se calcula en el workflow a partir del nombre del repositorio, así que puedes
llamarlo como quieras sin tocar `vite.config.ts`. En local usa `/nutrirub/`.

## Instalarlo en el iPhone

Ábrelo **en Safari** (Chrome en iOS no sabe instalar PWAs), toca Compartir → *Añadir a pantalla
de inicio*. A partir de ahí se abre a pantalla completa, con su icono, y arranca sin conexión.

## La clave de la IA

Se introduce a mano en Ajustes y se guarda en el `localStorage` de ese dispositivo. Nunca se
commitea, no hay `.env` con ella y no se usa `import.meta.env` para la clave. Por eso el
repositorio puede ser público.

En Ajustes hay un botón **Cargar modelos disponibles** que pregunta a la API cuáles existen
ahora mismo, porque los identificadores de los modelos cambian cada pocos meses. Y otro,
**Probar conexión**, que hace una llamada mínima para confirmar que la clave funciona.

Conviene restringir la clave por dominio desde el panel del proveedor: aunque el repo esté
limpio, la clave vive en un navegador.

## Copias de seguridad

**No hay servidor. La exportación a JSON es el único respaldo que existe.**

Ajustes → *Exportar datos*. En el iPhone sale la hoja de compartir, así que puedes guardarlo en
Archivos o mandártelo por correo. Hay dos exportaciones:

- **Exportar datos** — ligera, sin las fotos de las etiquetas. Es la del día a día.
- **Exportar con las fotos** — completa, pero pesa bastante más porque las imágenes viajan en
  base64.

Al importar puedes **fusionar** (añade lo que falte, no borra nada) o **reemplazar** (deja la
base exactamente como el fichero).

La app pide almacenamiento persistente al arrancar, pero en iOS ese permiso no es de fiar. La
copia manual sigue siendo la red de seguridad: hay un aviso en la pantalla Hoy si llevas mucho
sin hacer una.

## Decisiones que conviene no deshacer sin pensarlo

- **Todo se guarda por 100 g / 100 ml.** Cualquier conversión ocurre en la capa de
  presentación (`lib/calc.ts`). Es el error más fácil de cometer y el que corrompe los datos.
- **Los macros del diario van congelados.** Un `Registro` guarda sus propias kcal y gramos, no
  una referencia al producto. Si mañana corriges la etiqueta de los macarrones porque la IA
  leyó mal un número, la semana pasada no cambia. Por eso se congelan también fibra, azúcares y
  sal aunque hoy no se muestren: son datos que después no se pueden reconstruir.
- **Los objetivos llevan histórico.** Cambiarlos no reescribe los días pasados; cada día se
  compara con el objetivo que estaba vigente entonces.
- **Nada extraído por IA se guarda sin pasar por la pantalla de revisión.**
- Las kcal se contrastan contra `4·P + 4·H + 9·G + 2·fibra`. Más de un 15 % de desviación
  levanta un aviso. Es la forma más barata de cazar un OCR mal leído.

## Estructura

```
src/
  ai/          adaptador de proveedor (Gemini / OpenRouter), prompts, parseo de la etiqueta
  db/          esquema Dexie y tipos
  lib/         cálculo de macros, fechas, imagen, copias, ajustes
  components/  piezas compartidas
  pages/       las cinco pantallas
```

## Stack

React + Vite + TypeScript, `HashRouter` (Pages no reescribe rutas), Dexie sobre IndexedDB,
`vite-plugin-pwa`, CSS plano con variables. Las gráficas son SVG a mano: son treinta valores y
una línea, y una librería de gráficas pesaría más que toda la app.
