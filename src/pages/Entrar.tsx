import { useState } from 'react'
import { ErrorSesion, entrar } from '../nube/sesion'
import { revisarCredenciales } from '../nube/usuario'

/**
 * La puerta. No hay forma de usar la app sin entrar.
 *
 * No hay registro: las cuentas se crean desde el panel de Supabase. Para una
 * app de uso personal entre pocas personas es una ventaja, no una carencia:
 * nadie ajeno puede darse de alta, y de paso desaparece el ida y vuelta de
 * correos de confirmacion.
 */
export default function Entrar() {
  const [usuario, setUsuario] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [campoMal, setCampoMal] = useState<'usuario' | 'contrasena' | null>(null)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setCampoMal(null)

    const problema = revisarCredenciales(usuario, contrasena)
    if (problema) {
      setCampoMal(problema.campo)
      setError(problema.texto)
      return
    }

    setEntrando(true)
    try {
      await entrar(usuario, contrasena)
      // No hace falta navegar: al haber sesion, la app se muestra sola.
    } catch (err) {
      setError(err instanceof ErrorSesion ? err.message : 'No se ha podido entrar.')
    } finally {
      setEntrando(false)
    }
  }

  return (
    <main className="puerta">
      <div className="puerta-caja">
        <h1 className="puerta-marca">NutriRub</h1>
        <p className="nota puerta-lema">Tus comidas, en todos tus dispositivos.</p>

        <form onSubmit={enviar}>
          <label className={`campo ${campoMal === 'usuario' ? 'aviso' : ''}`}>
            <span>Usuario</span>
            <input
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="ruben"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              disabled={entrando}
            />
          </label>

          <label className={`campo ${campoMal === 'contrasena' ? 'aviso' : ''}`}>
            <span>Contraseña</span>
            <input
              type="password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              autoComplete="current-password"
              enterKeyHint="go"
              disabled={entrando}
            />
          </label>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <button className="boton ancho" type="submit" disabled={entrando}>
            {entrando ? <span className="cargando" /> : 'Entrar'}
          </button>
        </form>

        <p className="nota puerta-pie">
          Tus datos se guardan en este dispositivo y se sincronizan con tu cuenta. Nadie más puede
          verlos.
        </p>
      </div>
    </main>
  )
}
