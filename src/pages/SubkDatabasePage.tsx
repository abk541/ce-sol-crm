import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, Plus, Search, Phone, Mail, FileUp,
  Tag, Briefcase, X, Save, Eye, Pencil, Trash2, MoreHorizontal,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import type { SubkDatabaseEntry, SetAside } from '../types'
import { formatCurrency } from '../lib/utils'
import toast from 'react-hot-toast'

const SETASIDE_OPTIONS: SetAside[] = ['SB', 'SDVOSB', 'WOSB', 'HUBZone', 'VOSB', '8(a)', 'UNRES']

const SETASIDE_COLORS: Record<string, { bg: string; color: string }> = {
  SB:       { bg: '#EEF2FF', color: '#4338CA' },
  SDVOSB:   { bg: '#FEF3C7', color: '#D97706' },
  WOSB:     { bg: '#FCE7F3', color: '#BE185D' },
  HUBZone:  { bg: '#D1FAE5', color: '#065F46' },
  VOSB:     { bg: '#DBEAFE', color: '#1D4ED8' },
  '8(a)':   { bg: '#FFEDD5', color: '#C2410C' },
  UNRES:    { bg: '#F1F5F9', color: '#64748B' },
}

function EntryDrawer({ entry, onClose }: { entry: SubkDatabaseEntry; onClose: () => void }) {
  const saStyle = SETASIDE_COLORS[entry.setAside] || SETASIDE_COLORS['UNRES']

  return (
    <motion.div
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 280, damping: 30 }}
      className="fixed right-0 top-0 h-screen w-full max-w-md z-50 overflow-y-auto"
      style={{ background: 'var(--bg-card)', borderLeft: '1px solid var(--border-default)', boxShadow: '0 0 80px rgba(0,0,0,0.15)' }}
    >
      <div className="sticky top-0 border-b p-5 flex items-center gap-3 z-10" style={{ background: 'var(--bg-raised)', borderColor: 'var(--border-default)' }}>
        <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
          <Building2 size={16} className="text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-slate-800 truncate">{entry.companyName}</h2>
          <p className="text-xs text-slate-400">{entry.contactName}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
      </div>

      <div className="p-5 space-y-5">
        {/* Set-aside + stats */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ background: saStyle.bg, color: saStyle.color }}>
            {entry.setAside}
          </span>
          <span className="text-xs text-slate-500">{entry.totalContractsWorked} contracts worked</span>
        </div>

        {/* Contact info */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Mail size={13} className="text-slate-400" />{entry.email}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Phone size={13} className="text-slate-400" />{entry.phone}
          </div>
        </div>

        {/* NAICS codes */}
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">NAICS Codes</p>
          <div className="flex flex-wrap gap-1.5">
            {entry.naicsCodes.map(n => (
              <span key={n} className="text-xs font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{n}</span>
            ))}
          </div>
        </div>

        {/* Notes */}
        {entry.notes && (
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Notes</p>
            <p className="text-sm text-slate-700 leading-relaxed">{entry.notes}</p>
          </div>
        )}

        {/* Past projects */}
        {entry.pastProjects.length > 0 && (
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Past Projects</p>
            <div className="space-y-2">
              {entry.pastProjects.map((proj, i) => (
                <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-xs font-semibold text-slate-800">{proj.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{proj.client} · {proj.year}</p>
                  {proj.value && (
                    <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">{formatCurrency(proj.value)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quote file */}
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Quote File</p>
          {entry.quoteFile ? (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-indigo-50 border border-indigo-200">
              <Tag size={13} className="text-indigo-600" />
              <span className="text-xs text-indigo-700 font-semibold flex-1 truncate">{entry.quoteFile}</span>
              <button className="text-xs text-indigo-600 hover:underline">Download</button>
            </div>
          ) : (
            <button className="flex items-center gap-2 text-xs text-slate-500 hover:text-indigo-600 transition-colors p-2 rounded-lg border border-dashed border-slate-300 hover:border-indigo-400 w-full justify-center">
              <FileUp size={12} /> Upload Quote PDF
            </button>
          )}
        </div>

        <p className="text-[10px] text-slate-400">
          Added {new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} by {entry.createdBy}
        </p>
      </div>
    </motion.div>
  )
}

function CreateModal({ onClose, onSave }: { onClose: () => void; onSave: (e: Omit<SubkDatabaseEntry, 'id' | 'createdAt'>) => void }) {
  const { currentUser } = useStore()
  const [form, setForm] = useState({
    companyName: '', contactName: '', email: '', phone: '',
    naicsCodes: '', setAside: 'SB' as SetAside, notes: '',
  })
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))
  const valid = form.companyName && form.contactName

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(8px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="rounded-2xl w-full max-w-lg"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: '0 24px 80px rgba(0,0,0,0.15)' }}
      >
        <div className="flex items-center gap-3 p-5 border-b" style={{ borderColor: 'var(--border-default)' }}>
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Plus size={16} className="text-indigo-600" />
          </div>
          <h2 className="text-sm font-bold text-slate-800">Add Sourcing</h2>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Company Name *', key: 'companyName' },
              { label: 'Contact Name *', key: 'contactName' },
              { label: 'Email', key: 'email', type: 'email' },
              { label: 'Phone', key: 'phone' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{f.label}</label>
                <input type={f.type || 'text'} value={(form as any)[f.key]}
                  onChange={e => set(f.key, e.target.value)}
                  className="input-field text-xs py-2 w-full" />
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">NAICS Codes (comma separated)</label>
            <input value={form.naicsCodes} onChange={e => set('naicsCodes', e.target.value)}
              className="input-field text-xs py-2 w-full" placeholder="238220, 561621, 238290" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Set-Aside</label>
            <select value={form.setAside} onChange={e => set('setAside', e.target.value)} className="input-field text-xs py-2 w-full">
              {SETASIDE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
            <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
              className="input-field text-xs py-2 w-full resize-none" />
          </div>
        </div>

        <div className="flex gap-2 p-5 border-t" style={{ borderColor: 'var(--border-default)' }}>
          <button onClick={onClose} className="btn-secondary flex-1 text-xs">Cancel</button>
          <button
            disabled={!valid}
            onClick={() => {
              onSave({
                companyName: form.companyName,
                contactName: form.contactName,
                email: form.email,
                phone: form.phone,
                naicsCodes: form.naicsCodes.split(',').map(n => n.trim()).filter(Boolean),
                setAside: form.setAside,
                pastProjects: [],
                notes: form.notes,
                totalContractsWorked: 0,
                createdBy: currentUser?.username || 'unknown',
              })
              onClose()
            }}
            className="btn-primary flex-1 text-xs gap-1.5 disabled:opacity-40"
          >
            <Save size={12} /> Add Entry
          </button>
        </div>
      </motion.div>
    </div>
  )
}

export default function SubkDatabasePage() {
  const { subkDatabase, addSubkDatabaseEntry } = useStore()
  const [search, setSearch] = useState('')
  const [filterSA, setFilterSA] = useState<string>('ALL')
  const [selected, setSelected] = useState<SubkDatabaseEntry | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let list = subkDatabase
    if (filterSA !== 'ALL') list = list.filter(e => e.setAside === filterSA)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(e =>
        e.companyName.toLowerCase().includes(q) ||
        e.contactName.toLowerCase().includes(q) ||
        e.naicsCodes.some(n => n.includes(q))
      )
    }
    return list
  }, [subkDatabase, search, filterSA])

  return (
    <div className="p-6 page-enter">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] mb-1">CES · OPERATIONS</p>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            <Building2 size={22} className="text-indigo-500" /> Sourcing Database
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{subkDatabase.length} sourcing entries on record</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary gap-2">
          <Plus size={14} /> Add Sourcing
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="input-field pl-9 text-sm" placeholder="Search company, contact, NAICS…" />
        </div>
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
          {['ALL', ...SETASIDE_OPTIONS].map(sa => (
            <button key={sa} onClick={() => setFilterSA(sa)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                filterSA === sa
                  ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              {sa}
            </button>
          ))}
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.length === 0 && (
          <div className="col-span-full py-16 text-center text-slate-400 text-sm bg-white rounded-2xl border border-slate-100">
            No sourcing entries found.
          </div>
        )}
        {filtered.map((entry, i) => {
          const saStyle = SETASIDE_COLORS[entry.setAside] || SETASIDE_COLORS['UNRES']
          return (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => setSelected(entry)}
              className="relative bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer p-5"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                  style={{ background: saStyle.color }}>
                  {entry.companyName.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-slate-800 truncate">{entry.companyName}</h3>
                  <p className="text-xs text-slate-500 truncate">{entry.contactName}</p>
                </div>
                <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: saStyle.bg, color: saStyle.color }}>
                  {entry.setAside}
                </span>
                <div className="relative" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === entry.id ? null : entry.id) }}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    <MoreHorizontal size={13} />
                  </button>
                  <AnimatePresence>
                    {menuOpen === entry.id && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(null)} />
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -4 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -4 }}
                          transition={{ duration: 0.12 }}
                          className="absolute right-0 top-7 z-30 rounded-xl py-1 w-44"
                          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
                        >
                          <button
                            onClick={() => { setSelected(entry); setMenuOpen(null) }}
                            className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                            style={{ color: '#475569' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#0F172A' }}
                            onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#475569' }}
                          >
                            View Profile
                          </button>
                          <button
                            onClick={() => { navigator.clipboard.writeText(entry.email); toast.success('Email copied'); setMenuOpen(null) }}
                            className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                            style={{ color: '#475569' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#0F172A' }}
                            onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#475569' }}
                          >
                            Copy Email
                          </button>
                          <button
                            onClick={() => { navigator.clipboard.writeText(entry.phone); toast.success('Phone copied'); setMenuOpen(null) }}
                            className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                            style={{ color: '#475569' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#0F172A' }}
                            onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#475569' }}
                          >
                            Copy Phone
                          </button>
                          <button
                            onClick={() => { navigator.clipboard.writeText(entry.naicsCodes.join(', ')); toast.success('NAICS codes copied'); setMenuOpen(null) }}
                            className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                            style={{ color: '#475569' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#0F172A' }}
                            onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#475569' }}
                          >
                            Copy NAICS
                          </button>
                          <div className="my-1 border-t" style={{ borderColor: 'var(--border-default)' }} />
                          <button
                            onClick={() => { toast.error('Delete not yet implemented'); setMenuOpen(null) }}
                            className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                            style={{ color: '#DC2626' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.06)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#DC2626' }}
                          >
                            Remove Entry
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Contact */}
              <div className="space-y-1 mb-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Mail size={10} className="text-slate-400" />
                  <span className="truncate">{entry.email}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Phone size={10} className="text-slate-400" />
                  {entry.phone}
                </div>
              </div>

              {/* NAICS codes */}
              <div className="flex flex-wrap gap-1 mb-3">
                {entry.naicsCodes.slice(0, 3).map(n => (
                  <span key={n} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{n}</span>
                ))}
                {entry.naicsCodes.length > 3 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">+{entry.naicsCodes.length - 3}</span>
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>{entry.totalContractsWorked} contracts worked</span>
                {entry.quoteFile && (
                  <span className="flex items-center gap-1 text-indigo-500">
                    <Tag size={10} /> Quote on file
                  </span>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Detail drawer */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/20" onClick={() => setSelected(null)} />
            <EntryDrawer entry={selected} onClose={() => setSelected(null)} />
          </>
        )}
      </AnimatePresence>

      {/* Create modal */}
      <AnimatePresence>
        {showCreate && (
          <CreateModal onClose={() => setShowCreate(false)} onSave={e => { addSubkDatabaseEntry(e); setShowCreate(false) }} />
        )}
      </AnimatePresence>
    </div>
  )
}
