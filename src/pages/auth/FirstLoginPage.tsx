import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, Eye, EyeOff, Check, ArrowRight, Loader } from 'lucide-react'
import { useStore } from '../../store/useStore'
import toast from 'react-hot-toast'

const rules = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One number', test: (p: string) => /\d/.test(p) },
  { label: 'One special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
]

export default function FirstLoginPage() {
  const navigate = useNavigate()
  const { completeFirstLogin, currentUser } = useStore()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  const allPassed = rules.every(r => r.test(password))
  const matches = password === confirm && confirm.length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!allPassed || !matches) return
    setLoading(true)
    const ok = await completeFirstLogin(password)
    setLoading(false)
    if (!ok) return
    toast.success('Password set! Setting up your MFA…')
    navigate('/mfa-setup')
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: '#01060F' }}>
      <div className="orb-1" /><div className="orb-2" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.06)_0%,transparent_70%)]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md px-4"
      >
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-4"
            style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', boxShadow: '0 0 40px rgba(99,102,241,0.4)' }}>
            <Lock size={22} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome, {currentUser?.name.split(' ')[0]}!</h1>
          <p className="text-slate-500 text-sm mt-1">Set your password to get started.</p>
        </div>

        <div className="gradient-border p-px rounded-2xl" style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl p-8" style={{ background: 'rgba(7,14,34,0.95)' }}>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">New password</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input-field pl-10 pr-10"
                    placeholder="Create a strong password"
                    required
                  />
                  <button type="button" onClick={() => setShowPass(p => !p)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Rules */}
              {password.length > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-1.5">
                  {rules.map(r => (
                    <div key={r.label} className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-all ${r.test(password) ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-slate-600'}`}>
                        <Check size={9} />
                      </div>
                      <span className={`text-[11px] transition-colors ${r.test(password) ? 'text-emerald-400' : 'text-slate-600'}`}>{r.label}</span>
                    </div>
                  ))}
                </motion.div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Confirm password</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    className={`input-field pl-10 ${confirm.length > 0 ? (matches ? 'border-emerald-500/40' : 'border-rose-500/40') : ''}`}
                    placeholder="Repeat your password"
                  />
                </div>
                {confirm.length > 0 && !matches && (
                  <p className="text-rose-400 text-[11px] mt-1">Passwords don't match</p>
                )}
              </div>

              <button type="submit" disabled={loading || !allPassed || !matches}
                className="btn-primary w-full justify-center mt-2 disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? <Loader size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                {loading ? 'Setting password…' : 'Set Password & Continue'}
              </button>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
