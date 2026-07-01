import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Check, Copy, Download, Loader, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../../store/useStore'
import CompanyLogo from '../../components/shared/CompanyLogo'
import {
  createMfaEnrollment,
  generateRecoveryCodes,
  verifyTotpCode,
  type MfaEnrollment,
} from '../../lib/mfa'

type Step = 'scan' | 'verify' | 'recovery'

export default function MfaEnrollPage() {
  const navigate = useNavigate()
  const pendingMfaUserId  = useStore(s => s.pendingMfaUserId)
  const pendingMfaMode    = useStore(s => s.pendingMfaMode)
  const currentUser       = useStore(s => s.currentUser)
  const completeEnrollment = useStore(s => s.completeMfaEnrollment)
  const cancelPendingMfa  = useStore(s => s.cancelPendingMfa)

  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null)
  const [step, setStep] = useState<Step>('scan')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [recoveryAck, setRecoveryAck] = useState(false)
  const generatedFor = useRef<string | null>(null)

  const wrongGate = !pendingMfaUserId || pendingMfaMode !== 'enroll'
  const emailLabel = useMemo(() => currentUser?.email ?? 'user@cesolutionplus.com', [currentUser])

  // Generate a fresh secret + QR the first time this page mounts for a given
  // user. If the user cancels and comes back later they get a brand new
  // secret — a partially-completed enrollment must never be usable.
  useEffect(() => {
    if (wrongGate) return
    if (generatedFor.current === pendingMfaUserId && enrollment) return
    generatedFor.current = pendingMfaUserId ?? null
    let cancelled = false
    void createMfaEnrollment(emailLabel).then(en => {
      if (!cancelled) setEnrollment(en)
    })
    return () => { cancelled = true }
  }, [wrongGate, pendingMfaUserId, emailLabel, enrollment])

  if (wrongGate) {
    return (
      <BareShell>
        <div className="text-slate-300 text-sm">This screen is only available during sign-in.</div>
        <button onClick={() => navigate('/login')} className="btn-primary w-full justify-center mt-4">
          Back to sign in
        </button>
      </BareShell>
    )
  }

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!enrollment) return
    const cleaned = code.replace(/[\s-]/g, '')
    if (!/^\d{6}$/.test(cleaned)) { setError('Enter the 6-digit code from your authenticator.'); return }
    if (!verifyTotpCode(enrollment.secret, cleaned)) {
      setError('That code is invalid or expired. Try again.')
      return
    }
    // Generate the plaintext recovery codes only once — the user sees them
    // now and never again. They're hashed in the store on commit.
    setRecoveryCodes(generateRecoveryCodes())
    setStep('recovery')
  }

  const handleCommit = async () => {
    if (!enrollment) return
    setLoading(true)
    setError('')
    const result = await completeEnrollment(enrollment.secret, recoveryCodes)
    setLoading(false)
    if (!result.ok) { setError(result.error ?? 'Could not finish enrollment.'); return }
    toast.success('Two-factor authentication enabled.')
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
        <h1 className="text-lg font-semibold text-slate-900">Set up two-factor authentication</h1>
        <p className="text-slate-500 text-xs mt-1 text-center">
          Every account needs a second factor. This takes about a minute.
        </p>
      </div>

      {step === 'scan' && <ScanStep enrollment={enrollment} onContinue={() => setStep('verify')} />}

      {step === 'verify' && enrollment && (
        <form onSubmit={handleVerify} className="space-y-4">
          <p className="text-slate-400 text-xs">
            Enter the 6-digit code your authenticator shows for
            <span className="text-slate-200"> CE Solution Plus CRM</span>.
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Authentication code</label>
            <input
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

          <button type="submit" disabled={code.length !== 6} className="btn-primary w-full justify-center mt-2">
            <ArrowRight size={14} /> Verify code
          </button>
          <button type="button" onClick={() => setStep('scan')}
            className="w-full text-center text-xs text-slate-400 hover:text-slate-200 transition-colors">
            ← Back to QR code
          </button>
        </form>
      )}

      {step === 'recovery' && (
        <RecoveryStep
          codes={recoveryCodes}
          ack={recoveryAck}
          setAck={setRecoveryAck}
          loading={loading}
          error={error}
          onCommit={handleCommit}
          accountLabel={emailLabel}
        />
      )}

      <button type="button" onClick={handleCancel}
        className="w-full text-center text-[11px] text-slate-500 hover:text-slate-300 transition-colors mt-6">
        Cancel and sign out
      </button>
    </BareShell>
  )
}

