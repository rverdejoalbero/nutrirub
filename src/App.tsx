import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { IconoAlimentos, IconoAsistente, IconoEstadisticas, IconoHoy } from './components/Iconos'
import { useSesion, useSincronizacion } from './nube/useSesion'
import { ContextoSync } from './nube/contexto'
import Hoy from './pages/Hoy'
import Alimentos from './pages/Alimentos'
import Estadisticas from './pages/Estadisticas'
import Asistente from './pages/Asistente'
import Ajustes from './pages/Ajustes'
import NuevoProducto from './pages/NuevoProducto'
import EditarProducto from './pages/EditarProducto'
import RevisarProducto from './pages/RevisarProducto'
import EditarPlato from './pages/EditarPlato'
import Entrar from './pages/Entrar'

const PESTANAS = [
  { a: '/hoy', texto: 'Hoy', Icono: IconoHoy },
  { a: '/alimentos', texto: 'Alimentos', Icono: IconoAlimentos },
  { a: '/estadisticas', texto: 'Datos', Icono: IconoEstadisticas },
  { a: '/asistente', texto: 'Asistente', Icono: IconoAsistente },
]

function Navegacion() {
  return (
    <nav className="nav" aria-label="Secciones">
      {PESTANAS.map(({ a, texto, Icono }) => (
        <NavLink key={a} to={a} className={({ isActive }) => (isActive ? 'activo' : '')}>
          <Icono />
          <span>{texto}</span>
        </NavLink>
      ))}
    </nav>
  )
}

function Aplicacion() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/hoy" replace />} />
        <Route path="/hoy" element={<Hoy />} />
        <Route path="/alimentos" element={<Alimentos />} />
        <Route path="/alimentos/nuevo" element={<NuevoProducto />} />
        <Route path="/alimentos/revisar" element={<RevisarProducto />} />
        <Route path="/alimentos/:id" element={<EditarProducto />} />
        <Route path="/platos/nuevo" element={<EditarPlato />} />
        <Route path="/platos/:id" element={<EditarPlato />} />
        <Route path="/estadisticas" element={<Estadisticas />} />
        <Route path="/asistente" element={<Asistente />} />
        <Route path="/ajustes" element={<Ajustes />} />
        <Route path="*" element={<Navigate to="/hoy" replace />} />
      </Routes>
      <Navegacion />
    </>
  )
}

export default function App() {
  const { cuenta, comprobando } = useSesion()
  const sync = useSincronizacion(cuenta?.id ?? null)

  return (
    <HashRouter>
      <div className="app">
        {/* Mientras se comprueba la sesion no se enseña nada: parpadear la
            pantalla de entrada a quien ya habia entrado queda fatal, y en un
            movil el arranque es justo el momento en que mas se nota. */}
        {comprobando ? (
          <main className="puerta">
            <span className="cargando" />
          </main>
        ) : cuenta ? (
          <ContextoSync.Provider value={{ cuenta, sync }}>
            <Aplicacion />
          </ContextoSync.Provider>
        ) : (
          <Entrar />
        )}
      </div>
    </HashRouter>
  )
}
