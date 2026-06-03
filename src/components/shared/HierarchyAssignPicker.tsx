import { useMemo } from 'react'
import { useStore } from '../../store/useStore'
import type { Employee, HierarchyRole } from '../../types'
import { assignmentWorkloadByEmployee } from '../../lib/team'

interface HierarchyAssignPickerProps {
  value?: string           // currently selected employee id
  onChange: (employeeId: string) => void
  deadline?: string        // ISO date string (popEnd/dueDate) for conflict detection
  excludeOpportunityId?: string
  label?: string
  allowedEmployeeIds?: string[]
}

// Role display helpers
const ROLE_LABEL: Record<HierarchyRole, string> = {
  BD_MANAGER: 'Manager',
  TEAM_LEAD:  'Team Lead',
  ASSOCIATE:  'Associate',
}

// Avatar bg color by role
const ROLE_AVATAR_CLS: Record<HierarchyRole, string> = {
  BD_MANAGER: 'bg-[#102820] text-[#D7BE7A] border-[#D7BE7A]/40',
  TEAM_LEAD:  'bg-[#0A1D2B] text-[#7DD3FC] border-[#7DD3FC]/35',
  ASSOCIATE:  'bg-[#082F49] text-[#A5F3FC] border-[#A5F3FC]/35',
}

const COLUMN_DEFS: { role: HierarchyRole; header: string }[] = [
  { role: 'BD_MANAGER', header: 'Managers' },
  { role: 'TEAM_LEAD',  header: 'Team Leads' },
  { role: 'ASSOCIATE',  header: 'Associates' },
]

const EMPTY_WORKLOAD = {
  activeTotal: 0,
  sameDueDay: 0,
}

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
  excludeOpportunityId,
  label,
  allowedEmployeeIds,
}: HierarchyAssignPickerProps) {
  const { employees, contracts, opportunities } = useStore()
  const allowedSet = useMemo(() => allowedEmployeeIds ? new Set(allowedEmployeeIds) : null, [allowedEmployeeIds])
  const visibleSet = useMemo(() => {
    if (!allowedSet) return null
    const ids = new Set<string>()
    const byId = new Map(employees.map(employee => [employee.id, employee]))
    for (const allowedId of allowedSet) {
      let current = byId.get(allowedId)
      while (current) {
        ids.add(current.id)
        current = current.managerId ? byId.get(current.managerId) : undefined
      }
    }
    return ids
  }, [allowedSet, employees])

  const selectionChain = useMemo(
    () => deriveSelectionChain(employees, value),
    [employees, value]
  )

  const workloadByEmp = useMemo(() => {
    return assignmentWorkloadByEmployee({
      employees,
      opportunities,
      contracts,
      selectedDueDay: deadline,
      excludeOpportunityId,
    })
  }, [contracts, employees, opportunities, deadline, excludeOpportunityId])

  // Get the list of employees for each column
  function getColumnItems(colIdx: number): { emp: Employee; enabled: boolean }[] {
    const role = COLUMN_DEFS[colIdx].role
    const allAtTier = employees.filter(e => e.role === role && (!visibleSet || visibleSet.has(e.id)))
    const canPick = (employee: Employee) => !allowedSet || allowedSet.has(employee.id)
    const hasAllowedReport = (employee: Employee): boolean => {
      if (!allowedSet) return true
      const directReports = employees.filter(candidate => candidate.managerId === employee.id)
      return directReports.some(candidate => allowedSet.has(candidate.id) || hasAllowedReport(candidate))
    }

    if (colIdx === 0) {
      // Managers may be navigation-only when assignment is limited to team leads/associates.
      return allAtTier.map(emp => ({ emp, enabled: canPick(emp) || hasAllowedReport(emp) }))
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
      .map(emp => ({ emp, enabled: canPick(emp) || hasAllowedReport(emp) }))
  }

  const selectedEmp = value ? employees.find(e => e.id === value) : undefined

  const handleSelect = (emp: Employee, enabled: boolean) => {
    if (!enabled) return
    onChange(emp.id)
  }

  return (
    <div>
      {label && (
        <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{label}</label>
      )}

      {/* Cascading columns */}
      <div className="grid overflow-hidden rounded-2xl border border-[#D7BE7A]/20 bg-[#06131F]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:grid-cols-3">
        {COLUMN_DEFS.map((col, colIdx) => {
          const items = getColumnItems(colIdx)
          const selIdInCol = selectionChain[colIdx]

          return (
            <div
              key={col.role}
              className="min-w-0 border-b border-[#D7BE7A]/20 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 md:border-[#D7BE7A]/20"
            >
              {/* Column header */}
              <div className="border-b border-[#D7BE7A]/20 bg-[#0A1D2B] px-4 py-3">
                <p className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-[#D7BE7A]">
                  {col.header}
                </p>
              </div>

              {/* Scrollable list */}
              <div className="max-h-[min(34vh,320px)] min-h-[210px] overflow-y-auto">
                {items.length === 0 && (
                  <div className="px-3 py-8 text-center text-[11px] text-slate-500">No options</div>
                )}
                {items.map(({ emp, enabled }) => {
                  const isSelected = selIdInCol === emp.id
                  const workload = workloadByEmp[emp.id] ?? EMPTY_WORKLOAD

                  return (
                    <button
                      key={emp.id}
                      type="button"
                      disabled={!enabled}
                      onClick={() => handleSelect(emp, enabled)}
                      className={[
                        'w-full border-b border-[#D7BE7A]/10 px-4 py-3 text-left transition-all last:border-b-0',
                        enabled ? 'cursor-pointer hover:bg-[#D7BE7A]/10' : 'cursor-default opacity-35',
                        isSelected ? 'border-l-2 border-l-[#D7BE7A] bg-[#D7BE7A]/20 shadow-[inset_0_0_0_1px_rgba(215,190,122,0.10)]' : '',
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
                          <p className={`truncate text-sm font-bold ${isSelected ? 'text-[#F8FBF7]' : 'text-slate-100'}`}>
                            {emp.name}
                          </p>

                          {/* Role label */}
                          <p className="truncate text-[10px] font-medium text-slate-400">{ROLE_LABEL[emp.role]}</p>

                          <div className="mt-2 space-y-0.5 text-[10px] font-semibold leading-4 text-slate-400">
                            <p className="flex items-center justify-between gap-2">
                              <span>Active</span>
                              <span className="font-black text-[#F8FBF7]">{workload.activeTotal}</span>
                            </p>
                            <p className="flex items-center justify-between gap-2">
                              <span>Same day</span>
                              <span className={workload.sameDueDay > 0 ? 'font-black text-amber-200' : 'font-black text-slate-300'}>
                                {workload.sameDueDay}
                              </span>
                            </p>
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
        <div
          className="mt-3 flex items-center gap-3 rounded-2xl border px-4 py-3"
          style={{ background: 'rgba(184,145,78,0.12)', borderColor: 'rgba(215,190,122,0.28)' }}
        >
          <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${ROLE_AVATAR_CLS[selectedEmp.role]}`}>
            {selectedEmp.avatar}
          </div>
          <p className="min-w-0 text-sm font-bold" style={{ color: '#F8FBF7' }}>
            Assigned to: {selectedEmp.name}
            {' - '}{ROLE_LABEL[selectedEmp.role]}
          </p>
        </div>
      )}
    </div>
  )
}
