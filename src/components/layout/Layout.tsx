import { Outlet } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <Sidebar />

      <div className="app-shell flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#0A1D2B',
            color: '#F8FBF7',
            border: '1px solid rgba(215,190,122,0.18)',
            boxShadow: '0 18px 44px rgba(0,0,0,0.34), 0 2px 10px rgba(184,145,78,0.12)',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 500,
          },
          success: { iconTheme: { primary: '#1F7A78', secondary: '#FFFFFF' } },
          error:   { iconTheme: { primary: '#EF4444', secondary: '#FFFFFF' } },
        }}
      />
    </div>
  )
}
