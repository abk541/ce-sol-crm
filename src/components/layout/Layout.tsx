import { Outlet } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F1F5F9' }}>
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
            background: '#FFFFFF',
            color: '#0F172A',
            border: '1px solid rgba(0,0,0,0.10)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 500,
          },
          success: { iconTheme: { primary: '#6366F1', secondary: '#FFFFFF' } },
          error:   { iconTheme: { primary: '#EF4444', secondary: '#FFFFFF' } },
        }}
      />
    </div>
  )
}
