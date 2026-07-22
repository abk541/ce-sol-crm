import { describe, expect, it } from 'vitest'
import type { BDSubmission, Employee, Opportunity } from '../types'
import { bdTrackerAssociateOutcomes, parseBDTrackerAmount, sortBDSubmissionsByDueDateTime } from '../lib/bdTracker'

describe('BD Tracker amount input', () => {
  it('clears optional amounts with a blank and clears the required total to zero', () => {
    expect(parseBDTrackerAmount('', false)).toEqual({ valid: true, value: null })
    expect(parseBDTrackerAmount('   ', true)).toEqual({ valid: true, value: 0 })
  })

  it('accepts non-negative amounts and rejects invalid or negative input', () => {
    expect(parseBDTrackerAmount('1250.50')).toEqual({ valid: true, value: 1250.5 })
    expect(parseBDTrackerAmount('-1')).toEqual({ valid: false })
    expect(parseBDTrackerAmount('not-a-number')).toEqual({ valid: false })
  })
})

function opportunity(id: string, overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id,
    solicitation: `Opportunity ${id}`,
    solicitationId: `SOL-${id}`,
    client: 'Agency',
    type: 'OTJ',
    naicsCode: '541611',
    setAside: 'SB',
    priority: 'MEDIUM',
    status: 'SUBMITTED',
    dueDate: '2026-08-01',
    localTime: '17:00',
    timezone: 'GMT+1',
    location: 'Remote',
    pop: '',
    bdm: '',
    bds: '',
    comments: [],
    period: 'AUG 2026',
    capturedOn: '2026-07-01',
    ...overrides,
  }
}

function submission(id: number, overrides: Partial<BDSubmission> = {}): BDSubmission {
  return {
    id,
    submittedOn: '2026-07-20',
    solicitationId: `SOL-${id}`,
    setAside: 'SB',
    type: 'OTJ',
    solicitation: `Submission ${id}`,
    status: 'SUBMITTED',
    dueDate: '2026-08-01',
    localTime: '17:00 GMT+1',
    location: 'Remote',
    bdm: '',
    bds: '',
    value: 100,
    ...overrides,
  }
}

describe('BD Tracker due-date sorting', () => {
  it('sorts by due date and then by the actual timezone-aware due time', () => {
    const pacific = opportunity('pacific', { localTime: '09:00', timezone: 'PST' })
    const eastern = opportunity('eastern', { localTime: '11:00', timezone: 'EST' })
    const laterDate = opportunity('later', { dueDate: '2026-08-02', localTime: '08:00' })
    const rows = [
      submission(3, { opportunityId: laterDate.id, solicitationId: laterDate.solicitationId }),
      submission(1, { opportunityId: pacific.id, solicitationId: pacific.solicitationId }),
      submission(2, { opportunityId: eastern.id, solicitationId: eastern.solicitationId }),
    ]

    expect(sortBDSubmissionsByDueDateTime(rows, [pacific, eastern, laterDate]).map(row => row.opportunityId))
      .toEqual(['eastern', 'pacific', 'later'])
    expect(rows.map(row => row.opportunityId)).toEqual(['later', 'pacific', 'eastern'])
  })

  it('sorts legacy tracker clocks and puts missing time and missing date last', () => {
    const rows = [
      submission(5, { solicitationId: 'SOL-NO-DATE', dueDate: '', localTime: '' }),
      submission(3, { solicitationId: 'SOL-NO-TIME', localTime: '' }),
      submission(2, { solicitationId: 'SOL-LATE', localTime: '10:00 AM EDT' }),
      submission(1, { solicitationId: 'SOL-EARLY', localTime: '9:00 AM EDT' }),
      submission(4, { solicitationId: 'SOL-NEXT-DATE', dueDate: '2026-08-02', localTime: '8:00 AM EDT' }),
    ]

    expect(sortBDSubmissionsByDueDateTime(rows, []).map(row => row.solicitationId)).toEqual([
      'SOL-EARLY',
      'SOL-LATE',
      'SOL-NO-TIME',
      'SOL-NEXT-DATE',
      'SOL-NO-DATE',
    ])
  })

  it('uses stable business tie-breakers when deadlines are equal', () => {
    const rows = [
      submission(20, { solicitationId: 'SOL-B', solicitation: 'Beta' }),
      submission(10, { solicitationId: 'SOL-A', solicitation: 'Alpha' }),
    ]

    expect(sortBDSubmissionsByDueDateTime(rows, []).map(row => row.id)).toEqual([10, 20])
  })
})

describe('BD Tracker associate outcomes', () => {
  it('keeps every associate instead of truncating the dashboard to eight', () => {
    const employees: Employee[] = Array.from({ length: 9 }, (_, index) => ({
      id: `associate-${index + 1}`,
      name: `Associate ${index + 1}`,
      email: `associate-${index + 1}@example.test`,
      role: 'ASSOCIATE',
      managerId: null,
      avatar: `A${index + 1}`,
      team: 'BD',
    }))
    const opportunities = employees.map((employee, index) => opportunity(String(index + 1), {
      assignedTo: employee.id,
    }))
    const rows = opportunities.map((item, index) => submission(index + 1, {
      opportunityId: item.id,
      solicitationId: item.solicitationId,
    }))

    const outcomes = bdTrackerAssociateOutcomes(rows, opportunities, employees)

    expect(outcomes).toHaveLength(9)
    expect(outcomes.map(row => row.name)).toEqual(expect.arrayContaining(employees.map(employee => employee.name)))
  })

  it('counts only submitted, non-submitted, and dropped outcome groups', () => {
    const rows = [
      submission(1, { status: 'SUBMITTED', supportAgent: 'Alex' }),
      submission(2, { status: 'AWARDED', supportAgent: 'Alex' }),
      submission(3, { status: 'NOT_SUBMITTED', supportAgent: 'Alex' }),
      submission(4, { status: 'DROPPED', supportAgent: 'Alex' }),
      submission(5, { status: 'CANCELED', supportAgent: 'Alex' }),
    ]

    expect(bdTrackerAssociateOutcomes(rows, [], [])).toEqual([{
      key: 'name:alex',
      name: 'Alex',
      submitted: 2,
      nonSubmitted: 1,
      dropped: 1,
      total: 4,
    }])
  })
})
