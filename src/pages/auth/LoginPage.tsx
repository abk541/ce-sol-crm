import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, ShieldCheck, ArrowRight, Loader } from 'lucide-react'
import { useStore } from '../../store/useStore'
import CompanyLogo from '../../components/shared/CompanyLogo'
import toast from 'react-hot-toast'

type Step = 'credentials' | 'mfa'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, completeMFASetup, needsFirstLogin, needsMFASetup } = useStore()

  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    await new Promise(r => setTimeout(r, 800))

    const result = login(email, password)
    setLoading(false)

    if (!result.ok) { setError(result.error!); return }
    if (result.needsFirst) { navigate('/first-login'); return }
    if (result.needsMFA) { navigate('/mfa-setup'); return }
    setStep('mfa')
  }

  const handleMFA = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mfaCode.length !== 6) { setError('Enter the 6-digit code from your authenticator app.'); return }
    setLoading(true)
    await new Promise(r => setTimeout(r, 600))
    setLoading(false)
    toast.success('Welcome back!')
    navigate('/dashboard')
  }

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
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring' }}
            className="mb-4"
          >
            <CompanyLogo variant="full" height={52} />
          </motion.div>
          <p className="text-stone-300 text-sm mt-2">Government Contractor Intelligence Platform</p>
        </div>

        <div className="p-px rounded-2xl" style={{ background: 'linear-gradient(135deg, rgba(215,190,122,0.70), rgba(31,122,120,0.45))', boxShadow: '0 24px 80px rgba(0,0,0,0.46)' }}>
          <div className="rounded-2xl p-8" style={{ background: 'rgba(251,252,248,0.98)' }}>
            <AnimatePresence mode="wait">
              {step === 'credentials' ? (
                <motion.div key="creds"
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }}
                >
                  <h2 className="text-lg font-semibold text-slate-900 mb-1">Sign in</h2>
                  <p className="text-slate-500 text-sm mb-6">Use your work email to access the platform.</p>

                  <form onSubmit={handleCredentials} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">Email address</label>
                      <div className="relative">
                        <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="email"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          className="input-field pl-10"
                          placeholder="you@cesolutionplus.com"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
                      <div className="relative">
                        <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type={showPass ? 'text' : 'password'}
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          className="input-field pl-10 pr-10"
                          placeholder="••••••••"
                          required
                        />
                        <button type="button" onClick={() => setShowPass(p => !p)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                          {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>

                    {error && (
                      <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                        className="text-rose-400 text-xs bg-rose-400/10 border border-rose-400/20 rounded-lg px-3 py-2">
                        {error}
                      </motion.p>
                    )}

                    <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-2">
                      {loading ? <Loader size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                      {loading ? 'Signing in…' : 'Continue'}
                    </button>
                  </form>

                  <div className="mt-6 p-3 rounded-xl" style={{ border: '1px solid rgba(184,145,78,0.24)', background: 'rgba(184,145,78,0.08)' }}>
                    <p className="text-[11px] text-slate-500 font-medium mb-1">Demo credentials</p>
                    <p className="text-[11px]" style={{ color: '#0F4F59' }}>abk@cesolutionplus.com - abk123</p>
                    <p className="text-[11px] text-slate-500">Then enter any 6 digits for MFA</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="mfa"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
                      <ShieldCheck size={18} className="text-indigo-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">Two-factor auth</h2>
                      <p className="text-slate-500 text-sm">Open your authenticator app</p>
                    </div>
                  </div>

                  <form onSubmit={handleMFA} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">6-digit code</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={mfaCode}
                        onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="input-field text-center text-xl font-mono tracking-[0.5em] py-4"
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

                    <button type="submit" disabled={loading || mfaCode.length !== 6}
                      className="btn-primary w-full justify-center">
                      {loading ? <Loader size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                      {loading ? 'Verifying…' : 'Verify & Sign in'}
                    </button>

                    <button type="button" onClick={() => { setStep('credentials'); setError('') }}
                      className="btn-ghost w-full justify-center text-slate-500">
                      ← Back to credentials
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <p className="text-center text-xs text-stone-300 mt-6">
          CE Solution Plus CRM v2.4.1 - Protected by MFA
        </p>
      </motion.div>
    </div>
  )
}
