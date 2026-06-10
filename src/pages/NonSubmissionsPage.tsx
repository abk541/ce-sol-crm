import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ClipboardList, CheckCircle2, XCircle, Clock, AlertTriangle,
  PenLine, Search, MoreHorizontal, Trash2,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import toast from 'react-hot-toast'
import { hasPermission } from '../lib/permissions'
import SamGovListingButton from '../components/shared/SamGovListingButton'
import type { Opportunity } from '../types'

const stagger = { animate: { transition: { staggerChildren: 0.05 } } }
const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
}

const STATUS_META = {
  PENDING:  { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: Clock },
  APPROVED: { color: '#16A34A', bg: '#DCFCE7', border: '#86EFAC', icon: CheckCircle2 },
  DECLINED: { color: '#DC2626', bg: '#FEE2E2', border: '#FECACA', icon: XCircle },
} as const

// ── Submit Report Modal ────────────────────────────────────────────────
function SubmitReportModal({ oppId, oppName, onClose }: { oppId: string; oppName: string; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const { submitNonSubReport, currentUser } = useStore()

  const submit = () => {
    if (reason.trim().length < 20) { toast.error('Minimum 20 characters required'); return }
    submitNonSubReport({ opportunityId: oppId, agentUsername: currentUser?.username ?? '', reason: reason.trim() })
    toast.success('Report submitted for review')
    onClose()
  }

  return createPortal(
    <motion.div className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0" style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(8px)' }} onClick={onClose} />
      <motion.div
        className="relative flex w-full max-w-lg max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
        initial={{ scale: 0.94, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}>
        <div className="px-6 py-5 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-base font-bold text-slate-900">Non-Submission Report</h2>
          <p className="text-sm text-slate-500 mt-0.5 truncate">{oppName}</p>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Reason for non-submission <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason} onChange={e => setReason(e.target.value)} rows={5}
              className="input-field w-full resize-none text-sm leading-relaxed"
              placeholder="Explain why this opportunity was not submitted — amendments, disqualifying factors, resource constraints, etc…"
            />
            <div className="flex justify-between mt-1">
              <p className="text-[10px] text-slate-400">Minimum 20 characters</p>
              <p className={`text-[10px] font-semibold ${reason.length >= 20 ? 'text-emerald-600' : 'text-slate-400'}`}>{reason.length} chars</p>
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button onClick={submit} disabled={reason.trim().length < 20} className="btn-primary flex-1 justify-center disabled:opacity-40">
              <PenLine size={13} /> Submit Report
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

// ── Review / Details Modal ─────────────────────────────────────────────
function ReviewModal({ reportId, onClose }: { reportId: string; onClose: () => void }) {
  const [note, setNote] = useState('')
  const { reviewNonSubReport, nonSubReports, opportunities, currentUser } = useStore()
  const report = nonSubReports.find(r => r.id === reportId)
  const opp = opportunities.find(o => o.id === report?.opportunityId)

  const canReview = hasPermission(currentUser, 'nonSubmission:review')
  const isPending = report?.status === 'PENDING'
  const showActions = canReview && isPending

  const review = (action: 'APPROVED' | 'DECLINED') => {
    reviewNonSubReport(reportId, action, note, currentUser?.username ?? '')
    toast.success(action === 'APPROVED' ? 'Report approved → NOT_SUBMITTED' : 'Report declined → DROPPED')
    onClose()
  }

  if (!report) return null

  const meta = STATUS_META[report.status]
  const StatusIcon = meta.icon

  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

  const fmtMoney = (n?: number) =>
    typeof n === 'number' ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'

  return createPortal(
    <motion.div className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0" style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(8px)' }} onClick={onClose} />
      <motion.div
        className="relative flex w-full max-w-2xl max-h-[min(92vh,860px)] flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
        initial={{ scale: 0.94, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}>
        <div className="px-6 py-5 border-b border-slate-100 flex-shrink-0 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 truncate">{showActions ? 'Review Non-Submission Report' : 'Non-Submission Report Details'}</h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {opp?.solicitation ?? report.opportunityId} · By {report.agentUsername}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <SamGovListingButton opportunity={opp} compact />
            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border"
              style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}>
              <StatusIcon size={10} /> {report.status}
            </span>
          </div>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Opportunity Details */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
              <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Opportunity</p>
            </div>
            <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div className="col-span-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Solicitation</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5 break-words">{opp?.solicitation ?? '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Solicitation ID</p>
                <p className="text-slate-700 mt-0.5 break-words">{opp?.solicitationId ?? '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Client / Agency</p>
                <p className="text-slate-700 mt-0.5 break-words">{opp?.client ?? '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Type</p>
                <p className="text-slate-700 mt-0.5">{opp?.type ?? '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">NAICS / Set-Aside</p>
                <p className="text-slate-700 mt-0.5">{opp?.naicsCode ?? '—'} · {opp?.setAside ?? '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Due Date</p>
                <p className="text-slate-700 mt-0.5">{opp?.dueDate ? new Date(opp.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Value</p>
                <p className="text-slate-700 mt-0.5">{fmtMoney(opp?.value ?? opp?.contractAmount)}</p>
              </div>
              {opp?.location && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Location</p>
                  <p className="text-slate-700 mt-0.5 break-words">{opp.location}</p>
                </div>
              )}
              {opp?.pop && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Period of Performance</p>
                  <p className="text-slate-700 mt-0.5 break-words">{opp.pop}</p>
                </div>
              )}
              <div className="col-span-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">SAM.gov Listing</p>
                <div className="mt-1">
                  <SamGovListingButton opportunity={opp} label="Open SAM.gov" />
                </div>
              </div>
            </div>
          </div>

          {/* Agent's Reason */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-slate-500">Agent's Reason</p>
              <p className="text-[10px] text-slate-400">Submitted {fmtDate(report.submittedAt)}</p>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{report.reason}</p>
          </div>

          {/* Decision history (only for non-pending) */}
          {!isPending && (
            <div className="p-4 rounded-xl border" style={{ background: meta.bg, borderColor: meta.border }}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold" style={{ color: meta.color }}>
                  {report.status === 'APPROVED' ? 'Approved' : 'Declined'}{report.reviewedBy ? ` by ${report.reviewedBy}` : ''}
                </p>
                {report.reviewedAt && <p className="text-[10px]" style={{ color: meta.color }}>{fmtDate(report.reviewedAt)}</p>}
              </div>
              {report.reviewNote
                ? <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: meta.color }}>{report.reviewNote}</p>
                : <p className="text-xs italic" style={{ color: meta.color, opacity: 0.7 }}>No review note provided.</p>}
            </div>
          )}

          {/* Action area (pending + reviewer only) */}
          {showActions ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Review note <span className="text-slate-400">(optional)</span></label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                  className="input-field w-full resize-none text-sm"
                  placeholder="Add context for your decision…" />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs text-amber-700">
                  <strong>Approve</strong> → opportunity set to NOT_SUBMITTED &nbsp;·&nbsp; <strong>Decline</strong> → opportunity set to DROPPED
                </p>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button onClick={() => review('DECLINED')}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors">
                  <XCircle size={14} /> Decline
                </button>
                <button onClick={() => review('APPROVED')}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors">
                  <CheckCircle2 size={14} /> Approve
                </button>
              </div>
            </>
          ) : (
            <div className="flex justify-end pt-1">
              <button onClick={onClose} className="btn-secondary justify-center">Close</button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

// ── Report Card with "..." menu ─────────────────────────────────────────
function ReportCard({
  r,
  opp,
  isManager,
  onReview,
  onApprove,
  onDecline,
}: {
  r: { id: string; opportunityId: string; agentUsername: string; reason: string; status: 'PENDING' | 'APPROVED' | 'DECLINED'; submittedAt: string; reviewNote?: string; reviewedBy?: string }
  opp: Opportunity | undefined
  isManager: boolean
  onReview: () => void
  onApprove: () => void
  onDecline: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const meta = STATUS_META[r.status]
  const Icon = meta.icon

  return (
    <motion.div variants={fadeUp}
      onClick={onReview}
      className="relative rounded-2xl p-5 border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      style={{ background: 'var(--bg-card)', borderColor: meta.border, borderLeftWidth: 3, borderLeftColor: meta.color }}>

      {/* "..." menu button */}
      <div className="absolute top-3 right-3" onClick={e => e.stopPropagation()}>
        {menuOpen && (
          <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
        )}
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
          className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors relative z-30">
          <MoreHorizontal size={14} />
        </button>
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="absolute right-0 top-8 z-30 rounded-xl py-1 w-44"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}>
              {opp && (
                <>
                  <SamGovListingButton
                    opportunity={opp}
                    label="Open SAM.gov"
                    variant="menu"
                    onOpened={() => setMenuOpen(false)}
                  />
                  <div className="my-1 border-t" style={{ borderColor: 'var(--border-default)' }} />
                </>
              )}
              {isManager && r.status === 'PENDING' && (
                <>
                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpen(false); onApprove() }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 transition-colors"
                    style={{ color: '#475569' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = '#0F172A' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#475569' }}>
                    <CheckCircle2 size={12} /> Approve
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpen(false); onDecline() }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 transition-colors"
                    style={{ color: '#DC2626' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.06)'; (e.currentTarget as HTMLButtonElement).style.color = '#DC2626' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#DC2626' }}>
                    <XCircle size={12} /> Decline
                  </button>
                  <div className="my-1 border-t" style={{ borderColor: 'var(--border-default)' }} />
                </>
              )}
              <button
                onClick={e => { e.stopPropagation(); setMenuOpen(false); onReview() }}
                className="w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 transition-colors"
                style={{ color: '#475569' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = '#0F172A' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ''; (e.currentTarget as HTMLButtonElement).style.color = '#475569' }}>
                <ClipboardList size={12} /> View Details
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: meta.bg, border: `1px solid ${meta.border}` }}>
          <Icon size={16} style={{ color: meta.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
            <div>
              <p className="text-sm font-bold text-slate-900">{opp?.solicitation ?? r.opportunityId}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {opp?.solicitationId} · By <span className="font-semibold text-slate-600">{r.agentUsername}</span> · {new Date(r.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            <span className="flex-shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full border"
              style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}>
              {r.status}
            </span>
          </div>

          <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-xs text-slate-700 leading-relaxed">{r.reason}</p>
          </div>

          {r.reviewNote && (
            <div className="mt-2 p-2.5 rounded-lg"
              style={{ background: meta.bg, border: `1px solid ${meta.border}` }}>
              <p className="text-[11px] font-medium" style={{ color: meta.color }}>
                Review by <strong>{r.reviewedBy}</strong>: <span className="font-normal italic">{r.reviewNote}</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {isManager && r.status === 'PENDING' && (
        <div className="mt-4 flex justify-end">
          <button onClick={e => { e.stopPropagation(); onReview() }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors">
            Review Report
          </button>
        </div>
      )}
    </motion.div>
  )
}

// ── Dropped Opportunities Table ────────────────────────────────────────
function DroppedOpportunitiesTab({ targetId, onViewReport }: { targetId?: string | null; onViewReport: (reportId: string) => void }) {
  const { opportunities, nonSubReports } = useStore()
  const dropped = useMemo(
    () => opportunities
      .filter(o => o.status === 'DROPPED' && !o.isDeleted)
      .filter(o => !targetId || o.id === targetId || o.solicitationId === targetId),
    [opportunities, targetId]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Trash2 size={14} className="text-red-500" />
        <p className="text-sm font-bold text-slate-700">Dropped Opportunities</p>
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-600">{dropped.length}</span>
      </div>

      {dropped.length === 0 ? (
        <div className="glass rounded-2xl py-16 text-center text-slate-400 text-sm">
          No dropped opportunities
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Type</th>
                  <th>ID</th>
                  <th>Solicitation</th>
                  <th>Client</th>
                  <th>Due Date</th>
                  <th>Location</th>
                  <th>Manager</th>
                  <th>Team Lead</th>
                  <th>SAM.gov</th>
                  <th>Non-Sub Report</th>
                </tr>
              </thead>
              <tbody>
                {dropped.map((o, i) => {
                  const report = nonSubReports.find(r => r.opportunityId === o.id)
                  const clickable = !!report
                  return (
                    <motion.tr key={o.id}
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={clickable ? () => onViewReport(report!.id) : undefined}
                      className={`${clickable ? 'cursor-pointer hover:bg-slate-50 transition-colors' : ''} ${targetId ? 'ring-1 ring-[#D7BE7A] ring-inset bg-[#D7BE7A]/10' : ''}`.trim() || undefined}>
                      <td>
                        {o.priority && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            o.priority === 'HIGH' ? 'bg-red-100 text-red-600' :
                            o.priority === 'MEDIUM' ? 'bg-amber-100 text-amber-600' :
                            'bg-slate-100 text-slate-500'
                          }`}>
                            {o.priority}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600">
                          {o.type}
                        </span>
                      </td>
                      <td className="text-indigo-600 text-xs font-mono font-semibold">{o.solicitationId}</td>
                      <td className="max-w-[200px]">
                        <p className="truncate text-xs font-medium text-slate-800">{o.solicitation}</p>
                      </td>
                      <td className="text-xs text-slate-500">{o.client || '—'}</td>
                      <td className="text-xs text-slate-500 whitespace-nowrap">
                        {new Date(o.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="text-xs text-slate-500 max-w-[100px]">
                        <p className="truncate">{o.location || '—'}</p>
                      </td>
                      <td>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">{o.bdm || '—'}</span>
                      </td>
                      <td>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">{o.bds || '—'}</span>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <SamGovListingButton opportunity={o} compact />
                      </td>
                      <td>
                        {report ? (
                          <div className="max-w-[160px]">
                            <p className="text-[10px] text-slate-500 truncate italic">{report.reason}</p>
                            <p className="text-[9px] text-slate-400 mt-0.5">by {report.agentUsername}</p>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────
export default function NonSubmissionsPage() {
  const { nonSubReports, opportunities, currentUser, reviewNonSubReport } = useStore()
  const [searchParams] = useSearchParams()
  const globalRecordId = searchParams.get('record')
  const globalTab = searchParams.get('tab')
  const [pageTab, setPageTab] = useState<'reports' | 'dropped'>('reports')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'DECLINED'>('ALL')
  const [submitFor, setSubmitFor] = useState<{ id: string; name: string } | null>(null)
  const [reviewId, setReviewId] = useState<string | null>(null)

  const canReviewReports = hasPermission(currentUser, 'nonSubmission:review')
  const isAgent = !canReviewReports

  useEffect(() => {
    if (globalTab === 'dropped' || globalTab === 'reports') setPageTab(globalTab)
    if (!globalRecordId) return
    const target = opportunities.find(o => o.id === globalRecordId || o.solicitationId === globalRecordId)
    if (target) {
      setSearch(target.solicitation)
      if (target.status === 'DROPPED') setPageTab('dropped')
    }
  }, [globalRecordId, globalTab, opportunities])

  const droppedCount = useMemo(
    () => opportunities.filter(o => o.status === 'DROPPED' && !o.isDeleted).length,
    [opportunities]
  )

  const reports = useMemo(() => {
    let list = isAgent
      ? nonSubReports.filter(r => r.agentUsername === currentUser?.username)
      : nonSubReports
    if (filter !== 'ALL') list = list.filter(r => r.status === filter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(r => {
        const opp = opportunities.find(o => o.id === r.opportunityId)
        return opp?.solicitation.toLowerCase().includes(q) || r.agentUsername.includes(q)
      })
    }
    return list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
  }, [nonSubReports, filter, search, isAgent, currentUser, opportunities])

  const agentOpps = useMemo(() => {
    if (!isAgent) return []
    const un = currentUser?.username ?? ''
    const fn = (currentUser?.name ?? '').split(' ')[0].toLowerCase()
    return opportunities.filter(o => {
      if (o.isDeleted) return false
      const b = `${o.bds} ${o.bdm}`.toLowerCase()
      const hasReport = nonSubReports.some(r => r.opportunityId === o.id)
      return (b.includes(un) || b.includes(fn)) && !hasReport &&
        ['ACTIVE', 'DISCUSSION', 'NEW_ASSIGNMENT'].includes(o.status)
    })
  }, [opportunities, nonSubReports, isAgent, currentUser])

  const filterCounts = (['ALL', 'PENDING', 'APPROVED', 'DECLINED'] as const).map(f => ({
    id: f,
    count: nonSubReports.filter(r =>
      (isAgent ? r.agentUsername === currentUser?.username : true) &&
      (f === 'ALL' ? true : r.status === f)
    ).length,
  }))

  return (
    <div className="p-6 space-y-5 page-enter">
      {/* Header */}
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] mb-1">CES · NON-SUBMISSIONS</p>
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
          <ClipboardList size={22} className="text-indigo-500" /> Non-Submission Reports
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {isAgent ? 'Submit explanations for unsubmitted opportunities.' : 'Review and action agent non-submission reports.'}
        </p>
      </motion.div>

      {/* Top-level page tab switcher */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
        <button
          onClick={() => setPageTab('reports')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
            pageTab === 'reports'
              ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
              : 'text-slate-500 hover:text-slate-700'
          }`}>
          <ClipboardList size={12} />
          Non-Submission Reports
          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${pageTab === 'reports' ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
            {nonSubReports.length}
          </span>
        </button>
        <button
          onClick={() => setPageTab('dropped')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
            pageTab === 'dropped'
              ? 'bg-white text-red-600 shadow-sm border border-slate-200'
              : 'text-slate-500 hover:text-slate-700'
          }`}>
          <Trash2 size={12} />
          Dropped Submissions
          {droppedCount > 0 && (
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${pageTab === 'dropped' ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
              {droppedCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Reports Tab ── */}
      {pageTab === 'reports' && (
        <>
          {/* Agent: eligible opps */}
          {isAgent && agentOpps.length > 0 && (
            <motion.div variants={fadeUp} initial="initial" animate="animate"
              className="glass rounded-2xl overflow-hidden border-l-4 border-amber-400">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <AlertTriangle size={13} className="text-amber-500" />
                <p className="text-xs font-bold text-amber-700">Opportunities requiring a non-submission report</p>
                <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{agentOpps.length}</span>
              </div>
              <div className="divide-y divide-slate-50">
                {agentOpps.map((o, i) => (
                  <motion.div key={o.id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.04 }}
                    className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{o.solicitation}</p>
                      <p className="text-[10px] text-slate-500">{o.solicitationId} · Due: {new Date(o.dueDate).toLocaleDateString()}</p>
                    </div>
                    <button
                      onClick={() => setSubmitFor({ id: o.id, name: o.solicitation })}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors">
                      <PenLine size={11} /> Write Report
                    </button>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Filters */}
          <motion.div variants={fadeUp} initial="initial" animate="animate"
            className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex gap-0.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
              {filterCounts.map(({ id: f, count }) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    filter === f
                      ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                      : 'text-slate-500 hover:text-slate-700'}`}>
                  {f}
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${filter === f ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                className="input-field pl-9 w-60 text-xs" placeholder="Search reports…" />
            </div>
          </motion.div>

          {/* Reports list */}
          <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-3">
            {reports.length === 0 ? (
              <div className="glass rounded-2xl py-16 text-center text-slate-400 text-sm">No reports found</div>
            ) : (
              reports.map((r) => {
                const opp = opportunities.find(o => o.id === r.opportunityId)
                return (
                  <ReportCard
                    key={r.id}
                    r={r}
                    opp={opp}
                    isManager={canReviewReports}
                    onReview={() => setReviewId(r.id)}
                    onApprove={() => { reviewNonSubReport(r.id, 'APPROVED', 'Approved', currentUser?.username ?? ''); toast.success('Report approved → NOT_SUBMITTED') }}
                    onDecline={() => { reviewNonSubReport(r.id, 'DECLINED', 'Declined', currentUser?.username ?? ''); toast.success('Report declined → DROPPED') }}
                  />
                )
              })
            )}
          </motion.div>
        </>
      )}

      {/* ── Dropped Tab ── */}
      {pageTab === 'dropped' && <DroppedOpportunitiesTab targetId={globalRecordId} onViewReport={(id) => setReviewId(id)} />}

      {/* Modals */}
      <AnimatePresence>
        {submitFor && <SubmitReportModal oppId={submitFor.id} oppName={submitFor.name} onClose={() => setSubmitFor(null)} />}
        {reviewId && <ReviewModal reportId={reviewId} onClose={() => setReviewId(null)} />}
      </AnimatePresence>
    </div>
  )
}
