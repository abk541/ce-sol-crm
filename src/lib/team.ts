import type { BDSubmission, Contract, Employee, EmployeeTeam, NonSubmissionReport, Opportunity, User } from '../types'

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

const ACTIVE_STATUSES_EXCLUDE: Contract['status'][] = ['ARCHIVED', 'TERMINATED']
const ACTIVE_OPPORTUNITY_STATUSES: Opportunity['status'][] = ['ACTIVE', 'NEW_ASSIGNMENT', 'DISCUSSION']

const EMPTY_ASSIGNMENT_WORKLOAD: AssignmentWorkload = {
  activeTotal: 0,
  sameDueDay: 0,
}

function emptyAssignmentWorkload(): AssignmentWorkload {
  return { ...EMPTY_ASSIGNMENT_WORKLOAD }
}

function normalizeDate(date?: string) {
  return date ? date.slice(0, 10) : ''
}

function normalizeName(name?: string) {
  return (name ?? '').trim().toLowerCase()
}

function employeeMatchesReference(employee: Employee, reference?: string): boolean {
  const normalized = normalizeName(reference)
  if (!normalized) return false
  return [
    employee.id,
    employee.name,
    employee.email,
    employee.email.split('@')[0],
  ].some(value => normalizeName(value) === normalized)
}

function findEmployeeIdByName(employees: Employee[], name?: string): string | undefined {
  const normalized = normalizeName(name)
  if (!normalized) return undefined
  return employees.find(employee => normalizeName(employee.name) === normalized)?.id
}

function contractWorkloadAssignee(contract: Contract, employees: Employee[]): string | undefined {
  if (contract.assignedTo && employees.some(employee => employee.id === contract.assignedTo)) {
    return contract.assignedTo
  }

  return findEmployeeIdByName(employees, contract.supportAgent)
    ?? findEmployeeIdByName(employees, contract.pm)
    ?? findEmployeeIdByName(employees, contract.spm)
    ?? findEmployeeIdByName(employees, contract.bds)
    ?? findEmployeeIdByName(employees, contract.bdm)
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
  const exact = employees.find(employee => employee.id === user.id)
  if (exact) return exact
  const email = user.email?.toLowerCase()
  return employees.find(employee =>
    employee.email.toLowerCase() === email ||
    employee.name.toLowerCase() === user.name.toLowerCase(),
  )
}

/**
 * Resolve an account from one exact identity value without ever guessing.
 * New records use the immutable profile id; the remaining selectors keep
 * migrated rows readable. Ambiguous legacy values fail closed.
 */
export function findUserByExactIdentity(
  users: readonly User[],
  identityValue: string,
): User | undefined {
  const identity = identityValue.trim().toLowerCase()
  if (!identity) return undefined

  const selectors: Array<(user: User) => string | undefined> = [
    user => user.id,
    user => user.authUserId,
    user => user.username,
    user => user.email,
    user => user.name,
  ]
  for (const selector of selectors) {
    const matches = users.filter(user => selector(user)?.trim().toLowerCase() === identity)
    if (matches.length > 1) return undefined
    if (matches.length === 1) return matches[0]
  }

  return undefined
}

// Inverse of findEmployeeForUser: given an employee, find their login User
// account (matched by email, falling back to name). Employee ids and User ids
// are distinct, so notifications targeted at a specific person must use the
// User id resolved here — not the employee id.
export function findUserForEmployee(users: User[], employee?: Employee | null): User | undefined {
  if (!employee) return undefined
  const exact = users.find(user => user.id === employee.id)
  if (exact) return exact

  const email = employee.email?.toLowerCase()
  return users.find(user =>
    user.email?.toLowerCase() === email ||
    user.name.toLowerCase() === employee.name.toLowerCase(),
  )
}

/**
 * Resolve the current employee roster from active accounts without using a
 * name-only fallback. Migrated databases can contain old employee rows with
 * the same display name, so a name match would incorrectly reactivate them.
 * An exact shared id wins; email is used only when it identifies one employee.
 */
export function activeEmployeeIdsForUsers(employees: Employee[], users: User[]): Set<string> {
  const employeeById = new Map(employees.map(employee => [employee.id, employee]))
  const employeesByEmail = new Map<string, Employee[]>()
  for (const employee of employees) {
    const email = normalizeName(employee.email)
    if (!email) continue
    employeesByEmail.set(email, [...(employeesByEmail.get(email) ?? []), employee])
  }

  const activeIds = new Set<string>()
  for (const user of users) {
    if (user.status !== 'active') continue
    if (employeeById.has(user.id)) {
      activeIds.add(user.id)
      continue
    }
    const emailMatches = employeesByEmail.get(normalizeName(user.email)) ?? []
    if (emailMatches.length === 1) activeIds.add(emailMatches[0]!.id)
  }
  return activeIds
}

