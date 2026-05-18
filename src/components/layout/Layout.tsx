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
            background: '#FBFCF8',
            color: '#10202A',
            border: '1px solid rgba(31,53,66,0.14)',
            boxShadow: '0 14px 34px rgba(7,19,31,0.14), 0 2px 8px rgba(184,145,78,0.10)',
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
