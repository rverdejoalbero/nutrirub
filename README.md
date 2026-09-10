# NutriRub

Seguimiento de macros. Sin suscripción, sin publicidad, sin apps de pago.

Funciona en el móvil aunque no haya cobertura: los datos viven en el dispositivo y la app los
lee y escribe ahí. Cuando hay red se sincronizan con tu cuenta, así que lo apuntado en el móvil
aparece en el ordenador y al revés.

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

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | La batería de tests (248) |
| `npm run test:watch` | Tests en vigilancia mientras editas |
| `npm run typecheck` | Solo TypeScript, sin construir |
| `npm run build` | Construye a `dist/` y comprueba el precacheo |
| `npm run comprobar` | Typecheck + tests + contraste, todo de una |
| `npm run comprobar:contraste` | Audita la paleta contra la WCAG AA |
| `npm run comprobar:offline` | Verifica que el precacheo cubre todo `dist/` |

## Publicar en GitHub Pages

1. Sube el repo a GitHub. Puede ser público: **la clave de la API no está aquí dentro.**
2. En *Settings → Pages*, pon **Source: GitHub Actions**.
3. Haz push a `main`. El workflow construye y publica solo.

El `base` de Vite se calcula en el workflow a partir del nombre del repositorio, así que puedes
llamarlo como quieras sin tocar `vite.config.ts`. En local usa `/nutrirub/`.

## Instalarlo en el iPhone

Ábrelo **en Safari** (Chrome en iOS no sabe instalar PWAs), toca Compartir → *Añadir a pantalla
de inicio*. A partir de ahí se abre a pantalla completa, con su icono, y arranca sin conexión.

## Cuentas y sincronización

Cada persona tiene su usuario y solo ve lo suyo. Quien lo impide de verdad no es la app: son las
políticas *Row Level Security* de PostgreSQL, que rechazan cualquier consulta a filas de otro
aunque quien pregunte tenga la clave pública. Comprobado: intentar escribir en la cuenta de otro
devuelve `new row violates row-level security policy`.

### Crear una cuenta

**No hay registro dentro de la app**, a propósito. Las cuentas se crean desde el panel de
Supabase: *Authentication → Users → Add user*.

- **Email:** `<usuario>@rverdejoalbero.github.io` — la parte antes de la arroba es el usuario
- **Password:** la que sea, mínimo 6 caracteres
- **Marca «Auto Confirm User»**

Supabase Auth solo sabe autenticar por correo o teléfono, así que el correo se fabrica a partir
del nombre de usuario y nunca se enseña. De regalo, la unicidad sale gratis: Supabase ya exige
correos únicos. El dominio tiene que existir de verdad en el DNS o rechaza el alta, y ese existe
y no tiene servidor de correo, así que nunca se entregaría nada a nadie.

Que no haya registro abierto encaja con lo que es esto: no es una app pública, son unas pocas
personas. Y de paso evita los correos de confirmación, limitados a unos dos por hora en la capa
gratuita.

> **No hay «he olvidado mi contraseña».** Recuperarla exige mandar un correo a una dirección
> real, y aquí no hay ninguna. Si alguien la pierde, se le crea otra cuenta desde el panel.

### Cómo sincroniza

Al abrir la app, al volver la conexión, al volver a primer plano, **al cambiar algo** (segundo y
medio después, para agrupar la racha), al irse a segundo plano y cada tres minutos.

Ese *al cambiar algo* costó un fallo real: sin él, añadir un producto en el móvil y cerrar la app
antes del temporizador dejaba el producto ahí para siempre y no aparecía en el ordenador.

Sin red no pasa nada: los cambios se marcan y suben después. Es lo que permite seguir apuntando
en el súper sin cobertura.

Ante el mismo registro tocado en dos sitios gana el más reciente. Los conflictos de verdad son
rarísimos con una sola persona y varios dispositivos.

**Las fotos de las etiquetas no viajan.** Son unos 200 KB que en JSON inflan un tercio más:
harían lenta cada sincronización y se comerían la cuota. Se quedan en el móvil donde las hiciste.

El esquema del servidor está en [supabase/esquema.sql](supabase/esquema.sql) y se puede
reejecutar sin miedo.

## La clave de la IA

Se introduce a mano en Ajustes y se guarda en el `localStorage` de ese dispositivo. Nunca se
commitea, no hay `.env` con ella y no se usa `import.meta.env` para la clave. Por eso el
repositorio puede ser público.

En Ajustes hay un botón **Cargar modelos disponibles** que pregunta a la API cuáles existen
ahora mismo, porque los identificadores de los modelos cambian cada pocos meses. Y otro,
**Probar conexión**, que hace una llamada mínima para confirmar que la clave funciona.

Conviene restringir la clave por dominio desde el panel del proveedor: aunque el repo esté
limpio, la clave vive en un navegador.

## Qué hay dentro

**Hoy.** Las kcal que quedan como número dominante, las tres barras de macro y el diario del día
agrupado por momento. Botón para copiar un día entero desde el último día con registros.

**Alimentos.** La biblioteca, con búsqueda sin tildes, favoritos (que ordenan primero) y filtros
por favoritos y por platos.