// True for users on the OPS team below manager (i.e. Ops Team Lead / Ops Associate).
// These users get the trimmed ops-only navigation and are bounced from the BD dashboard.
export function isOpsAgent(user?: User | null): boolean {
  if (!user) return false
  if (user.team !== 'OPS') return false
  return user.role === 'TEAM_LEAD' || user.role === 'ASSOCIATE'
}

export function assignableEmployeesForUser(employees: Employee[], user?: User | null, team?: EmployeeTeam): Employee[] {
  if (!user) return []
  const pool = team ? employees.filter(employee => (employee.team ?? 'BD') === team) : employees
  if (user.role === 'CAPTURE_MANAGER') return pool
  if (user.role === 'ASSOCIATE') return []

  const currentEmployee = findEmployeeForUser(pool, user)
  if (!currentEmployee) {
    if (!team && user.role === 'BD_MANAGER') return pool.filter(employee => employee.role !== 'BD_MANAGER')
    if (!team && user.role === 'OPS_MANAGER') return pool.filter(employee => (employee.team ?? 'BD') === 'OPS' && employee.role !== 'BD_MANAGER')
    if (!team && user.role === 'TEAM_LEAD') return pool.filter(employee => employee.role === 'ASSOCIATE')
    return []
  }

  if (currentEmployee.role === 'BD_MANAGER') {
    const teamLeads = pool.filter(employee => employee.managerId === currentEmployee.id && employee.role === 'TEAM_LEAD')
    const teamLeadIds = new Set(teamLeads.map(employee => employee.id))
    const associates = pool.filter(employee => employee.role === 'ASSOCIATE' && employee.managerId && teamLeadIds.has(employee.managerId))
    return [...teamLeads, ...associates]
  }

  if (currentEmployee.role === 'TEAM_LEAD') {
    return pool.filter(employee => employee.managerId === currentEmployee.id && employee.role === 'ASSOCIATE')
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

// True when the opportunity's bottom-of-chain assignee is the user themselves
// or someone the user supervises directly/transitively. Capture/BD Managers
// always pass; Ops Manager too (they may need to act on cross-team items).
// Associates only pass when assignedTo === their own employee id.
export function isOpportunityOwnedByUser(
  employees: Employee[],
  user: User | null | undefined,
  assignedTo: string | undefined,
): boolean {
  if (!user) return false
  if (user.role === 'CAPTURE_MANAGER') return true
  if (user.role === 'BD_MANAGER')      return true
  if (user.role === 'OPS_MANAGER')     return true
  if (!assignedTo) return false

  const me = findEmployeeForUser(employees, user)
  if (!me) return false
  if (me.id === assignedTo) return true

  // Team Lead → owns every employee in their downline.
  if (me.role === 'TEAM_LEAD' || me.role === 'BD_MANAGER') {
    const downline = teamMemberIdsForWorkload(employees, me.id)
    return downline.includes(assignedTo)
  }

  return false
}

/**
 * Ownership normally follows `assignedTo`. Migrated opportunities can still
 * carry the associate/team chain only in the legacy name fields, so sourcing
 * actions also recognize that saved responsibility without granting access to
 * unrelated associates.
 */
export function isOpportunityAssociatedToUser(
  employees: Employee[],
  user: User | null | undefined,
  opportunity: Pick<Opportunity, 'assignedTo' | 'bdm' | 'bds' | 'supportAgent'>,
): boolean {
  if (isOpportunityOwnedByUser(employees, user, opportunity.assignedTo)) return true
  if (!user) return false

  const me = findEmployeeForUser(employees, user)
  if (!me) return false

  if (me.role === 'ASSOCIATE') {
    return employeeMatchesReference(me, opportunity.supportAgent)
  }

  if (me.role === 'TEAM_LEAD') {
    if (employeeMatchesReference(me, opportunity.bds)) return true
    const legacyAssociate = employees.find(employee =>
      employee.role === 'ASSOCIATE'
      && employeeMatchesReference(employee, opportunity.supportAgent))
    return Boolean(
      legacyAssociate
      && teamMemberIdsForWorkload(employees, me.id).includes(legacyAssociate.id),
    )
  }

  return employeeMatchesReference(me, opportunity.bdm)
}

// True when a contract "belongs" to the user: it is assigned to their employee
// record (directly via assignedTo, or via their name in the spm/pm/bds/bdm/
// supportAgent fields), or someone they supervise is the assignee. Capture/BD/
// Ops Managers always pass since they oversee all contracts. Used to scope
// contract-related notifications so each user only sees actions on contracts
// associated with them, mirroring isOpportunityOwnedByUser.
export function isContractAssociatedToUser(
  employees: Employee[],
  user: User | null | undefined,
  contract: Contract,
): boolean {
  if (!user) return false
  if (user.role === 'CAPTURE_MANAGER') return true
  if (user.role === 'BD_MANAGER')      return true
  if (user.role === 'OPS_MANAGER')     return true

  const me = findEmployeeForUser(employees, user)
  if (!me) return false

  const assigneeId = contractWorkloadAssignee(contract, employees)
  if (!assigneeId) return false
  if (assigneeId === me.id) return true

  // Team Lead / BD Manager → owns every employee in their downline.
  if (me.role === 'TEAM_LEAD' || me.role === 'BD_MANAGER') {
    return teamMemberIdsForWorkload(employees, me.id).includes(assigneeId)
  }

  return false
}

// True when the opportunity "belongs" to the user for personal-dashboard
// purposes: it is assigned to their employee record, or their name/username
// appears in the BD/BDM/support-agent fields. Mirrors the AgentDashboard
// "my opportunities" scope so a dashboard drill-down shows exactly the same set.
export function isOpportunityAssignedToUser(
  employees: Employee[],
  user: User | null | undefined,
  opp: Pick<Opportunity, 'assignedTo' | 'bds' | 'bdm' | 'supportAgent'>,
): boolean {
  if (!user) return false
  const me = findEmployeeForUser(employees, user)
  if (opp.assignedTo && opp.assignedTo === me?.id) return true
  const haystack = `${opp.bds ?? ''} ${opp.bdm ?? ''} ${opp.supportAgent ?? ''}`.toLowerCase()
  const username = (user.username ?? '').toLowerCase()
  const name = (user.name ?? '').toLowerCase()
  if (username && haystack.includes(username)) return true
  if (name && haystack.includes(name)) return true
  return false
}

function normalizedSolicitationId(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

export function findBDSubmissionOpportunity(
  submission: Pick<BDSubmission, 'opportunityId' | 'solicitationId' | 'solicitation'>,
  opportunities: Opportunity[],
): Opportunity | undefined {
  if (submission.opportunityId) {
    return opportunities.find(opportunity => opportunity.id === submission.opportunityId)
  }
  const solicitationId = normalizedSolicitationId(submission.solicitationId)
  if (!solicitationId) return undefined
  const matches = opportunities.filter(opportunity =>
    normalizedSolicitationId(opportunity.solicitationId) === solicitationId)
  return matches.length === 1 ? matches[0] : undefined
}

export function findBDSubmissionForOpportunity(
  submissions: BDSubmission[],
  opportunity: Pick<Opportunity, 'id' | 'solicitationId'>,
  opportunities: Array<Pick<Opportunity, 'id' | 'solicitationId'>>,
): BDSubmission | undefined {
  const linked = submissions.filter(submission => submission.opportunityId === opportunity.id)
  if (linked.length !== 0) return linked.length === 1 ? linked[0] : undefined
  const solicitationId = normalizedSolicitationId(opportunity.solicitationId)
  if (!solicitationId) return undefined
  const opportunityMatches = opportunities.filter(candidate =>
    normalizedSolicitationId(candidate.solicitationId) === solicitationId)
  if (opportunityMatches.length !== 1 || opportunityMatches[0]?.id !== opportunity.id) return undefined
  const legacy = submissions.filter(submission =>
    !submission.opportunityId
    && normalizedSolicitationId(submission.solicitationId) === solicitationId)
  return legacy.length === 1 ? legacy[0] : undefined
}

/**
 * Resolves a tracker row to the employee who owns it. Current rows use the
 * linked opportunity assignment; legacy/canceled rows fall back to the names
 * saved on the tracker row because the original opportunity may no longer
 * exist.
 */
export function isBDSubmissionAttributedToEmployee(
  employees: Employee[],
  employee: Employee,
  submission: BDSubmission,
  opportunities: Opportunity[],
): boolean {
  const linkedOpportunity = findBDSubmissionOpportunity(submission, opportunities)
  const chain = getAssignmentChain(employees, linkedOpportunity?.assignedTo)
  if (
    chain.manager?.id === employee.id ||
    chain.teamLead?.id === employee.id ||
    chain.associate?.id === employee.id
  ) return true

  return [submission.bdm, submission.bds, submission.supportAgent]
    .some(reference => employeeMatchesReference(employee, reference))
}

/**
 * Returns the hierarchy shown for a tracker row. Linked opportunities remain
 * authoritative; legacy rows fall back to the role-specific name snapshots
 * stored in bd_submissions.
 */
export function getBDSubmissionAssignmentChain(
  employees: Employee[],
  submission: BDSubmission,
  opportunities: Opportunity[],
): AssignmentChain {
  const linkedOpportunity = findBDSubmissionOpportunity(submission, opportunities)
  const linkedChain = getAssignmentChain(employees, linkedOpportunity?.assignedTo)
  if (linkedChain.assigned) return linkedChain

  const associate = employees.find(employee =>
    employee.role === 'ASSOCIATE' && employeeMatchesReference(employee, submission.supportAgent))
  const teamLead = employees.find(employee =>
    employee.role === 'TEAM_LEAD' && employeeMatchesReference(employee, submission.bds))
  const manager = employees.find(employee =>
    employee.role === 'BD_MANAGER' && employeeMatchesReference(employee, submission.bdm))
  const fallbackAssigned = associate ?? teamLead ?? manager
  const fallbackChain = getAssignmentChain(employees, fallbackAssigned?.id)

  return {
    assigned: fallbackChain.assigned ?? fallbackAssigned,
    associate: fallbackChain.associate ?? associate,
    teamLead: fallbackChain.teamLead ?? teamLead,
    manager: fallbackChain.manager ?? manager,
  }
}

/** Scopes BD Tracker rows and their notifications to the responsible user. */
export function isBDSubmissionAssociatedToUser(
  employees: Employee[],
  user: User | null | undefined,
  submission: BDSubmission,
  opportunities: Opportunity[],
): boolean {
  if (!user) return false
  if (['CAPTURE_MANAGER', 'BD_MANAGER', 'OPS_MANAGER'].includes(user.role)) return true

  const linkedOpportunity = findBDSubmissionOpportunity(submission, opportunities)
  if (linkedOpportunity?.assignedTo) {
    return isOpportunityOwnedByUser(employees, user, linkedOpportunity.assignedTo)
  }

  return employees.some(employee =>
    [submission.bdm, submission.bds, submission.supportAgent]
      .some(reference => employeeMatchesReference(employee, reference)) &&
    isOpportunityOwnedByUser(employees, user, employee.id))
}

/** Attribute an approved non-submission to the same hierarchy as its source opportunity. */
export function isNonSubmissionAttributedToEmployee(
  employees: Employee[],
  employee: Employee,
  report: Pick<NonSubmissionReport, 'opportunityId' | 'agentUsername'>,
  opportunities: Opportunity[],
): boolean {
  const opportunity = opportunities.find(candidate => candidate.id === report.opportunityId)
  const chain = getAssignmentChain(employees, opportunity?.assignedTo)
  if (
    chain.manager?.id === employee.id ||
    chain.teamLead?.id === employee.id ||
    chain.associate?.id === employee.id
  ) return true

  return employeeMatchesReference(employee, report.agentUsername)
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
    const entry = directWorkload[employeeId] ?? emptyAssignmentWorkload()
    entry.activeTotal += 1
    if (normalizedSelectedDueDay && normalizeDate(dueDay) === normalizedSelectedDueDay) {
      entry.sameDueDay += 1
    }
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
    if (ACTIVE_STATUSES_EXCLUDE.includes(contract.status)) continue
    addDirect(contractWorkloadAssignee(contract, employees), contract.popEnd)
  }

  return employees.reduce<Record<string, AssignmentWorkload>>((map, employee) => {
    const responsibleIds = teamMemberIdsForWorkload(employees, employee.id)
    map[employee.id] = responsibleIds.reduce<AssignmentWorkload>((total, id) => {
      const workload = directWorkload[id] ?? EMPTY_ASSIGNMENT_WORKLOAD
      return {
        activeTotal: total.activeTotal + workload.activeTotal,
        sameDueDay: total.sameDueDay + workload.sameDueDay,
      }
    }, emptyAssignmentWorkload())
    return map
  }, {})
}
