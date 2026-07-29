import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Check, Copy, Download, Loader, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../../store/useStore'
import CompanyLogo from '../../components/shared/CompanyLogo'
import {
  renderMfaEnrollment,
  type MfaEnrollment,
} from '../../lib/mfa'

type Step = 'scan' | 'verify' | 'recovery'
const RECOVERY_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}(?:-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}){3}$/

function hasCompleteRecoveryBundle(codes: string[]): boolean {
  return codes.length === 10
    && codes.every(code => RECOVERY_CODE_PATTERN.test(code))
    && new Set(codes).size === 10
}

export default function MfaEnrollPage() {
  const navigate = useNavigate()
  const pendingMfaUserId  = useStore(s => s.pendingMfaUserId)
  const pendingMfaMode    = useStore(s => s.pendingMfaMode)
  const pendingRecoveryCodes = useStore(s => s.pendingMfaRecoveryCodes)
  const currentUser       = useStore(s => s.currentUser)
  const startEnrollment   = useStore(s => s.startMfaEnrollment)
  const completeEnrollment = useStore(s => s.completeMfaEnrollment)
  const restoreRecoveryCodes = useStore(s => s.restoreMfaRecoveryCodes)
  const acknowledgeRecoveryCodes = useStore(s => s.acknowledgeMfaRecoveryCodes)
  const cancelPendingMfa  = useStore(s => s.cancelPendingMfa)

  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null)
  const [step, setStep] = useState<Step>(pendingMfaMode === 'recovery' ? 'recovery' : 'scan')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>(pendingRecoveryCodes)
  const [recoveryAck, setRecoveryAck] = useState(false)
  const [loadNonce, setLoadNonce] = useState(0)
  const [canceling, setCanceling] = useState(false)

  const wrongGate = !pendingMfaUserId || !['enroll', 'recovery'].includes(pendingMfaMode ?? '')
  const emailLabel = useMemo(() => currentUser?.email ?? 'user@cesolutionplus.com', [currentUser])

  // Fetch only server-issued enrollment material. The browser renders the QR
  // but never generates or verifies a TOTP secret.
  useEffect(() => {
    if (wrongGate) return
    let cancelled = false
    setError('')
    if (pendingMfaMode === 'recovery') {
      setStep('recovery')
      setRecoveryAck(false)
      if (hasCompleteRecoveryBundle(pendingRecoveryCodes)) {
        setRecoveryCodes(pendingRecoveryCodes)
        setLoading(false)
        return () => { cancelled = true }
      }
      setRecoveryCodes([])
      setLoading(true)
      void restoreRecoveryCodes().then(result => {
        if (cancelled) return
        if (!result.ok) setError(result.error ?? 'Recovery codes could not be restored.')
        else setRecoveryCodes(result.recoveryCodes ?? [])
      }).finally(() => {
        if (!cancelled) setLoading(false)
      })
    } else {
      setLoading(true)
      setEnrollment(null)
      void startEnrollment().then(async result => {
        if (cancelled) return
        if (!result.ok || !result.enrollment) {
          setError(result.error ?? 'Authenticator enrollment could not be started.')
          return
        }
        try {
          const rendered = await renderMfaEnrollment(result.enrollment)
          if (!cancelled) setEnrollment(rendered)
        } catch {
          if (!cancelled) setError('The authenticator QR code could not be prepared. Please retry.')
        }
      }).finally(() => {
        if (!cancelled) setLoading(false)
      })
    }
    return () => { cancelled = true }
  }, [
    loadNonce,
    pendingMfaMode,
    pendingMfaUserId,
    pendingRecoveryCodes,
    restoreRecoveryCodes,
    startEnrollment,
    wrongGate,
  ])

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

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!enrollment) return
    const cleaned = code.replace(/[\s-]/g, '')
    if (!/^\d{6}$/.test(cleaned)) { setError('Enter the 6-digit code from your authenticator.'); return }
    setLoading(true)
    const result = await completeEnrollment(cleaned)
    setLoading(false)
    if (!result.ok) {
      setError(result.error ?? 'That code is invalid or expired. Try again.')
      return
    }
    // Recovery codes are created and protected by the server. The browser
    // only displays the complete short-lived setup response.
    const returnedCodes = result.recoveryCodes ?? []
    if (!hasCompleteRecoveryBundle(returnedCodes)) {
      setError('Enrollment succeeded. Reloading the complete recovery-code set now.')
      setStep('recovery')
      return
    }
    setRecoveryCodes(returnedCodes)
    setStep('recovery')
  }

  const handleCommit = async () => {
    if (!recoveryAck || !hasCompleteRecoveryBundle(recoveryCodes)) {
      setError('Load and save all 10 recovery codes before finishing setup.')
      return
    }
    setLoading(true)
    setError('')
    const result = await acknowledgeRecoveryCodes()
    setLoading(false)
    if (!result.ok) { setError(result.error ?? 'Could not finish enrollment.'); return }
    toast.success('Two-factor authentication enabled.')
    navigate('/access-notice')
  }

  const handleRetry = () => {
    setError('')
    setRecoveryAck(false)
    setLoadNonce(value => value + 1)
  }

  const handleCancel = async () => {
    if (canceling) return
    setCanceling(true)
    try {
      await cancelPendingMfa()
    } finally {
      navigate('/login')
    }
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

      {step === 'scan' && (
        <ScanStep
          enrollment={enrollment}
          error={error}
          loading={loading}
          onRetry={handleRetry}
          onContinue={() => setStep('verify')}
        />
      )}

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

          <button type="submit" disabled={loading || code.length !== 6} className="btn-primary w-full justify-center mt-2">
            {loading ? <Loader size={14} className="animate-spin" /> : <ArrowRight size={14} />}
            {loading ? 'Verifying…' : 'Verify code'}
          </button>
          <button type="button" onClick={() => setStep('scan')} disabled={loading}
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
          onRetry={handleRetry}
          accountLabel={emailLabel}
        />
      )}

      <button type="button" onClick={() => { void handleCancel() }} disabled={canceling || loading}
        className="w-full text-center text-[11px] text-slate-500 hover:text-slate-300 transition-colors mt-6">
        {canceling ? 'Signing out…' : 'Cancel and sign out'}
      </button>
    </BareShell>
  )
}

