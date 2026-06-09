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

// ─────────────────────────────────────────────────────────────────────────────
// Org-chart drop target system
//
// The hierarchy is a real tree:
//   Capture Managers (top)
//     ├─ BD_MANAGER ─ TEAM_LEAD ─ ASSOCIATE
//     └─ OPS_MANAGER ─ TEAM_LEAD ─ ASSOCIATE
//
// Dropping a card on a target re-roles, re-teams, and re-parents the user in
// one go. The semantics are intentionally simple:
//
//   * Drop on Capture row     → CAPTURE_MANAGER, team=null, no parent
//   * Drop on Team header     → BD_MANAGER / OPS_MANAGER, team=BD/OPS, no parent
//   * Drop on a Manager card  → TEAM_LEAD under that manager (inherits team)
//   * Drop on a TL card       → ASSOCIATE under that TL  (inherits team)
// ─────────────────────────────────────────────────────────────────────────────
type DropTarget =
  | { kind: 'capture' }
  | { kind: 'team'; team: EmployeeTeam }
  | { kind: 'manager'; id: string; team: EmployeeTeam }
  | { kind: 'tl'; id: string; team: EmployeeTeam }

function resolveDrop(target: DropTarget): { role: Role; team: EmployeeTeam | null; managerId: string | null } {
  switch (target.kind) {
    case 'capture':  return { role: 'CAPTURE_MANAGER', team: null, managerId: null }
    case 'team':     return { role: target.team === 'BD' ? 'BD_MANAGER' : 'OPS_MANAGER', team: target.team, managerId: null }
    case 'manager':  return { role: 'TEAM_LEAD', team: target.team, managerId: target.id }
    case 'tl':       return { role: 'ASSOCIATE', team: target.team, managerId: target.id }
  }
}

function targetKey(t: DropTarget): string {
  switch (t.kind) {
    case 'capture': return 'capture'
    case 'team':    return `team:${t.team}`
    case 'manager': return `manager:${t.id}`
    case 'tl':      return `tl:${t.id}`
  }
}

