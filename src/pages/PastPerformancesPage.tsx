import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  History, Plus, Search, Download, FileText,
  Building2, DollarSign, Calendar, MapPin,
  ChevronDown, X, Save, Eye, Tag, MoreHorizontal,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import type { PastPerformance, ContractType, ContractFinanceType, SetAside, Prime } from '../types'
import { formatCurrency } from '../lib/utils'
import toast from 'react-hot-toast'

const PRIME_OPTIONS: Prime[] = ['TECH-OR', 'AYJ-S', 'SANFORD', 'SAUDI']
const TYPE_OPTIONS: ContractType[] = ['OTJ', 'RECURRING', 'BPA', 'IDIQ', 'S&D', 'SUPPLY']
const FINANCE_OPTIONS: ContractFinanceType[] = ['FFP', 'T&M', 'CPFF', 'OTHER']
const SETASIDE_OPTIONS: SetAside[] = ['SB', 'SDVOSB', 'WOSB', 'HUBZone', 'VOSB', '8(a)', 'UNRES']

const PRIME_COLORS: Record<Prime, string> = {
  'TECH-OR': '#6366F1', 'AYJ-S': '#10B981', 'SANFORD': '#F59E0B', 'SAUDI': '#EF4444',
}

function DetailDrawerPP({ pp, onClose }: { pp: PastPerformance; onClose: () => void }) {
  return (
    <motion.div
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 280, damping: 30 }}
      className="fixed right-0 top-0 h-screen w-full max-w-lg z-50 overflow-y-auto"
      style={{ background: '#FFFFFF', borderLeft: '1px solid rgba(0,0,0,0.10)', boxShadow: '0 0 80px rgba(0,0,0,0.15)' }}
    >
      <div className="sticky top-0 border-b p-5 flex items-center gap-3 z-10" style={{ background: '#F8FAFC', borderColor: 'rgba(0,0,0,0.08)' }}>
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
            { label: 'Prime', value: pp.prime, color: PRIME_COLORS[pp.prime] },
            { label: 'Type', value: pp.type },
            { label: 'Finance', value: pp.financeType || '—' },
            { label: 'NAICS', value: pp.naicsCode },
            { label: 'Set-Aside', value: pp.setAside },
          ].map(f => (
            <div key={f.label} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-0.5">{f.label}</p>
              <p className="text-sm font-bold" style={f.color ? { color: f.color } : { color: '#1E293B' }}>{f.value}</p>
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
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">BDM</p>
            <p className="text-sm font-semibold text-slate-700">{pp.bdm}</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">BDS</p>
            <p className="text-sm font-semibold text-slate-700">{pp.bds}</p>
          </div>
        </div>

        {/* Export button */}
        <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">
          <Download size={14} /> Export to PDF Template
        </button>
      </div>
    </motion.div>
  )
}

