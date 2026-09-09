import { leerAjustes, type Proveedor as IdProveedor } from '../lib/ajustes'

export interface MensajeChat {
  rol: 'user' | 'assistant'
  texto: string
}

export interface Imagen {
  base64: string
  mime: string
}

export interface Proveedor {
  id: IdProveedor
  listarModelos(): Promise<string[]>
  /** Llamada minima para confirmar que la clave funciona. */
  probar(): Promise<string>
  /** Vision -> texto crudo (se espera JSON, pero se valida fuera). */
  visionJSON(img: Imagen, instruccion: string): Promise<string>
  chat(sistema: string, mensajes: MensajeChat[]): Promise<string>
}

export class ErrorIA extends Error {
  constructor(
    mensaje: string,
    readonly estado?: number,
  ) {
    super(mensaje)
    this.name = 'ErrorIA'
  }
}

const ESPERA = 90_000

async function pedir(url: string, init: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(ESPERA) })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      throw new ErrorIA('La petición ha tardado demasiado. Inténtalo otra vez.')
    }
    throw new ErrorIA('No hay conexión con el servicio de IA. Comprueba la red.')
  }
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => '')
    throw new ErrorIA(mensajeDeError(res.status, cuerpo), res.status)
  }
  return res
}

function mensajeDeError(estado: number, cuerpo: string): string {
  let detalle = ''
  try {
    const j = JSON.parse(cuerpo)
    detalle = j?.error?.message ?? j?.message ?? ''
  } catch {
    detalle = cuerpo.slice(0, 200)
  }
  if (estado === 400 && /API key not valid|API_KEY_INVALID/i.test(detalle))
    return 'La clave de API no es válida. Revísala en Ajustes.'
  if (estado === 401 || estado === 403)
    return 'La clave de API no es válida o no tiene permiso. Revísala en Ajustes.'
  if (estado === 404) return 'Ese modelo no existe o ya no está disponible. Elige otro en Ajustes.'
  if (estado === 429)
    return 'Has llegado al límite de peticiones. Espera un rato o prueba otro modelo.'
  if (estado >= 500) return 'El servicio de IA está caído ahora mismo. Prueba en unos minutos.'
  return detalle ? `Error ${estado}: ${detalle}` : `Error ${estado} del servicio de IA.`
}

// ---------------------------------------------------------------- Gemini

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta'

function creaGemini(apiKey: string, modelo: string): Proveedor {
  const cab = { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }

  async function generar(cuerpo: unknown): Promise<string> {
    const res = await pedir(`${GEMINI}/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: 'POST',
      headers: cab,
      body: JSON.stringify(cuerpo),
    })
    const j = await res.json()
    const cand = j?.candidates?.[0]
    if (!cand) {
      const bloqueo = j?.promptFeedback?.blockReason
      throw new ErrorIA(
        bloqueo
          ? `El modelo ha rechazado la imagen (${bloqueo}).`
          : 'El modelo no ha devuelto nada.',
      )
    }
    const texto = (cand.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? '')
      .join('')
      .trim()
    if (!texto) {
      if (cand.finishReason === 'MAX_TOKENS')
        throw new ErrorIA('La respuesta se ha cortado. Prueba otra vez o con otro modelo.')
      throw new ErrorIA('El modelo ha devuelto una respuesta vacía.')
    }
    return texto
  }

  return {
    id: 'gemini',

    async listarModelos() {
      const res = await pedir(`${GEMINI}/models?pageSize=200`, { headers: cab })
      const j = await res.json()
      return (j?.models ?? [])
        .filter((m: { supportedGenerationMethods?: string[] }) =>
          m.supportedGenerationMethods?.includes('generateContent'),
        )
        .map((m: { name: string }) => m.name.replace(/^models\//, ''))
        .filter((n: string) => !/embedding|aqa|imagen|veo/i.test(n))
        .sort()
    },

    probar() {
      return generar({
        contents: [{ role: 'user', parts: [{ text: 'Responde solo con: OK' }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 16 },
      })
    },

    async visionJSON(img, instruccion) {
      const base = {
        systemInstruction: { parts: [{ text: instruccion }] },
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'Extrae la información nutricional de esta etiqueta.' },
              { inline_data: { mime_type: img.mime, data: img.base64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 2048 },
      }
      try {
        // responseMimeType fuerza JSON limpio, pero no todos los modelos lo aceptan.
        return await generar({
          ...base,
          generationConfig: { ...base.generationConfig, responseMimeType: 'application/json' },
        })
      } catch (e) {
        if (e instanceof ErrorIA && e.estado === 400) return await generar(base)
        throw e
      }
    },

    chat(sistema, mensajes) {
      return generar({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: mensajes.map((m) => ({
          role: m.rol === 'user' ? 'user' : 'model',
          parts: [{ text: m.texto }],
        })),
        generationConfig: { temperature: 0.6, maxOutputTokens: 1024 },
      })
    },
  }
}

// ------------------------------------------------------------ OpenRouter

const OPENROUTER = 'https://openrouter.ai/api/v1'

function creaOpenRouter(apiKey: string, modelo: string): Proveedor {
  const cab = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'X-Title': 'NutriRub',
  }
  // Varios IDs separados por coma: OpenRouter prueba el siguiente si uno cae.
  const ids = modelo
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const principal = ids[0] ?? ''

  async function completar(mensajes: unknown[], temperatura: number): Promise<string> {
    const res = await pedir(`${OPENROUTER}/chat/completions`, {
      method: 'POST',
      headers: cab,
      body: JSON.stringify({
        model: principal,
        ...(ids.length > 1 ? { models: ids } : {}),
        messages: mensajes,
        temperature: temperatura,
      }),
    })
    const j = await res.json()
    const texto = j?.choices?.[0]?.message?.content
    if (typeof texto !== 'string' || !texto.trim())
      throw new ErrorIA('El modelo ha devuelto una respuesta vacía.')
    return texto.trim()
  }

  return {
    id: 'openrouter',

    async listarModelos() {
      const res = await pedir(`${OPENROUTER}/models`, { headers: cab })
      const j = await res.json()
      return (j?.data ?? []).map((m: { id: string }) => m.id).sort()
    },

    probar: () => completar([{ role: 'user', content: 'Responde solo con: OK' }], 0),

    visionJSON: (img, instruccion) =>
      completar(
        [
          { role: 'system', content: instruccion },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extrae la información nutricional de esta etiqueta.' },
              { type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.base64}` } },
            ],
          },
        ],
        0,
      ),

    chat: (sistema, mensajes) =>
      completar(
        [
          { role: 'system', content: sistema },
          ...mensajes.map((m) => ({ role: m.rol, content: m.texto })),
        ],
        0.6,
      ),
  }
}

// ------------------------------------------------------------------ fabrica

export function obtenerProveedor(): Proveedor {
  const { proveedor, apiKey, modelo } = leerAjustes()
  const clave = apiKey.trim()
  if (!clave) throw new ErrorIA('No hay clave de API guardada.')
  return proveedor === 'openrouter' ? creaOpenRouter(clave, modelo) : creaGemini(clave, modelo)
}

/** Igual que obtenerProveedor pero con clave y modelo sueltos, para "Probar conexión". */
export function proveedorCon(id: IdProveedor, apiKey: string, modelo: string): Proveedor {
  return id === 'openrouter' ? creaOpenRouter(apiKey, modelo) : creaGemini(apiKey, modelo)
}
