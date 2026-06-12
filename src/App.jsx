import { useState } from 'react'
import './App.css'
import Dashboard from './pages/Dashboard'
import Diagnosa  from './pages/Diagnosa'
import Grafik    from './pages/Grafik'

// Ripple effect hook untuk tombol nav
function useRipple() {
  const createRipple = (e) => {
    const btn = e.currentTarget
    const circle = document.createElement('span')
    const diameter = Math.max(btn.clientWidth, btn.clientHeight)
    const radius = diameter / 2
    const rect = btn.getBoundingClientRect()
    circle.style.width = circle.style.height = `${diameter}px`
    circle.style.left = `${e.clientX - rect.left - radius}px`
    circle.style.top = `${e.clientY - rect.top - radius}px`
    circle.classList.add('ripple')
    const existing = btn.querySelector('.ripple')
    if (existing) existing.remove()
    btn.appendChild(circle)
  }
  return createRipple
}

function App() {
  const [activePage, setActivePage]   = useState('dashboard')
  const [prevPage, setPrevPage]       = useState(null)
  const [animating, setAnimating]     = useState(false)
  const [slideDir, setSlideDir]       = useState('left')
  const [diagnosData, setDiagnosData] = useState(null) // ← shared state Diagnosa → Grafik
  const createRipple = useRipple()

  const pageOrder = ['diagnosa', 'dashboard', 'grafik']

  const navigateTo = (page, e) => {
    if (page === activePage || animating) return
    createRipple(e)

    const currentIdx = pageOrder.indexOf(activePage)
    const nextIdx    = pageOrder.indexOf(page)
    setSlideDir(nextIdx > currentIdx ? 'left' : 'right')

    setPrevPage(activePage)
    setAnimating(true)
    setActivePage(page)

    setTimeout(() => {
      setAnimating(false)
      setPrevPage(null)
    }, 420)
  }

  const renderPage = (page) => {
    switch (page) {
      case 'dashboard': return <Dashboard />
      case 'diagnosa':  return <Diagnosa  onSimpan={setDiagnosData} />
      case 'grafik':    return <Grafik    diagnosData={diagnosData} />
      default:          return <Dashboard />
    }
  }

  const navItems = [
    {
      id: 'diagnosa',
      label: <span>Diagnosa<br />Motor</span>,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      )
    },
    {
      id: 'dashboard',
      label: <span>Dashboard</span>,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      )
    },
    {
      id: 'grafik',
      label: <span>Analisa</span>,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      )
    }
  ]

  return (
    <div className="app-wrapper">

      {/* Page transition container */}
      <div className="page-content">

        {/* Halaman sebelumnya (exit animation) */}
        {animating && prevPage && (
          <div className={`page-layer page-exit page-exit-${slideDir}`}>
            {renderPage(prevPage)}
          </div>
        )}

        {/* Halaman aktif (enter animation) */}
        <div className={`page-layer ${animating ? `page-enter page-enter-${slideDir}` : 'page-idle'}`}>
          {renderPage(activePage)}
        </div>

      </div>

      {/* Bottom Navigation */}
      <div className="bottom-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activePage === item.id ? 'nav-active' : ''}`}
            onClick={(e) => navigateTo(item.id, e)}
          >
            <div className="nav-icon">
              {item.icon}
              {activePage === item.id && <span className="nav-glow" />}
            </div>
            {item.label}
          </button>
        ))}
      </div>

    </div>
  )
}

export default App