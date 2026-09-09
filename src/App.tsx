import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import {
  IconoAlimentos,
  IconoAsistente,
  IconoEstadisticas,
  IconoHoy,
} from './components/Iconos'
import Hoy from './pages/Hoy'
import Alimentos from './pages/Alimentos'
import Estadisticas from './pages/Estadisticas'
import Asistente from './pages/Asistente'
import Ajustes from './pages/Ajustes'
import NuevoProducto from './pages/NuevoProducto'
import EditarProducto from './pages/EditarProducto'
import RevisarProducto from './pages/RevisarProducto'

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

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<Navigate to="/hoy" replace />} />
          <Route path="/hoy" element={<Hoy />} />
          <Route path="/alimentos" element={<Alimentos />} />
          <Route path="/alimentos/nuevo" element={<NuevoProducto />} />
          <Route path="/alimentos/revisar" element={<RevisarProducto />} />
          <Route path="/alimentos/:id" element={<EditarProducto />} />
          <Route path="/estadisticas" element={<Estadisticas />} />
          <Route path="/asistente" element={<Asistente />} />
          <Route path="/ajustes" element={<Ajustes />} />
          <Route path="*" element={<Navigate to="/hoy" replace />} />
        </Routes>
        <Navegacion />
      </div>
    </HashRouter>
  )
}
