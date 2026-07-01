import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Loader, ShieldCheck, KeyRound } from 'lucide-react'
import { useStore } from '../../store/useStore'
import CompanyLogo from '../../components/shared/CompanyLogo'

export default function MfaVerifyPage() {
  const navigate = useNavigate()
  const pendingMfaUserId = useStore(s => s.pendingMfaUserId)
  const pendingMfaMode   = useStore(s => s.pendingMfaMode)
  const currentUser      = useStore(s => s.currentUser)
  const verifyMfaCode    = useStore(s => s.verifyMfaCode)
  const useRecoveryCode  = useStore(s => s.useRecoveryCode)
  const cancelPendingMfa = useStore(s => s.cancelPendingMfa)

  const [mode, setMode] = useState<'code' | 'recovery'>('code')
  const [code, setCode] = useState('')
  const [recovery, setRecovery] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const wrongGate = !pendingMfaUserId || pendingMfaMode !== 'verify'
  const emailHint = useMemo(() => currentUser?.email ?? '', [currentUser])

  if (wrongGate) {
    // A user who navigates directly to /mfa-verify without a pending gate
    // should be bounced back to the login screen. This is a safety net —
    // App.tsx's guard should catch this first.
    return (
      <BareShell>
        <div className="text-slate-300 text-sm">This screen is only available during sign-in.</div>
        <button onClick={() => navigate('/login')} className="btn-primary w-full justify-center mt-4">
          Back to sign in
        </button>
      </BareShell>
    )
  }

  const handleTotp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const cleaned = code.replace(/[\s-]/g, '')
    if (!/^\d{6}$/.test(cleaned)) { setError('Enter the 6-digit code from your authenticator.'); return }
    setLoading(true)
    const result = verifyMfaCode(cleaned)
    setLoading(false)
    if (!result.ok) { setError(result.error ?? 'Verification failed.'); return }
    navigate('/access-notice')
  }

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await useRecoveryCode(recovery)
    setLoading(false)
    if (!result.ok) { setError(result.error ?? 'Verification failed.'); return }
    navigate('/access-notice')
  }

  const handleCancel = () => {
    cancelPendingMfa()
    navigate('/login')
  }

  return (
    <BareShell>
      <div className="flex flex-col items-center mb-6">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
          style={{ background: 'linear-gradient(135deg,#1F7A78,#0A5F60)', boxShadow: '0 0 32px rgba(31,122,120,0.35)' }}>
          <ShieldCheck size={20} className="text-white" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">Two-factor authentication</h1>
        <p className="text-slate-500 text-xs mt-1 text-center">
          Enter the 6-digit code from your authenticator app for{' '}
          <span className="text-slate-300">{emailHint}</span>.
        </p>
      </div>

      {mode === 'code' ? (
        <form onSubmit={handleTotp} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Authentication code</label>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={e => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
              className="input-field text-center tracking-[0.6em] text-lg"
              placeholder="000000"
              maxLength={6}
              required
            />
          </div>

          {error && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="text-rose-400 text-xs bg-rose-400/10 border border-rose-400/20 rounded-lg px-3 py-2">
              {error}
            </motion.p>
          )}

          <button type="submit" disabled={loading || code.length !== 6} className="btn-primary w-full justify-center mt-2">
            {loading ? <Loader size={14} className="animate-spin" /> : <ArrowRight size={14} />}
            {loading ? 'Verifying…' : 'Verify'}
          </button>

          <button type="button" onClick={() => { setMode('recovery'); setError('') }}
            className="w-full text-center text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-center gap-1.5 mt-2">
            <KeyRound size={12} /> Use a recovery code instead
          </button>
        </form>
      ) : (
        <form onSubmit={handleRecovery} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Recovery code</label>
            <input
              type="text"
              autoFocus
              value={recovery}
              onChange={e => setRecovery(e.target.value.toUpperCase().slice(0, 20))}
              className="input-field text-center tracking-[0.35em] text-base"
              placeholder="XXXX-XXXX"
              required
            />
            <p className="text-[11px] text-slate-500 mt-1.5">
              Each recovery code can only be used once. Save your remaining codes somewhere safe.
            </p>
          </div>

          {error && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="text-rose-400 text-xs bg-rose-400/10 border border-rose-400/20 rounded-lg px-3 py-2">
              {error}
            </motion.p>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-2">
            {loading ? <Loader size={14} className="animate-spin" /> : <ArrowRight size={14} />}
            {loading ? 'Verifying…' : 'Use recovery code'}
          </button>

          <button type="button" onClick={() => { setMode('code'); setError('') }}
            className="w-full text-center text-xs text-slate-400 hover:text-slate-200 transition-colors mt-2">
            ← Back to authenticator code
          </button>
        </form>
      )}

      <button type="button" onClick={handleCancel}
        className="w-full text-center text-[11px] text-slate-500 hover:text-slate-300 transition-colors mt-6">
        Sign in with a different account
      </button>
    </BareShell>
  )
}

// Shared auth-screen chrome so the enroll + verify pages match the login page.
function BareShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #07131F 0%, #0A1D2B 48%, #102820 100%)' }}
    >
      <div className="absolute inset-0 opacity-40"
        style={{ background: 'linear-gradient(180deg, rgba(215,190,122,0.10) 0%, transparent 38%, rgba(31,122,120,0.10) 100%)' }} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md px-4"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4"><CompanyLogo variant="full" height={52} /></div>
          <p className="text-stone-300 text-sm mt-2">Government Contractor Intelligence Platform</p>
        </div>

        <div className="p-px rounded-2xl" style={{ background: 'linear-gradient(135deg, rgba(215,190,122,0.70), rgba(31,122,120,0.45))', boxShadow: '0 24px 80px rgba(0,0,0,0.46)' }}>
          <div className="rounded-2xl p-8" style={{ background: 'linear-gradient(180deg, rgba(16,40,32,0.96), rgba(10,29,43,0.98))' }}>
            {children}
          </div>
        </div>

        <p className="text-center text-xs text-stone-300 mt-6">CE Solution Plus CRM v2.4.1</p>
      </motion.div>
    </div>
  )
}
