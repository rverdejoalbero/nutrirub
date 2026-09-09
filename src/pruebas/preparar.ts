import 'fake-indexeddb/auto'

/**
 * Dexie necesita structuredClone y un Blob que sepa devolver arrayBuffer.
 * Node los trae desde la 18, pero fake-indexeddb no siempre los cablea,
 * asi que nos aseguramos aqui en vez de descubrirlo test a test.
 */
if (typeof globalThis.structuredClone !== 'function') {
  throw new Error('Hace falta Node 18 o superior para structuredClone')
}
