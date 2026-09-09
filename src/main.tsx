import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { pedirPersistencia } from './db/db'
import './styles.css'

registerSW({ immediate: true })

// Sin esto el navegador puede desalojar IndexedDB cuando ande justo de espacio.
void pedirPersistencia()

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