// ── Step: scan ────────────────────────────────────────────────────────────

function ScanStep({
  enrollment,
  error,
  loading,
  onRetry,
  onContinue,
}: {
  enrollment: MfaEnrollment | null
  error: string
  loading: boolean
  onRetry: () => void
  onContinue: () => void
}) {
  const [secretCopied, setSecretCopied] = useState(false)

  const copySecret = async () => {
    if (!enrollment) return
    try {
      await navigator.clipboard.writeText(enrollment.manualKey)
      setSecretCopied(true)
      setTimeout(() => setSecretCopied(false), 1400)
    } catch { /* clipboard blocked — user can still type the secret */ }
  }

  if (!enrollment) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        {loading ? (
          <>
            <Loader size={20} className="animate-spin text-slate-400" />
            <p className="text-slate-400 text-xs">Preparing your authenticator setup…</p>
          </>
        ) : (
          <>
            <p className="text-rose-400 text-xs text-center">
              {error || 'Authenticator setup could not be loaded.'}
            </p>
            <button type="button" onClick={onRetry} className="btn-primary justify-center">
              Retry
            </button>
          </>
        )}
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
            {enrollment.manualKey}
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
  codes, ack, setAck, loading, error, onCommit, onRetry, accountLabel,
}: {
  codes: string[]
  ack: boolean
  setAck: (v: boolean) => void
  loading: boolean
  error: string
  onCommit: () => void
  onRetry: () => void
  accountLabel: string
}) {
  const [copied, setCopied] = useState(false)
  const completeBundle = hasCompleteRecoveryBundle(codes)

  const copyAll = async () => {
    if (!completeBundle) return
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch { /* clipboard blocked */ }
  }

  const downloadTxt = () => {
    if (!completeBundle) return
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
          Save all 10 codes before finishing setup. You can reload them while this setup screen is active,
          but after you finish each code can only be used once.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 font-mono text-sm text-slate-100 bg-slate-900/40 border border-slate-700/60 rounded-lg p-3">
        {completeBundle ? codes.map(c => (
          <div key={c} className="tracking-wider select-all text-center py-1">{c}</div>
        )) : (
          <div className="col-span-2 py-5 text-center text-xs font-sans text-slate-400">
            {loading ? 'Loading recovery codes…' : 'The complete recovery-code set is unavailable.'}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={copyAll} disabled={!completeBundle}
          className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors">
          {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy all</>}
        </button>
        <button type="button" onClick={downloadTxt} disabled={!completeBundle}
          className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors">
          <Download size={12} /> Download .txt
        </button>
      </div>

      <label className="flex items-start gap-2 text-xs text-slate-300 select-none cursor-pointer">
        <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)}
          disabled={!completeBundle}
          className="mt-0.5 accent-emerald-500" />
        <span>I have saved these recovery codes somewhere safe.</span>
      </label>

      {error && (
        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className="text-rose-400 text-xs bg-rose-400/10 border border-rose-400/20 rounded-lg px-3 py-2">
          {error}
        </motion.p>
      )}

      {!completeBundle && !loading && (
        <button type="button" onClick={onRetry}
          className="w-full text-center text-xs text-slate-300 hover:text-white transition-colors">
          Retry loading recovery codes
        </button>
      )}

      <button type="button" onClick={onCommit} disabled={!ack || !completeBundle || loading}
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
