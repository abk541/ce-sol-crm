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
        position="top-center"
        gutter={10}
        containerStyle={{ top: 24, zIndex: 9999 }}
        toastOptions={{
          duration: 6000,
          style: {
            background: '#0A1D2B',
            color: '#F8FBF7',
            border: '1px solid rgba(215,190,122,0.28)',
            boxShadow: '0 22px 60px rgba(0,0,0,0.45), 0 2px 10px rgba(184,145,78,0.18)',
            borderRadius: '12px',
            fontSize: '15px',
            fontWeight: 500,
            lineHeight: '1.45',
            padding: '14px 18px',
            minWidth: '320px',
            maxWidth: '560px',
          },
          success: {
            duration: 5000,
            iconTheme: { primary: '#1F7A78', secondary: '#FFFFFF' },
          },
          error: {
            duration: 8000,
            iconTheme: { primary: '#EF4444', secondary: '#FFFFFF' },
            style: {
              background: '#3B0D0D',
              color: '#FEE2E2',
              border: '1px solid rgba(239,68,68,0.55)',
            },
          },
        }}
      />
    </div>
  )
}
