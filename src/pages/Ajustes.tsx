import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db, guardarObjetivos, objetivosActuales, productosVivos } from '../db/db'
import {
  MODELOS_SUGERIDOS,
  guardarAjustes,
  leerAjustes,
  type Proveedor as IdProveedor,
} from '../lib/ajustes'
import { ErrorIA, proveedorCon } from '../ai/provider'
import { borrarTodo, exportar, importar } from '../lib/copia'
import { aNumero, ent } from '../lib/formato'
import { kcalTeoricas } from '../lib/calc'
import { Cabecera, Confirmar, Hoja } from '../components/UI'
import { useCuentaYSync } from '../nube/contexto'
import { salir } from '../nube/sesion'

type EstadoPrueba = { tipo: 'ok' | 'error' | 'probando'; texto?: string } | null

const ESTADO_SYNC: Record<string, string> = {
  reposo: 'Todo al día',
  sincronizando: 'Sincronizando…',
  'sin-conexion': 'Sin conexión',
  error: 'No se ha podido sincronizar',
}

export default function Ajustes() {
  const nav = useNavigate()
  const [a, setA] = useState(() => leerAjustes())
  const [prueba, setPrueba] = useState<EstadoPrueba>(null)
  const [modelos, setModelos] = useState<string[] | null>(null)
  const [cargandoModelos, setCargandoModelos] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<'borrar' | 'importar' | 'salir' | null>(null)
  const { cuenta, sync } = useCuentaYSync()
  const ficheroPendiente = useRef<string | null>(null)
  const entradaFichero = useRef<HTMLInputElement>(null)

  // ---- objetivos
  const objetivoActual = useLiveQuery(() => objetivosActuales(), [], undefined)
  const [obj, setObj] = useState({ kcal: '', proteinas: '', carbohidratos: '', grasas: '' })
  useEffect(() => {
    if (!objetivoActual) return
    setObj({
      kcal: String(objetivoActual.kcal),
      proteinas: String(objetivoActual.proteinas),
      carbohidratos: String(objetivoActual.carbohidratos),
      grasas: String(objetivoActual.grasas),
    })
  }, [objetivoActual])

  const objNum = {
    kcal: aNumero(obj.kcal),
    proteinas: aNumero(obj.proteinas),
    carbohidratos: aNumero(obj.carbohidratos),
    grasas: aNumero(obj.grasas),
  }
  const kcalDeMacros = kcalTeoricas(objNum)
  const objCuadra =
    objNum.kcal === null || kcalDeMacros === 0
      ? true
      : Math.abs(objNum.kcal - kcalDeMacros) / objNum.kcal <= 0.1

  // Contar lo vivo: las filas borradas siguen ahi para propagar el borrado,
  // pero decirte que tienes 40 alimentos cuando borraste 15 seria mentir.
  const nProductos = useLiveQuery(async () => (await productosVivos()).length, [], undefined)
  const nRegistros = useLiveQuery(
    async () => (await db.diario.toArray()).filter((r) => !r.borradoEn).length,
    [],
    undefined,
  )

  function cambiar(parcial: Partial<typeof a>) {
    setA(guardarAjustes(parcial))
    setPrueba(null)
  }

  async function probarConexion() {
    setPrueba({ tipo: 'probando' })
    try {
      const p = proveedorCon(a.proveedor, a.apiKey.trim(), a.modelo.trim())
      const r = await p.probar()
      setPrueba({ tipo: 'ok', texto: `Responde correctamente («${r.slice(0, 40)}»).` })
    } catch (e) {
      setPrueba({ tipo: 'error', texto: e instanceof ErrorIA ? e.message : 'Ha fallado la conexión.' })
    }
  }

  async function cargarModelos() {
    setCargandoModelos(true)
    setPrueba(null)
    try {
      const lista = await proveedorCon(a.proveedor, a.apiKey.trim(), a.modelo.trim()).listarModelos()
      setModelos(lista)
      if (lista.length === 0) setPrueba({ tipo: 'error', texto: 'No ha devuelto ningún modelo.' })
    } catch (e) {
      setPrueba({ tipo: 'error', texto: e instanceof ErrorIA ? e.message : 'No se ha podido cargar la lista.' })
    } finally {
      setCargandoModelos(false)
    }
  }

  async function exportarCopia(conFotos: boolean) {
    setMensaje(null)
    try {
      const r = await exportar(conFotos)
      setA(leerAjustes())
      setMensaje(r === 'compartido' ? 'Copia compartida.' : 'Copia descargada.')
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setMensaje('No se ha podido exportar. Inténtalo otra vez.')
    }
  }

  async function aplicarImportacion(modo: 'reemplazar' | 'fusionar') {
    try {
      const r = await importar(ficheroPendiente.current ?? '', modo)
      setMensaje(
        `Importados ${r.productos} alimentos, ${r.registros} registros y ${r.objetivos} objetivos.`,
      )
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'No se ha podido importar.')
    } finally {
      ficheroPendiente.current = null
      setConfirmar(null)
    }
  }

  const opciones = modelos ?? MODELOS_SUGERIDOS[a.proveedor]

  return (
    <>
      <Cabecera titulo="Ajustes" onAtras={() => nav(-1)} />
      <main>
        <div className="contenido">
          {/* --------------------------------------------------- cuenta */}
          <div className="seccion">
            <h2>Tu cuenta</h2>
          </div>
          <div className="previo" style={{ display: 'block', textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{cuenta.usuario}</p>
            <p className="nota" style={{ margin: '4px 0 0' }}>
              {ESTADO_SYNC[sync.estado]}
              {sync.pendientes > 0 && ` · ${sync.pendientes} sin subir`}
            </p>
          </div>
          {sync.ultimoError && <p className="error">{sync.ultimoError}</p>}
          <div style={{ display: 'grid', gap: 10 }}>
            <button
              className="boton secundario ancho"
              onClick={sync.ahora}
              disabled={sync.estado === 'sincronizando'}
            >
              {sync.estado === 'sincronizando' ? <span className="cargando" /> : 'Sincronizar ahora'}
            </button>
            <button className="boton secundario ancho" onClick={() => setConfirmar('salir')}>
              Cerrar sesión
            </button>
          </div>
          <p className="nota" style={{ marginTop: 10 }}>
            Se sincroniza sola al abrir la app y cuando vuelve la conexión. Sin cobertura puedes
            seguir apuntando: lo pendiente sube después.
          </p>

          {/* ------------------------------------------------ objetivos */}
          <div className="seccion">
            <h2>Objetivos diarios</h2>
          </div>
          <label className="campo">
            <span>Calorías</span>
            <input
              type="text"
              inputMode="numeric"
              value={obj.kcal}
              onChange={(e) => setObj({ ...obj, kcal: e.target.value })}
            />
          </label>
          <div className="rejilla-2">
            {(
              [
                ['proteinas', 'Proteínas (g)'],
                ['carbohidratos', 'Hidratos (g)'],
                ['grasas', 'Grasas (g)'],
              ] as const
            ).map(([k, etiqueta]) => (
              <label className="campo" key={k}>
                <span>{etiqueta}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={obj[k]}
                  onChange={(e) => setObj({ ...obj, [k]: e.target.value })}
                />
              </label>
            ))}
          </div>
          {!objCuadra && (
            <p className="texto-aviso" style={{ marginTop: -6, marginBottom: 14 }}>
              Con esos macros salen unas {ent(kcalDeMacros)} kcal, no {ent(objNum.kcal ?? 0)}.
            </p>
          )}
          <button
            className="boton ancho"
            disabled={Object.values(objNum).some((v) => v === null || v < 0)}
            onClick={async () => {
              await guardarObjetivos({
                kcal: objNum.kcal!,
                proteinas: objNum.proteinas!,
                carbohidratos: objNum.carbohidratos!,
                grasas: objNum.grasas!,
              })
              setMensaje('Objetivos guardados.')
            }}
          >
            Guardar objetivos
          </button>
          <p className="nota" style={{ marginTop: 10 }}>
            Cambiar los objetivos no reescribe los días pasados: cada día se compara con el
            objetivo que tenías entonces.
          </p>

          {/* ------------------------------------------------------- IA */}
          <div className="seccion">
            <h2>Inteligencia artificial</h2>
          </div>
          <label className="campo">
            <span>Proveedor</span>
            <select
              value={a.proveedor}
              onChange={(e) => {
                const p = e.target.value as IdProveedor
                setModelos(null)
                cambiar({ proveedor: p, modelo: MODELOS_SUGERIDOS[p][0] })
              }}
            >
              <option value="gemini">Google Gemini</option>
              <option value="openrouter">OpenRouter</option>
            </select>
          </label>

          <label className="campo">
            <span>Clave de API</span>
            <input
              type="password"
              value={a.apiKey}
              onChange={(e) => cambiar({ apiKey: e.target.value })}
              placeholder={a.proveedor === 'gemini' ? 'AIza…' : 'sk-or-…'}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>

          <label className="campo">
            <span>Modelo para leer etiquetas</span>
            <input
              type="text"
              value={a.modelo}
              onChange={(e) => cambiar({ modelo: e.target.value })}
              list="modelos"
              autoCapitalize="none"
              spellCheck={false}
            />
            <datalist id="modelos">
              {opciones.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>

          <label className="campo">
            <span>Modelo para el asistente</span>
            <input
              type="text"
              value={a.modeloAsistente}
              onChange={(e) => cambiar({ modeloAsistente: e.target.value })}
              list="modelos"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>

          <p className="nota" style={{ marginTop: -6, marginBottom: 16 }}>
            Están separados porque los límites gratuitos de Google son <strong>por modelo</strong>,
            y los más nuevos traen muy pocas solicitudes al día. Para leer etiquetas usas unas
            pocas al mes y conviene el modelo bueno; el asistente gasta muchas más y le vale uno
            con cuota alta. Consulta los tuyos en{' '}
            <a href="https://aistudio.google.com/rate-limit" target="_blank" rel="noreferrer">
              aistudio.google.com/rate-limit
            </a>
            , cambiando el modelo del desplegable de arriba.
          </p>

          <div style={{ display: 'grid', gap: 10 }}>
            <button
              className="boton secundario ancho"
              onClick={cargarModelos}
              disabled={!a.apiKey.trim() || cargandoModelos}
            >
              {cargandoModelos ? <span className="cargando" /> : 'Cargar modelos disponibles'}
            </button>
            <button
              className="boton ancho"
              onClick={probarConexion}
              disabled={!a.apiKey.trim() || !a.modelo.trim() || prueba?.tipo === 'probando'}
            >
              {prueba?.tipo === 'probando' ? <span className="cargando" /> : 'Probar conexión'}
            </button>
          </div>

          {prueba?.tipo === 'ok' && (
            <p className="nota" style={{ color: 'var(--carbos)', marginTop: 10 }}>
              {prueba.texto}
            </p>
          )}
          {prueba?.tipo === 'error' && <p className="error">{prueba.texto}</p>}

          {modelos && (
            <p className="nota" style={{ marginTop: 10 }}>
              {modelos.length} modelos disponibles. Elige uno con visión para leer etiquetas.
            </p>
          )}

          <p className="nota" style={{ marginTop: 12 }}>
            La clave se guarda solo en este dispositivo y nunca sale de aquí salvo hacia el
            proveedor que elijas. Conviene restringirla por dominio desde el panel del proveedor.
          </p>

          {/* -------------------------------------------------- copia */}
          <div className="seccion">
            <h2>Copia de seguridad</h2>
          </div>
          <p className="nota" style={{ marginBottom: 14 }}>
            {nProductos ?? 0} alimentos y {nRegistros ?? 0} registros.{' '}
            {a.ultimaCopia
              ? `Última copia el ${new Date(a.ultimaCopia).toLocaleDateString('es-ES')}.`
              : 'Todavía no has hecho ninguna copia.'}{' '}
            Es el único respaldo que existe: no hay servidor detrás.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            <button className="boton ancho" onClick={() => exportarCopia(false)}>
              Exportar datos
            </button>
            <button className="boton secundario ancho" onClick={() => exportarCopia(true)}>
              Exportar con las fotos
            </button>
            <button
              className="boton secundario ancho"
              onClick={() => entradaFichero.current?.click()}
            >
              Importar una copia
            </button>
            <input
              ref={entradaFichero}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                ficheroPendiente.current = await f.text()
                setConfirmar('importar')
              }}
            />
          </div>

          <label className="campo" style={{ marginTop: 18 }}>
            <span>Avisarme si no hago copia en</span>
            <select
              value={a.avisarCopiaCada}
              onChange={(e) => cambiar({ avisarCopiaCada: Number(e.target.value) })}
            >
              <option value={7}>7 días</option>
              <option value={14}>14 días</option>
              <option value={30}>30 días</option>
              <option value={0}>No avisarme</option>
            </select>
          </label>

          {/* ------------------------------------------------ peligro */}
          <div className="seccion">
            <h2>Zona de peligro</h2>
          </div>
          <button className="boton peligro ancho" onClick={() => setConfirmar('borrar')}>
            Borrar todos los datos
          </button>

          {mensaje && (
            <p className="nota" style={{ marginTop: 16, color: 'var(--carbos)' }}>
              {mensaje}
            </p>
          )}

          <p className="nota" style={{ margin: '32px 0 8px', textAlign: 'center' }}>
            NutriRub · todo se guarda en este dispositivo
          </p>
        </div>
      </main>

      {confirmar === 'borrar' && (
        <Confirmar
          titulo="Borrar todos los datos"
          mensaje="Se van los alimentos, el diario entero y las fotos. No hay vuelta atrás salvo que tengas una copia exportada."
          textoOk="Borrar todo"
          peligro
          onOk={async () => {
            await borrarTodo()
            setConfirmar(null)
            setMensaje('Datos borrados.')
          }}
          onCancelar={() => setConfirmar(null)}
        />
      )}

      {confirmar === 'salir' && (
        <Confirmar
          titulo="Cerrar sesión"
          mensaje={
            sync.pendientes > 0
              ? `Quedan ${sync.pendientes} cambios sin subir. Si cierras ahora se quedan en este móvil hasta que vuelvas a entrar. Tus datos NO se borran.`
              : 'Tus datos NO se borran de este móvil: siguen aquí cuando vuelvas a entrar.'
          }
          textoOk="Cerrar sesión"
          onOk={async () => {
            await salir(cuenta.id)
            setConfirmar(null)
          }}
          onCancelar={() => setConfirmar(null)}
        />
      )}

      {confirmar === 'importar' && (
        <Hoja titulo="Importar copia" onCerrar={() => setConfirmar(null)}>
          <p className="nota" style={{ marginTop: 0 }}>
            Elige qué hacer con lo que ya tienes en el móvil.
          </p>
          <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
            <button className="boton ancho" onClick={() => void aplicarImportacion('fusionar')}>
              Fusionar
            </button>
            <p className="nota" style={{ margin: '-4px 0 8px' }}>
              Añade los alimentos y registros que falten. No borra nada.
            </p>
            <button
              className="boton peligro ancho"
              onClick={() => void aplicarImportacion('reemplazar')}
            >
              Reemplazar
            </button>
            <p className="nota" style={{ margin: '-4px 0 8px' }}>
              Deja la base exactamente como el fichero. Borra lo que haya ahora.
            </p>
            <button className="boton secundario ancho" onClick={() => setConfirmar(null)}>
              Cancelar
            </button>
          </div>
        </Hoja>
      )}

    </>
  )
}
