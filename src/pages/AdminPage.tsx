import { useState, useMemo, useEffect, useCallback, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, X, Check, Shield, Search, Clock, Save, Network, List, GripVertical, Eye, EyeOff, KeyRound, RotateCcw, Users, GitBranch, AlertTriangle, Bomb, Database, FileText, Award, Bell, Activity, Briefcase, FolderTree, UserCog, Wifi, WifiOff, Download, Upload, ChevronDown, ChevronUp, RefreshCw, HardDrive, Lock, Target } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { User, Role, EmployeeTeam, Goal, GoalMetric, GoalScope, Employee, Opportunity, FreshAward } from '../types'
import { avatarColor, useEscapeKey } from '../lib/utils'
import {
  GOAL_METRIC_LABELS,
  computeGoalProgress,
  currentMonthKey,
  formatGoalValue,
  formatMonthKey,
  goalsForEmployee,
} from '../lib/goals'
import {
  hasPermission,
  ROLE_LABELS,
  PERMISSION_REGISTRY,
  PERMISSION_LABELS,
  PERMISSION_GROUP_LABELS,
  getPermissionGroup,
  getEffectiveRolePermissions,
  type Permission,
} from '../lib/permissions'
import { fetchRemoteRowCounts, REMOTE_COUNT_TABLES, type RemoteCountTable } from '../lib/db'
import { isSupabaseConnected, supabaseHost } from '../lib/supabase'
import toast from 'react-hot-toast'

const ROLES: Role[] = ['CAPTURE_MANAGER', 'BD_MANAGER', 'TEAM_LEAD', 'ASSOCIATE', 'OPS_MANAGER']
const ROLE_BADGE: Record<Role, string> = {
  CAPTURE_MANAGER: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  BD_MANAGER:      'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',
  TEAM_LEAD:       'bg-violet-500/15 text-violet-400 border-violet-500/25',
  ASSOCIATE:       'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  OPS_MANAGER:     'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
}

// Top-level admin tabs. Each tab maps to one of the existing SectionHeader
// accents below so the visual identity is preserved.
type AdminTab = 'people' | 'roles' | 'goals' | 'integrations' | 'workspace' | 'health' | 'danger'

// Returns the team a user lives in on the org chart. Managers are implicit;
// non-managers default to 'BD' for legacy users with no `team` set.
function teamOf(u: User): EmployeeTeam | null {
  if (u.role === 'CAPTURE_MANAGER') return null
  if (u.role === 'BD_MANAGER') return 'BD'
  if (u.role === 'OPS_MANAGER') return 'OPS'
  return u.team ?? 'BD'
}

