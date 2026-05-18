import { useMemo } from 'react'
import { useStore } from '../../store/useStore'
import type { Employee, HierarchyRole } from '../../types'

interface HierarchyAssignPickerProps {
  value?: string           // currently selected employee id
  onChange: (employeeId: string) => void
  deadline?: string        // ISO date string (popEnd/dueDate) for conflict detection
  label?: string
}

// Role display helpers
const ROLE_LABEL: Record<HierarchyRole, string> = {
  BD_MANAGER: 'BD Manager',
  TEAM_LEAD:  'Team Lead',
  ASSOCIATE:  'Associate',
}

// Avatar bg color by role
const ROLE_AVATAR_CLS: Record<HierarchyRole, string> = {
  BD_MANAGER: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  TEAM_LEAD:  'bg-blue-100 text-blue-700 border-blue-200',
  ASSOCIATE:  'bg-cyan-100 text-cyan-700 border-cyan-200',
}

const ACTIVE_STATUSES_EXCLUDE = ['ARCHIVED', 'TERMINATED', 'CANCELED']

const COLUMN_DEFS: { role: HierarchyRole; header: string }[] = [
  { role: 'BD_MANAGER', header: 'BD Managers' },
  { role: 'TEAM_LEAD',  header: 'Team Leads' },
  { role: 'ASSOCIATE',  header: 'Associates' },
]

// Given a selected employee id, derive the chain of selected ids at each tier
function deriveSelectionChain(
  employees: Employee[],
  selectedId: string | undefined
): (string | undefined)[] {
  // Returns [bdManagerId, teamLeadId, associateId]
  // where each entry is the selected employee at that tier, or undefined
  const chain: (string | undefined)[] = [undefined, undefined, undefined]
  if (!selectedId) return chain

  const emp = employees.find(e => e.id === selectedId)
  if (!emp) return chain

  const roleOrder: HierarchyRole[] = ['BD_MANAGER', 'TEAM_LEAD', 'ASSOCIATE']
  const tierIdx = roleOrder.indexOf(emp.role)
  chain[tierIdx] = emp.id

  // Walk up the hierarchy to fill parent selections
  let current: Employee | undefined = emp
  while (current && current.managerId) {
    const parent = employees.find(e => e.id === current!.managerId)
    if (!parent) break
    const parentTier = roleOrder.indexOf(parent.role)
    chain[parentTier] = parent.id
    current = parent
  }

  return chain
}

export default function HierarchyAssignPicker({
  value,
  onChange,
  deadline,
  label,
}: HierarchyAssignPickerProps) {
  const { employees, contracts } = useStore()

  const selectionChain = useMemo(
    () => deriveSelectionChain(employees, value),
    [employees, value]
  )

  // Count active contracts per employee
  const activeContractsByEmp = useMemo(() => {
    const map: Record<string, number> = {}
    for (const c of contracts) {
      if (!c.assignedTo) continue
      if (ACTIVE_STATUSES_EXCLUDE.includes(c.status)) continue
      map[c.assignedTo] = (map[c.assignedTo] ?? 0) + 1
    }
    return map
  }, [contracts])

  // Detect conflict: contracts for employee whose popEnd === deadline
  const conflictsByEmp = useMemo(() => {
    if (!deadline) return {} as Record<string, number>
    const map: Record<string, number> = {}
    for (const c of contracts) {
      if (!c.assignedTo) continue
      if (ACTIVE_STATUSES_EXCLUDE.includes(c.status)) continue
      if (c.popEnd === deadline) {
        map[c.assignedTo] = (map[c.assignedTo] ?? 0) + 1
      }
    }
    return map
  }, [contracts, deadline])

  // Get the list of employees for each column
  function getColumnItems(colIdx: number): { emp: Employee; enabled: boolean }[] {
    const role = COLUMN_DEFS[colIdx].role
    const allAtTier = employees.filter(e => e.role === role)

    if (colIdx === 0) {
      // Managers: always show all, always enabled
      return allAtTier.map(emp => ({ emp, enabled: true }))
    }

    // For subsequent columns, filter by parent selection
    const parentSelId = selectionChain[colIdx - 1]
    if (!parentSelId) {
      // No parent selected: show all but disabled (grayed out)
      return allAtTier.map(emp => ({ emp, enabled: false }))
    }

    // Only show direct reports of the selected parent
    return allAtTier
      .filter(emp => emp.managerId === parentSelId)
      .map(emp => ({ emp, enabled: true }))
  }

  const selectedEmp = value ? employees.find(e => e.id === value) : undefined

  const handleSelect = (emp: Employee, enabled: boolean) => {
    if (!enabled) return
    onChange(emp.id)
  }

  return (
    <div>
      {label && (
        <label className="block text-xs font-semibold text-slate-500 mb-2">{label}</label>
      )}

      {/* Cascading columns */}
      <div className="flex gap-0 border border-slate-200 rounded-xl overflow-hidden bg-white">
        {COLUMN_DEFS.map((col, colIdx) => {
          const items = getColumnItems(colIdx)
          const selIdInCol = selectionChain[colIdx]

          return (
            <div
              key={col.role}
              className="flex-1 min-w-0 border-r border-slate-200 last:border-r-0 flex flex-col"
            >
              {/* Column header */}
              <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex-shrink-0">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">
                  {col.header}
                </p>
              </div>

              {/* Scrollable list */}
              <div className="flex-1 overflow-y-auto max-h-52">
                {items.length === 0 && (
                  <div className="px-3 py-4 text-[11px] text-slate-400 text-center">—</div>
                )}
                {items.map(({ emp, enabled }) => {
                  const isSelected = selIdInCol === emp.id
                  const activeCount = activeContractsByEmp[emp.id] ?? 0
                  const conflictCount = conflictsByEmp[emp.id] ?? 0

                  return (
                    <button
                      key={emp.id}
                      type="button"
                      disabled={!enabled}
                      onClick={() => handleSelect(emp, enabled)}
                      className={[
                        'w-full text-left px-3 py-2.5 border-b border-slate-100 last:border-b-0 transition-colors',
                        enabled ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default opacity-40',
                        isSelected ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : '',
                      ].join(' ')}
                    >
                      <div className="flex items-start gap-2">
                        {/* Avatar */}
                        <div
                          className={`flex-shrink-0 w-7 h-7 rounded-full border flex items-center justify-center text-[10px] font-bold ${ROLE_AVATAR_CLS[emp.role]}`}
                        >
                          {emp.avatar}
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Name */}
                          <p className={`text-xs font-semibold truncate ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>
                            {emp.name}
                          </p>

                          {/* Role label */}
                          <p className="text-[10px] text-slate-400 truncate">{ROLE_LABEL[emp.role]}</p>

                          {/* Badges row */}
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {/* Active contracts badge */}
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${activeCount > 0 ? 'text-slate-600 bg-slate-100 border-slate-200' : 'text-slate-400 bg-slate-50 border-slate-100'}`}>
                              {activeCount} active
                            </span>

                            {/* Conflict badge */}
                            {conflictCount > 0 && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
                                ⚠ {conflictCount} end same day
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary bar */}
      {selectedEmp && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center gap-2">
          <div className={`w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${ROLE_AVATAR_CLS[selectedEmp.role]}`}>
            {selectedEmp.avatar}
          </div>
          <p className="text-xs text-indigo-700 font-semibold">
            Assigned to: {selectedEmp.name}
            <span className="font-normal text-indigo-500 ml-1">· {ROLE_LABEL[selectedEmp.role]}</span>
          </p>
        </div>
      )}
    </div>
  )
}