**Alta de un producto**, por tres vías: foto de la etiqueta, a mano, o como plato de varios
alimentos. Las tres acaban en la misma pantalla de revisión.

**Datos.** Calorías por día a 7 y 30 vistas, reparto medio de macros, medias de fibra, azúcares
y sal, y lo que más repites.

**Asistente.** Chat que recibe como contexto el resumen del día antes de cada respuesta.

**Ajustes.** Tu cuenta y estado de sincronización, clave y modelo de la IA, objetivos,
exportar/importar y borrar todo.

### Platos compuestos

Un plato se guarda como **un producto más**, con sus valores ya calculados por 100 g, y además
recuerda sus ingredientes y su peso final para poder reeditarlo. Así el buscador, el registro
por gramos, las porciones rápidas y las estadísticas funcionan sin enterarse de que es una
receta.

El **peso del plato terminado** es lo que hace que el cálculo sea correcto y no una
aproximación: 100 g de macarrones crudos pesan unos 230 cocidos, así que dividir por la suma de
los ingredientes daría un plato casi el doble de calórico. La pantalla sugiere el peso crudo y
deja de seguirlo en cuanto escribes el peso real de la olla.

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
  sal: son datos que después no se podrían reconstruir, y por eso existen las medias de Datos.
- **Duplicar un día es la excepción, y a propósito.** Ahí sí se recalcula con la etiqueta
  actual, porque el apunte de hoy es *nuevo*: debe reflejar lo mejor que sabemos hoy.
- **Los objetivos llevan histórico.** Cambiarlos no reescribe los días pasados; cada día se
  compara con el objetivo que estaba vigente entonces.
- **Nada extraído por IA se guarda sin pasar por la pantalla de revisión.**
- **Los identificadores son UUID, no números.** Dos móviles sin conexión generarían el `id: 1`
  para cosas distintas y al sincronizar se pisarían.
- **Borrar es marcar `borradoEn`, no quitar la fila.** Si desapareciera, el otro dispositivo la
  volvería a subir creyéndola nueva y reaparecería sola.
- **Lo pendiente de subir es una bandera explícita**, no una comparación de fechas: deducirlo del
  reloj falla cuando un dispositivo va adelantado.
- **No se inventa un cero.** Si ninguna etiqueta declaraba la fibra, el producto no declara
  fibra: un 0 diría «no tiene» cuando lo cierto es «no lo sabemos».
- Las kcal se contrastan contra `4·P + 4·H + 9·G + 2·fibra`. Más de un 15 % de desviación
  levanta un aviso. Es la forma más barata de cazar un OCR mal leído.

## Que siga funcionando sin conexión

Es un requisito, no una aspiración: la app tiene que abrir y dejar registrar comidas en el súper
sin cobertura. Eso solo se cumple si **todo** lo que se construye está en el manifiesto de
precacheo del service worker, incluida la fuente —si viniera de la red, el número grande de kcal
no se vería—. `npm run build` lo comprueba y falla si algún fichero se queda fuera, así que
añadir un tipo de asset nuevo sin meterlo en `globPatterns` no puede pasar desapercibido.

Para comprobarlo tú de verdad: instálala en el iPhone, pon el modo avión y ábrela. Debe arrancar
y dejarte registrar. Solo la lectura de etiquetas y el asistente necesitan red.

## Contraste

`npm run comprobar:contraste` mide la paleta contra la WCAG 2.1 AA leyendo los tokens del CSS
real, y corre en CI. Importa más de lo normal porque esta app se consulta de noche y de un
vistazo.

Por eso hay dos tokens de borde y no uno: `--borde` dibuja las líneas finas entre filas, que
pueden ser tenues porque son decorativas, y `--borde-control` dibuja el límite de los campos,
chips y botones, que necesita 3:1 para que se vea dónde está el control.

## Los tests

`npm test`. Cubren lo que puede corromper datos en silencio sin que se note hasta semanas
después: el escalado por 100 g y la comprobación de coherencia, el parseo de las respuestas del
modelo (JSON envuelto en markdown, comas decimales, nulos que no son ceros), las fechas locales
con sus cambios de mes, año, bisiesto y horario, la composición de platos, la duplicación de
días y —sobre todo— la exportación y reimportación comparando registro a registro.

Los de base de datos corren contra `fake-indexeddb`, así que no hace falta navegador.

## Estructura

```
src/
  ai/          adaptador de proveedor (Gemini / OpenRouter), prompts, parseo de la etiqueta
  db/          esquema Dexie y tipos
  lib/         cálculo de macros, recetas, diario, fechas, imagen, copias, ajustes
  components/  piezas compartidas
  pages/       las pantallas
  pruebas/     preparación del entorno de test
scripts/       comprobaciones de precacheo y contraste
```

## Stack

React + Vite + TypeScript, `HashRouter` (Pages no reescribe rutas), Dexie sobre IndexedDB,
`vite-plugin-pwa`, CSS plano con variables, Vitest. Las gráficas son SVG a mano: son treinta
valores y una línea, y una librería de gráficas pesaría más que toda la app.
