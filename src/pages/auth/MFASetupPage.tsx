import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldCheck, Check, Loader, Smartphone } from 'lucide-react'
import { useStore } from '../../store/useStore'
import toast from 'react-hot-toast'

const FAKE_QR = `data:image/svg+xml,${encodeURIComponent(`
<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" fill="#0B1530"/>
  <g fill="#6366F1" opacity="0.9">
    ${Array.from({ length: 20 }, (_, r) =>
      Array.from({ length: 20 }, (_, c) =>
        Math.random() > 0.5 ? `<rect x="${c * 9 + 5}" y="${r * 9 + 5}" width="8" height="8" rx="1"/>` : ''
      ).join('')
    ).join('')}
  </g>
  <rect x="5" y="5" width="38" height="38" rx="3" fill="none" stroke="#6366F1" stroke-width="4"/>
  <rect x="157" y="5" width="38" height="38" rx="3" fill="none" stroke="#6366F1" stroke-width="4"/>
  <rect x="5" y="157" width="38" height="38" rx="3" fill="none" stroke="#6366F1" stroke-width="4"/>
  <rect x="14" y="14" width="20" height="20" rx="2" fill="#6366F1"/>
  <rect x="166" y="14" width="20" height="20" rx="2" fill="#6366F1"/>
  <rect x="14" y="166" width="20" height="20" rx="2" fill="#6366F1"/>
  <text x="100" y="105" text-anchor="middle" fill="#22D3EE" font-size="9" font-family="monospace">NEXUS ERP MFA</text>
</svg>`)}`

export default function MFASetupPage() {
  const navigate = useNavigate()
  const { completeMFASetup, currentUser } = useStore()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const SECRET = 'NEXS-ABCD-1234-WXYZ'

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length !== 6) { setError('Enter the 6-digit code from your app.'); return }
    setLoading(true)
    await new Promise(r => setTimeout(r, 700))
    setLoading(false)
    completeMFASetup()
    toast.success('MFA enabled! You\'re all set.')
    navigate('/dashboard')
  }

  const steps = [
    'Download Google Authenticator or Authy on your phone.',
    'Tap the "+" button and scan the QR code below.',
    'Enter the 6-digit code shown in the app.',
  ]

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: '#01060F' }}>
      <div className="orb-1" /><div className="orb-2" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.06)_0%,transparent_70%)]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-lg px-4"
      >
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-4"
            style={{ background: 'linear-gradient(135deg,#22D3EE,#6366F1)', boxShadow: '0 0 40px rgba(34,211,238,0.35)' }}>
            <ShieldCheck size={22} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Set up two-factor auth</h1>
          <p className="text-slate-500 text-sm mt-1">Secure your account with an authenticator app.</p>
        </div>

        <div className="gradient-border p-px rounded-2xl" style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl p-8" style={{ background: 'rgba(7,14,34,0.95)' }}>
            {/* Steps */}
            <div className="space-y-3 mb-6">
              {steps.map((s, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5"
                    style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}>
                    {i + 1}
                  </div>
                  <p className="text-sm text-slate-400">{s}</p>
                </div>
              ))}
            </div>

            {/* QR */}
            <div className="flex flex-col items-center gap-4 mb-6">
              <div className="p-3 rounded-2xl" style={{ background: 'rgba(11,21,48,0.8)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <img src={FAKE_QR} alt="MFA QR Code" width={160} height={160} className="rounded-lg" />
              </div>

              <div className="text-center">
                <p className="text-xs text-slate-600 mb-1 flex items-center gap-1.5 justify-center">
                  <Smartphone size={11} /> Manual entry key
                </p>
                <p className="font-mono text-sm text-indigo-400 tracking-widest bg-indigo-500/10 px-4 py-2 rounded-lg border border-indigo-500/20">
                  {SECRET}
                </p>
              </div>
            </div>

            {/* Code input */}
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Verification code</label>
                <input
                  type="text" inputMode="numeric"
                  value={code}
                  onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
                  className="input-field text-center text-2xl font-mono tracking-[0.6em] py-4"
                  placeholder="000000"
                  maxLength={6}
                />
              </div>

              {error && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="text-rose-400 text-xs bg-rose-400/10 border border-rose-400/20 rounded-lg px-3 py-2">
                  {error}
                </motion.p>
              )}

              <button type="submit" disabled={loading || code.length !== 6}
                className="btn-primary w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
                {loading ? 'Verifying…' : 'Enable Two-Factor Auth'}
              </button>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
