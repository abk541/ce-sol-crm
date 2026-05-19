import { describe, expect, it } from 'vitest'
import { getAssignmentChain, isAssignedToAssociate } from '../lib/team'
import type { Employee } from '../types'

const employees: Employee[] = [
  { id: 'mgr', name: 'Manager', email: 'manager@ces.com', role: 'BD_MANAGER', managerId: null, avatar: 'MG' },
  { id: 'tl', name: 'Team Lead', email: 'lead@ces.com', role: 'TEAM_LEAD', managerId: 'mgr', avatar: 'TL' },
  { id: 'assoc', name: 'Associate', email: 'associate@ces.com', role: 'ASSOCIATE', managerId: 'tl', avatar: 'AS' },
]

describe('assignment hierarchy helpers', () => {
  it('treats only associate assignments as ready for Contract Opportunities', () => {
    expect(isAssignedToAssociate(employees, undefined)).toBe(false)
    expect(isAssignedToAssociate(employees, 'mgr')).toBe(false)
    expect(isAssignedToAssociate(employees, 'tl')).toBe(false)
    expect(isAssignedToAssociate(employees, 'assoc')).toBe(true)
  })

  it('keeps manager and team lead in the assignment chain without marking an associate', () => {
    expect(getAssignmentChain(employees, 'mgr').associate).toBeUndefined()
    expect(getAssignmentChain(employees, 'tl').associate).toBeUndefined()
    expect(getAssignmentChain(employees, 'assoc').associate?.id).toBe('assoc')
  })
})
