import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, CheckSquare, LockKeyhole, Mail, ShieldAlert } from 'lucide-react'
import CompanyLogo from '../../components/shared/CompanyLogo'
import { useStore } from '../../store/useStore'

export default function AccessNoticePage() {
  const navigate = useNavigate()
  const acceptAccessNotice = useStore(s => s.acceptAccessNotice)
  const [confirmed, setConfirmed] = useState(false)

  const handleAccept = () => {
    if (!confirmed) return
    acceptAccessNotice()
    navigate('/login', { replace: true })
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8"
      style={{ background: 'linear-gradient(135deg, #050A12 0%, #07131F 44%, #102820 100%)' }}
    >
      <div
        className="absolute inset-0 opacity-80"
        style={{
          background:
            'radial-gradient(circle at 18% 12%, rgba(239,68,68,0.18), transparent 28%), radial-gradient(circle at 82% 82%, rgba(215,190,122,0.14), transparent 30%), linear-gradient(180deg, rgba(215,190,122,0.08), transparent 42%)',
        }}
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-400 to-transparent" />

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-4xl"
      >
        <div className="mb-6 flex justify-center">
          <CompanyLogo variant="full" height={50} />
        </div>

        <div
          className="rounded-3xl p-px"
          style={{
            background: 'linear-gradient(135deg, rgba(248,113,113,0.92), rgba(215,190,122,0.45), rgba(31,122,120,0.36))',
            boxShadow: '0 26px 90px rgba(0,0,0,0.56), 0 0 46px rgba(248,113,113,0.10)',
          }}
        >
          <div
            className="rounded-3xl p-6 sm:p-8"
            style={{ background: 'linear-gradient(180deg, rgba(11,18,27,0.98), rgba(7,19,31,0.98))' }}
          >
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.28em] text-red-300">Controlled Access Warning</p>
                <h1 className="text-3xl font-black tracking-tight text-stone-50 sm:text-4xl">
                  Authorized Platform Access Only
                </h1>
              </div>
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-red-400/35 bg-red-400/12 text-red-300">
                <ShieldAlert size={22} />
              </div>
            </div>

            <div className="rounded-2xl border border-red-400/24 bg-red-950/28 p-5">
              <div className="flex gap-4">
                <AlertTriangle size={22} className="mt-0.5 flex-shrink-0 text-red-300" />
                <p className="text-sm font-semibold leading-7 text-stone-100">
                  You are entering a controlled business system that may contain contract data, procurement records,
                  Controlled Unclassified Information, and customer-sensitive material. Access is limited to approved
                  users with a valid business need. Activity may be logged, reviewed, and audited. Unauthorized access,
                  disclosure, copying, or misuse may lead to account removal, disciplinary action, civil liability, or
                  criminal referral.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-5">
                <div className="mb-4 flex items-center gap-2">
                  <LockKeyhole size={16} className="text-[#D7BE7A]" />
                  <h2 className="text-sm font-black text-stone-100">Handling Rules</h2>
                </div>
                <div className="space-y-3 text-sm text-stone-300">
                  <p className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-300" />
                    Do not upload, paste, or process controlled information in public or unapproved systems.
                  </p>
                  <p className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-300" />
                    Verify recipients, attachments, and contract identifiers before sharing or exporting records.
                  </p>
                  <p className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-300" />
                    Keep access credentials private and lock your workstation when unattended.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-[#D7BE7A]/18 bg-[#D7BE7A]/[0.06] p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Mail size={16} className="text-[#D7BE7A]" />
                  <h2 className="text-sm font-black text-stone-100">Incident Reporting</h2>
                </div>
                <p className="text-sm leading-7 text-stone-300">
                  Report suspected exposure, incorrect access, suspicious activity, or lost files immediately to your
                  manager and the security contact responsible for this platform. Do not wait for confirmation before
                  raising a concern.
                </p>
                <p className="mt-3 rounded-xl border border-[#D7BE7A]/18 bg-black/20 px-3 py-2 text-xs font-bold text-[#D7BE7A]">
                  Security incidents must be escalated without delay.
                </p>
              </div>
            </div>

            <label
              className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-all"
              style={{
                borderColor: confirmed ? 'rgba(215,190,122,0.42)' : 'rgba(255,255,255,0.12)',
                background: confirmed ? 'rgba(215,190,122,0.12)' : 'rgba(255,255,255,0.04)',
              }}
            >
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                className="mt-1 h-4 w-4 flex-shrink-0 accent-[#D7BE7A]"
              />
              <span className="text-sm font-semibold leading-6 text-stone-100">
                I understand this notice, will follow the platform handling requirements, and accept monitoring and
                audit of my activity while using this system.
              </span>
            </label>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-400">
                <CheckSquare size={14} className="text-[#D7BE7A]" />
                Acceptance is required before sign-in.
              </div>
              <button
                type="button"
                onClick={handleAccept}
                disabled={!confirmed}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white transition-all disabled:cursor-not-allowed disabled:opacity-45"
                style={{
                  background: confirmed
                    ? 'linear-gradient(135deg, #B4232D 0%, #B8914E 100%)'
                    : 'rgba(148,163,184,0.24)',
                  boxShadow: confirmed ? '0 14px 38px rgba(180,35,45,0.24)' : 'none',
                }}
              >
                Accept and Continue <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
