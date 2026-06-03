import type { Contract, Employee, Opportunity, User } from '../types'

export const ROLE_DISPLAY_LABELS: Record<string, string> = {
  BD_MANAGER: 'Manager',
  TEAM_LEAD: 'Team Lead',
  ASSOCIATE: 'Associate',
}

export interface AssignmentChain {
  associate?: Employee
  teamLead?: Employee
  manager?: Employee
  assigned?: Employee
}

export interface AssignmentWorkload {
  activeTotal: number
  sameDueDay: number
}

const ACTIVE_STATUSES_EXCLUDE: Contract['status'][] = ['ARCHIVED', 'TERMINATED', 'CANCELED']
const ACTIVE_OPPORTUNITY_STATUSES: Opportunity['status'][] = ['ACTIVE', 'NEW_ASSIGNMENT', 'DISCUSSION']

function normalizeDate(date?: string) {
  return date ? date.slice(0, 10) : ''
}

export function getAssignmentChain(employees: Employee[], assignedTo?: string): AssignmentChain {
  const byId = new Map(employees.map(employee => [employee.id, employee]))
  const assigned = assignedTo ? byId.get(assignedTo) : undefined
  if (!assigned) return {}

  if (assigned.role === 'ASSOCIATE') {
    const teamLead = assigned.managerId ? byId.get(assigned.managerId) : undefined
    const manager = teamLead?.managerId ? byId.get(teamLead.managerId) : undefined
    return {
      assigned,
      associate: assigned,
      teamLead: teamLead?.role === 'TEAM_LEAD' ? teamLead : undefined,
      manager: manager?.role === 'BD_MANAGER' ? manager : undefined,
    }
  }

  if (assigned.role === 'TEAM_LEAD') {
    const manager = assigned.managerId ? byId.get(assigned.managerId) : undefined
    return {
      assigned,
      teamLead: assigned,
      manager: manager?.role === 'BD_MANAGER' ? manager : undefined,
    }
  }

  return {
    assigned,
    manager: assigned.role === 'BD_MANAGER' ? assigned : undefined,
  }
}

export function isAssignedToAssociate(employees: Employee[], assignedTo?: string): boolean {
  return !!getAssignmentChain(employees, assignedTo).associate
}

export function employeeName(employees: Employee[], employeeId?: string): string {
  return employeeId ? employees.find(employee => employee.id === employeeId)?.name ?? '' : ''
}

export function findEmployeeForUser(employees: Employee[], user?: User | null): Employee | undefined {
  if (!user) return undefined
  const email = user.email?.toLowerCase()
  return employees.find(employee =>
    employee.email.toLowerCase() === email ||
    employee.name.toLowerCase() === user.name.toLowerCase(),
  )
}

export function assignableEmployeesForUser(employees: Employee[], user?: User | null): Employee[] {
  if (!user) return []
  if (user.role === 'CAPTURE_MANAGER') return employees
  if (user.role === 'ASSOCIATE') return []

  const currentEmployee = findEmployeeForUser(employees, user)
  if (!currentEmployee) {
    if (user.role === 'BD_MANAGER') return employees.filter(employee => employee.role !== 'BD_MANAGER')
    if (user.role === 'TEAM_LEAD') return employees.filter(employee => employee.role === 'ASSOCIATE')
    return []
  }

  if (currentEmployee.role === 'BD_MANAGER') {
    const teamLeads = employees.filter(employee => employee.managerId === currentEmployee.id && employee.role === 'TEAM_LEAD')
    const teamLeadIds = new Set(teamLeads.map(employee => employee.id))
    const associates = employees.filter(employee => employee.role === 'ASSOCIATE' && employee.managerId && teamLeadIds.has(employee.managerId))
    return [...teamLeads, ...associates]
  }

  if (currentEmployee.role === 'TEAM_LEAD') {
    return employees.filter(employee => employee.managerId === currentEmployee.id && employee.role === 'ASSOCIATE')
  }

  return []
}

export function teamMemberIdsForWorkload(employees: Employee[], employeeId: string): string[] {
  const target = employees.find(employee => employee.id === employeeId)
  if (!target || target.role === 'ASSOCIATE') return target ? [target.id] : []

  const ids = new Set<string>([target.id])
  const stack = [target.id]

  while (stack.length > 0) {
    const managerId = stack.pop()
    employees
      .filter(employee => employee.managerId === managerId)
      .forEach(report => {
        if (!ids.has(report.id)) {
          ids.add(report.id)
          stack.push(report.id)
        }
      })
  }

  return Array.from(ids)
}

export function assignmentWorkloadByEmployee({
  employees,
  opportunities,
  contracts,
  selectedDueDay,
  excludeOpportunityId,
}: {
  employees: Employee[]
  opportunities: Opportunity[]
  contracts: Contract[]
  selectedDueDay?: string
  excludeOpportunityId?: string
}): Record<string, AssignmentWorkload> {
  const directWorkload: Record<string, AssignmentWorkload> = {}
  const normalizedSelectedDueDay = normalizeDate(selectedDueDay)

  const addDirect = (employeeId: string | undefined, dueDay?: string) => {
    if (!employeeId) return
    const entry = directWorkload[employeeId] ?? { activeTotal: 0, sameDueDay: 0 }
    entry.activeTotal += 1
    if (normalizedSelectedDueDay && normalizeDate(dueDay) === normalizedSelectedDueDay) entry.sameDueDay += 1
    directWorkload[employeeId] = entry
  }

  for (const opportunity of opportunities) {
    if (!opportunity.assignedTo) continue
    if (opportunity.id === excludeOpportunityId) continue
    if (opportunity.isDeleted || opportunity.nonSubmissionReportId) continue
    if (!ACTIVE_OPPORTUNITY_STATUSES.includes(opportunity.status)) continue
    addDirect(opportunity.assignedTo, opportunity.dueDate)
  }

  for (const contract of contracts) {
    if (!contract.assignedTo) continue
    if (ACTIVE_STATUSES_EXCLUDE.includes(contract.status)) continue
    addDirect(contract.assignedTo, contract.popEnd)
  }

  return employees.reduce<Record<string, AssignmentWorkload>>((map, employee) => {
    const responsibleIds = teamMemberIdsForWorkload(employees, employee.id)
    map[employee.id] = responsibleIds.reduce<AssignmentWorkload>((total, id) => {
      const workload = directWorkload[id] ?? { activeTotal: 0, sameDueDay: 0 }
      return {
        activeTotal: total.activeTotal + workload.activeTotal,
        sameDueDay: total.sameDueDay + workload.sameDueDay,
      }
    }, { activeTotal: 0, sameDueDay: 0 })
    return map
  }, {})
}
