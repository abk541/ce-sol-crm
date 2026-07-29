import { describe, expect, it } from 'vitest'
import type { Opportunity } from '../types'
import {
  compareOpportunityDeadlines,
  opportunityMoroccoDeadlineValue,
} from '../lib/pipelineSort'

function opportunity(id: string, overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id,
    solicitation: id,
    solicitationId: id,
    client: 'Agency',
    type: 'OTJ',
    naicsCode: '541611',
    setAside: 'SB',
    priority: 'MEDIUM',
    status: 'ACTIVE',
    dueDate: '2026-07-30',
    localTime: '1:00 PM',
    timezone: 'EDT',
    location: 'Dover, DE',
    pop: '',
    bdm: '',
    bds: '',
    comments: [],
    period: 'JUL 2026',
    capturedOn: '2026-07-01',
    ...overrides,
  }
}

describe('General Pipeline Morocco deadline sorting', () => {
  it('orders opportunities on the same date by their Morocco due time', () => {
    const later = opportunity('later', { moroccoDate: '2026-07-30', moroccoTime: '7:00 PM' })
    const earlier = opportunity('earlier', { moroccoDate: '2026-07-30', moroccoTime: '2:30 PM' })

    expect([later, earlier].sort((a, b) => compareOpportunityDeadlines(a, b)))
      .toEqual([earlier, later])
  })

  it('uses the converted Morocco date when a deadline crosses midnight', () => {
    const sameDay = opportunity('same-day', { moroccoDate: '2026-07-30', moroccoTime: '11:30 PM' })
    const nextDay = opportunity('next-day', { moroccoDate: '2026-07-31', moroccoTime: '12:15 AM' })

    expect(opportunityMoroccoDeadlineValue(sameDay))
      .toBeLessThan(opportunityMoroccoDeadlineValue(nextDay)!)
  })

  it('converts legacy source timezone fields when saved Morocco fields are missing', () => {
    const morning = opportunity('morning', { localTime: '8:00 AM', timezone: 'EDT' })
    const afternoon = opportunity('afternoon', { localTime: '3:00 PM', timezone: 'EDT' })

    expect([afternoon, morning].sort((a, b) => compareOpportunityDeadlines(a, b)))
      .toEqual([morning, afternoon])
  })

  it('keeps untimed and undated opportunities after complete deadlines', () => {
    const complete = opportunity('complete')
    const untimed = opportunity('untimed', { localTime: '', moroccoTime: '' })
    const undated = opportunity('undated', { dueDate: '', localTime: '', moroccoDate: '', moroccoTime: '' })

    expect([undated, untimed, complete].sort((a, b) => compareOpportunityDeadlines(a, b)))
      .toEqual([complete, untimed, undated])
    const descending = [undated, untimed, complete]
      .sort((a, b) => compareOpportunityDeadlines(a, b, 'desc'))
    expect(descending).toEqual([complete, untimed, undated])
  })
})