function CreateModal({ onClose, onSave }: { onClose: () => void; onSave: (pp: Omit<PastPerformance, 'id' | 'createdAt'>) => void }) {
  const [form, setForm] = useState({
    contractNumber: '', title: '', client: '', prime: 'TECH-OR' as Prime,
    type: 'OTJ' as ContractType, financeType: 'FFP' as ContractFinanceType,
    naicsCode: '', setAside: 'SB' as SetAside, value: '',
    popStart: '', popEnd: '', location: '', description: '',
    relevance: '', keyPersonnel: '', challenges: '',
    bdm: '', bds: '',
  })

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))
  const valid = form.contractNumber && form.title && form.client && form.description && form.relevance && form.bdm && form.bds

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(8px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)' }}
      >
        <div className="sticky top-0 border-b p-5 flex items-center gap-3 z-10" style={{ background: '#F8FAFC', borderColor: 'rgba(0,0,0,0.08)' }}>
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Plus size={16} className="text-indigo-600" />
          </div>
          <h2 className="text-sm font-bold text-slate-800">Add Past Performance</h2>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Contract Number *', key: 'contractNumber' },
              { label: 'Title *', key: 'title' },
              { label: 'Client *', key: 'client' },
              { label: 'NAICS Code', key: 'naicsCode' },
              { label: 'PoP Start', key: 'popStart', type: 'date' },
              { label: 'PoP End', key: 'popEnd', type: 'date' },
              { label: 'Location', key: 'location' },
              { label: 'Contract Value', key: 'value', type: 'number' },
              { label: 'BDM *', key: 'bdm' },
              { label: 'BDS *', key: 'bds' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{f.label}</label>
                <input type={f.type || 'text'} value={(form as any)[f.key]}
                  onChange={e => set(f.key, e.target.value)}
                  className="input-field text-xs py-2 w-full" />
              </div>
            ))}
          </div>

          {/* Dropdowns row */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Prime', key: 'prime', opts: PRIME_OPTIONS },
              { label: 'Type', key: 'type', opts: TYPE_OPTIONS },
              { label: 'Finance', key: 'financeType', opts: FINANCE_OPTIONS },
              { label: 'Set-Aside', key: 'setAside', opts: SETASIDE_OPTIONS },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{f.label}</label>
                <select value={(form as any)[f.key]} onChange={e => set(f.key, e.target.value)} className="input-field text-xs py-2 w-full">
                  {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>

          {/* Textareas */}
          {[
            { label: 'Project Description *', key: 'description', rows: 3 },
            { label: 'Relevance *', key: 'relevance', rows: 2 },
            { label: 'Key Personnel', key: 'keyPersonnel', rows: 1 },
            { label: 'Challenges & Solutions', key: 'challenges', rows: 2 },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{f.label}</label>
              <textarea rows={f.rows} value={(form as any)[f.key]}
                onChange={e => set(f.key, e.target.value)}
                className="input-field text-xs py-2 w-full resize-none" />
            </div>
          ))}
        </div>

        <div className="flex gap-2 p-5 border-t" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
          <button onClick={onClose} className="btn-secondary flex-1 text-xs">Cancel</button>
          <button
            disabled={!valid}
            onClick={() => {
              onSave({
                contractNumber: form.contractNumber,
                title: form.title,
                client: form.client,
                prime: form.prime,
                type: form.type,
                financeType: form.financeType,
                naicsCode: form.naicsCode,
                setAside: form.setAside,
                value: parseFloat(form.value) || 0,
                popStart: form.popStart,
                popEnd: form.popEnd,
                location: form.location,
                description: form.description,
                relevance: form.relevance,
                keyPersonnel: form.keyPersonnel || undefined,
                challenges: form.challenges || undefined,
                bdm: form.bdm,
                bds: form.bds,
                createdBy: 'current_user',
              })
              onClose()
            }}
            className="btn-primary flex-1 text-xs gap-1.5 disabled:opacity-40"
          >
            <Save size={12} /> Save Record
          </button>
        </div>
      </motion.div>
    </div>
  )
}

export default function PastPerformancesPage() {
  const { pastPerformances, addPastPerformance } = useStore()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<PastPerformance | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!search) return pastPerformances
    const q = search.toLowerCase()
    return pastPerformances.filter(pp =>
      pp.title.toLowerCase().includes(q) ||
      pp.client.toLowerCase().includes(q) ||
      pp.contractNumber.toLowerCase().includes(q) ||
      pp.naicsCode.includes(q)
    )
  }, [pastPerformances, search])

  const totalValue = pastPerformances.reduce((s, p) => s + p.value, 0)

  return (
    <div className="p-6 page-enter">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] mb-1">CES · BUSINESS DEV</p>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            <History size={22} className="text-indigo-500" /> Past Performances
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{pastPerformances.length} records · {formatCurrency(totalValue)} total value</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary gap-2">
          <Plus size={14} /> Add Record
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5 max-w-md">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="input-field pl-9 text-sm w-full" placeholder="Search by title, client, contract number, NAICS…" />
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
                <th>Prime</th>
                <th>Type</th>
                <th>NAICS</th>
                <th>Set-Aside</th>
                <th>Value</th>
                <th>PoP</th>
                <th>BDM / BDS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-slate-400 text-sm">
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
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                      style={{ background: PRIME_COLORS[pp.prime] }}>
                      {pp.prime}
                    </span>
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
                            style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
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
                              onClick={() => { toast.success('Exporting PDF…'); setMenuOpen(null) }}
                              className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                              style={{ color: '#475569' }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#0F172A' }}
                              onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#475569' }}
                            >
                              Export to PDF
                            </button>
                            <div className="my-1 border-t" style={{ borderColor: 'rgba(0,0,0,0.08)' }} />
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
            <DetailDrawerPP pp={selected} onClose={() => setSelected(null)} />
          </>
        )}
      </AnimatePresence>

      {/* Create modal */}
      <AnimatePresence>
        {showCreate && (
          <CreateModal onClose={() => setShowCreate(false)} onSave={pp => { addPastPerformance(pp); setShowCreate(false) }} />
        )}
      </AnimatePresence>
    </div>
  )
}
