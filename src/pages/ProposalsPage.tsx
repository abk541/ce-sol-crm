import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, UserPlus, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { Opportunity } from '../types'
import toast from 'react-hot-toast'
import HierarchyAssignPicker from '../components/shared/HierarchyAssignPicker'
import { assignableEmployeesForUser, getAssignmentChain, isAssignedToAssociate } from '../lib/team'
import { hasPermission } from '../lib/permissions'
import SamGovListingButton from '../components/shared/SamGovListingButton'

const ASSIGNABLE_STATUSES = ['ACTIVE', 'NEW_ASSIGNMENT', 'DISCUSSION'] as const

function AssignModal({ opp, onClose }: { opp: Opportunity; onClose: () => void }) {
  const { assignOpportunityToEmployee, employees, currentUser } = useStore()
  const [selectedEmpId, setSelectedEmpId] = useState<string | undefined>(opp.assignedTo)
  const assignable = useMemo(() => assignableEmployeesForUser(employees, currentUser, 'BD'), [employees, currentUser])

  const handleAssign = () => {
    if (!selectedEmpId) { toast.error('Please select an assignee'); return }
    const emp = employees.find(e => e.id === selectedEmpId)
    if (!emp || !assignable.some(item => item.id === emp.id)) {
      toast.error('You can only assign inside your team.')
      return
    }
    assignOpportunityToEmployee(opp.id, selectedEmpId)
    toast.success(`Assigned to ${emp.name}`)
    onClose()
  }

  return createPortal(
    <motion.div className="fixed inset-0 z-[80] grid place-items-center px-4 py-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-[#020B12]/75 backdrop-blur-md" onClick={onClose} />
      <motion.div
        initial={{ y: 16, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 16, scale: 0.98, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className="relative z-10 flex max-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-[#D7BE7A]/25 bg-[#07131F] shadow-[0_28px_90px_rgba(0,0,0,0.48),0_0_0_1px_rgba(255,255,255,0.04)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#D7BE7A]/15 bg-gradient-to-r from-[#0B1B2A] via-[#0A2327] to-[#102820] px-6 py-5">
          <div className="min-w-0 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D7BE7A]">Assignment</p>
            <h2 className="text-xl font-black tracking-tight text-[#F8FBF7]">Assign Opportunity</h2>
            <p className="max-w-3xl truncate text-sm text-slate-300" title={opp.solicitation}>{opp.solicitation}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <SamGovListingButton opportunity={opp} label="Open SAM.gov" variant="premium" />
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition-all hover:border-[#D7BE7A]/35 hover:bg-[#D7BE7A]/10 hover:text-white"
              aria-label="Close assignment modal"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-4 grid gap-3 rounded-2xl border border-[#D7BE7A]/20 bg-white/[0.035] p-4 text-xs text-slate-300 md:grid-cols-4">
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Solicitation ID</p>
              <p className="truncate font-mono text-[#F8FBF7]">{opp.solicitationId || '-'}</p>
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Agency</p>
              <p className="truncate text-[#F8FBF7]">{opp.client || '-'}</p>
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Due Date</p>
              <p className="truncate text-[#F8FBF7]">{opp.dueDate ? new Date(opp.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}</p>
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Location</p>
              <p className="truncate text-[#F8FBF7]">{opp.location || '-'}</p>
            </div>
          </div>
          <HierarchyAssignPicker
            label="Select Assignee"
            value={selectedEmpId}
            onChange={setSelectedEmpId}
            deadline={opp.dueDate}
            excludeOpportunityId={opp.id}
            allowedEmployeeIds={assignable.map(emp => emp.id)}
            team="BD"
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-[#D7BE7A]/15 bg-[#07131F]/95 px-6 py-4 sm:flex-row">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button type="button" onClick={handleAssign} disabled={!selectedEmpId}
            className="btn-primary flex-1 justify-center disabled:opacity-40">
            <Check size={14} /> Confirm Assignment
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  )
}

export default function ProposalsPage() {
  const { opportunities, employees, currentUser } = useStore()
  const [searchParams] = useSearchParams()
  const globalRecordId = searchParams.get('record')
  const [assignTarget, setAssignTarget] = useState<Opportunity | null>(null)
  const assignable = useMemo(() => assignableEmployeesForUser(employees, currentUser, 'BD'), [employees, currentUser])
  const canAssign = hasPermission(currentUser, 'opportunity:assign')

  const rows = useMemo(() =>
    opportunities
      .filter(o =>
        !o.isDeleted &&
        !o.nonSubmissionReportId &&
        ASSIGNABLE_STATUSES.includes(o.status as any) &&
        !isAssignedToAssociate(employees, o.assignedTo)
      )
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    [opportunities, employees]
  )

  useEffect(() => {
    if (!globalRecordId) return
    const target = rows.find(o => o.id === globalRecordId || o.solicitationId === globalRecordId)
    if (target) setAssignTarget(target)
  }, [globalRecordId, rows])

  if (!canAssign) {
    return (
      <div className="p-6 page-enter">
        <div className="glass rounded-2xl p-8 text-center text-sm text-slate-400">
          Assign Opportunities is only available to managers and team leads.
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 page-enter">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="mb-1 text-[10px] font-bold tracking-[0.2em] text-slate-400">CES - BUSINESS DEV</p>
          <h1 className="text-2xl font-black text-slate-900">Assign Opportunities</h1>
          <p className="mt-0.5 text-sm text-slate-500">{rows.length} captured opportunities waiting for assignment</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Solicitation</th>
                <th>Agency</th>
                <th>Type</th>
                <th>Set Aside</th>
                <th>NAICS</th>
                <th>Due Date</th>
                <th>Location</th>
                <th>Manager</th>
                <th>Team Lead</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-sm text-slate-400">
                    No opportunities are waiting for assignment.
                  </td>
                </tr>
              )}
              {rows.map((o, i) => {
                const chain = getAssignmentChain(employees, o.assignedTo)
                return (
                <motion.tr key={o.id}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}>
                  <td className="max-w-[260px]">
                    <p className="truncate text-xs font-semibold text-slate-800" title={o.solicitation}>{o.solicitation}</p>
                    <p className="text-[10px] font-mono text-slate-400">{o.solicitationId}</p>
                  </td>
                  <td className="max-w-[160px] text-xs text-slate-600"><p className="truncate">{o.client}</p></td>
                  <td><span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600">{o.type || '-'}</span></td>
                  <td className="text-xs text-slate-500">{o.setAside}</td>
                  <td className="text-xs font-mono text-slate-500">{o.naicsCode}</td>
                  <td className="whitespace-nowrap text-xs text-slate-600">
                    {o.dueDate ? new Date(o.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                  </td>
                  <td className="max-w-[150px] text-xs text-slate-500"><p className="truncate">{o.location}</p></td>
                  <td className="max-w-[150px] text-xs text-slate-600">
                    {chain.manager
                      ? <p className="truncate" title={chain.manager.name}>{chain.manager.name}</p>
                      : <span className="text-slate-300">-</span>}
                  </td>
                  <td className="max-w-[150px] text-xs text-slate-600">
                    {chain.teamLead
                      ? <p className="truncate" title={chain.teamLead.name}>{chain.teamLead.name}</p>
                      : <span className="text-slate-300">-</span>}
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <SamGovListingButton opportunity={o} compact />
                      <button
                        type="button"
                        onClick={() => setAssignTarget(o)}
                        disabled={assignable.length === 0}
                        className="group inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#D7BE7A]/30 bg-gradient-to-r from-[#0F4F59]/80 via-[#1F7A78]/80 to-[#B8914E]/80 px-3.5 text-xs font-bold text-white shadow-[0_8px_22px_rgba(15,79,89,0.24)] transition-all hover:-translate-y-0.5 hover:border-[#D7BE7A]/60 hover:shadow-[0_14px_32px_rgba(184,145,78,0.22)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-white/10 transition-all group-hover:bg-white/20">
                          <UserPlus size={12} />
                        </span>
                        Assign
                      </button>
                    </div>
                  </td>
                </motion.tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {assignTarget && <AssignModal opp={assignTarget} onClose={() => setAssignTarget(null)} />}
      </AnimatePresence>
    </div>
  )
}
