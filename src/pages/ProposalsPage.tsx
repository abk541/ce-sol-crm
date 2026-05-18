import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, UserPlus, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { Opportunity } from '../types'
import toast from 'react-hot-toast'
import HierarchyAssignPicker from '../components/shared/HierarchyAssignPicker'
import { getAssignmentChain } from '../lib/team'

const ASSIGNABLE_STATUSES = ['ACTIVE', 'NEW_ASSIGNMENT', 'DISCUSSION'] as const

function AssignModal({ opp, onClose }: { opp: Opportunity; onClose: () => void }) {
  const { assignOpportunityToEmployee, employees } = useStore()
  const [selectedEmpId, setSelectedEmpId] = useState<string | undefined>(opp.assignedTo)

  const handleAssign = () => {
    if (!selectedEmpId) { toast.error('Please select an associate'); return }
    const emp = employees.find(e => e.id === selectedEmpId)
    if (emp?.role !== 'ASSOCIATE') {
      toast.error('Opportunities must be assigned to an associate.')
      return
    }
    assignOpportunityToEmployee(opp.id, selectedEmpId)
    toast.success(`Assigned to ${emp.name}`)
    onClose()
  }

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">Assign Opportunity</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">{opp.solicitation}</p>
          </div>
          <button onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <HierarchyAssignPicker
            label="Select Associate"
            value={selectedEmpId}
            onChange={setSelectedEmpId}
            deadline={opp.dueDate}
          />
        </div>

        <div className="flex gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button onClick={handleAssign} disabled={!selectedEmpId}
            className="btn-primary flex-1 justify-center disabled:opacity-40">
            <Check size={13} /> Confirm Assignment
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function ProposalsPage() {
  const { opportunities, employees } = useStore()
  const [assignTarget, setAssignTarget] = useState<Opportunity | null>(null)

  const rows = useMemo(() =>
    opportunities
      .filter(o =>
        !o.isDeleted &&
        ASSIGNABLE_STATUSES.includes(o.status as any) &&
        getAssignmentChain(employees, o.assignedTo).associate == null
      )
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    [opportunities, employees]
  )

  return (
    <div className="p-6 page-enter">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="mb-1 text-[10px] font-bold tracking-[0.2em] text-slate-400">CES - BUSINESS DEV</p>
          <h1 className="text-2xl font-black text-slate-900">Assign Opportunities</h1>
          <p className="mt-0.5 text-sm text-slate-500">{rows.length} opportunities waiting for associate assignment</p>
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
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-slate-400">
                    No opportunities are waiting for assignment.
                  </td>
                </tr>
              )}
              {rows.map((o, i) => (
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
                  <td>
                    <button onClick={() => setAssignTarget(o)} className="btn-secondary gap-1 px-2.5 py-1 text-xs">
                      <UserPlus size={10} /> Assign
                    </button>
                  </td>
                </motion.tr>
              ))}
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
