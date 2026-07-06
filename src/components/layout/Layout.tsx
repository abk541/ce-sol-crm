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
            background: 'var(--bg-modal)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-strong)',
            boxShadow: 'var(--shadow-modal)',
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
            iconTheme: { primary: 'var(--accent-2)', secondary: '#FFFFFF' },
          },
          error: {
            duration: 8000,
            iconTheme: { primary: 'var(--error-fg)', secondary: '#FFFFFF' },
            style: {
              background: 'color-mix(in srgb, var(--error-fg) 16%, var(--bg-modal))',
              color: 'var(--text-primary)',
              border: '1px solid color-mix(in srgb, var(--error-fg) 50%, transparent)',
            },
          },
        }}
      />
    </div>
  )
}