function formatRelative(iso?: string): string {
  if (!iso) return 'Never'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return 'Never'
  const diff = Date.now() - t
  if (diff < 0) return 'In the future'
  const m = Math.floor(diff / 60_000)
  if (m < 1)   return 'Just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30)  return `${d}d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

const REMOTE_TABLE_LOCAL_KEY: Record<RemoteCountTable, string> = {
  users: 'users',
  opportunities: 'opportunities',
  contracts: 'contracts',
  fresh_awards: 'freshAwards',
  past_performances: 'pastPerformances',
  subcontractors: 'subcontractors',
  subk_database: 'subkDatabase',
  bd_submissions: 'bdSubmissions',
  non_submission_reports: 'nonSubReports',
  deletion_requests: 'deletionRequests',
  notifications: 'notifications',
  activity_logs: 'activityLogs',
}

const REMOTE_TABLE_LABEL: Record<RemoteCountTable, string> = {
  users: 'Users',
  opportunities: 'Opportunities',
  contracts: 'Contracts',
  fresh_awards: 'Fresh awards',
  past_performances: 'Past performances',
  subcontractors: 'Subcontractors',
  subk_database: 'Subk database',
  bd_submissions: 'BD submissions',
  non_submission_reports: 'Non-submission reports',
  deletion_requests: 'Deletion requests',
  notifications: 'Notifications',
  activity_logs: 'Activity logs',
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
                className="input-field" placeholder="e.g. BD Manager 01" required />
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
    requireAssociateForActivePipeline,
    setRequireAssociateForActivePipeline,
    opportunities,
    contracts,
    freshAwards,
    pastPerformances,
    subcontractors,
    subkDatabase,
    bdSubmissions,
    nonSubReports,
    deletionRequests,
    notifications,
    activityLogs,
    companyCertifications,
    employeeRequests,
    wipeOpportunities,
    wipeContracts,
    wipeFreshAwards,
    wipePastPerformances,
    wipeSubcontractors,
    wipeSubkDatabase,
    wipeBDSubmissions,
    wipeNonSubReports,
    wipeDeletionRequests,
    wipeNotifications,
    wipeActivityLogs,
    wipeCompanyCertifications,
    wipeEmployeeRequests,
    resetBDPipeline,
    resetOperations,
    wipeNonAdminUsers,
    resetEntireWorkspace,
    userSessions,
    lastSyncedAt,
    exportSnapshot,
    importSnapshot,
    rolePermissionOverrides,
    userPermissionGrants,
    userPermissionRevokes,
    permissionOverridesSyncStatus,
    setRolePermissions,
    resetRolePermissions,
    setUserPermissionGrant,
    setUserPermissionRevoke,
    resetUserPermissions,
    resetAllPermissionOverrides,
    employees,
    goals,
    createGoal,
    updateGoal,
    deleteGoal,
    appSettings,
    appSettingsSyncStatus,
    setAppSetting,
  } = useStore()
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<'create' | User | null>(null)
  const [createRole, setCreateRole] = useState<Role | null>(null)
  const [createTeam, setCreateTeam] = useState<EmployeeTeam | null>(null)
  const [createManagerId, setCreateManagerId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<AdminTab>('people')
  const [goalModal, setGoalModal] = useState<'create' | Goal | null>(null)
  const [goalMonthKey, setGoalMonthKey] = useState<string>(() => currentMonthKey())
  const [view, setView] = useState<'hierarchy' | 'table'>('hierarchy')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [graceHours, setGraceHours] = useState(String(nonSubGraceHours))
  const [graceMinutes, setGraceMinutes] = useState(String(nonSubGraceMinutes))
  const [danger, setDanger] = useState<DangerAction | null>(null)
  const [dangerBusy, setDangerBusy] = useState(false)
  const [contractClient, setContractClient] = useState<string>('')

  // System Health: remote row counts loaded on demand
  const [remoteCounts, setRemoteCounts] = useState<Record<RemoteCountTable, number | null> | null>(null)
  const [remoteCountsLoading, setRemoteCountsLoading] = useState(false)
  const [healthOpen, setHealthOpen] = useState(true)

  // Permissions Matrix: collapsed by default to keep the page short
  const [matrixOpen, setMatrixOpen] = useState(false)
  // 'view' = read-only ✓ / — display, 'edit' = checkboxes with reset buttons.
  // We default to 'view' so accidental clicks can't change RBAC.
  const [matrixMode, setMatrixMode] = useState<'view' | 'edit'>('view')

  // Per-user overrides: pick a user to see / edit their grants and revokes.
  const [overrideUserId, setOverrideUserId] = useState<string>('')
  const [userOverridesOpen, setUserOverridesOpen] = useState(false)

  // Workspace snapshot
  const [snapshotBusy, setSnapshotBusy] = useState(false)

  // Integrations tab
  const storedSamKey = appSettings?.['sam_gov_api_key'] ?? ''
  const [samKeyDraft, setSamKeyDraft] = useState(storedSamKey)
  const [showSamKey, setShowSamKey] = useState(false)
  const [savingSamKey, setSavingSamKey] = useState(false)
  useEffect(() => { setSamKeyDraft(storedSamKey) }, [storedSamKey])

  const refreshRemoteCounts = useCallback(async () => {
    if (!isSupabaseConnected) {
      setRemoteCounts(null)
      return
    }
    setRemoteCountsLoading(true)
    try {
      const counts = await fetchRemoteRowCounts()
      setRemoteCounts(counts)
    } finally {
      setRemoteCountsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isSupabaseConnected && healthOpen && remoteCounts == null) {
      void refreshRemoteCounts()
    }
  }, [healthOpen, remoteCounts, refreshRemoteCounts])

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

  const contractClients = useMemo(
    () => Array.from(new Set(contracts.map(c => c.client).filter(Boolean))).sort(),
    [contracts],
  )

  const removableUserCount = users.filter(u => u.role !== 'CAPTURE_MANAGER').length

  const runDanger = async () => {
    if (!danger) return
    setDangerBusy(true)
    try {
      const n = await danger.run()
      toast.success(danger.toastSuccess(n))
      setDanger(null)
      if (danger.id === 'wipe-contracts-client') setContractClient('')
    } catch (err) {
      console.error('[admin] danger action failed', err)
      toast.error('Operation failed. Check the console for details.')
    } finally {
      setDangerBusy(false)
    }
  }

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
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Shield size={20} className="text-indigo-400" /> Admin
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {activeTab === 'people'    && <>{users.length} users · {users.filter(u => u.status === 'active').length} active</>}
              {activeTab === 'roles'     && 'Edit role permissions and per-user overrides'}
              {activeTab === 'goals'     && 'Set monthly submission, win, and win-rate targets per team or employee'}
              {activeTab === 'integrations' && 'Runtime API keys and third-party integration settings'}
              {activeTab === 'workspace' && 'Settings, snapshots, and import / export'}
              {activeTab === 'health'    && 'Local vs Supabase drift across every business table'}
              {activeTab === 'danger'    && 'Reset and wipe operations — irreversible'}
            </p>
          </div>
          {activeTab === 'people' && (
            <button onClick={() => openCreate()} className="btn-primary">
              <Plus size={14} /> Create User
            </button>
          )}
        </div>

        {/* Top tab navigation. Underline style with the section accent colour
           so each tab keeps the visual identity it had as a SectionHeader. */}
        <div
          role="tablist"
          aria-label="Admin sections"
          className="flex items-center gap-1 overflow-x-auto -mx-1 px-1"
          style={{ borderBottom: '1px solid rgba(99,102,241,0.18)' }}
        >
          {([
            { id: 'people'    as AdminTab, label: 'People',              Icon: Users,         accent: 'emerald' as const },
            { id: 'roles'     as AdminTab, label: 'Roles & Permissions', Icon: Shield,        accent: 'violet'  as const },
            { id: 'goals'     as AdminTab, label: 'Goals',               Icon: Target,        accent: 'amber'   as const },
            { id: 'integrations' as AdminTab, label: 'Integrations',     Icon: KeyRound,      accent: 'sky'     as const },
            { id: 'workspace' as AdminTab, label: 'Workspace',           Icon: Save,          accent: 'indigo'  as const },
            { id: 'health'    as AdminTab, label: 'System Health',       Icon: Activity,      accent: 'cyan'    as const },
            { id: 'danger'    as AdminTab, label: 'Reset & Maintenance',  Icon: AlertTriangle, accent: 'rose'    as const },
          ]).map(t => {
            const active  = activeTab === t.id
            const palette = SECTION_ACCENT[t.accent]
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(t.id)}
                className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors -mb-px border-b-2 ${active ? '' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                style={active ? { color: palette.fg, borderColor: palette.fg } : undefined}
              >
                <t.Icon size={14} />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {activeTab === 'workspace' && (<>
      <SectionHeader icon={<Save size={14} />} label="Workspace settings" accent="indigo" />

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

      <div className="glass rounded-2xl p-4 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 mb-1">
              <GitBranch size={16} className="text-violet-300" />
              <h2 className="text-sm font-bold text-white">Opportunity Activation Mode</h2>
            </div>
            <p className="text-xs text-slate-400">
              {requireAssociateForActivePipeline
                ? <>Currently <span className="font-semibold text-violet-200">Wait for Associate</span>: opportunities only enter the active pipeline once a Manager assigns an Associate. Manager/Team Lead-only opportunities stay in <span className="font-semibold text-slate-200">NEW_ASSIGNMENT</span> and are not part of the general pipeline.</>
                : <>Currently <span className="font-semibold text-emerald-200">Manager/TL can carry it</span>: an opportunity becomes ACTIVE and counts in the general pipeline as soon as a Manager or Team Lead is assigned, even without an Associate. The assigned Manager/TL is treated as the current handler until an Associate is added.</>}
            </p>
            <p className="mt-2 text-[11px] text-amber-200/80">
              Switching this setting immediately re-evaluates every existing opportunity. Status changes are saved to the database.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Mode</span>
            <button
              type="button"
              role="switch"
              aria-checked={requireAssociateForActivePipeline}
              onClick={() => {
                const next = !requireAssociateForActivePipeline
                setRequireAssociateForActivePipeline(next)
                toast.success(next ? 'Switched to: Wait for Associate' : 'Switched to: Manager/TL can carry it')
              }}
              className="relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-400 focus:ring-offset-slate-900"
              style={{
                background: requireAssociateForActivePipeline ? '#7c3aed' : '#10b981',
              }}
            >
              <span
                className="inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow"
                style={{ transform: requireAssociateForActivePipeline ? 'translateX(4px)' : 'translateX(32px)' }}
              />
            </button>
            <span className="text-xs font-semibold text-slate-200 min-w-[140px]">
              {requireAssociateForActivePipeline ? 'Wait for Associate' : 'Manager/TL can carry it'}
            </span>
          </div>
        </div>
      </div>
      </>)}

      {activeTab === 'health' && (<>
      <SectionHeader icon={<Activity size={14} />} label="System health" accent="cyan" />
      <div className="glass rounded-2xl p-4 mb-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            {isSupabaseConnected ? (
              <Wifi size={16} className="text-emerald-400" />
            ) : (
              <WifiOff size={16} className="text-amber-400" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-200">
                  Supabase {isSupabaseConnected ? 'connected' : 'offline (local-only mode)'}
                </span>
                {isSupabaseConnected && supabaseHost && (
                  <span className="text-[10px] text-slate-500 font-mono">{supabaseHost}</span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Last sync: <span className="text-slate-300">{formatRelative(lastSyncedAt ? new Date(lastSyncedAt).toISOString() : undefined)}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHealthOpen(o => !o)}
              className="btn-ghost text-[11px] text-slate-400 hover:text-slate-200 inline-flex items-center gap-1"
            >
              {healthOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {healthOpen ? 'Hide' : 'Show'} tables
            </button>
            {isSupabaseConnected && (
              <button
                onClick={() => void refreshRemoteCounts()}
                disabled={remoteCountsLoading}
                className="btn-ghost text-[11px] text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1 disabled:opacity-40"
              >
                <RefreshCw size={12} className={remoteCountsLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            )}
          </div>
        </div>
        {healthOpen && (
          <>
            {!isSupabaseConnected ? (
              <div className="text-xs text-slate-400 bg-amber-500/5 border border-amber-500/15 rounded-lg p-3">
                Supabase credentials are not configured. The app is reading and writing only to this browser's
                local storage. Set <code className="font-mono text-amber-300">VITE_SUPABASE_URL</code> and
                <code className="font-mono text-amber-300"> VITE_SUPABASE_ANON_KEY</code> to enable sync.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Table</th>
                      <th className="text-right">Local</th>
                      <th className="text-right">Remote</th>
                      <th className="text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {REMOTE_COUNT_TABLES.map(table => {
                      const localKey = REMOTE_TABLE_LOCAL_KEY[table]
                      const localVal = (() => {
                        switch (localKey) {
                          case 'users':            return users.length
                          case 'opportunities':    return opportunities.length
                          case 'contracts':        return contracts.length
                          case 'freshAwards':      return freshAwards.length
                          case 'pastPerformances': return pastPerformances.length
                          case 'subcontractors':   return subcontractors.length
                          case 'subkDatabase':     return subkDatabase.length
                          case 'bdSubmissions':    return bdSubmissions.length
                          case 'nonSubReports':    return nonSubReports.length
                          case 'deletionRequests': return deletionRequests.length
                          case 'notifications':    return notifications.length
                          case 'activityLogs':     return activityLogs.length
                          default: return 0
                        }
                      })()
                      const remoteVal = remoteCounts?.[table] ?? null
                      const drift = remoteVal != null && localVal !== remoteVal
                      return (
                        <tr key={table}>
                          <td className="text-xs text-slate-300">{REMOTE_TABLE_LABEL[table]}</td>
                          <td className="text-xs text-slate-200 text-right font-mono">{localVal}</td>
                          <td className="text-xs text-right font-mono">
                            {remoteCountsLoading && remoteCounts == null ? (
                              <span className="text-slate-600">…</span>
                            ) : remoteVal == null ? (
                              <span className="text-slate-600">—</span>
                            ) : (
                              <span className="text-slate-200">{remoteVal}</span>
                            )}
                          </td>
                          <td className="text-right">
                            {remoteVal == null ? (
                              <span className="text-[10px] text-slate-600">unknown</span>
                            ) : drift ? (
                              <span className="badge bg-amber-500/15 text-amber-300 border-amber-500/25 border text-[10px]">drift</span>
                            ) : (
                              <span className="badge bg-emerald-500/15 text-emerald-300 border-emerald-500/25 border text-[10px]">in sync</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <p className="text-[10px] text-slate-500 mt-3">
                  Drift just means the count differs — usually because another browser made a change you haven't
                  pulled yet. Reload the page or use Refresh to re-fetch.
                </p>
              </div>
            )}
          </>
        )}
      </div>
      </>)}

      {activeTab === 'people' && (<>
      <SectionHeader icon={<Users size={14} />} label="People &amp; roles" accent="emerald" />

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
            ? 'Click a person to edit. Hover a row for quick actions. Drag onto another row to reparent.'
            : 'Tabular view of all user accounts.'}
        </p>
      </div>

      {/* Hierarchy view — clean indented tree, side-by-side teams */}
      {view === 'hierarchy' && (
        <div className="space-y-4">
          <CaptureStrip
            users={users.filter(u => u.role === 'CAPTURE_MANAGER')}
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
            onDelete={handleDelete}
          />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {(['BD', 'OPS'] as EmployeeTeam[]).map(t => (
              <TeamPanel
                key={t}
                team={t}
                label={t === 'BD' ? 'BD Team' : 'OPS Team'}
                allUsers={users}
                dragId={dragId}
                dragOverKey={dragOverKey}
                currentUserId={currentUser?.id}
                onDragOver={key => dragId && setDragOverKey(key)}
                onDragLeave={key => dragOverKey === key && setDragOverKey(null)}
                onDrop={target => handleDrop(target)}
                onCardDragStart={id => setDragId(id)}
                onCardDragEnd={() => { setDragId(null); setDragOverKey(null) }}
                onCardClick={u => setModal(u)}
                onAdd={(role, team, mgrId) => openCreate(role, team, mgrId)}
                onDelete={handleDelete}
              />
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
              className={`input-field pl-9 text-xs ${search ? 'pr-8' : ''}`} placeholder="Search by name, email, role\u2026" />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/15 text-rose-500 transition-colors hover:bg-rose-500 hover:text-white"
                aria-label="Clear search"
                title="Clear search"
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            )}
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
              <th>Status</th><th>First Login</th><th>Last seen</th><th>Created</th><th>Actions</th>
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
                    <span className={`badge text-[10px] ${u.firstLogin ? 'badge-pending' : 'badge-active'}`}>
                      {u.firstLogin ? 'Pending' : 'Complete'}
                    </span>
                  </td>
                  <td className="text-slate-400 text-xs" title={userSessions[u.id]?.lastLoginAt ?? 'Never logged in on this browser'}>
                    {formatRelative(userSessions[u.id]?.lastLoginAt)}
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
      </>)}

      {activeTab === 'roles' && (<>
      <div className="mt-2">
        <SectionHeader icon={<Shield size={14} />} label="Permissions matrix" accent="violet" />
        <div className="glass rounded-2xl p-4 mb-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="max-w-2xl">
              <p className="text-xs text-slate-300">
                Toggle what each role is allowed to do. Edits apply to every user with that role; use
                <span className="text-violet-300"> per-user overrides</span> below to grant or revoke for a single user.
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-[10px] text-slate-500">
                  {PERMISSION_REGISTRY.length} permissions · {Object.keys(PERMISSION_GROUP_LABELS).length} groups
                </span>
                {permissionOverridesSyncStatus === 'synced' && (
                  <span className="badge bg-emerald-500/15 text-emerald-300 border-emerald-500/25 border text-[10px] inline-flex items-center gap-1">
                    <Check size={10} /> Synced to Supabase
                  </span>
                )}
                {permissionOverridesSyncStatus === 'local' && (
                  <span
                    className="badge bg-amber-500/15 text-amber-300 border-amber-500/25 border text-[10px] inline-flex items-center gap-1"
                    title="Apply supabase/migrations/019_permission_overrides.sql to share these edits across browsers."
                  >
                    <AlertTriangle size={10} /> Local-only (apply migration 019)
                  </span>
                )}
                {permissionOverridesSyncStatus === 'unknown' && !isSupabaseConnected && (
                  <span className="badge bg-slate-500/15 text-slate-300 border-slate-500/25 border text-[10px]">
                    Offline — local-only
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {matrixOpen && matrixMode === 'edit' && (
                <button
                  onClick={async () => {
                    if (!confirm('Reset every role to its default permissions and clear all per-user overrides? This cannot be undone.')) return
                    await resetAllPermissionOverrides()
                    toast.success('Permissions reset to defaults')
                  }}
                  className="btn-ghost text-[11px] text-rose-300 hover:text-rose-200 inline-flex items-center gap-1"
                >
                  <RotateCcw size={12} /> Reset all to defaults
                </button>
              )}
              {matrixOpen && (
                <button
                  onClick={() => setMatrixMode(m => (m === 'view' ? 'edit' : 'view'))}
                  className={`btn-ghost text-[11px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md border ${
                    matrixMode === 'edit'
                      ? 'border-violet-500/40 text-violet-200 bg-violet-500/10'
                      : 'border-slate-700 text-slate-300 hover:text-violet-200'
                  }`}
                >
                  {matrixMode === 'edit' ? <><Lock size={12} /> Stop editing</> : <><Pencil size={12} /> Edit</>}
                </button>
              )}
              <button
                onClick={() => setMatrixOpen(o => !o)}
                className="btn-ghost text-[11px] text-violet-300 hover:text-violet-200 inline-flex items-center gap-1"
              >
                {matrixOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {matrixOpen ? 'Hide' : 'Show'} matrix
              </button>
            </div>
          </div>
          {matrixOpen && (
            <div className="overflow-x-auto mt-4">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="min-w-[260px]">Permission</th>
                    {ROLES.map(r => {
                      const customized = rolePermissionOverrides[r] !== undefined
                      return (
                        <th key={r} className="text-center min-w-[120px]">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`badge border text-[9px] ${ROLE_BADGE[r]}`}>{ROLE_LABELS[r]}</span>
                            {customized && (
                              <span className="text-[9px] text-amber-300">customized</span>
                            )}
                            {matrixMode === 'edit' && customized && (
                              <button
                                onClick={async () => {
                                  await resetRolePermissions(r)
                                  toast.success(`${ROLE_LABELS[r]} reset to defaults`)
                                }}
                                className="text-[9px] text-slate-500 hover:text-rose-300 inline-flex items-center gap-1"
                                title="Reset this role to default permissions"
                              >
                                <RotateCcw size={9} /> reset
                              </button>
                            )}
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(PERMISSION_GROUP_LABELS).map(([groupKey, groupLabel]) => {
                    const perms = PERMISSION_REGISTRY.filter(p => getPermissionGroup(p) === groupKey)
                    if (perms.length === 0) return null
                    return (
                      <Fragment key={groupKey}>
                        <tr>
                          <td
                            colSpan={1 + ROLES.length}
                            className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-900/30 py-2"
                          >
                            {groupLabel}
                          </td>
                        </tr>
                        {perms.map((perm: Permission) => (
                          <tr key={perm}>
                            <td>
                              <div className="text-xs text-slate-200">{PERMISSION_LABELS[perm]}</div>
                              <div className="text-[10px] text-slate-600 font-mono">{perm}</div>
                            </td>
                            {ROLES.map(r => {
                              const allowed = getEffectiveRolePermissions(r).includes(perm)
                              if (matrixMode === 'view') {
                                return (
                                  <td key={r} className="text-center">
                                    {allowed ? (
                                      <Check size={14} className="inline text-emerald-400" />
                                    ) : (
                                      <span className="text-slate-700 text-xs">—</span>
                                    )}
                                  </td>
                                )
                              }
                              const isCaptureAdmin = r === 'CAPTURE_MANAGER' && perm === 'admin:manageUsers'
                              return (
                                <td key={r} className="text-center">
                                  <label
                                    className={`inline-flex items-center justify-center cursor-pointer ${
                                      isCaptureAdmin ? 'cursor-not-allowed opacity-60' : ''
                                    }`}
                                    title={isCaptureAdmin ? 'Capture Manager always keeps user management to avoid lockout.' : undefined}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={allowed}
                                      disabled={isCaptureAdmin}
                                      onChange={async (e) => {
                                        const nextAllowed = e.target.checked
                                        const current = new Set(getEffectiveRolePermissions(r))
                                        if (nextAllowed) current.add(perm); else current.delete(perm)
                                        await setRolePermissions(r, Array.from(current))
                                      }}
                                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-violet-500 focus:ring-violet-500"
                                    />
                                  </label>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
              {matrixMode === 'edit' && (
                <p className="text-[10px] text-slate-500 mt-3">
                  Changes save instantly. Use <span className="text-amber-300">Reset all to defaults</span> if you need to start over.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Per-user overrides */}
        <div className="glass rounded-2xl p-4 mb-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2">
                <UserCog size={14} className="text-violet-300" />
                <h3 className="text-xs font-semibold text-slate-200">Per-user overrides</h3>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Grant a permission to a single user (in addition to their role) or revoke one their role would
                normally have. Use this when, say, one Associate needs to submit non-submission reports but the
                rest don't.
              </p>
            </div>
            <button
              onClick={() => setUserOverridesOpen(o => !o)}
              className="btn-ghost text-[11px] text-violet-300 hover:text-violet-200 inline-flex items-center gap-1"
            >
              {userOverridesOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {userOverridesOpen ? 'Hide' : 'Show'} per-user editor
            </button>
          </div>
          {userOverridesOpen && (() => {
            const selectableUsers = users.filter(u => u.id !== currentUser?.id)
            const selectedUser = users.find(u => u.id === overrideUserId)
            const grants  = selectedUser ? (userPermissionGrants[selectedUser.id]  ?? []) : []
            const revokes = selectedUser ? (userPermissionRevokes[selectedUser.id] ?? []) : []
            const grantSet  = new Set(grants)
            const revokeSet = new Set(revokes)
            const customCount = selectableUsers.filter(u =>
              (userPermissionGrants[u.id]  ?? []).length > 0 ||
              (userPermissionRevokes[u.id] ?? []).length > 0
            ).length
            return (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <label className="text-[11px] text-slate-400">User:</label>
                  <select
                    value={overrideUserId}
                    onChange={e => setOverrideUserId(e.target.value)}
                    className="bg-slate-900/60 border border-slate-700 rounded-md text-xs text-slate-200 px-2 py-1 min-w-[240px]"
                  >
                    <option value="">— Select a user —</option>
                    {selectableUsers.map(u => {
                      const hasCustom = (userPermissionGrants[u.id]  ?? []).length > 0
                                     || (userPermissionRevokes[u.id] ?? []).length > 0
                      return (
                        <option key={u.id} value={u.id}>
                          {u.name} ({ROLE_LABELS[u.role]}){hasCustom ? ' • customized' : ''}
                        </option>
                      )
                    })}
                  </select>
                  {customCount > 0 && (
                    <span className="text-[10px] text-amber-300">
                      {customCount} user{customCount === 1 ? '' : 's'} currently customized
                    </span>
                  )}
                  {selectedUser && (grants.length > 0 || revokes.length > 0) && (
                    <button
                      onClick={async () => {
                        if (!confirm(`Clear all permission overrides for ${selectedUser.name}? Their effective permissions will revert to their role defaults.`)) return
                        await resetUserPermissions(selectedUser.id)
                        toast.success(`Cleared overrides for ${selectedUser.name}`)
                      }}
                      className="btn-ghost text-[11px] text-rose-300 hover:text-rose-200 inline-flex items-center gap-1 ml-auto"
                    >
                      <RotateCcw size={12} /> Clear overrides for this user
                    </button>
                  )}
                </div>

                {!selectedUser ? (
                  <p className="text-[11px] text-slate-500">
                    Pick a user from the dropdown to view and edit their effective permissions.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th className="min-w-[260px]">Permission</th>
                          <th className="text-center min-w-[100px]">From role</th>
                          <th className="text-center min-w-[100px]">Grant extra</th>
                          <th className="text-center min-w-[100px]">Revoke</th>
                          <th className="text-center min-w-[100px]">Effective</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(PERMISSION_GROUP_LABELS).map(([groupKey, groupLabel]) => {
                          const perms = PERMISSION_REGISTRY.filter(p => getPermissionGroup(p) === groupKey)
                          if (perms.length === 0) return null
                          return (
                            <Fragment key={groupKey}>
                              <tr>
                                <td colSpan={5} className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-900/30 py-2">
                                  {groupLabel}
                                </td>
                              </tr>
                              {perms.map((perm: Permission) => {
                                const fromRole = getEffectiveRolePermissions(selectedUser.role).includes(perm)
                                const grantOn  = grantSet.has(perm)
                                const revokeOn = revokeSet.has(perm)
                                const effective = (fromRole && !revokeOn) || grantOn
                                return (
                                  <tr key={perm}>
                                    <td>
                                      <div className="text-xs text-slate-200">{PERMISSION_LABELS[perm]}</div>
                                      <div className="text-[10px] text-slate-600 font-mono">{perm}</div>
                                    </td>
                                    <td className="text-center">
                                      {fromRole ? (
                                        <Check size={14} className="inline text-emerald-400" />
                                      ) : (
                                        <span className="text-slate-700 text-xs">—</span>
                                      )}
                                    </td>
                                    <td className="text-center">
                                      <input
                                        type="checkbox"
                                        checked={grantOn}
                                        disabled={fromRole}
                                        title={fromRole ? 'Already granted by role — no extra grant needed.' : undefined}
                                        onChange={(e) => { void setUserPermissionGrant(selectedUser.id, perm, e.target.checked) }}
                                        className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 disabled:opacity-30"
                                      />
                                    </td>
                                    <td className="text-center">
                                      <input
                                        type="checkbox"
                                        checked={revokeOn}
                                        disabled={!fromRole}
                                        title={!fromRole ? 'Role does not grant this permission — nothing to revoke.' : undefined}
                                        onChange={(e) => { void setUserPermissionRevoke(selectedUser.id, perm, e.target.checked) }}
                                        className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-rose-500 focus:ring-rose-500 disabled:opacity-30"
                                      />
                                    </td>
                                    <td className="text-center">
                                      {effective ? (
                                        <Check size={14} className="inline text-emerald-400" />
                                      ) : (
                                        <span className="text-slate-700 text-xs">—</span>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </div>
      </>)}

      {activeTab === 'goals' && (<>
      <GoalsAdminPanel
        goals={goals}
        employees={employees}
        opportunities={opportunities}
        freshAwards={freshAwards}
        monthKey={goalMonthKey}
        onMonthKeyChange={setGoalMonthKey}
        onCreate={() => setGoalModal('create')}
        onEdit={g => setGoalModal(g)}
        onDelete={id => {
          if (confirm('Delete this goal? This cannot be undone.')) deleteGoal(id)
        }}
      />
      </>)}

      {activeTab === 'integrations' && (<>
      <div className="mt-2">
        <SectionHeader icon={<KeyRound size={14} />} label="Integration keys" accent="sky" />

        <div
          className="rounded-2xl p-4 mb-4"
          style={{
            background: 'rgba(245,158,11,0.06)',
            border: '1px solid rgba(245,158,11,0.28)',
          }}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-300 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-amber-100 leading-relaxed">
              These keys are fetched by the browser and used in outbound requests. They are
              <span className="font-semibold"> not end-to-end secret</span>: any signed-in user with DevTools open
              can read them. Storing them here is still safer than baking them into the JavaScript bundle
              via <code className="px-1 rounded bg-black/30">VITE_*</code> env vars (which are visible to every
              anonymous visitor) and lets you rotate keys without a redeploy.
            </p>
          </div>
        </div>

        <div className="glass rounded-2xl p-4 mb-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <KeyRound size={14} className="text-sky-300" /> SAM.gov API key
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Used by the Pipeline → Create → Import from SAM.gov URL flow. Get a key from{' '}
                <a
                  href="https://open.gsa.gov/api/get-opportunities-public-api/"
                  target="_blank" rel="noopener noreferrer"
                  className="text-sky-300 underline hover:text-sky-200"
                >
                  open.gsa.gov
                </a>.
              </p>
            </div>
            <span
              className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md whitespace-nowrap"
              style={
                appSettingsSyncStatus === 'synced'
                  ? { background: 'rgba(16,185,129,0.14)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.28)' }
                  : appSettingsSyncStatus === 'local'
                    ? { background: 'rgba(245,158,11,0.14)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.28)' }
                    : { background: 'rgba(148,163,184,0.14)', color: '#cbd5e1', border: '1px solid rgba(148,163,184,0.28)' }
              }
            >
              {appSettingsSyncStatus === 'synced' && (isSupabaseConnected ? <>Synced <Wifi size={10} className="inline ml-1" /></> : 'Synced')}
              {appSettingsSyncStatus === 'local'  && <>Local only <WifiOff size={10} className="inline ml-1" /></>}
              {appSettingsSyncStatus === 'unknown' && 'Not fetched'}
            </span>
          </div>

          {appSettingsSyncStatus === 'local' && (
            <p className="text-[11px] text-amber-300 mb-3">
              The <code className="px-1 rounded bg-black/30">app_settings</code> table doesn't exist yet.
              Apply migration <code className="px-1 rounded bg-black/30">025_add_app_settings.sql</code> so
              saves reach the database.
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                type={showSamKey ? 'text' : 'password'}
                value={samKeyDraft}
                onChange={e => setSamKeyDraft(e.target.value)}
                placeholder={storedSamKey ? '••••••••' : 'Paste SAM.gov API key'}
                autoComplete="off"
                spellCheck={false}
                className="w-full text-xs px-3 py-2 pr-9 rounded-lg bg-slate-900/60 border border-slate-700/60 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500/60"
              />
              <button
                type="button"
                onClick={() => setShowSamKey(v => !v)}
                aria-label={showSamKey ? 'Hide key' : 'Show key'}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showSamKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button
              type="button"
              disabled={savingSamKey || samKeyDraft === storedSamKey}
              onClick={async () => {
                setSavingSamKey(true)
                try {
                  const r = await setAppSetting('sam_gov_api_key', samKeyDraft)
                  if (r.ok) {
                    toast.success(isSupabaseConnected ? 'SAM.gov key saved to database' : 'SAM.gov key saved locally')
                  } else if (r.missingTable) {
                    toast.error('Database table missing — apply migration 025 first. Value kept locally.')
                  } else {
                    toast.error('Could not save SAM.gov key')
                  }
                } finally {
                  setSavingSamKey(false)
                }
              }}
              className="btn-primary text-xs px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save size={12} /> {savingSamKey ? 'Saving…' : 'Save'}
            </button>
            {samKeyDraft !== storedSamKey && (
              <button
                type="button"
                onClick={() => setSamKeyDraft(storedSamKey)}
                className="text-xs px-3 py-2 rounded-lg border border-slate-700/60 text-slate-300 hover:bg-slate-800/60"
              >
                Revert
              </button>
            )}
          </div>
        </div>
      </div>
      </>)}

      {activeTab === 'workspace' && (<>
      <div className="mt-2">
        <SectionHeader icon={<HardDrive size={14} />} label="Workspace snapshot" accent="amber" />
        <div className="glass rounded-2xl p-4 mb-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div className="max-w-xl">
              <p className="text-xs text-slate-300 leading-relaxed">
                Download a JSON snapshot of every record currently in this browser, or restore a previous snapshot.
                Use this to back up before risky changes, or to copy a working dataset onto another browser.
              </p>
              {isSupabaseConnected && (
                <p className="text-[11px] text-amber-300 mt-2">
                  Restoring only rewrites local state — Supabase tables are not touched. If you want a clean
                  database first, use <span className="font-semibold">Reset entire workspace</span> below.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setSnapshotBusy(true)
                  try {
                    const payload = exportSnapshot()
                    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `ce-sol-crm-snapshot-${new Date().toISOString().slice(0, 10)}.json`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)
                    toast.success('Snapshot downloaded')
                  } catch (err) {
                    console.error('[admin] exportSnapshot failed', err)
                    toast.error('Could not export snapshot')
                  } finally {
                    setSnapshotBusy(false)
                  }
                }}
                disabled={snapshotBusy}
                className="btn-primary inline-flex items-center gap-1.5 text-xs disabled:opacity-50"
              >
                <Download size={12} /> Download snapshot
              </button>
              <label className="btn-ghost inline-flex items-center gap-1.5 text-xs cursor-pointer border border-amber-500/30 text-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-500/10">
                <Upload size={12} /> Restore from file
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (!file) return
                    setSnapshotBusy(true)
                    try {
                      const text = await file.text()
                      let parsed: unknown
                      try {
                        parsed = JSON.parse(text)
                      } catch {
                        toast.error('That file is not valid JSON')
                        return
                      }
                      const result = importSnapshot(parsed)
                      if (!result.ok) {
                        toast.error(result.error || 'Restore failed')
                        return
                      }
                      const total = Object.values(result.counts ?? {}).reduce((a, b) => a + b, 0)
                      toast.success(`Restored ${total} records across ${Object.keys(result.counts ?? {}).length} slices`)
                    } catch (err) {
                      console.error('[admin] importSnapshot failed', err)
                      toast.error('Could not read snapshot file')
                    } finally {
                      setSnapshotBusy(false)
                    }
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      </div>
      </>)}

      {activeTab === 'danger' && (<>
      <div className="mt-2">
        <SectionHeader icon={<AlertTriangle size={14} />} label="Reset &amp; maintenance" accent="rose" />
        <div
          className="rounded-2xl p-5"
          style={{
            background: 'linear-gradient(135deg, rgba(244,63,94,0.06), rgba(220,38,38,0.04))',
            border: '1px solid rgba(244,63,94,0.28)',
          }}
        >
          <p className="text-xs text-slate-300 mb-4 leading-relaxed">
            Every action here <span className="font-semibold text-rose-300">permanently</span> removes data from this
            browser and from the connected database. Use these tools to clean up test data, hand a workspace over,
            or start a team from scratch. <span className="text-rose-300 font-semibold">There is no undo.</span>
          </p>

          {/* Team-level resets */}
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Team resets</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
            <DangerCard
              icon={<Briefcase size={14} />}
              label="Reset BD pipeline"
              subtitle={`${opportunities.length} opps · ${bdSubmissions.length} tracker · ${nonSubReports.length} reports`}
              disabled={opportunities.length + bdSubmissions.length + nonSubReports.length + deletionRequests.length === 0}
              onClick={() => setDanger({
                id: 'reset-bd',
                title: 'Reset the BD pipeline',
                description: 'Clears the entire Business Development workspace.',
                consequences: [
                  `${opportunities.length} opportunit${opportunities.length === 1 ? 'y' : 'ies'} will be deleted`,
                  `${bdSubmissions.length} BD tracker entr${bdSubmissions.length === 1 ? 'y' : 'ies'} will be deleted`,
                  `${nonSubReports.length} non-submission report(s) will be deleted`,
                  `${deletionRequests.length} pending deletion request(s) will be cleared`,
                  'Contracts and operations records are NOT affected',
                ],
                confirmPhrase: 'reset BD',
                destructiveLabel: 'Reset BD pipeline',
                run: resetBDPipeline,
                toastSuccess: (n) => `BD pipeline reset · ${n} record(s) removed.`,
              })}
            />
            <DangerCard
              icon={<FolderTree size={14} />}
              label="Reset Operations"
              subtitle={`${contracts.length} contracts · ${freshAwards.length} fresh · ${pastPerformances.length} past`}
              disabled={contracts.length + freshAwards.length + pastPerformances.length === 0}
              onClick={() => setDanger({
                id: 'reset-ops',
                title: 'Reset Operations',
                description: 'Clears every contract and operational record.',
                consequences: [
                  `${contracts.length} contract(s) will be deleted (including invoices, line items, POCs, locks, warnings)`,
                  `${freshAwards.length} fresh award(s) will be deleted`,
                  `${pastPerformances.length} past performance(s) will be deleted`,
                  'Opportunities and the BD pipeline are NOT affected',
                ],
                confirmPhrase: 'reset OPS',
                destructiveLabel: 'Reset Operations',
                run: resetOperations,
                toastSuccess: (n) => `Operations reset · ${n} record(s) removed.`,
              })}
            />
            <DangerCard
              icon={<UserCog size={14} />}
              label="Remove non-admin users"
              subtitle={`${removableUserCount} account(s) will be removed`}
              disabled={removableUserCount === 0}
              onClick={() => setDanger({
                id: 'wipe-users',
                title: 'Remove non-admin users',
                description: 'Deletes everyone except Capture Manager accounts.',
                consequences: [
                  `${removableUserCount} user account(s) will be removed`,
                  'Capture Manager accounts are preserved so admins keep their access',
                  'Assignments on existing opportunities and contracts will become unassigned',
                ],
                confirmPhrase: 'remove users',
                destructiveLabel: 'Remove users',
                run: wipeNonAdminUsers,
                toastSuccess: (n) => `${n} user account(s) removed.`,
              })}
            />
          </div>

          {/* Contracts by client */}
          {contractClients.length > 0 && (
            <>
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Contracts by client</h3>
              <div className="rounded-xl border border-rose-500/15 bg-black/20 p-3 mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-200">Delete every contract for a specific client</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Pick a client, then click delete. All of that client's contracts (and their invoices, line items, POCs, locks, warnings) will be removed.
                  </p>
                </div>
                <select
                  value={contractClient}
                  onChange={e => setContractClient(e.target.value)}
                  className="select-field sm:w-60"
                >
                  <option value="">— Select client —</option>
                  {contractClients.map(c => {
                    const count = contracts.filter(x => x.client === c).length
                    return <option key={c} value={c}>{c} ({count})</option>
                  })}
                </select>
                <button
                  type="button"
                  disabled={!contractClient}
                  onClick={() => {
                    if (!contractClient) return
                    const count = contracts.filter(c => c.client === contractClient).length
                    setDanger({
                      id: 'wipe-contracts-client',
                      title: `Delete contracts for ${contractClient}`,
                      description: `Removes every contract whose client is ${contractClient}.`,
                      consequences: [
                        `${count} contract(s) for ${contractClient} will be deleted`,
                        'All linked invoices, line items, POCs, locks and warnings will be removed',
                        `Other clients' contracts are NOT affected`,
                      ],
                      confirmPhrase: contractClient,
                      destructiveLabel: `Delete ${contractClient} contracts`,
                      run: () => wipeContracts(contractClient),
                      toastSuccess: (n) => `${n} contract(s) for ${contractClient} removed.`,
                    })
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: 'rgba(244,63,94,0.15)', color: '#fda4af', border: '1px solid rgba(244,63,94,0.35)' }}
                >
                  <Trash2 size={12} /> Delete client contracts
                </button>
              </div>
            </>
          )}

          {/* Individual data type wipes */}
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Clear individual data types</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-5">
            {([
              { id: 'wipe-opps',     icon: <Briefcase size={13} />,   label: 'Opportunities',     lower: 'opportunities',         count: opportunities.length,          run: wipeOpportunities },
              { id: 'wipe-contracts',icon: <FolderTree size={13} />,  label: 'All contracts',     lower: 'contracts',             count: contracts.length,              run: () => wipeContracts() },
              { id: 'wipe-fresh',    icon: <Award size={13} />,       label: 'Fresh awards',      lower: 'fresh awards',          count: freshAwards.length,            run: wipeFreshAwards },
              { id: 'wipe-past',     icon: <FileText size={13} />,    label: 'Past performances', lower: 'past performances',     count: pastPerformances.length,       run: wipePastPerformances },
              { id: 'wipe-subs',     icon: <Users size={13} />,       label: 'Subcontractors',    lower: 'subcontractors',        count: subcontractors.length,         run: wipeSubcontractors },
              { id: 'wipe-subk',     icon: <Database size={13} />,    label: 'Sourcing entries',  lower: 'sourcing entries',      count: subkDatabase.length,           run: wipeSubkDatabase },
              { id: 'wipe-bd',       icon: <List size={13} />,        label: 'BD tracker',        lower: 'BD tracker entries',    count: bdSubmissions.length,          run: wipeBDSubmissions },
              { id: 'wipe-nonsub',   icon: <FileText size={13} />,    label: 'Non-sub reports',   lower: 'non-submission reports',count: nonSubReports.length,          run: wipeNonSubReports },
              { id: 'wipe-delreq',   icon: <Trash2 size={13} />,      label: 'Deletion requests', lower: 'deletion requests',     count: deletionRequests.length,       run: wipeDeletionRequests },
              { id: 'wipe-notif',    icon: <Bell size={13} />,        label: 'Notifications',     lower: 'notifications',         count: notifications.length,          run: wipeNotifications },
              { id: 'wipe-activity', icon: <Activity size={13} />,    label: 'Activity log',      lower: 'activity log entries',  count: activityLogs.length,           run: wipeActivityLogs },
              { id: 'wipe-certs',    icon: <Shield size={13} />,      label: 'Certifications',    lower: 'company certifications',count: companyCertifications.length,  run: wipeCompanyCertifications },
              { id: 'wipe-empreq',   icon: <KeyRound size={13} />,    label: 'Employee requests', lower: 'employee requests',     count: employeeRequests.length,       run: wipeEmployeeRequests },
            ] as const).map(w => (
              <DangerCard
                key={w.id}
                icon={w.icon}
                label={w.label}
                subtitle={`${w.count} record(s)`}
                compact
                disabled={w.count === 0}
                onClick={() => setDanger({
                  id: w.id,
                  title: `Delete all ${w.lower}`,
                  description: `Permanently removes every ${w.lower.replace(/s$/, '')} from the workspace.`,
                  consequences: [`All ${w.count} ${w.lower} will be permanently deleted`],
                  confirmPhrase: 'DELETE',
                  destructiveLabel: `Delete all ${w.lower}`,
                  run: w.run,
                  toastSuccess: (n) => `${n} ${w.lower} removed.`,
                })}
              />
            ))}
          </div>

          {/* Total reset — biggest button */}
          <button
            type="button"
            onClick={() => setDanger({
              id: 'full-reset',
              title: 'Reset the entire workspace',
              description: 'Nukes every business record and every non-admin user account.',
              consequences: [
                'All opportunities, contracts, fresh awards and past performances are deleted',
                'All subcontractors, sourcing entries, BD tracker rows and non-sub reports are deleted',
                'All notifications, activity logs, certifications and employee requests are cleared',
                `All ${removableUserCount} non-admin user account(s) are removed (Capture Managers are kept so you can keep logging in)`,
                'Settings (timing / activation mode) are preserved',
              ],
              confirmPhrase: 'RESET EVERYTHING',
              destructiveLabel: 'Reset entire workspace',
              run: resetEntireWorkspace,
              toastSuccess: (n) => `Workspace reset · ${n} item(s) removed.`,
            })}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wide transition-all hover:brightness-110"
            style={{
              background: 'linear-gradient(135deg, rgba(244,63,94,0.22), rgba(190,18,60,0.28))',
              border: '1px solid rgba(244,63,94,0.55)',
              color: '#fecdd3',
              boxShadow: '0 8px 24px rgba(244,63,94,0.12)',
            }}
          >
            <Bomb size={14} /> Reset entire workspace
          </button>
        </div>
      </div>
      </>)}

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

      <AnimatePresence>
        {goalModal && (
          <GoalModal
            key={goalModal === 'create' ? 'create' : goalModal.id}
            goal={goalModal === 'create' ? null : goalModal}
            employees={employees}
            defaultMonthKey={goalMonthKey}
            onSave={data => {
              if (goalModal === 'create') createGoal(data)
              else updateGoal(goalModal.id, data)
              setGoalModal(null)
            }}
            onClose={() => setGoalModal(null)}
          />
        )}
      </AnimatePresence>

      {createPortal(
        <AnimatePresence>
          {danger && (
            <DangerConfirmModal
              key={danger.id}
              action={danger}
              busy={dangerBusy}
              onClose={() => { if (!dangerBusy) setDanger(null) }}
              onConfirm={runDanger}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Org-tree components — Capture strip + Team panels with indented PersonRows
// ─────────────────────────────────────────────────────────────────────────────

const TEAM_PALETTE: Record<EmployeeTeam, { bg: string; border: string; accent: string; text: string; soft: string }> = {
  BD: {
    bg: 'rgba(184,145,78,0.05)',
    border: 'rgba(215,190,122,0.22)',
    accent: '#D7BE7A',
    text: '#E8C77B',
    soft: 'rgba(215,190,122,0.12)',
  },
  OPS: {
    bg: 'rgba(31,122,120,0.06)',
    border: 'rgba(31,122,120,0.32)',
    accent: '#5EBCB9',
    text: '#7DD3CF',
    soft: 'rgba(31,122,120,0.14)',
  },
}

const CAPTURE_ACCENT = '#D7BE7A'

function confirmDelete(user: User, currentUserId: string | undefined, onDelete: (u: User) => void) {
  if (user.id === currentUserId) { toast.error("You can't delete your own account."); return }
  if (window.confirm(`Remove ${user.name}? This action cannot be undone.`)) onDelete(user)
}

// ─── Capture Managers strip — compact horizontal pills with inline delete
function CaptureStrip({
  users, isOver, dragId, currentUserId,
  onDragOver, onDragLeave, onDrop,
  onCardDragStart, onCardDragEnd, onCardClick, onAdd, onDelete,
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
  onDelete: (u: User) => void
}) {
  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver() }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="rounded-2xl p-3 transition-all"
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${isOver ? CAPTURE_ACCENT : 'var(--border-default)'}`,
        boxShadow: isOver ? `0 0 0 2px ${CAPTURE_ACCENT}55, 0 12px 32px ${CAPTURE_ACCENT}22` : undefined,
      }}>
      <div className="flex items-center justify-between gap-3 px-1 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: CAPTURE_ACCENT, boxShadow: `0 0 8px ${CAPTURE_ACCENT}` }} />
          <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: CAPTURE_ACCENT }}>Capture Managers</h3>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(248,251,247,0.55)' }}>{users.length}</span>
          {isOver && <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: CAPTURE_ACCENT }}>Drop to promote</span>}
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md transition-colors"
          style={{ color: `${CAPTURE_ACCENT}cc`, background: 'rgba(215,190,122,0.06)', border: `1px solid ${CAPTURE_ACCENT}33` }}
          onMouseEnter={e => { e.currentTarget.style.color = CAPTURE_ACCENT; e.currentTarget.style.background = 'rgba(215,190,122,0.14)' }}
          onMouseLeave={e => { e.currentTarget.style.color = `${CAPTURE_ACCENT}cc`; e.currentTarget.style.background = 'rgba(215,190,122,0.06)' }}>
          <Plus size={11} /> Capture Manager
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {users.length === 0 && (
          <p className="text-[11px] italic px-2 py-1.5" style={{ color: 'rgba(248,251,247,0.4)' }}>None yet — click &ldquo;+ Capture Manager&rdquo; to add one.</p>
        )}
        {users.map(u => (
          <CapturePill key={u.id} user={u}
            dragging={dragId === u.id}
            isCurrentUser={u.id === currentUserId}
            onDragStart={() => onCardDragStart(u.id)}
            onDragEnd={onCardDragEnd}
            onClick={() => onCardClick(u)}
            onDelete={() => confirmDelete(u, currentUserId, onDelete)} />
        ))}
      </div>
    </div>
  )
}

function CapturePill({ user, dragging, isCurrentUser, onDragStart, onDragEnd, onClick, onDelete }: {
  user: User
  dragging: boolean
  isCurrentUser: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onClick: () => void
  onDelete: () => void
}) {
  return (
    <div
      draggable
      onDragStart={e => { onDragStart(); e.dataTransfer.effectAllowed = 'move' }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="group relative flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-full cursor-grab active:cursor-grabbing transition-all"
      style={{
        background: 'var(--bg-raised)',
        border: `1px solid ${CAPTURE_ACCENT}33`,
        opacity: dragging ? 0.4 : 1,
      }}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white bg-gradient-to-br ${avatarColor(user.avatar)} flex-shrink-0`}>
        {user.avatar.slice(0, 2)}
      </div>
      <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{user.name}</span>
      {isCurrentUser && (
        <span className="text-[8px] font-bold px-1 rounded" style={{ background: `${CAPTURE_ACCENT}26`, color: CAPTURE_ACCENT }}>YOU</span>
      )}
      {user.status === 'inactive' && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" title="Inactive" />}
      {user.firstLogin && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Pending first login" />}
      <button
        type="button"
        draggable={false}
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="ml-0.5 opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity hover:bg-rose-500/15"
        style={{ color: 'rgba(248,113,113,0.85)' }}
        title="Remove user">
        <Trash2 size={11} />
      </button>
    </div>
  )
}

// ─── Team panel — one container per team, holding an indented PersonRow tree
function TeamPanel({
  team, label, allUsers, dragId, dragOverKey, currentUserId,
  onDragOver, onDragLeave, onDrop,
  onCardDragStart, onCardDragEnd, onCardClick, onAdd, onDelete,
}: {
  team: EmployeeTeam
  label: string
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
  onDelete: (u: User) => void
}) {
  const palette = TEAM_PALETTE[team]
  const teamKey = targetKey({ kind: 'team', team })
  const isTeamOver = dragOverKey === teamKey
  const managers = allUsers.filter(u =>
    (team === 'BD' ? u.role === 'BD_MANAGER' : u.role === 'OPS_MANAGER') && (u.team ?? 'BD') === team
  )
  const tlsOf = (mgrId: string) => allUsers.filter(u => u.role === 'TEAM_LEAD' && u.managerId === mgrId)
  const assocsOf = (tlId: string) => allUsers.filter(u => u.role === 'ASSOCIATE' && u.managerId === tlId)
  const orphanTLs = allUsers.filter(u => u.role === 'TEAM_LEAD' && !u.managerId && (u.team ?? 'BD') === team)
  const orphanAssoc = allUsers.filter(u => u.role === 'ASSOCIATE' && !u.managerId && (u.team ?? 'BD') === team)
  const tlCount = allUsers.filter(u => u.role === 'TEAM_LEAD' && (u.team ?? 'BD') === team).length
  const assocCount = allUsers.filter(u => u.role === 'ASSOCIATE' && (u.team ?? 'BD') === team).length

  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver(teamKey) }}
      onDragLeave={() => onDragLeave(teamKey)}
      onDrop={() => onDrop({ kind: 'team', team })}
      className="rounded-2xl transition-all overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${isTeamOver ? palette.accent : 'var(--border-default)'}`,
        boxShadow: isTeamOver ? `0 0 0 2px ${palette.accent}55, 0 12px 32px ${palette.accent}22` : undefined,
      }}>
      {/* Header — drop target for new Manager */}
      <div className="flex items-center justify-between gap-3 px-4 py-3"
        style={{ borderBottom: `1px solid ${palette.border}`, background: palette.bg }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: palette.accent, boxShadow: `0 0 8px ${palette.accent}` }} />
          <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: palette.text }}>{label}</h3>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(248,251,247,0.55)' }}>
            {managers.length} mgr · {tlCount} TL · {assocCount} assoc
          </span>
          {isTeamOver && (
            <span className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: palette.accent }}>Drop to make Manager</span>
          )}
        </div>
        <button
          onClick={() => onAdd(team === 'BD' ? 'BD_MANAGER' : 'OPS_MANAGER', team, null)}
          className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md transition-colors flex-shrink-0"
          style={{ color: palette.text, background: palette.soft, border: `1px solid ${palette.accent}44` }}>
          <Plus size={11} /> Manager
        </button>
      </div>

      <div className="p-3 space-y-0.5">
        {managers.length === 0 && (
          <div className="text-[11px] italic px-3 py-5 text-center rounded-lg"
            style={{ color: 'rgba(248,251,247,0.45)', background: 'rgba(255,255,255,0.02)', border: `1px dashed ${palette.border}` }}>
            No managers on the {team} team yet.<br />
            <span className="text-[10px]">Drop someone on this panel header or click &ldquo;+ Manager&rdquo;.</span>
          </div>
        )}
        {managers.map(mgr => {
          const tls = tlsOf(mgr.id)
          return (
            <Fragment key={mgr.id}>
              <PersonRow
                user={mgr} level={0} palette={palette}
                dragId={dragId} currentUserId={currentUserId} dragOverKey={dragOverKey}
                dropTargetForChild={{ kind: 'manager', id: mgr.id, team }}
                addChildLabel="Team Lead"
                onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                onCardDragStart={onCardDragStart} onCardDragEnd={onCardDragEnd}
                onCardClick={onCardClick} onDelete={onDelete}
                onAddChild={() => onAdd('TEAM_LEAD', team, mgr.id)} />
              {tls.map(tl => {
                const assocs = assocsOf(tl.id)
                return (
                  <Fragment key={tl.id}>
                    <PersonRow
                      user={tl} level={1} palette={palette}
                      dragId={dragId} currentUserId={currentUserId} dragOverKey={dragOverKey}
                      dropTargetForChild={{ kind: 'tl', id: tl.id, team }}
                      addChildLabel="Associate"
                      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                      onCardDragStart={onCardDragStart} onCardDragEnd={onCardDragEnd}
                      onCardClick={onCardClick} onDelete={onDelete}
                      onAddChild={() => onAdd('ASSOCIATE', team, tl.id)} />
                    {assocs.map(a => (
                      <PersonRow key={a.id}
                        user={a} level={2} palette={palette}
                        dragId={dragId} currentUserId={currentUserId} dragOverKey={dragOverKey}
                        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                        onCardDragStart={onCardDragStart} onCardDragEnd={onCardDragEnd}
                        onCardClick={onCardClick} onDelete={onDelete} />
                    ))}
                  </Fragment>
                )
              })}
            </Fragment>
          )
        })}

        {(orphanTLs.length > 0 || orphanAssoc.length > 0) && (
          <div className="mt-3 pt-2" style={{ borderTop: `1px dashed ${palette.border}` }}>
            <p className="text-[10px] font-bold uppercase tracking-wider px-2 mb-1" style={{ color: 'rgba(248,251,247,0.5)' }}>
              Unassigned ({orphanTLs.length + orphanAssoc.length})
            </p>
            {orphanTLs.map(u => (
              <PersonRow key={u.id}
                user={u} level={0} palette={palette}
                dragId={dragId} currentUserId={currentUserId} dragOverKey={dragOverKey}
                onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                onCardDragStart={onCardDragStart} onCardDragEnd={onCardDragEnd}
                onCardClick={onCardClick} onDelete={onDelete} />
            ))}
            {orphanAssoc.map(u => (
              <PersonRow key={u.id}
                user={u} level={0} palette={palette}
                dragId={dragId} currentUserId={currentUserId} dragOverKey={dragOverKey}
                onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                onCardDragStart={onCardDragStart} onCardDragEnd={onCardDragEnd}
                onCardClick={onCardClick} onDelete={onDelete} />
            ))}
            <p className="text-[10px] mt-1 px-2" style={{ color: 'rgba(248,251,247,0.35)' }}>
              Drag onto a manager or team lead to assign a parent.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// Compact target-icon dot rendered inline in PersonRow. Renders nothing when
// the user has no active goals for the current month.
function PersonRowGoalDot({ user }: { user: User }) {
  const goals = useStore(s => s.goals)
  const employees = useStore(s => s.employees)
  const opportunities = useStore(s => s.opportunities)
  const freshAwards = useStore(s => s.freshAwards)
  const monthKey = currentMonthKey()
  const userGoals = useMemo(() => {
    const emp = employees.find(e =>
      e.email?.toLowerCase() === user.email.toLowerCase() ||
      e.name.toLowerCase() === user.name.toLowerCase(),
    )
    return goalsForEmployee(goals, emp?.id, employees, monthKey)
  }, [goals, employees, user, monthKey])
  if (!userGoals.length) return null
  const primary = userGoals[0]
  const progress = computeGoalProgress(primary, opportunities, freshAwards, employees)
  const palette = GOAL_STATUS_PALETTE[progress.status]
  const title =
    `${GOAL_METRIC_LABELS[primary.metric]} \u00b7 ` +
    `${formatGoalValue(primary.metric, progress.current)} / ${formatGoalValue(primary.metric, primary.targetValue)} ` +
    `(${Math.round(progress.pct)}%) \u00b7 ${userGoals.length === 1 ? '1 active goal' : `${userGoals.length} active goals`}`
  return (
    <span
      className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full flex-shrink-0"
      title={title}
      style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.border}` }}
    >
      <Target size={8} />
    </span>
  )
}

// ─── PersonRow — the single row component used at every level of the tree.
// Level 0 = Manager (or orphan), 1 = Team Lead, 2 = Associate.
// dropTargetForChild makes the row a drop zone that re-parents the dragged
// user as this row's child.
function PersonRow({
  user, level, palette,
  dragId, currentUserId, dragOverKey,
  dropTargetForChild, addChildLabel,
  onDragOver, onDragLeave, onDrop,
  onCardDragStart, onCardDragEnd, onCardClick, onDelete, onAddChild,
}: {
  user: User
  level: 0 | 1 | 2
  palette: { accent: string; text: string; soft: string; bg: string; border: string }
  dragId: string | null
  currentUserId: string | undefined
  dragOverKey: string | null
  dropTargetForChild?: DropTarget
  addChildLabel?: string
  onDragOver: (key: string) => void
  onDragLeave: (key: string) => void
  onDrop: (target: DropTarget) => void
  onCardDragStart: (id: string) => void
  onCardDragEnd: () => void
  onCardClick: (u: User) => void
  onDelete: (u: User) => void
  onAddChild?: () => void
}) {
  const INDENT = 24
  const childKey = dropTargetForChild ? targetKey(dropTargetForChild) : null
  const isChildDropOver = childKey !== null && dragOverKey === childKey
  const isDragging = dragId === user.id

  const dropProps = dropTargetForChild ? {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); onDragOver(childKey!) },
    onDragLeave: (e: React.DragEvent) => { e.stopPropagation(); onDragLeave(childKey!) },
    onDrop: (e: React.DragEvent) => { e.stopPropagation(); onDrop(dropTargetForChild) },
  } : {}

  return (
    <div
      {...dropProps}
      className="relative rounded-lg transition-colors"
      style={{
        marginLeft: level * INDENT,
        background: isChildDropOver ? `${palette.accent}14` : 'transparent',
      }}>
      {/* Tree guides: one vertical for each parent level + horizontal connector on innermost */}
      {Array.from({ length: level }, (_, i) => {
        const offset = -(INDENT / 2) - i * INDENT
        const innermost = i === 0
        return (
          <Fragment key={i}>
            <div className="absolute top-0 bottom-0 w-px pointer-events-none"
              style={{ left: offset, background: `${palette.accent}33` }} />
            {innermost && (
              <div className="absolute w-3 h-px pointer-events-none"
                style={{ left: offset, top: '50%', background: `${palette.accent}33` }} />
            )}
          </Fragment>
        )
      })}
      {/* Drop highlight bar at the row's left edge */}
      {isChildDropOver && (
        <div className="absolute top-1 bottom-1 w-0.5 rounded-full pointer-events-none"
          style={{ left: 3, background: palette.accent, boxShadow: `0 0 8px ${palette.accent}` }} />
      )}

      <div
        draggable
        onDragStart={e => { onCardDragStart(user.id); e.dataTransfer.effectAllowed = 'move' }}
        onDragEnd={onCardDragEnd}
        onClick={() => onCardClick(user)}
        className="group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing transition-colors hover:bg-white/[0.03]"
        style={{ opacity: isDragging ? 0.4 : 1 }}>
        <GripVertical size={11} className="opacity-0 group-hover:opacity-40 transition-opacity flex-shrink-0" style={{ color: palette.accent }} />
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-gradient-to-br ${avatarColor(user.avatar)} flex-shrink-0`}>
          {user.avatar.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{user.name}</span>
          <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0"
            style={{ color: palette.text, background: palette.soft, border: `1px solid ${palette.accent}33` }}>
            {ROLE_LABELS[user.role]}
          </span>
          {currentUserId === user.id && (
            <span className="text-[8px] font-bold px-1 rounded flex-shrink-0" style={{ background: `${CAPTURE_ACCENT}26`, color: CAPTURE_ACCENT }}>YOU</span>
          )}
          {user.status === 'inactive' && <span className="w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0" title="Inactive" />}
          {user.firstLogin && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Pending first login" />}
          <PersonRowGoalDot user={user} />
        </div>
        <span className="text-[10px] truncate hidden md:block max-w-[140px]" style={{ color: 'rgba(248,251,247,0.35)' }}>@{user.username}</span>

        {isChildDropOver && addChildLabel && (
          <span className="text-[9px] font-bold uppercase tracking-wider whitespace-nowrap flex-shrink-0" style={{ color: palette.accent }}>
            Drop to add as {addChildLabel}
          </span>
        )}

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          onClick={e => e.stopPropagation()}>
          {addChildLabel && onAddChild && (
            <button
              type="button"
              draggable={false}
              onClick={e => { e.stopPropagation(); onAddChild() }}
              className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-1 rounded transition-colors"
              style={{ color: palette.text, border: `1px solid ${palette.accent}44`, background: 'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.background = palette.soft }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              title={`Add ${addChildLabel}`}>
              <Plus size={10} /> {addChildLabel}
            </button>
          )}
          <button
            type="button"
            draggable={false}
            onClick={e => { e.stopPropagation(); confirmDelete(user, currentUserId, onDelete) }}
            className="p-1 rounded transition-colors hover:bg-rose-500/15"
            style={{ color: 'rgba(248,113,113,0.7)' }}
            title="Remove user">
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin layout helpers — section headers + Danger Zone modal
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_ACCENT: Record<'indigo' | 'emerald' | 'rose' | 'cyan' | 'violet' | 'amber' | 'sky', { fg: string; bg: string; line: string }> = {
  indigo:  { fg: '#a5b4fc', bg: 'rgba(99,102,241,0.12)',  line: 'rgba(99,102,241,0.25)' },
  emerald: { fg: '#6ee7b7', bg: 'rgba(16,185,129,0.12)',  line: 'rgba(16,185,129,0.25)' },
  rose:    { fg: '#fda4af', bg: 'rgba(244,63,94,0.14)',   line: 'rgba(244,63,94,0.30)' },
  cyan:    { fg: '#67e8f9', bg: 'rgba(6,182,212,0.12)',   line: 'rgba(6,182,212,0.25)'  },
  violet:  { fg: '#c4b5fd', bg: 'rgba(139,92,246,0.12)',  line: 'rgba(139,92,246,0.25)' },
  amber:   { fg: '#fcd34d', bg: 'rgba(245,158,11,0.12)',  line: 'rgba(245,158,11,0.25)' },
  sky:     { fg: '#7dd3fc', bg: 'rgba(14,165,233,0.12)',  line: 'rgba(14,165,233,0.25)' },
}

function SectionHeader({ icon, label, accent }: { icon: React.ReactNode; label: string; accent: 'indigo' | 'emerald' | 'rose' | 'cyan' | 'violet' | 'amber' | 'sky' }) {
  const palette = SECTION_ACCENT[accent]
  return (
    <div className="flex items-center gap-3 mb-3">
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-md"
        style={{ background: palette.bg, color: palette.fg }}
      >
        {icon}
      </span>
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: palette.fg }}>{label}</h2>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, ${palette.line}, transparent)` }} />
    </div>
  )
}

type DangerAction = {
  id: string
  title: string
  description: string
  consequences: string[]
  confirmPhrase: string
  destructiveLabel: string
  run: () => Promise<number>
  toastSuccess: (count: number) => string
}

function DangerCard({ icon, label, subtitle, onClick, disabled, compact }: {
  icon: React.ReactNode
  label: string
  subtitle: string
  onClick: () => void
  disabled?: boolean
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-left transition-all rounded-xl ${compact ? 'px-3 py-2.5' : 'px-3.5 py-3'} disabled:cursor-not-allowed disabled:opacity-40`}
      style={{
        background: disabled ? 'rgba(15,23,42,0.4)' : 'rgba(244,63,94,0.06)',
        border: `1px solid ${disabled ? 'rgba(148,163,184,0.12)' : 'rgba(244,63,94,0.25)'}`,
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'rgba(244,63,94,0.12)' }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.background = 'rgba(244,63,94,0.06)' }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-rose-300">{icon}</span>
        <span className={`font-semibold text-slate-100 ${compact ? 'text-[11px]' : 'text-xs'}`}>{label}</span>
      </div>
      <p className="text-[10px] text-slate-500">{subtitle}</p>
    </button>
  )
}

function DangerConfirmModal({ action, busy, onClose, onConfirm }: {
  action: DangerAction
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const [typed, setTyped] = useState('')
  useEscapeKey(() => { if (!busy) onClose() })
  const phraseMatches = typed.trim() === action.confirmPhrase
  return (
    <motion.div
      key={`danger-${action.id}`}
      className="fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-4"
      style={{ pointerEvents: 'none' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        style={{ pointerEvents: 'all' }}
        onClick={() => !busy && onClose()}
      />
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="relative z-10 w-full max-w-lg flex flex-col max-h-[min(92vh,860px)] overflow-hidden rounded-2xl"
        style={{
          background: 'rgba(7,14,34,0.98)',
          border: '1px solid rgba(244,63,94,0.45)',
          boxShadow: '0 24px 80px rgba(244,63,94,0.16), 0 24px 80px rgba(0,0,0,0.7)',
          pointerEvents: 'all',
        }}
      >
        <div className="flex items-start justify-between p-5 pb-3 flex-shrink-0 border-b border-rose-500/15">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-rose-500/15 text-rose-300 flex-shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{action.title}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{action.description}</p>
            </div>
          </div>
          <button onClick={() => !busy && onClose()} className="btn-ghost p-1.5" disabled={busy}>
            <X size={13} />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200 mb-1.5">This action is permanent</p>
            <ul className="text-xs text-slate-300 space-y-1.5">
              {action.consequences.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-rose-400 leading-tight">•</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 block mb-1.5">
              Type <span className="font-mono text-rose-300 normal-case tracking-normal">{action.confirmPhrase}</span> to confirm
            </label>
            <input
              type="text"
              autoFocus
              value={typed}
              onChange={e => setTyped(e.target.value)}
              disabled={busy}
              spellCheck={false}
              autoComplete="off"
              className="input-field font-mono"
              placeholder={action.confirmPhrase}
            />
          </div>
        </div>

        <div className="flex gap-2 p-5 pt-3 flex-shrink-0 border-t border-rose-500/10">
          <button type="button" onClick={onClose} disabled={busy} className="btn-secondary flex-1 justify-center">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!phraseMatches || busy}
            className="flex-1 justify-center inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: phraseMatches && !busy ? '#e11d48' : 'rgba(244,63,94,0.15)',
              color: phraseMatches && !busy ? '#fff' : 'rgba(244,63,94,0.55)',
              border: '1px solid rgba(244,63,94,0.35)',
            }}
          >
            <Bomb size={13} /> {busy ? 'Working…' : action.destructiveLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Goals — admin CRUD + per-target progress bars
// ─────────────────────────────────────────────────────────────────────────

const GOAL_STATUS_PALETTE: Record<'achieved' | 'ahead' | 'on-track' | 'behind', { fg: string; bg: string; border: string; bar: string }> = {
  achieved: { fg: '#6ee7b7', bg: 'rgba(16,185,129,0.16)', border: 'rgba(16,185,129,0.45)', bar: '#10b981' },
  ahead:    { fg: '#67e8f9', bg: 'rgba(6,182,212,0.14)',  border: 'rgba(6,182,212,0.40)',  bar: '#06b6d4' },
  'on-track':{ fg: '#fcd34d', bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.40)', bar: '#f59e0b' },
  behind:   { fg: '#fda4af', bg: 'rgba(244,63,94,0.14)',  border: 'rgba(244,63,94,0.40)',  bar: '#f43f5e' },
}

const GOAL_STATUS_LABEL: Record<'achieved' | 'ahead' | 'on-track' | 'behind', string> = {
  achieved: 'Achieved',
  ahead: 'Ahead of pace',
  'on-track': 'On track',
  behind: 'Behind pace',
}

function GoalsAdminPanel({
  goals,
  employees,
  opportunities,
  freshAwards,
  monthKey,
  onMonthKeyChange,
  onCreate,
  onEdit,
  onDelete,
}: {
  goals: Goal[]
  employees: Employee[]
  opportunities: Opportunity[]
  freshAwards: FreshAward[]
  monthKey: string
  onMonthKeyChange: (v: string) => void
  onCreate: () => void
  onEdit: (g: Goal) => void
  onDelete: (id: string) => void
}) {
  const visible = useMemo(() => goals.filter(g => g.monthKey === monthKey), [goals, monthKey])
  const teamGoals = visible.filter(g => g.scope === 'team')
  const employeeGoals = visible.filter(g => g.scope === 'employee')
  const employeeById = useMemo(() => {
    const m = new Map<string, Employee>()
    for (const e of employees) m.set(e.id, e)
    return m
  }, [employees])

  const monthOptions = useMemo(() => {
    const now = new Date()
    const opts: string[] = []
    for (let i = -3; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return opts
  }, [])

  return (
    <div className="mt-2">
      <SectionHeader icon={<Target size={14} />} label="Performance goals" accent="amber" />
      <div className="glass rounded-2xl p-4 mb-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="max-w-xl">
            <p className="text-xs text-slate-300 leading-relaxed">
              Set monthly targets for submissions, wins, and win rate. Goals can be assigned to an
              individual employee or to a manager so the whole team rolls up against the same number.
              Progress updates live as opportunities are submitted and contracts are awarded.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] uppercase tracking-wide text-slate-500">Month</label>
            <select
              value={monthKey}
              onChange={e => onMonthKeyChange(e.target.value)}
              className="select-field"
              style={{ minWidth: 160 }}
            >
              {monthOptions.map(m => (
                <option key={m} value={m}>{formatMonthKey(m)}</option>
              ))}
            </select>
            <button type="button" onClick={onCreate} className="btn-primary">
              <Plus size={12} /> Add goal
            </button>
          </div>
        </div>
      </div>

      <GoalGroup
        title="Team goals"
        empty="No team goals for this month. Add one to set a target for a manager and everyone reporting to them."
        goals={teamGoals}
        employees={employees}
        employeeById={employeeById}
        opportunities={opportunities}
        freshAwards={freshAwards}
        onEdit={onEdit}
        onDelete={onDelete}
      />

      <div className="h-3" />

      <GoalGroup
        title="Individual goals"
        empty="No individual goals for this month. Add one to set a personal target for a specific employee."
        goals={employeeGoals}
        employees={employees}
        employeeById={employeeById}
        opportunities={opportunities}
        freshAwards={freshAwards}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  )
}

function GoalGroup({
  title,
  empty,
  goals,
  employees,
  employeeById,
  opportunities,
  freshAwards,
  onEdit,
  onDelete,
}: {
  title: string
  empty: string
  goals: Goal[]
  employees: Employee[]
  employeeById: Map<string, Employee>
  opportunities: Opportunity[]
  freshAwards: FreshAward[]
  onEdit: (g: Goal) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{title}</h3>
        <span className="text-[10px] text-slate-500">{goals.length} {goals.length === 1 ? 'goal' : 'goals'}</span>
      </div>
      {goals.length === 0 ? (
        <p className="text-[11px] text-slate-500 leading-relaxed">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {goals.map(g => (
            <GoalRow
              key={g.id}
              goal={g}
              targetName={employeeById.get(g.targetId)?.name ?? 'Unknown'}
              employees={employees}
              opportunities={opportunities}
              freshAwards={freshAwards}
              onEdit={() => onEdit(g)}
              onDelete={() => onDelete(g.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function GoalRow({
  goal,
  targetName,
  employees,
  opportunities,
  freshAwards,
  onEdit,
  onDelete,
}: {
  goal: Goal
  targetName: string
  employees: Employee[]
  opportunities: Opportunity[]
  freshAwards: FreshAward[]
  onEdit: () => void
  onDelete: () => void
}) {
  const progress = useMemo(
    () => computeGoalProgress(goal, opportunities, freshAwards, employees),
    [goal, opportunities, freshAwards, employees],
  )
  const palette = GOAL_STATUS_PALETTE[progress.status]
  const barPct = Math.min(100, progress.pct)
  return (
    <li
      className="rounded-xl p-3"
      style={{ background: 'var(--bg-raised, rgba(15,23,42,0.55))', border: '1px solid var(--border-default)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-slate-100 truncate">{targetName}</span>
            <span
              className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc' }}
            >
              {goal.scope === 'team' ? 'Team' : 'Individual'}
            </span>
            <span
              className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.border}` }}
            >
              {GOAL_STATUS_LABEL[progress.status]}
            </span>
          </div>
          <div className="text-[11px] text-slate-400">
            {GOAL_METRIC_LABELS[goal.metric]}
            {' · '}
            Target {formatGoalValue(goal.metric, goal.targetValue)}
            {' · '}
            {progress.submissions} submission{progress.submissions === 1 ? '' : 's'}, {progress.wins} win{progress.wins === 1 ? '' : 's'}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(148,163,184,0.12)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${barPct}%`, background: palette.bar }}
              />
            </div>
            <span className="text-[11px] font-semibold tabular-nums" style={{ color: palette.fg, minWidth: 56, textAlign: 'right' }}>
              {formatGoalValue(goal.metric, progress.current)} / {formatGoalValue(goal.metric, goal.targetValue)}
            </span>
          </div>
          {goal.notes && (
            <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">{goal.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button type="button" onClick={onEdit} className="btn-ghost p-1.5" title="Edit goal">
            <Pencil size={12} />
          </button>
          <button type="button" onClick={onDelete} className="btn-ghost p-1.5" title="Delete goal" style={{ color: 'rgba(248,113,113,0.85)' }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </li>
  )
}

function GoalModal({
  goal,
  employees,
  defaultMonthKey,
  onSave,
  onClose,
}: {
  goal: Goal | null
  employees: Employee[]
  defaultMonthKey: string
  onSave: (data: {
    scope: GoalScope
    targetId: string
    metric: GoalMetric
    targetValue: number
    period: 'monthly'
    monthKey: string
    notes?: string
  }) => void
  onClose: () => void
}) {
  const isEdit = !!goal
  const [scope, setScope] = useState<GoalScope>(goal?.scope ?? 'employee')
  const [targetId, setTargetId] = useState<string>(goal?.targetId ?? '')
  const [metric, setMetric] = useState<GoalMetric>(goal?.metric ?? 'submissions_count')
  const [targetValue, setTargetValue] = useState<string>(goal ? String(goal.targetValue) : '')
  const [monthKey, setMonthKey] = useState<string>(goal?.monthKey ?? defaultMonthKey)
  const [notes, setNotes] = useState<string>(goal?.notes ?? '')

  useEscapeKey(onClose)

  // Filter target options: team scope = managers/team leads (anyone with reports);
  // employee scope = every employee.
  const targetOptions = useMemo(() => {
    if (scope === 'team') {
      const reportsByManager = new Map<string, number>()
      for (const e of employees) {
        if (e.managerId) reportsByManager.set(e.managerId, (reportsByManager.get(e.managerId) ?? 0) + 1)
      }
      return employees
        .filter(e => reportsByManager.has(e.id))
        .map(e => ({ id: e.id, label: `${e.name} — ${e.role}`, reports: reportsByManager.get(e.id) ?? 0 }))
        .sort((a, b) => a.label.localeCompare(b.label))
    }
    return employees
      .map(e => ({ id: e.id, label: `${e.name} — ${e.role}`, reports: 0 }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [employees, scope])

  const monthOptions = useMemo(() => {
    const now = new Date()
    const opts: string[] = []
    for (let i = -3; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    if (goal && !opts.includes(goal.monthKey)) opts.unshift(goal.monthKey)
    return opts
  }, [goal])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const n = Number(targetValue)
    if (!targetId) return
    if (!Number.isFinite(n) || n <= 0) return
    if (metric === 'win_rate_pct' && n > 100) return
    onSave({
      scope,
      targetId,
      metric,
      targetValue: n,
      period: 'monthly',
      monthKey,
      notes: notes.trim() || undefined,
    })
  }

  return createPortal(
    <motion.div className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative z-10 w-full max-w-md flex flex-col max-h-[min(92vh,860px)] overflow-hidden rounded-2xl"
        style={{ background: 'rgba(7,14,34,0.98)', border: '1px solid rgba(245,158,11,0.22)', boxShadow: '0 24px 80px rgba(0,0,0,0.7)' }}>
        <div className="flex items-center justify-between p-6 pb-4 flex-shrink-0">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Target size={14} className="text-amber-300" />
            {isEdit ? 'Edit Goal' : 'New Goal'}
          </h2>
          <button onClick={onClose} className="btn-ghost p-1.5" type="button"><X size={13} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 pb-6 overflow-y-auto flex-1 space-y-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Scope *</label>
            <div className="grid grid-cols-2 gap-2">
              {(['team', 'employee'] as GoalScope[]).map(s => {
                const selected = scope === s
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setScope(s); setTargetId('') }}
                    className="px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: selected ? 'rgba(245,158,11,0.16)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${selected ? 'rgba(245,158,11,0.45)' : 'var(--border-default)'}`,
                      color: selected ? '#fcd34d' : 'rgb(148 163 184)',
                    }}
                  >
                    {s === 'team' ? 'Team (manager + reports)' : 'Individual'}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1">
              {scope === 'team' ? 'Team lead / manager *' : 'Employee *'}
            </label>
            <select
              value={targetId}
              onChange={e => setTargetId(e.target.value)}
              className="select-field"
              required
            >
              <option value="">{scope === 'team' ? 'Select a manager…' : 'Select an employee…'}</option>
              {targetOptions.map(o => (
                <option key={o.id} value={o.id}>
                  {o.label}{scope === 'team' && o.reports ? ` (${o.reports} report${o.reports === 1 ? '' : 's'})` : ''}
                </option>
              ))}
            </select>
            {scope === 'team' && targetOptions.length === 0 && (
              <p className="text-[10px] text-rose-300 mt-1">No employees currently have direct reports.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Metric *</label>
              <select
                value={metric}
                onChange={e => setMetric(e.target.value as GoalMetric)}
                className="select-field"
              >
                <option value="submissions_count">{GOAL_METRIC_LABELS.submissions_count}</option>
                <option value="wins_count">{GOAL_METRIC_LABELS.wins_count}</option>
                <option value="win_rate_pct">{GOAL_METRIC_LABELS.win_rate_pct}</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">
                Target * {metric === 'win_rate_pct' ? '(%)' : ''}
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={metric === 'win_rate_pct' ? 1 : 1}
                max={metric === 'win_rate_pct' ? 100 : undefined}
                step={metric === 'win_rate_pct' ? 1 : 1}
                value={targetValue}
                onChange={e => setTargetValue(e.target.value)}
                className="input-field"
                placeholder={metric === 'win_rate_pct' ? 'e.g. 25' : 'e.g. 10'}
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1">Month *</label>
            <select
              value={monthKey}
              onChange={e => setMonthKey(e.target.value)}
              className="select-field"
            >
              {monthOptions.map(m => (
                <option key={m} value={m}>{formatMonthKey(m)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="input-field min-h-[64px]"
              placeholder="Optional context, stretch criteria, or coaching notes…"
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center">
              <Check size={12} /> {isEdit ? 'Save changes' : 'Create goal'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

