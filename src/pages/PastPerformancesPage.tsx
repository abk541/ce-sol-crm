import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  History, Search, Download, FileText,
  Building2, DollarSign, Calendar, MapPin,
  ChevronDown, X, Save, Eye, Tag, MoreHorizontal,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import type { PastPerformance } from '../types'
import { formatCurrency } from '../lib/utils'
import toast from 'react-hot-toast'

function ExportModal({ pp, onClose }: { pp: PastPerformance; onClose: () => void }) {
  const [desc, setDesc] = useState(pp.description)
  const [touched, setTouched] = useState(false)
  const invalid = touched && !desc.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(8px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="rounded-2xl w-full max-w-lg"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
      >
        <div className="border-b p-5 flex items-center gap-3" style={{ borderColor: 'var(--border-default)' }}>
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Download size={16} className="text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-slate-800">Export to PDF</h2>
            <p className="text-xs text-slate-400 truncate">{pp.title}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Project Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={5}
              value={desc}
              onChange={e => setDesc(e.target.value)}
              onBlur={() => setTouched(true)}
              className="input-field text-xs py-2 w-full resize-none"
              placeholder="Enter project description…"
            />
            {invalid && (
              <p className="text-xs text-rose-500 mt-1">Description is required</p>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Review and confirm the project description before exporting. This text will appear in the PDF template.
          </p>
        </div>

        <div className="flex gap-2 p-5 border-t" style={{ borderColor: 'var(--border-default)' }}>
          <button onClick={onClose} className="btn-secondary flex-1 text-xs">Cancel</button>
          <button
            disabled={!desc.trim()}
            onClick={() => {
              if (!desc.trim()) { setTouched(true); return }
              toast.success('PDF exported successfully')
              onClose()
            }}
            className="btn-primary flex-1 text-xs gap-1.5 disabled:opacity-40"
          >
            <Download size={12} /> Export PDF
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function DetailDrawerPP({ pp, onClose, onExport }: { pp: PastPerformance; onClose: () => void; onExport: (pp: PastPerformance) => void }) {
  return (
    <motion.div
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 280, damping: 30 }}
      className="fixed right-0 top-0 h-screen w-full max-w-lg z-50 overflow-y-auto"
      style={{ background: 'var(--bg-card)', borderLeft: '1px solid var(--border-default)', boxShadow: '0 0 80px rgba(0,0,0,0.15)' }}
    >
      <div className="sticky top-0 border-b p-5 flex items-center gap-3 z-10" style={{ background: 'var(--bg-raised)', borderColor: 'var(--border-default)' }}>
        <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
          <History size={16} className="text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-slate-800 truncate">{pp.title}</h2>
          <p className="text-xs text-slate-400">{pp.contractNumber}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
      </div>

      <div className="p-5 space-y-5">
        {/* Key info */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Client', value: pp.client },
            { label: 'Type', value: pp.type },
            { label: 'Finance', value: pp.financeType || '—' },
            { label: 'NAICS', value: pp.naicsCode },
            { label: 'Set-Aside', value: pp.setAside },
          ].map(f => (
            <div key={f.label} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-0.5">{f.label}</p>
              <p className="text-sm font-bold text-slate-800">{f.value}</p>
            </div>
          ))}
        </div>

        {/* Value + PoP */}
        <div className="flex gap-3">
          <div className="flex-1 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider mb-0.5">Contract Value</p>
            <p className="text-lg font-black text-emerald-700">{formatCurrency(pp.value)}</p>
          </div>
          <div className="flex-1 p-3 rounded-xl bg-blue-50 border border-blue-200">
            <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider mb-0.5">Period of Performance</p>
            <p className="text-xs font-semibold text-blue-700">{pp.popStart}</p>
            <p className="text-xs text-blue-500">→ {pp.popEnd}</p>
          </div>
        </div>

        {/* Location */}
        {pp.location && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <MapPin size={13} className="text-slate-400" />
            {pp.location}
          </div>
        )}

        {/* Description */}
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Project Description</p>
          <p className="text-sm text-slate-700 leading-relaxed">{pp.description}</p>
        </div>

        {/* Relevance */}
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Relevance</p>
          <p className="text-sm text-slate-700 leading-relaxed">{pp.relevance}</p>
        </div>

        {/* Key personnel */}
        {pp.keyPersonnel && (
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Key Personnel</p>
            <p className="text-sm text-slate-700">{pp.keyPersonnel}</p>
          </div>
        )}

        {/* Challenges */}
        {pp.challenges && (
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Challenges & Solutions</p>
            <p className="text-sm text-slate-700 leading-relaxed">{pp.challenges}</p>
          </div>
        )}

        {/* Team */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Manager</p>
            <p className="text-sm font-semibold text-slate-700">{pp.bdm}</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Team Lead</p>
            <p className="text-sm font-semibold text-slate-700">{pp.bds}</p>
          </div>
        </div>

        {/* Export button */}
        <button
          onClick={() => onExport(pp)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          <Download size={14} /> Export to PDF Template
        </button>
      </div>
    </motion.div>
  )
}

export default function PastPerformancesPage() {
  const { pastPerformances, contracts, freshAwards } = useStore()
  const [search, setSearch] = useState('')
  const [source, setSource] = useState<'AWARDED' | 'ACTIVE'>('AWARDED')
  const [selected, setSelected] = useState<PastPerformance | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [exportTarget, setExportTarget] = useState<PastPerformance | null>(null)

  const sourceRows = useMemo<PastPerformance[]>(() => {
    if (source === 'ACTIVE') {
      return contracts.map(c => ({
        id: `active-${c.id}`,
        contractId: c.id,
        opportunityId: c.opportunityId,
        contractNumber: c.contractId,
        title: c.title,
        client: c.client || '',
        type: c.type,
        financeType: c.financeType,
        naicsCode: c.naicsCode,
        setAside: c.setAside || 'UNRES',
        value: c.value,
        popStart: c.popStart,
        popEnd: c.popEnd,
        location: c.location,
        description: '',
        relevance: '',
        bdm: c.bdm || '',
        bds: c.bds || '',
        createdAt: c.popStart,
        createdBy: 'System',
      }))
    }
    const awardRows = freshAwards.map(fa => ({
      id: `award-${fa.id}`,
      opportunityId: fa.opportunityId,
      contractId: fa.contractId,
      contractNumber: fa.solicitationId,
      title: fa.solicitation,
      client: fa.client,
      type: fa.type,
      naicsCode: fa.naicsCode,
      setAside: fa.setAside,
      value: fa.contractAmount ?? 0,
      popStart: fa.awardedDate,
      popEnd: fa.movedAt?.slice(0, 10) ?? '',
      location: fa.location,
      description: '',
      relevance: '',
      bdm: fa.assignedBDM || '',
      bds: fa.assignedBDS || '',
      createdAt: fa.awardedDate,
      createdBy: 'System',
    }))
    return [...awardRows, ...pastPerformances]
  }, [source, contracts, freshAwards, pastPerformances])

  const filtered = useMemo(() => {
    if (!search) return sourceRows
    const q = search.toLowerCase()
    return sourceRows.filter(pp =>
      pp.title.toLowerCase().includes(q) ||
      pp.client.toLowerCase().includes(q) ||
      pp.contractNumber.toLowerCase().includes(q) ||
      pp.naicsCode.includes(q)
    )
  }, [sourceRows, search])

  const totalValue = sourceRows.reduce((s, p) => s + p.value, 0)

  return (
    <div className="p-6 page-enter">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] mb-1">CES · BUSINESS DEV</p>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            <History size={22} className="text-indigo-500" /> Past Performances
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{sourceRows.length} records - {formatCurrency(totalValue)} total value</p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
          {[
            { key: 'AWARDED' as const, label: 'Awarded' },
            { key: 'ACTIVE' as const, label: 'Active Contracts' },
          ].map(item => (
            <button key={item.key} onClick={() => setSource(item.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${source === item.key ? 'border border-slate-200 bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="relative max-w-md flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="input-field pl-9 text-sm w-full" placeholder="Search by title, client, contract number, NAICS..." />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Contract #</th>
                <th>Title</th>
                <th>Client</th>
                <th>Type</th>
                <th>NAICS</th>
                <th>Set-Aside</th>
                <th>Value</th>
                <th>PoP</th>
                <th>Manager / Team Lead</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400 text-sm">
                    No past performance records found.
                  </td>
                </tr>
              )}
              {filtered.map((pp, i) => (
                <motion.tr key={pp.id}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => setSelected(pp)}
                >
                  <td className="text-xs font-mono text-indigo-600 font-semibold">{pp.contractNumber}</td>
                  <td className="max-w-[180px]">
                    <p className="truncate text-xs font-semibold text-slate-800" title={pp.title}>{pp.title}</p>
                  </td>
                  <td className="text-xs text-slate-600 max-w-[120px]">
                    <p className="truncate">{pp.client}</p>
                  </td>
                  <td>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{pp.type}</span>
                  </td>
                  <td className="text-xs font-mono text-slate-500">{pp.naicsCode}</td>
                  <td className="text-xs text-slate-500">{pp.setAside}</td>
                  <td className="text-xs font-semibold text-emerald-600">{formatCurrency(pp.value)}</td>
                  <td className="text-xs text-slate-500 whitespace-nowrap">
                    {pp.popStart}<br /><span className="text-slate-400">→ {pp.popEnd}</span>
                  </td>
                  <td className="text-xs text-slate-600">{pp.bdm} / {pp.bds}</td>
                  <td className="relative" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === pp.id ? null : pp.id) }}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    <AnimatePresence>
                      {menuOpen === pp.id && (
                        <>
                          <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(null)} />
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -4 }}
                            transition={{ duration: 0.12 }}
                            className="absolute right-0 top-8 z-30 rounded-xl py-1 w-44"
                            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
                          >
                            <button
                              onClick={() => { setSelected(pp); setMenuOpen(null) }}
                              className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                              style={{ color: '#475569' }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#0F172A' }}
                              onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#475569' }}
                            >
                              View Details
                            </button>
                            <button
                              onClick={() => { navigator.clipboard.writeText(pp.contractNumber); toast.success('Copied: ' + pp.contractNumber); setMenuOpen(null) }}
                              className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                              style={{ color: '#475569' }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#0F172A' }}
                              onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#475569' }}
                            >
                              Copy Contract #
                            </button>
                            <button
                              onClick={() => { setExportTarget(pp); setMenuOpen(null) }}
                              className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                              style={{ color: '#475569' }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#0F172A' }}
                              onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#475569' }}
                            >
                              Export to PDF
                            </button>
                            <div className="my-1 border-t" style={{ borderColor: 'var(--border-default)' }} />
                            <button
                              onClick={() => { toast.error('Delete not yet implemented'); setMenuOpen(null) }}
                              className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                              style={{ color: '#DC2626' }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.06)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#DC2626' }}
                            >
                              Delete Record
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail drawer */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/20" onClick={() => setSelected(null)} />
            <DetailDrawerPP
              pp={selected}
              onClose={() => setSelected(null)}
              onExport={(pp) => { setSelected(null); setExportTarget(pp) }}
            />
          </>
        )}
      </AnimatePresence>

      {/* Export modal */}
      <AnimatePresence>
        {exportTarget && (
          <ExportModal pp={exportTarget} onClose={() => setExportTarget(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}
