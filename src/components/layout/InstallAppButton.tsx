import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export default function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    if (standalone) return

    const capturePrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    const clearPrompt = () => setInstallPrompt(null)

    window.addEventListener('beforeinstallprompt', capturePrompt)
    window.addEventListener('appinstalled', clearPrompt)
    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt)
      window.removeEventListener('appinstalled', clearPrompt)
    }
  }, [])

  if (!installPrompt) return null

  return (
    <button
      type="button"
      onClick={async () => {
        await installPrompt.prompt()
        await installPrompt.userChoice
        setInstallPrompt(null)
      }}
      className="flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold transition-colors"
      style={{
        borderColor: 'var(--border-default)',
        background: 'var(--exec-panel-soft)',
        color: 'var(--text-secondary)',
      }}
      aria-label="Install CE ERP on this device"
      title="Install CE ERP"
    >
      <Download size={14} />
      <span className="hidden xl:inline">Install app</span>
    </button>
  )
}