type FormState = {
  name: string
  email: string
  role: Role
  team: EmployeeTeam | null
  managerId: string | null
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

// Returns the role of the user whose id is `managerId` if they're a valid
// parent for `role`, else null.
function validParentRole(role: Role): Role | null {
  if (role === 'TEAM_LEAD') return 'BD_MANAGER' // also OPS_MANAGER — checked elsewhere
  if (role === 'ASSOCIATE') return 'TEAM_LEAD'
  return null
}

function UserModal({ user, defaultRole, defaultTeam, defaultManagerId, onClose }: {
  user: User | null
  defaultRole?: Role
  defaultTeam?: EmployeeTeam | null
  defaultManagerId?: string | null
  onClose: () => void
}) {
  const { createUser, updateUser, users } = useStore()
  const isEdit = !!user
  const initialRole: Role = user?.role ?? defaultRole ?? 'ASSOCIATE'
  const initialTeam: EmployeeTeam | null = user
    ? teamOf(user)
    : teamForRole(initialRole, defaultTeam ?? 'BD')
  const initialManagerId: string | null = user?.managerId ?? defaultManagerId ?? null

  const [form, setForm] = useState<FormState>({
    name:   user?.name   ?? '',
    email:  user?.email  ?? '',
    role:   initialRole,
    team:   initialTeam,
    managerId: initialManagerId,
    status: user?.status ?? 'active',
    password: '',
    forceFirstLogin: user ? false : true,
  })
  const [showPassword, setShowPassword] = useState(false)

  // When role changes, snap team and clear an invalid parent.
  const handleRoleChange = (r: Role) => {
    setForm(p => {
      const newTeam = teamForRole(r, p.team)
      const parentRole = validParentRole(r)
      const stillValid = parentRole && p.managerId
        ? users.some(u => u.id === p.managerId && (
            r === 'TEAM_LEAD'
              ? (u.role === 'BD_MANAGER' || u.role === 'OPS_MANAGER') && teamOf(u) === newTeam
              : u.role === 'TEAM_LEAD' && teamOf(u) === newTeam
          ))
        : false
      return { ...p, role: r, team: newTeam, managerId: stillValid ? p.managerId : null }
    })
  }

  const teamEditable = form.role === 'TEAM_LEAD' || form.role === 'ASSOCIATE'
  const managerNeeded = form.role === 'TEAM_LEAD' || form.role === 'ASSOCIATE'

  // Candidate parents based on role + team.
  const parentCandidates = managerNeeded
    ? users.filter(u => {
        if (u.id === user?.id) return false // can't parent yourself
        if (form.role === 'TEAM_LEAD') {
          if (u.role !== 'BD_MANAGER' && u.role !== 'OPS_MANAGER') return false
        } else {
          if (u.role !== 'TEAM_LEAD') return false
        }
        return teamOf(u) === form.team
      })
    : []

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.email) return
    const username = form.email.split('@')[0]
    const team = teamForRole(form.role, form.team)
    const managerId = managerNeeded ? form.managerId : null
    if (isEdit) {
      const patch: Partial<User> = {
        name: form.name,
        email: form.email,
        username,
        role: form.role,
        status: form.status,
        team: team ?? undefined,
        managerId,
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
        managerId,
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
                    const palette = t === 'BD'
                      ? { bg: 'rgba(184,145,78,0.14)', border: 'rgba(215,190,122,0.45)', text: '#E8C77B' }
                      : { bg: 'rgba(31,122,120,0.16)',  border: 'rgba(31,122,120,0.55)',  text: '#7DD3CF' }
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={disabled}
                        onClick={() => teamEditable && setForm(p => ({ ...p, team: t, managerId: null }))}
                        className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                        style={{
                          background: selected ? palette.bg : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${selected ? palette.border : 'var(--border-default)'}`,
                          color: selected ? palette.text : 'rgba(248,251,247,0.55)',
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

            {managerNeeded && (
              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  {form.role === 'TEAM_LEAD' ? 'Reports to (Manager)' : 'Reports to (Team Lead)'}
                </label>
                <select
                  value={form.managerId ?? ''}
                  onChange={e => setForm(p => ({ ...p, managerId: e.target.value || null }))}
                  className="select-field">
                  <option value="">— Unassigned —</option>
                  {parentCandidates.map(p => (
                    <option key={p.id} value={p.id}>{p.name} · {ROLE_LABELS[p.role]}</option>
                  ))}
                </select>
                {parentCandidates.length === 0 && (
                  <p className="text-[10px] text-slate-500 mt-1">
                    No {form.role === 'TEAM_LEAD' ? 'managers' : 'team leads'} on the {form.team} team yet.
                  </p>
                )}
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
  const [createManagerId, setCreateManagerId] = useState<string | null>(null)
  const [view, setView] = useState<'hierarchy' | 'table'>('hierarchy')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
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

  const openCreate = (role?: Role, team?: EmployeeTeam | null, managerId?: string | null) => {
    setCreateRole(role ?? null)
    setCreateTeam(team ?? null)
    setCreateManagerId(managerId ?? null)
    setModal('create')
  }

  // Recursively cascade a team change to a user's descendants in the org tree.
  // Used when a manager is moved between teams so their subtree follows.
  const collectDescendants = (rootId: string): string[] => {
    const out: string[] = []
    const visit = (parentId: string) => {
      for (const u of users) {
        if (u.managerId === parentId) {
          out.push(u.id)
          visit(u.id)
        }
      }
    }
    visit(rootId)
    return out
  }

  const handleDrop = (target: DropTarget) => {
    setDragOverKey(null)
    const id = dragId
    setDragId(null)
    if (!id) return
    const user = users.find(u => u.id === id)
    if (!user) return
    // Disallow dropping a user onto themselves or onto one of their own descendants
    if (target.kind === 'manager' && target.id === user.id) return
    if (target.kind === 'tl' && target.id === user.id) return
    const desc = collectDescendants(user.id)
    if ((target.kind === 'manager' || target.kind === 'tl') && desc.includes(target.id)) {
      toast.error("Can't reparent under a descendant.")
      return
    }
    const next = resolveDrop(target)
    if (user.id === currentUser?.id && next.role !== 'CAPTURE_MANAGER') {
      toast.error("You can't change your own role away from Capture Manager.")
      return
    }
    // No-op detection
    if (
      user.role === next.role &&
      (user.team ?? null) === next.team &&
      (user.managerId ?? null) === next.managerId
    ) return

    updateUser(user.id, {
      role: next.role,
      team: next.team ?? undefined,
      managerId: next.managerId,
    })
    // If a manager moved teams, drag their whole subtree along.
    if (next.team && (target.kind === 'team' || target.kind === 'capture')) {
      for (const did of desc) {
        const d = users.find(u => u.id === did)
        if (d && (d.team ?? 'BD') !== next.team) {
          updateUser(did, { team: next.team })
        }
      }
    }
    const where = next.team ? ` (${next.team})` : ''
    toast.success(`${user.name} \u2192 ${ROLE_LABELS[next.role]}${where}`)
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
          {view === 'hierarchy'
            ? 'Drop a card on a Manager to make them a Team Lead, on a Team Lead to make them an Associate, or on a team header to make them a Manager.'
            : 'Tabular view of all user accounts.'}
        </p>
      </div>

      {/* Hierarchy view — true org tree (Manager → Team Lead → Associate) */}
      {view === 'hierarchy' && (() => {
        const captures = users.filter(u => u.role === 'CAPTURE_MANAGER')
        const bdManagers = users.filter(u => u.role === 'BD_MANAGER')
        const opsManagers = users.filter(u => u.role === 'OPS_MANAGER')
        // Orphans = TLs/Associates with no manager assigned, grouped by team.
        const orphan = (team: EmployeeTeam) => ({
          tls: users.filter(u => u.role === 'TEAM_LEAD' && !u.managerId && (u.team ?? 'BD') === team),
          ass: users.filter(u => u.role === 'ASSOCIATE' && !u.managerId && (u.team ?? 'BD') === team),
        })

        return (
          <div className="space-y-3">
            {/* Capture Managers row */}
            <CaptureRow
              users={captures}
              dragId={dragId}
              isOver={dragOverKey === targetKey({ kind: 'capture' })}
              currentUserId={currentUser?.id}
              onDragOver={() => dragId && setDragOverKey(targetKey({ kind: 'capture' }))}
              onDragLeave={() => dragOverKey === targetKey({ kind: 'capture' }) && setDragOverKey(null)}
              onDrop={() => handleDrop({ kind: 'capture' })}
              onCardDragStart={id => setDragId(id)}
              onCardDragEnd={() => { setDragId(null); setDragOverKey(null) }}
              onCardClick={u => setModal(u)}
              onAdd={() => openCreate('CAPTURE_MANAGER', null, null)}
            />

            <div className="flex justify-center py-0.5">
              <div className="w-px h-4" style={{ background: 'linear-gradient(to bottom, rgba(215,190,122,0.55), rgba(215,190,122,0.05))' }} />
            </div>

            {/* Two team columns side-by-side */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {([
                { team: 'BD'  as const, label: 'BD Team',  managers: bdManagers,  orphans: orphan('BD') },
                { team: 'OPS' as const, label: 'OPS Team', managers: opsManagers, orphans: orphan('OPS') },
              ]).map(col => (
                <TeamColumn
                  key={col.team}
                  team={col.team}
                  label={col.label}
                  managers={col.managers}
                  orphans={col.orphans}
                  allUsers={users}
                  dragId={dragId}
                  dragOverKey={dragOverKey}
                  currentUserId={currentUser?.id}
                  onDragOver={key => dragId && setDragOverKey(key)}
                  onDragLeave={key => dragOverKey === key && setDragOverKey(null)}
                  onDrop={t => handleDrop(t)}
                  onCardDragStart={id => setDragId(id)}
                  onCardDragEnd={() => { setDragId(null); setDragOverKey(null) }}
                  onCardClick={u => setModal(u)}
                  onAdd={(role, team, mgrId) => openCreate(role, team, mgrId)}
                />
              ))}
            </div>
          </div>
        )
      })()}

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
            defaultManagerId={createManagerId}
            onClose={() => { setModal(null); setCreateRole(null); setCreateTeam(null); setCreateManagerId(null) }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Org-tree components — Capture row, Team column, Manager / TL / Associate
// ─────────────────────────────────────────────────────────────────────────────

const TEAM_PALETTE: Record<EmployeeTeam, { bg: string; border: string; pill: string; accent: string; text: string; soft: string }> = {
  BD: {
    bg: 'rgba(184,145,78,0.06)',
    border: 'rgba(215,190,122,0.22)',
    pill: 'rgba(184,145,78,0.18)',
    accent: '#D7BE7A',
    text: '#E8C77B',
    soft: 'rgba(215,190,122,0.12)',
  },
  OPS: {
    bg: 'rgba(31,122,120,0.06)',
    border: 'rgba(31,122,120,0.32)',
    pill: 'rgba(31,122,120,0.20)',
    accent: '#5EBCB9',
    text: '#7DD3CF',
    soft: 'rgba(31,122,120,0.14)',
  },
}

const CAPTURE_ACCENT = '#D7BE7A'

type CardProps = {
  user: User
  dragging: boolean
  isCurrentUser: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onClick: () => void
}

function UserCard({ user, dragging, isCurrentUser, onDragStart, onDragEnd, onClick, accent, compact }: CardProps & { accent: string; compact?: boolean }) {
  return (
    <div
      draggable
      onDragStart={e => { onDragStart(); e.dataTransfer.effectAllowed = 'move' }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="group relative flex items-center gap-2 pl-2 pr-3 py-2 rounded-xl cursor-grab active:cursor-grabbing transition-all"
      style={{
        background: 'var(--bg-raised)',
        border: `1px solid ${accent}33`,
        opacity: dragging ? 0.4 : 1,
        minWidth: compact ? 180 : 220,
      }}>
      <GripVertical size={12} className="opacity-30 group-hover:opacity-70 transition-opacity flex-shrink-0" style={{ color: accent }} />
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-gradient-to-br ${avatarColor(user.avatar)} flex-shrink-0`}>
        {user.avatar.slice(0, 2)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{user.name}</p>
          {isCurrentUser && (
            <span className="text-[8px] font-bold px-1 py-0.5 rounded" style={{ background: `${CAPTURE_ACCENT}26`, color: CAPTURE_ACCENT }}>YOU</span>
          )}
          {user.status === 'inactive' && (
            <span className="text-[8px] font-bold text-rose-300 bg-rose-400/15 px-1 py-0.5 rounded">OFF</span>
          )}
          {user.firstLogin && (
            <span className="text-[8px] font-bold text-amber-300 bg-amber-400/15 px-1 py-0.5 rounded" title="Pending first login">1ST</span>
          )}
        </div>
        <p className="text-[10px] truncate" style={{ color: 'rgba(248,251,247,0.45)' }}>@{user.username} · {ROLE_LABELS[user.role]}</p>
      </div>
    </div>
  )
}

function AddButton({ label, accent, onClick, minWidth = 180 }: { label: string; accent: string; onClick: () => void; minWidth?: number }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
      style={{
        background: 'transparent',
        border: `1px dashed ${accent}66`,
        color: `${accent}cc`,
        minWidth,
        justifyContent: 'center',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = accent; e.currentTarget.style.borderColor = accent }}
      onMouseLeave={e => { e.currentTarget.style.color = `${accent}cc`; e.currentTarget.style.borderColor = `${accent}66` }}
    >
      <Plus size={13} /> {label}
    </button>
  )
}

// ─── Capture Managers — full-width row at the top of the chart
function CaptureRow({
  users, isOver, dragId, currentUserId,
  onDragOver, onDragLeave, onDrop,
  onCardDragStart, onCardDragEnd, onCardClick, onAdd,
}: {
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
      className="rounded-2xl p-4 transition-all"
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${isOver ? CAPTURE_ACCENT : 'var(--border-default)'}`,
        boxShadow: isOver ? `0 0 0 2px ${CAPTURE_ACCENT}55, 0 12px 32px ${CAPTURE_ACCENT}22` : undefined,
      }}
    >
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider"
            style={{ background: `${CAPTURE_ACCENT}1F`, color: CAPTURE_ACCENT, border: `1px solid ${CAPTURE_ACCENT}55` }}
          >
            Capture Managers
          </span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(248,251,247,0.6)' }}>{users.length}</span>
          <p className="text-[11px] hidden sm:block truncate" style={{ color: 'rgba(248,251,247,0.45)' }}>Executive tier · oversees BD &amp; OPS</p>
        </div>
        {isOver && (
          <p className="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: CAPTURE_ACCENT }}>Drop to promote</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {users.map(u => (
          <UserCard
            key={u.id}
            user={u}
            accent={CAPTURE_ACCENT}
            dragging={dragId === u.id}
            isCurrentUser={u.id === currentUserId}
            onDragStart={() => onCardDragStart(u.id)}
            onDragEnd={onCardDragEnd}
            onClick={() => onCardClick(u)}
          />
        ))}
        <AddButton label="Add Capture Manager" accent={CAPTURE_ACCENT} onClick={onAdd} minWidth={200} />
      </div>
    </div>
  )
}

// ─── Team column (BD or OPS) — rendered side-by-side
function TeamColumn({
  team, label, managers, orphans, allUsers, dragId, dragOverKey, currentUserId,
  onDragOver, onDragLeave, onDrop, onCardDragStart, onCardDragEnd, onCardClick, onAdd,
}: {
  team: EmployeeTeam
  label: string
  managers: User[]
  orphans: { tls: User[]; ass: User[] }
  allUsers: User[]
  dragId: string | null
  dragOverKey: string | null
  currentUserId: string | undefined
  onDragOver: (key: string) => void
  onDragLeave: (key: string) => void
  onDrop: (target: DropTarget) => void
  onCardDragStart: (id: string) => void
  onCardDragEnd: () => void
  onCardClick: (u: User) => void
  onAdd: (role: Role, team: EmployeeTeam | null, managerId: string | null) => void
}) {
  const palette = TEAM_PALETTE[team]
  const teamTargetKey = targetKey({ kind: 'team', team })
  const isTeamOver = dragOverKey === teamTargetKey
  const teamManagers = managers.filter(m => (m.team ?? 'BD') === team)

  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver(teamTargetKey) }}
      onDragLeave={() => onDragLeave(teamTargetKey)}
      onDrop={() => onDrop({ kind: 'team', team })}
      className="rounded-2xl p-4 transition-all space-y-3"
      style={{
        background: palette.bg,
        border: `1px solid ${isTeamOver ? palette.accent : palette.border}`,
        boxShadow: isTeamOver ? `0 0 0 2px ${palette.accent}66, 0 12px 32px ${palette.accent}22` : undefined,
      }}
    >
      {/* Team header — drop here to make a Manager */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider"
            style={{ background: palette.pill, color: palette.text, border: `1px solid ${palette.accent}55` }}
          >
            {label}
          </span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(248,251,247,0.6)' }}>
            {teamManagers.length} mgr · {allUsers.filter(u => (u.team ?? 'BD') === team && u.role === 'TEAM_LEAD').length} TL · {allUsers.filter(u => (u.team ?? 'BD') === team && u.role === 'ASSOCIATE').length} assoc
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isTeamOver && (
            <p className="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: palette.accent }}>Drop to make Manager</p>
          )}
          <button
            onClick={() => onAdd(team === 'BD' ? 'BD_MANAGER' : 'OPS_MANAGER', team, null)}
            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md transition-colors"
            style={{ background: palette.soft, color: palette.text, border: `1px solid ${palette.accent}44` }}>
            <Plus size={11} /> Manager
          </button>
        </div>
      </div>

      {/* Manager cards — each is its own subtree */}
      <div className="space-y-3">
        {teamManagers.map(mgr => (
          <ManagerCard
            key={mgr.id}
            manager={mgr}
            team={team}
            allUsers={allUsers}
            dragId={dragId}
            dragOverKey={dragOverKey}
            currentUserId={currentUserId}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onCardDragStart={onCardDragStart}
            onCardDragEnd={onCardDragEnd}
            onCardClick={onCardClick}
            onAdd={onAdd}
          />
        ))}
        {teamManagers.length === 0 && (
          <div className="text-[11px] italic px-2 py-3 rounded-lg" style={{ color: 'rgba(248,251,247,0.4)', background: 'rgba(255,255,255,0.02)', border: `1px dashed ${palette.border}` }}>
            No managers on the {team} team yet. Drop someone here, or click &ldquo;+ Manager&rdquo;.
          </div>
        )}

        {/* Orphan section — TLs/Associates with no manager */}
        {(orphans.tls.length > 0 || orphans.ass.length > 0) && (
          <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: `1px dashed ${palette.border}` }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'rgba(248,251,247,0.5)' }}>Unassigned ({orphans.tls.length + orphans.ass.length})</p>
            <div className="flex flex-wrap gap-2">
              {orphans.tls.map(u => (
                <UserCard key={u.id} user={u} accent={palette.accent} compact dragging={dragId === u.id} isCurrentUser={u.id === currentUserId}
                  onDragStart={() => onCardDragStart(u.id)} onDragEnd={onCardDragEnd} onClick={() => onCardClick(u)} />
              ))}
              {orphans.ass.map(u => (
                <UserCard key={u.id} user={u} accent={palette.accent} compact dragging={dragId === u.id} isCurrentUser={u.id === currentUserId}
                  onDragStart={() => onCardDragStart(u.id)} onDragEnd={onCardDragEnd} onClick={() => onCardClick(u)} />
              ))}
            </div>
            <p className="text-[10px] mt-2" style={{ color: 'rgba(248,251,247,0.35)' }}>Drag onto a manager or team lead to assign a parent.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Manager card — drop here to become a Team Lead under this manager
function ManagerCard({
  manager, team, allUsers, dragId, dragOverKey, currentUserId,
  onDragOver, onDragLeave, onDrop, onCardDragStart, onCardDragEnd, onCardClick, onAdd,
}: {
  manager: User
  team: EmployeeTeam
  allUsers: User[]
  dragId: string | null
  dragOverKey: string | null
  currentUserId: string | undefined
  onDragOver: (key: string) => void
  onDragLeave: (key: string) => void
  onDrop: (target: DropTarget) => void
  onCardDragStart: (id: string) => void
  onCardDragEnd: () => void
  onCardClick: (u: User) => void
  onAdd: (role: Role, team: EmployeeTeam | null, managerId: string | null) => void
}) {
  const palette = TEAM_PALETTE[team]
  const key = targetKey({ kind: 'manager', id: manager.id, team })
  const isOver = dragOverKey === key
  const teamLeads = allUsers.filter(u => u.role === 'TEAM_LEAD' && u.managerId === manager.id)

  return (
    <div
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); onDragOver(key) }}
      onDragLeave={e => { e.stopPropagation(); onDragLeave(key) }}
      onDrop={e => { e.stopPropagation(); onDrop({ kind: 'manager', id: manager.id, team }) }}
      className="rounded-xl p-3 transition-all"
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${isOver ? palette.accent : palette.border}`,
        boxShadow: isOver ? `0 0 0 2px ${palette.accent}66, 0 8px 24px ${palette.accent}22` : undefined,
      }}
    >
      {/* Manager header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <UserCard user={manager} accent={palette.accent} dragging={dragId === manager.id} isCurrentUser={manager.id === currentUserId}
          onDragStart={() => onCardDragStart(manager.id)} onDragEnd={onCardDragEnd} onClick={() => onCardClick(manager)} />
        <div className="flex items-center gap-2">
          {isOver && (
            <p className="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: palette.accent }}>Drop to make Team Lead</p>
          )}
          <button
            onClick={() => onAdd('TEAM_LEAD', team, manager.id)}
            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md transition-colors"
            style={{ background: palette.soft, color: palette.text, border: `1px solid ${palette.accent}33` }}>
            <Plus size={11} /> Team Lead
          </button>
        </div>
      </div>

      {/* Team Leads under this manager */}
      <div className="pl-4 border-l-2 space-y-2" style={{ borderColor: `${palette.accent}33` }}>
        {teamLeads.map(tl => (
          <TeamLeadNode
            key={tl.id}
            tl={tl}
            team={team}
            allUsers={allUsers}
            dragId={dragId}
            dragOverKey={dragOverKey}
            currentUserId={currentUserId}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onCardDragStart={onCardDragStart}
            onCardDragEnd={onCardDragEnd}
            onCardClick={onCardClick}
            onAdd={onAdd}
          />
        ))}
        {teamLeads.length === 0 && (
          <div className="text-[10px] italic px-2 py-1.5 rounded-md" style={{ color: 'rgba(248,251,247,0.35)' }}>
            No team leads yet — drop a card on this manager or click &ldquo;+ Team Lead&rdquo;.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Team Lead node — drop here to become an Associate under this TL
function TeamLeadNode({
  tl, team, allUsers, dragId, dragOverKey, currentUserId,
  onDragOver, onDragLeave, onDrop, onCardDragStart, onCardDragEnd, onCardClick, onAdd,
}: {
  tl: User
  team: EmployeeTeam
  allUsers: User[]
  dragId: string | null
  dragOverKey: string | null
  currentUserId: string | undefined
  onDragOver: (key: string) => void
  onDragLeave: (key: string) => void
  onDrop: (target: DropTarget) => void
  onCardDragStart: (id: string) => void
  onCardDragEnd: () => void
  onCardClick: (u: User) => void
  onAdd: (role: Role, team: EmployeeTeam | null, managerId: string | null) => void
}) {
  const palette = TEAM_PALETTE[team]
  const key = targetKey({ kind: 'tl', id: tl.id, team })
  const isOver = dragOverKey === key
  const associates = allUsers.filter(u => u.role === 'ASSOCIATE' && u.managerId === tl.id)

  return (
    <div
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); onDragOver(key) }}
      onDragLeave={e => { e.stopPropagation(); onDragLeave(key) }}
      onDrop={e => { e.stopPropagation(); onDrop({ kind: 'tl', id: tl.id, team }) }}
      className="rounded-lg p-2 transition-all"
      style={{
        background: 'var(--bg-raised)',
        border: `1px solid ${isOver ? palette.accent : 'transparent'}`,
        boxShadow: isOver ? `0 0 0 2px ${palette.accent}55` : undefined,
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
        <UserCard user={tl} accent={palette.accent} compact dragging={dragId === tl.id} isCurrentUser={tl.id === currentUserId}
          onDragStart={() => onCardDragStart(tl.id)} onDragEnd={onCardDragEnd} onClick={() => onCardClick(tl)} />
        <div className="flex items-center gap-2">
          {isOver && (
            <p className="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: palette.accent }}>Drop to make Associate</p>
          )}
          <button
            onClick={() => onAdd('ASSOCIATE', team, tl.id)}
            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md transition-colors"
            style={{ background: palette.soft, color: palette.text, border: `1px solid ${palette.accent}33` }}>
            <Plus size={11} /> Associate
          </button>
        </div>
      </div>

      {associates.length > 0 && (
        <div className="pl-4 border-l-2 mt-1.5 flex flex-wrap gap-1.5" style={{ borderColor: `${palette.accent}33` }}>
          {associates.map(a => (
            <AssociateChip key={a.id} user={a} accent={palette.accent} dragging={dragId === a.id} isCurrentUser={a.id === currentUserId}
              onDragStart={() => onCardDragStart(a.id)} onDragEnd={onCardDragEnd} onClick={() => onCardClick(a)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Associate chip — leaf node, draggable
function AssociateChip({ user, accent, dragging, isCurrentUser, onDragStart, onDragEnd, onClick }: {
  user: User
  accent: string
  dragging: boolean
  isCurrentUser: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onClick: () => void
}) {
  return (
    <div
      draggable
      onDragStart={e => { onDragStart(); e.dataTransfer.effectAllowed = 'move' }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-md text-[11px] cursor-grab active:cursor-grabbing transition-all"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${accent}33`,
        opacity: dragging ? 0.4 : 1,
        color: 'var(--text-primary)',
      }}
    >
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white bg-gradient-to-br ${avatarColor(user.avatar)}`}>
        {user.avatar.slice(0, 2)}
      </div>
      <span className="font-medium truncate max-w-[140px]">{user.name}</span>
      {isCurrentUser && (
        <span className="text-[8px] font-bold px-1 rounded" style={{ background: `${CAPTURE_ACCENT}26`, color: CAPTURE_ACCENT }}>YOU</span>
      )}
      {user.status === 'inactive' && (
        <span className="text-[8px] font-bold text-rose-300 bg-rose-400/15 px-1 rounded">OFF</span>
      )}
      {user.firstLogin && (
        <span className="text-[8px] font-bold text-amber-300 bg-amber-400/15 px-1 rounded" title="Pending first login">1ST</span>
      )}
    </div>
  )
}

