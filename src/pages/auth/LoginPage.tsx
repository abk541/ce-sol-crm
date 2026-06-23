import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader } from 'lucide-react'
import { useStore } from '../../store/useStore'
import CompanyLogo from '../../components/shared/CompanyLogo'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    await new Promise(r => setTimeout(r, 400))

    const result = login(email, password)
    setLoading(false)

    if (!result.ok) { setError(result.error!); return }
    navigate('/access-notice')
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
          <div className="rounded-2xl p-8" style={{ background: 'linear-gradient(180deg, rgba(16,40,32,0.96), rgba(10,29,43,0.98))' }}>
            <motion.div
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
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
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>
              </form>

              <div className="mt-6 p-3 rounded-xl" style={{ border: '1px solid rgba(184,145,78,0.24)', background: 'rgba(184,145,78,0.08)' }}>
                <p className="text-[11px] text-slate-500 font-medium mb-1">Demo credentials</p>
                <p className="text-[11px]" style={{ color: '#D7BE7A' }}>abk@cesolutionplus.com - abk123</p>
              </div>
            </motion.div>
          </div>
        </div>

        <p className="text-center text-xs text-stone-300 mt-6">
          CE Solution Plus CRM v2.4.1
        </p>
      </motion.div>
    </div>
  )
}
