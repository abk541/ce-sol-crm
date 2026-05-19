import type { Employee, User } from '../types'

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