// ── Step: scan ────────────────────────────────────────────────────────────

function ScanStep({ enrollment, onContinue }: { enrollment: MfaEnrollment | null; onContinue: () => void }) {
  const [secretCopied, setSecretCopied] = useState(false)

  const copySecret = async () => {
    if (!enrollment) return
    try {
      await navigator.clipboard.writeText(enrollment.secret)
      setSecretCopied(true)
      setTimeout(() => setSecretCopied(false), 1400)
    } catch { /* clipboard blocked — user can still type the secret */ }
  }

  if (!enrollment) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <Loader size={20} className="animate-spin text-slate-400" />
        <p className="text-slate-400 text-xs">Generating your secure key…</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside">
        <li>Open your authenticator app (Authy, Google Authenticator, 1Password, etc.).</li>
        <li>Add a new account by scanning the QR code below.</li>
        <li>Continue to the next step to verify the code your app shows.</li>
      </ol>

      <div className="flex justify-center">
        <div className="rounded-xl p-2" style={{ background: '#ffffff' }}>
          <img src={enrollment.qrDataUrl} width={200} height={200} alt="Two-factor QR code" />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-slate-400 mb-1">Can't scan? Enter this key manually</label>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-slate-200 text-xs font-mono bg-slate-900/40 border border-slate-700/60 rounded-lg px-3 py-2 tracking-wider select-all break-all">
            {enrollment.secret}
          </code>
          <button
            type="button"
            onClick={copySecret}
            className="shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            {secretCopied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
          </button>
        </div>
      </div>

      <button type="button" onClick={onContinue} className="btn-primary w-full justify-center mt-2">
        <ArrowRight size={14} /> I've added the account
      </button>
    </div>
  )
}

// ── Step: recovery codes ──────────────────────────────────────────────────

function RecoveryStep({
  codes, ack, setAck, loading, error, onCommit, accountLabel,
}: {
  codes: string[]
  ack: boolean
  setAck: (v: boolean) => void
  loading: boolean
  error: string
  onCommit: () => void
  accountLabel: string
}) {
  const [copied, setCopied] = useState(false)

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch { /* clipboard blocked */ }
  }

  const downloadTxt = () => {
    const body = [
      'CE Solution Plus CRM — Recovery Codes',
      `Account: ${accountLabel}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      'Each code can be used ONCE if you lose access to your authenticator app.',
      'Keep them somewhere safe (password manager, printed, encrypted file).',
      '',
      ...codes,
      '',
    ].join('\n')
    const blob = new Blob([body], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ce-crm-recovery-codes.txt'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
        <p className="text-amber-200 text-xs leading-relaxed">
          Save these 10 codes now — this is the <strong>only time</strong> they will be shown. Each can be used
          once to sign in if you lose your authenticator device.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 font-mono text-sm text-slate-100 bg-slate-900/40 border border-slate-700/60 rounded-lg p-3">
        {codes.map(c => (
          <div key={c} className="tracking-wider select-all text-center py-1">{c}</div>
        ))}
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={copyAll}
          className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors">
          {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy all</>}
        </button>
        <button type="button" onClick={downloadTxt}
          className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors">
          <Download size={12} /> Download .txt
        </button>
      </div>

      <label className="flex items-start gap-2 text-xs text-slate-300 select-none cursor-pointer">
        <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)}
          className="mt-0.5 accent-emerald-500" />
        <span>I have saved these recovery codes somewhere safe.</span>
      </label>

      {error && (
        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className="text-rose-400 text-xs bg-rose-400/10 border border-rose-400/20 rounded-lg px-3 py-2">
          {error}
        </motion.p>
      )}

      <button type="button" onClick={onCommit} disabled={!ack || loading}
        className="btn-primary w-full justify-center mt-2">
        {loading ? <Loader size={14} className="animate-spin" /> : <ArrowRight size={14} />}
        {loading ? 'Finishing setup…' : 'Finish and continue'}
      </button>
    </div>
  )
}

// ── Shell ─────────────────────────────────────────────────────────────────

function BareShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden py-8"
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
        <div className="flex flex-col items-center mb-6">
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
