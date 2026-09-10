import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { objetivosEn, registrosDe } from '../db/db'
import { NOMBRE_MOMENTO } from '../db/types'
import { sumar } from '../lib/calc'
import { ent, gr } from '../lib/formato'
import { hoyISO } from '../lib/fecha'
import { hayClave } from '../lib/ajustes'
import { ErrorIA, obtenerProveedor, type MensajeChat } from '../ai/provider'
import { PROMPT_ASISTENTE } from '../ai/prompt'
import { IconoEnviar } from '../components/Iconos'

/**
 * Resumen del dia que se le cuela al modelo en cada turno. Se recalcula al
 * enviar, no al montar: si acabas de registrar algo, cuenta.
 */
async function resumenDelDia(): Promise<string> {
  const fecha = hoyISO()
  const [registros, objetivo] = await Promise.all([
    registrosDe(fecha),
    objetivosEn(fecha),
  ])
  const t = sumar(registros)
  const linea = (n: string, v: number, o: number, u: string) =>
    `${n}: ${gr(v)} de ${gr(o)} ${u} (quedan ${gr(Math.max(0, o - v))})`

  const comido = registros.length
    ? registros
        .map(
          (r) =>
            `- ${NOMBRE_MOMENTO[r.momento]}: ${r.nombreProducto}, ${gr(r.cantidad)} ${r.unidad}, ${ent(r.kcal)} kcal`,
        )
        .join('\n')
    : '- (todavía no ha comido nada registrado)'

  return [
    `Resumen de hoy (${fecha}):`,
    linea('Calorías', t.kcal, objetivo.kcal, 'kcal'),
    linea('Proteínas', t.proteinas, objetivo.proteinas, 'g'),
    linea('Hidratos', t.carbohidratos, objetivo.carbohidratos, 'g'),
    linea('Grasas', t.grasas, objetivo.grasas, 'g'),
    '',
    'Registrado hoy:',
    comido,
  ].join('\n')
}

const SUGERENCIAS = [
  '¿Qué me puedo cenar con lo que me queda?',
  '¿Voy bien de proteína hoy?',
  'Dame una idea de merienda de unas 200 kcal',
]

export default function Asistente() {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const finRef = useRef<HTMLDivElement>(null)
  const conClave = hayClave()

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensajes, pensando])

  async function enviar(contenido: string) {
    const limpio = contenido.trim()
    if (!limpio || pensando) return
    setError(null)
    setTexto('')
    const historial: MensajeChat[] = [...mensajes, { rol: 'user', texto: limpio }]
    setMensajes(historial)
    setPensando(true)
    try {
      const resumen = await resumenDelDia()
      // El resumen va pegado al ultimo turno, no al sistema, para que refleje
      // el estado en el momento de preguntar.
      const conContexto = historial.map((m, i) =>
        i === historial.length - 1 ? { ...m, texto: `${resumen}\n\nPregunta: ${m.texto}` } : m,
      )
      const respuesta = await obtenerProveedor().chat(PROMPT_ASISTENTE, conContexto)
      setMensajes([...historial, { rol: 'assistant', texto: respuesta }])
    } catch (e) {
      setError(e instanceof ErrorIA ? e.message : 'No se ha podido conectar con la IA.')
    } finally {
      setPensando(false)
    }
  }

  return (
    <>
      <header className="cabecera">
        <h1>Asistente</h1>
        {mensajes.length > 0 && (
          <button className="accion" onClick={() => setMensajes([])} aria-label="Vaciar conversación">
            <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>Vaciar</span>
          </button>
        )}
      </header>

      <main style={{ paddingBottom: 'calc(var(--barra-inf) * 2 + var(--seguro-inf) + 40px)' }}>
        {!conClave ? (
          <div className="contenido" style={{ paddingTop: 20 }}>
            <div className="aviso-caja">
              El asistente necesita una clave de API. <Link to="/ajustes">Ponerla en Ajustes</Link>.
            </div>
          </div>
        ) : (
          <>
            {mensajes.length === 0 && (
              <div className="contenido" style={{ paddingTop: 24 }}>
                <p className="nota" style={{ marginBottom: 18 }}>
                  Sabe lo que llevas comido hoy y lo que te queda. Pregúntale.
                </p>
                <div style={{ display: 'grid', gap: 8 }}>
                  {SUGERENCIAS.map((s) => (
                    <button key={s} className="boton secundario" onClick={() => enviar(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="chat">
              {mensajes.map((m, i) => (
                <div key={i} className={`burbuja ${m.rol === 'user' ? 'mia' : 'suya'}`}>
                  {m.texto}
                </div>
              ))}
              {pensando && (
                <div className="burbuja suya" role="status">
                  <span className="cargando" />
                </div>
              )}
              {error && <p className="error">{error}</p>}
              <div ref={finRef} />
            </div>
          </>
        )}
      </main>

      {conClave && (
        <form
          className="barra-chat"
          onSubmit={(e) => {
            e.preventDefault()
            void enviar(texto)
          }}
        >
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribe tu pregunta"
            enterKeyHint="send"
            aria-label="Mensaje"
          />
          <button className="boton" type="submit" disabled={!texto.trim() || pensando} aria-label="Enviar">
            <IconoEnviar />
          </button>
        </form>
      )}
    </>
  )
}
