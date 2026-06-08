import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, X, Check, Shield, Search, Clock, Save, Network, List, GripVertical, Eye, EyeOff, KeyRound, RotateCcw, Users } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { User, Role, EmployeeTeam } from '../types'
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

// Returns the team a user lives in on the org chart. Managers are implicit;
// non-managers default to 'BD' for legacy users with no `team` set.
function teamOf(u: User): EmployeeTeam | null {
  if (u.role === 'CAPTURE_MANAGER') return null
  if (u.role === 'BD_MANAGER') return 'BD'
  if (u.role === 'OPS_MANAGER') return 'OPS'
  return u.team ?? 'BD'
}

type ZoneKey =
  | 'capture'
  | 'bd-manager' | 'bd-leads' | 'bd-associates'
  | 'ops-manager' | 'ops-leads' | 'ops-associates'

type DropZone = {
  key: ZoneKey
  title: string
  subtitle: string
  role: Role
  team: EmployeeTeam | null
  accent: string
  pillClass: string
}

const ZONES: Record<ZoneKey, DropZone> = {
  'capture':        { key: 'capture',        title: 'Capture Manager', subtitle: 'Top-level admin & oversight',  role: 'CAPTURE_MANAGER', team: null,  accent: 'rgba(245,158,11,0.45)', pillClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  'bd-manager':     { key: 'bd-manager',     title: 'BD Manager',      subtitle: 'Leads the BD team',             role: 'BD_MANAGER',      team: 'BD',  accent: 'rgba(99,102,241,0.45)', pillClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  'bd-leads':       { key: 'bd-leads',       title: 'Team Leads',      subtitle: 'BD coordinators',               role: 'TEAM_LEAD',       team: 'BD',  accent: 'rgba(139,92,246,0.45)', pillClass: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  'bd-associates':  { key: 'bd-associates',  title: 'Associates',      subtitle: 'BD analysts & writers',         role: 'ASSOCIATE',       team: 'BD',  accent: 'rgba(16,185,129,0.45)', pillClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  'ops-manager':    { key: 'ops-manager',    title: 'Operations Manager', subtitle: 'Leads the OPS team',         role: 'OPS_MANAGER',     team: 'OPS', accent: 'rgba(34,211,238,0.45)', pillClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  'ops-leads':      { key: 'ops-leads',      title: 'Team Leads',      subtitle: 'OPS coordinators',              role: 'TEAM_LEAD',       team: 'OPS', accent: 'rgba(139,92,246,0.45)', pillClass: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  'ops-associates': { key: 'ops-associates', title: 'Associates',      subtitle: 'OPS analysts & writers',        role: 'ASSOCIATE',       team: 'OPS', accent: 'rgba(16,185,129,0.45)', pillClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
}

// Map a user to its zone on the org chart.
function zoneOfUser(u: User): ZoneKey {
  if (u.role === 'CAPTURE_MANAGER') return 'capture'
  if (u.role === 'BD_MANAGER') return 'bd-manager'
  if (u.role === 'OPS_MANAGER') return 'ops-manager'
  const t = u.team ?? 'BD'
  if (u.role === 'TEAM_LEAD') return t === 'OPS' ? 'ops-leads' : 'bd-leads'
  return t === 'OPS' ? 'ops-associates' : 'bd-associates'
}

type FormState = {
  name: string
  email: string
  role: Role
  team: EmployeeTeam | null
  status: 'active' | 'inactive'
  password: string
  forceFirstLogin: boolean
}

function teamForRole(role: Role, fallback: EmployeeTeam | null): EmployeeTeam | null {
  if (role === 'CAPTURE_MANAGER') return null
  if (role === 'BD_MANAGER') return 'BD'
  if (role === 'OPS_MANAGER') return 'OPS'
  return fallback ?? 'BD'
}

function UserModal({ user, defaultRole, defaultTeam, onClose }: {
  user: User | null
  defaultRole?: Role
  defaultTeam?: EmployeeTeam | null
  onClose: () => void
}) {
  const { createUser, updateUser } = useStore()
  const isEdit = !!user
  const initialRole: Role = user?.role ?? defaultRole ?? 'ASSOCIATE'
  const initialTeam: EmployeeTeam | null = user
    ? teamOf(user)
    : teamForRole(initialRole, defaultTeam ?? 'BD')

  const [form, setForm] = useState<FormState>({
    name:   user?.name   ?? '',
    email:  user?.email  ?? '',
    role:   initialRole,
    team:   initialTeam,
    status: user?.status ?? 'active',
    password: '',
    forceFirstLogin: user ? false : true,
  })
  const [showPassword, setShowPassword] = useState(false)

  // When role changes, snap team to the role's required value (or keep editable for TL/Associate)
  const handleRoleChange = (r: Role) => {
    setForm(p => ({ ...p, role: r, team: teamForRole(r, p.team) }))
  }

  const teamEditable = form.role === 'TEAM_LEAD' || form.role === 'ASSOCIATE'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.email) return
    const username = form.email.split('@')[0]
    const team = teamForRole(form.role, form.team)
    if (isEdit) {
      const patch: Partial<User> = {
        name: form.name,
        email: form.email,
        username,
        role: form.role,
        status: form.status,
        team: team ?? undefined,
      }
      if (form.password.trim()) patch.password = form.password
      if (form.forceFirstLogin) {
        patch.firstLogin = true
        patch.password = '' // clear so any password works on next login until they set a new one
      }
      updateUser(user!.id, patch)
      toast.success('User updated')
    } else {
      createUser({
        name: form.name,
        email: form.email,
        username,
        role: form.role,
        status: form.status,
        avatar: form.name.split(' ').map(p => p[0]).join('').slice(0, 3).toUpperCase(),
        firstLogin: form.forceFirstLogin,
        mfaEnabled: false,
        team: team ?? undefined,
        password: form.password.trim() || undefined,
      })
      toast.success(form.password.trim()
        ? 'User created with initial password.'
        : `User created. They'll set their password on first login.`)
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
        className="relative z-10 w-full max-w-md flex flex-col max-h-[min(92vh,860px)] overflow-hidden rounded-2xl"
        style={{ background: 'rgba(7,14,34,0.98)', border: '1px solid rgba(99,102,241,0.2)', boxShadow: '0 24px 80px rgba(0,0,0,0.7)' }}>
        <div className="flex items-center justify-between p-6 pb-4 flex-shrink-0">
          <h2 className="font-semibold text-white">{isEdit ? 'Edit User' : 'Create User'}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={13} /></button>
        </div>

        <div className="px-6 pb-6 overflow-y-auto flex-1">
          {!isEdit && (
            <div className="p-3 rounded-xl border border-indigo-500/15 bg-indigo-500/5 mb-4">
              <p className="text-[11px] text-slate-400">
                The username will be auto-set from the email (part before @).
                Leave the password blank to require the user to set one on first login.
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
                <select value={form.role} onChange={e => handleRoleChange(e.target.value as Role)}
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

            {form.role !== 'CAPTURE_MANAGER' && (
              <div>
                <label className="text-xs text-slate-500 block mb-1 flex items-center gap-1.5">
                  <Users size={11} className="text-slate-400" /> Team
                  {!teamEditable && <span className="text-[10px] text-slate-600">(locked by role)</span>}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['BD', 'OPS'] as EmployeeTeam[]).map(t => {
                    const selected = form.team === t
                    const disabled = !teamEditable && form.team !== t
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={disabled}
                        onClick={() => teamEditable && setForm(p => ({ ...p, team: t }))}
                        className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                        style={{
                          background: selected ? (t === 'OPS' ? 'rgba(34,211,238,0.15)' : 'rgba(99,102,241,0.15)') : 'rgba(15,23,42,0.5)',
                          border: `1px solid ${selected ? (t === 'OPS' ? 'rgba(34,211,238,0.45)' : 'rgba(99,102,241,0.45)') : 'rgba(99,102,241,0.15)'}`,
                          color: selected ? (t === 'OPS' ? '#67e8f9' : '#a5b4fc') : '#94a3b8',
                          cursor: disabled ? 'not-allowed' : (teamEditable ? 'pointer' : 'default'),
                          opacity: disabled ? 0.5 : 1,
                        }}>
                        {t === 'BD' ? 'BD Team' : 'OPS Team'}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Password management — admin only (page is gated) */}
            <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 space-y-3">
              <div className="flex items-center gap-1.5">
                <KeyRound size={12} className="text-amber-300" />
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-amber-300">Password Management</h3>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  {isEdit ? 'Set new password' : 'Initial password (optional)'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    className="input-field pr-9"
                    placeholder={isEdit ? 'Leave blank to keep current' : 'Leave blank — user sets on first login'}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300">
                    {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              <label className="flex items-start gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={form.forceFirstLogin}
                  onChange={e => setForm(p => ({ ...p, forceFirstLogin: e.target.checked }))}
                  className="mt-0.5 accent-amber-400"
                />
                <span className="flex-1">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <RotateCcw size={11} className="text-amber-300" />
                    {isEdit ? 'Force password reset on next login' : 'Require password change on first login'}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    {isEdit
                      ? 'Clears their password and routes them to the first-login flow next time they sign in.'
                      : 'User will be sent through the first-login flow to pick their own password.'}
                  </span>
                </span>
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button type="submit" className="btn-primary flex-1 justify-center">
                <Check size={13} /> {isEdit ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
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
  const [createTeam, setCreateTeam] = useState<EmployeeTeam | null>(null)
  const [view, setView] = useState<'hierarchy' | 'table'>('hierarchy')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverZone, setDragOverZone] = useState<ZoneKey | null>(null)
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

  const openCreate = (role?: Role, team?: EmployeeTeam | null) => {
    setCreateRole(role ?? null)
    setCreateTeam(team ?? null)
    setModal('create')
  }

  const handleDrop = (zone: DropZone) => {
    setDragOverZone(null)
    const id = dragId
    setDragId(null)
    if (!id) return
    const user = users.find(u => u.id === id)
    if (!user) return
    if (zoneOfUser(user) === zone.key) return
    if (user.id === currentUser?.id && zone.role !== 'CAPTURE_MANAGER') {
      toast.error("You can't change your own role away from Capture Manager.")
      return
    }
    updateUser(user.id, { role: zone.role, team: zone.team ?? undefined })
    const where = zone.team ? ` (${zone.team})` : ''
    toast.success(`${user.name} \u2192 ${ROLE_LABELS[zone.role]}${where}`)
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
          {view === 'hierarchy' ? 'Click \u201C+\u201D to add a user, or drag a card between zones to change role / team.' : 'Tabular view of all user accounts.'}
        </p>
      </div>

      {/* Hierarchy view — top-down org chart with BD and OPS columns */}
      {view === 'hierarchy' && (
        <div className="space-y-3">
          {/* Executive tier — full width */}
          <HierarchyZone
            zone={ZONES['capture']}
            users={users.filter(u => zoneOfUser(u) === 'capture')}
            isOver={dragOverZone === 'capture'}
            dragId={dragId}
            currentUserId={currentUser?.id}
            onDragOver={() => dragId && setDragOverZone('capture')}
            onDragLeave={() => dragOverZone === 'capture' && setDragOverZone(null)}
            onDrop={() => handleDrop(ZONES['capture'])}
            onCardDragStart={(id) => setDragId(id)}
            onCardDragEnd={() => { setDragId(null); setDragOverZone(null) }}
            onCardClick={(u) => setModal(u)}
            onAdd={() => openCreate(ZONES['capture'].role, ZONES['capture'].team)}
          />

          {/* Connector line */}
          <div className="flex justify-center py-1">
            <div className="w-px h-4" style={{ background: 'linear-gradient(to bottom, rgba(99,102,241,0.4), rgba(99,102,241,0.05))' }} />
          </div>

          {/* Two-column team grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {([
              { team: 'BD' as const,  header: 'BD Team',  headerClass: 'bg-indigo-500/15 text-indigo-200 border-indigo-500/30', zones: ['bd-manager', 'bd-leads', 'bd-associates'] as ZoneKey[] },
              { team: 'OPS' as const, header: 'OPS Team', headerClass: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/30',       zones: ['ops-manager', 'ops-leads', 'ops-associates'] as ZoneKey[] },
            ]).map(col => (
              <div key={col.team} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className={`badge border text-[10px] font-bold uppercase tracking-wider ${col.headerClass}`}>{col.header}</span>
                  <div className="flex-1 h-px" style={{ background: col.team === 'OPS' ? 'rgba(34,211,238,0.2)' : 'rgba(99,102,241,0.2)' }} />
                </div>
                {col.zones.map((zk, idx) => {
                  const zone = ZONES[zk]
                  return (
                    <div key={zk}>
                      <HierarchyZone
                        zone={zone}
                        users={users.filter(u => zoneOfUser(u) === zk)}
                        isOver={dragOverZone === zk}
                        dragId={dragId}
                        currentUserId={currentUser?.id}
                        onDragOver={() => dragId && setDragOverZone(zk)}
                        onDragLeave={() => dragOverZone === zk && setDragOverZone(null)}
                        onDrop={() => handleDrop(zone)}
                        onCardDragStart={(id) => setDragId(id)}
                        onCardDragEnd={() => { setDragId(null); setDragOverZone(null) }}
                        onCardClick={(u) => setModal(u)}
                        onAdd={() => openCreate(zone.role, zone.team)}
                      />
                      {idx < col.zones.length - 1 && (
                        <div className="flex justify-center py-1">
                          <div className="w-px h-3" style={{ background: 'linear-gradient(to bottom, rgba(99,102,241,0.4), rgba(99,102,241,0.05))' }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
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
              <th>User</th><th>Username</th><th>Email</th><th>Role</th><th>Team</th>
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
                    {teamOf(u) ? (
                      <span className={`badge border text-[10px] ${teamOf(u) === 'OPS' ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25' : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25'}`}>
                        {teamOf(u)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-600">—</span>
                    )}
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
            defaultTeam={createTeam ?? undefined}
            onClose={() => { setModal(null); setCreateRole(null); setCreateTeam(null) }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HierarchyZone — a single drop target on the org chart
// ─────────────────────────────────────────────────────────────────────────────
function HierarchyZone({
  zone, users, isOver, dragId, currentUserId,
  onDragOver, onDragLeave, onDrop,
  onCardDragStart, onCardDragEnd, onCardClick, onAdd,
}: {
  zone: DropZone
  users: User[]
  isOver: boolean
  dragId: string | null
  currentUserId: string | undefined
  onDragOver: () => void
  onDragLeave: () => void
  onDrop: () => void
  onCardDragStart: (id: string) => void
  onCardDragEnd: () => void
  onCardClick: (u: User) => void
  onAdd: () => void
}) {
  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver() }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="glass rounded-2xl p-4 transition-all"
      style={{
        border: `1px solid ${isOver ? zone.accent : 'rgba(99,102,241,0.12)'}`,
        boxShadow: isOver ? `0 0 0 2px ${zone.accent}, 0 12px 32px ${zone.accent}` : undefined,
        background: isOver ? 'rgba(99,102,241,0.05)' : undefined,
      }}>
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`badge border text-[10px] ${zone.pillClass}`}>{zone.title}</span>
          <span className="text-[10px] font-bold text-slate-500 bg-slate-700/30 px-1.5 py-0.5 rounded-md">{users.length}</span>
          <p className="text-[11px] text-slate-500 hidden sm:block truncate">{zone.subtitle}</p>
        </div>
        {isOver && (
          <p className="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: zone.accent }}>
            Drop here
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {users.map(u => (
          <div
            key={u.id}
            draggable
            onDragStart={e => { onCardDragStart(u.id); e.dataTransfer.effectAllowed = 'move' }}
            onDragEnd={onCardDragEnd}
            onClick={() => onCardClick(u)}
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
                {u.id === currentUserId && (
                  <span className="text-[8px] font-bold text-indigo-300 bg-indigo-400/15 px-1 py-0.5 rounded">YOU</span>
                )}
                {u.status === 'inactive' && (
                  <span className="text-[8px] font-bold text-rose-300 bg-rose-400/15 px-1 py-0.5 rounded">OFF</span>
                )}
                {u.firstLogin && (
                  <span className="text-[8px] font-bold text-amber-300 bg-amber-400/15 px-1 py-0.5 rounded" title="Pending first login">1ST</span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 truncate">@{u.username} · {ROLE_LABELS[u.role]}</p>
            </div>
          </div>
        ))}
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-indigo-300 transition-colors"
          style={{ background: 'transparent', border: '1px dashed rgba(99,102,241,0.3)', minWidth: 200, justifyContent: 'center' }}>
          <Plus size={13} /> Add
        </button>
      </div>
    </div>
  )
}
