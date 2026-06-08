import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, X, Check, Shield, Search, Clock, Save, Network, List, GripVertical } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { User, Role } from '../types'
import { avatarColor, useEscapeKey } from '../lib/utils'
import { hasPermission, ROLE_LABELS } from '../lib/permissions'
import toast from 'react-hot-toast'

const ROLES: Role[] = ['CAPTURE_MANAGER', 'BD_MANAGER', 'TEAM_LEAD', 'ASSOCIATE', 'OPS_MANAGER']
const ROLE_BADGE: Record<Role, string> = {
  CAPTURE_MANAGER: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  BD_MANAGER:      'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',
  TEAM_LEAD:       'bg-violet-500/15 text-violet-400 border-violet-500/25',
  ASSOCIATE:       'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  OPS_MANAGER:     'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
}

type HierarchyTier = {
  key: string
  title: string
  subtitle: string
  roles: Role[]
  // Role assigned when the “+” tile is clicked OR when a card is dropped onto this tier.
  primaryRole: Role
  accent: string        // border / glow colour
  pillClass: string     // tailwind classes for header pill
}

const HIERARCHY_TIERS: HierarchyTier[] = [
  {
    key: 'executive',
    title: 'Executive',
    subtitle: 'Capture & Operations leadership',
    roles: ['CAPTURE_MANAGER', 'OPS_MANAGER'],
    primaryRole: 'CAPTURE_MANAGER',
    accent: 'rgba(245,158,11,0.45)',
    pillClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  {
    key: 'bd',
    title: 'BD Managers',
    subtitle: 'Lead the business-development teams',
    roles: ['BD_MANAGER'],
    primaryRole: 'BD_MANAGER',
    accent: 'rgba(99,102,241,0.45)',
    pillClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  },
  {
    key: 'leads',
    title: 'Team Leads',
    subtitle: 'Coordinate associates day-to-day',
    roles: ['TEAM_LEAD'],
    primaryRole: 'TEAM_LEAD',
    accent: 'rgba(139,92,246,0.45)',
    pillClass: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  },
  {
    key: 'associates',
    title: 'Associates',
    subtitle: 'Capture analysts & proposal writers',
    roles: ['ASSOCIATE'],
    primaryRole: 'ASSOCIATE',
    accent: 'rgba(16,185,129,0.45)',
    pillClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
]

type FormState = {
  name: string; email: string; role: Role; status: 'active' | 'inactive'
}

function UserModal({ user, defaultRole, onClose }: { user: User | null; defaultRole?: Role; onClose: () => void }) {
  const { createUser, updateUser } = useStore()
  const isEdit = !!user
  const [form, setForm] = useState<FormState>({
    name:   user?.name   ?? '',
    email:  user?.email  ?? '',
    role:   user?.role   ?? defaultRole ?? 'ASSOCIATE',
    status: user?.status ?? 'active',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.email) return
    const username = form.email.split('@')[0]
    if (isEdit) {
      updateUser(user!.id, { ...form, username })
      toast.success('User updated')
    } else {
      createUser({
        ...form, username,
        avatar: form.name.split(' ').map(p => p[0]).join('').slice(0,3).toUpperCase(),
        firstLogin: true, mfaEnabled: false,
      })
      toast.success(`User created. They'll set their password on first login.`)
    }
    onClose()
  }

  useEscapeKey(onClose)

  return createPortal(
    <motion.div className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative z-10 w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl p-6"
        style={{ background: 'rgba(7,14,34,0.98)', border: '1px solid rgba(99,102,241,0.2)', boxShadow: '0 24px 80px rgba(0,0,0,0.7)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-white">{isEdit ? 'Edit User' : 'Create User'}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={13} /></button>
        </div>

        {!isEdit && (
          <div className="p-3 rounded-xl border border-indigo-500/15 bg-indigo-500/5 mb-4">
            <p className="text-[11px] text-slate-400">
              The username will be auto-set from the email (part before @). The user will set their own password on first login and be prompted to enable MFA.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Full Name *</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="input-field" placeholder="e.g. Aymane Chhouma" required />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Email *</label>
            <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              className="input-field" placeholder="user@cesolutionplus.com" required />
            {form.email.includes('@') && (
              <p className="text-[11px] text-indigo-400 mt-1">Username: {form.email.split('@')[0]}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Role *</label>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as Role }))}
                className="select-field">
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as 'active' | 'inactive' }))}
                className="select-field">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center">
              <Check size={13} /> {isEdit ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

export default function AdminPage() {
  const {
    users,
    deleteUser,
    updateUser,
    currentUser,
    nonSubGraceHours,
    nonSubGraceMinutes,
    updateNonSubGracePeriod,
  } = useStore()
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<'create' | User | null>(null)
  const [createRole, setCreateRole] = useState<Role | null>(null)
  const [view, setView] = useState<'hierarchy' | 'table'>('hierarchy')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverTier, setDragOverTier] = useState<string | null>(null)
  const [graceHours, setGraceHours] = useState(String(nonSubGraceHours))
  const [graceMinutes, setGraceMinutes] = useState(String(nonSubGraceMinutes))

  if (!hasPermission(currentUser, 'admin:manageUsers')) {
    return (
      <div className="p-6 page-enter">
        <div className="glass rounded-2xl p-8 text-center text-sm text-slate-400">
          Admin controls are only available to the Capture Manager.
        </div>
      </div>
    )
  }

  const filtered = users.filter(u =>
    !search ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = (u: User) => {
    if (u.id === currentUser?.id) { toast.error("You can't delete your own account."); return }
    deleteUser(u.id)
    toast.success(`${u.name} removed.`)
  }

  const openCreate = (role?: Role) => {
    setCreateRole(role ?? null)
    setModal('create')
  }

  const handleDrop = (tier: HierarchyTier) => {
    setDragOverTier(null)
    const id = dragId
    setDragId(null)
    if (!id) return
    const user = users.find(u => u.id === id)
    if (!user) return
    if (tier.roles.includes(user.role)) return
    if (user.id === currentUser?.id && !tier.roles.includes('CAPTURE_MANAGER')) {
      toast.error("You can't change your own role away from Capture Manager.")
      return
    }
    updateUser(user.id, { role: tier.primaryRole })
    toast.success(`${user.name} \u2192 ${ROLE_LABELS[tier.primaryRole]}`)
  }

  const saveNonSubTiming = () => {
    const hours = Math.max(0, Math.trunc(Number(graceHours) || 0))
    const minutes = Math.max(0, Math.trunc(Number(graceMinutes) || 0))
    updateNonSubGracePeriod(hours, minutes)
    setGraceHours(String(hours))
    setGraceMinutes(String(minutes))
    toast.success('Non-submission timing updated')
  }

  return (
    <div className="p-6 page-enter">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Shield size={20} className="text-indigo-400" /> User Management
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{users.length} users · {users.filter(u => u.status === 'active').length} active</p>
        </div>
        <button onClick={() => openCreate()} className="btn-primary">
          <Plus size={14} /> Create User
        </button>
      </div>

      <div className="glass rounded-2xl p-4 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={16} className="text-amber-300" />
              <h2 className="text-sm font-bold text-white">Non-Submission Timing</h2>
            </div>
            <p className="text-xs text-slate-400">
              Assigned opportunities move directly to Non-Submission Reports after the due datetime plus this grace period.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 block mb-1">Hours</label>
              <input
                type="number"
                min={0}
                value={graceHours}
                onChange={e => setGraceHours(e.target.value)}
                className="input-field w-full sm:w-28"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 block mb-1">Minutes</label>
              <input
                type="number"
                min={0}
                value={graceMinutes}
                onChange={e => setGraceMinutes(e.target.value)}
                className="input-field w-full sm:w-28"
              />
            </div>
            <button type="button" onClick={saveNonSubTiming} className="btn-primary justify-center">
              <Save size={13} /> Save Timing
            </button>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
        {ROLES.map(r => {
          const count = users.filter(u => u.role === r).length
          return (
            <div key={r} className="glass rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-white">{count}</p>
              <p className={`badge ${ROLE_BADGE[r]} text-[9px] mt-1 justify-center border`}>{ROLE_LABELS[r]}</p>
            </div>
          )
        })}
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-2 mb-4">
        <div className="inline-flex rounded-xl p-1" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <button
            onClick={() => setView('hierarchy')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${view === 'hierarchy' ? 'bg-indigo-500/20 text-indigo-200' : 'text-slate-400 hover:text-slate-200'}`}>
            <Network size={13} /> Hierarchy
          </button>
          <button
            onClick={() => setView('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${view === 'table' ? 'bg-indigo-500/20 text-indigo-200' : 'text-slate-400 hover:text-slate-200'}`}>
            <List size={13} /> Table
          </button>
        </div>
        <p className="text-[11px] text-slate-500 ml-1">
          {view === 'hierarchy' ? 'Click \u201C+\u201D to add a user at that level, or drag a card between tiers to change a role.' : 'Tabular view of all user accounts.'}
        </p>
      </div>

      {/* Hierarchy view */}
      {view === 'hierarchy' && (
        <div className="space-y-3">
          {HIERARCHY_TIERS.map((tier, idx) => {
            const tierUsers = users.filter(u => tier.roles.includes(u.role))
            const isOver = dragOverTier === tier.key
            return (
              <div key={tier.key}>
                <div
                  onDragOver={e => { e.preventDefault(); if (dragId) setDragOverTier(tier.key) }}
                  onDragLeave={() => { if (dragOverTier === tier.key) setDragOverTier(null) }}
                  onDrop={() => handleDrop(tier)}
                  className="glass rounded-2xl p-4 transition-all"
                  style={{
                    border: `1px solid ${isOver ? tier.accent : 'rgba(99,102,241,0.12)'}`,
                    boxShadow: isOver ? `0 0 0 2px ${tier.accent}, 0 12px 32px ${tier.accent}` : undefined,
                    background: isOver ? 'rgba(99,102,241,0.05)' : undefined,
                  }}>
                  <div className="flex items-center justify-between mb-3 gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`badge border text-[10px] ${tier.pillClass}`}>{tier.title}</span>
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-700/30 px-1.5 py-0.5 rounded-md">{tierUsers.length}</span>
                      <p className="text-[11px] text-slate-500 hidden sm:block">{tier.subtitle}</p>
                    </div>
                    {isOver && (
                      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: tier.accent }}>
                        Drop to set role: {ROLE_LABELS[tier.primaryRole]}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tierUsers.map(u => (
                      <div
                        key={u.id}
                        draggable
                        onDragStart={e => { setDragId(u.id); e.dataTransfer.effectAllowed = 'move' }}
                        onDragEnd={() => { setDragId(null); setDragOverTier(null) }}
                        onClick={() => setModal(u)}
                        className="group relative flex items-center gap-2 pl-2 pr-3 py-2 rounded-xl cursor-grab active:cursor-grabbing transition-all"
                        style={{
                          background: 'rgba(15,23,42,0.7)',
                          border: '1px solid rgba(99,102,241,0.18)',
                          opacity: dragId === u.id ? 0.4 : 1,
                          minWidth: 200,
                        }}>
                        <GripVertical size={12} className="text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0" />
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-gradient-to-br ${avatarColor(u.avatar)} flex-shrink-0`}>
                          {u.avatar.slice(0, 2)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-semibold text-slate-200 truncate">{u.name}</p>
                            {u.id === currentUser?.id && (
                              <span className="text-[8px] font-bold text-indigo-300 bg-indigo-400/15 px-1 py-0.5 rounded">YOU</span>
                            )}
                            {u.status === 'inactive' && (
                              <span className="text-[8px] font-bold text-rose-300 bg-rose-400/15 px-1 py-0.5 rounded">OFF</span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 truncate">@{u.username} · {ROLE_LABELS[u.role]}</p>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => openCreate(tier.primaryRole)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-indigo-300 transition-colors"
                      style={{ background: 'transparent', border: '1px dashed rgba(99,102,241,0.3)', minWidth: 200, justifyContent: 'center' }}>
                      <Plus size={13} /> Add to {tier.title}
                    </button>
                  </div>
                </div>
                {idx < HIERARCHY_TIERS.length - 1 && (
                  <div className="flex justify-center py-1">
                    <div className="w-px h-3" style={{ background: 'linear-gradient(to bottom, rgba(99,102,241,0.4), rgba(99,102,241,0.05))' }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Search */}
      {view === 'table' && (
        <div className="glass rounded-2xl p-4 mb-4">
          <div className="relative max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="input-field pl-9 text-xs" placeholder="Search by name, email, role\u2026" />
          </div>
        </div>
      )}

      {/* Table */}
      {view === 'table' && (
      <div className="glass rounded-2xl overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>User</th><th>Username</th><th>Email</th><th>Role</th>
              <th>Status</th><th>MFA</th><th>First Login</th><th>Created</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {filtered.map((u, i) => (
                <motion.tr key={u.id}
                  initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ delay: i * 0.04 }}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-gradient-to-br ${avatarColor(u.avatar)}`}>
                        {u.avatar.slice(0,2)}
                      </div>
                      <span className="text-xs font-medium text-slate-200">{u.name}</span>
                      {u.id === currentUser?.id && (
                        <span className="text-[9px] font-semibold text-indigo-400 bg-indigo-400/10 px-1.5 py-0.5 rounded-md">YOU</span>
                      )}
                    </div>
                  </td>
                  <td className="text-indigo-400 text-xs font-mono">@{u.username}</td>
                  <td className="text-slate-400 text-xs">{u.email}</td>
                  <td>
                    <span className={`badge border text-[10px] ${ROLE_BADGE[u.role]}`}>{ROLE_LABELS[u.role]}</span>
                  </td>
                  <td>
                    <span className={`badge text-[10px] ${u.status === 'active' ? 'badge-active' : 'badge-canceled'}`}>
                      {u.status}
                    </span>
                  </td>
                  <td>
                    <span className={`badge text-[10px] ${u.mfaEnabled ? 'badge-active' : 'badge-lost'}`}>
                      {u.mfaEnabled ? '✓ Enabled' : '✗ Off'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge text-[10px] ${u.firstLogin ? 'badge-pending' : 'badge-active'}`}>
                      {u.firstLogin ? 'Pending' : 'Complete'}
                    </span>
                  </td>
                  <td className="text-slate-600 text-xs">{u.createdAt}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setModal(u)} className="btn-ghost p-1.5 rounded-lg text-slate-400 hover:text-indigo-400">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => handleDelete(u)} className="btn-ghost p-1.5 rounded-lg text-slate-400 hover:text-rose-400">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
      )}

      <AnimatePresence>
        {modal && (
          <UserModal
            user={modal === 'create' ? null : modal as User}
            defaultRole={createRole ?? undefined}
            onClose={() => { setModal(null); setCreateRole(null) }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
