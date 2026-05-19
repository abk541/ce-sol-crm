import { describe, expect, it } from 'vitest'
import {
  buildSamGovOpportunityEndpoint,
  getSamGovPostedRange,
  mapSamGovOpportunityToForm,
  parseSamGovDeadline,
} from '../pages/PipelinePage'

const NOW = new Date('2026-05-18T12:00:00Z')

function params(endpoint: string) {
  return new URL(endpoint).searchParams
}

describe('SAM.gov import API calls', () => {
  it('builds a documented notice ID lookup for SAM.gov opportunity URLs', () => {
    const noticeId = '7f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c'
    const endpoint = buildSamGovOpportunityEndpoint(
      `https://sam.gov/opp/${noticeId}/view`,
      'test key',
      NOW,
    )
    const p = params(endpoint)

    expect(endpoint.startsWith('https://api.sam.gov/opportunities/v2/search?')).toBe(true)
    expect(p.get('noticeid')).toBe(noticeId)
    expect(p.get('solnum')).toBeNull()
    expect(p.get('limit')).toBe('1')
    expect(p.get('offset')).toBe('0')
    expect(p.get('api_key')).toBe('test key')
    expect(p.get('postedFrom')).toBe('05/19/2025')
    expect(p.get('postedTo')).toBe('05/18/2026')
  })

  it('builds a documented solicitation-number lookup from SAM.gov search URLs', () => {
    const endpoint = buildSamGovOpportunityEndpoint(
      'https://sam.gov/search/?q=W912EP-26-R-0001',
      'abc123',
      NOW,
    )
    const p = params(endpoint)

    expect(p.get('solnum')).toBe('W912EP-26-R-0001')
    expect(p.get('noticeid')).toBeNull()
    expect(p.get('postedFrom')).toBe('05/19/2025')
    expect(p.get('postedTo')).toBe('05/18/2026')
    expect(p.get('offset')).toBe('0')
  })

  it('keeps the mandatory posted-date range inside SAM.gov one-year limit', () => {
    expect(getSamGovPostedRange(NOW)).toEqual({
      postedFrom: '05/19/2025',
      postedTo: '05/18/2026',
    })
  })

  it('uses the SAM.gov Eastern business date instead of the browser local date', () => {
    expect(getSamGovPostedRange(new Date('2026-05-19T01:00:00Z'))).toEqual({
      postedFrom: '05/19/2025',
      postedTo: '05/18/2026',
    })
  })

  it('rejects unparseable URLs before making an API call', () => {
    expect(() => buildSamGovOpportunityEndpoint('https://sam.gov/opportunities', 'abc123', NOW))
      .toThrow('Could not parse the SAM.gov URL')
  })

  it('keeps API calls explicit by only exposing endpoint construction', () => {
    const endpoint = buildSamGovOpportunityEndpoint(
      'https://sam.gov/search/?q=W912EP-26-R-0001',
      'abc123',
      NOW,
    )

    expect(endpoint).toContain('/opportunities/v2/search?')
    expect(endpoint).toContain('solnum=W912EP-26-R-0001')
  })

  it('maps SAM.gov agency from subtier and leaves contract type empty', () => {
    const mapped = mapSamGovOpportunityToForm({
      title: 'Roof Anchor Testing',
      solicitationNumber: '36C26326Q0724',
      subtierName: 'Veterans Health Administration',
      departmentName: 'Department of Veterans Affairs',
      naicsCode: '541350',
      typeOfSetAside: 'SBA',
      responseDeadLine: '2026-05-27T10:00:00-05:00',
      placeOfPerformance: { city: { name: 'Iowa City' }, state: { code: 'IA' } },
    }, 'https://sam.gov/opp/example/view')

    expect(mapped.client).toBe('Veterans Health Administration')
    expect(mapped.type).toBeUndefined()
    expect(mapped.dueDate).toBe('2026-05-27')
    expect(mapped.localTime).toBe('10:00')
    expect(mapped.timezone).toBe('EST')
  })

  it('falls back to department when subtier is missing', () => {
    const mapped = mapSamGovOpportunityToForm({
      title: 'Test',
      solicitationNumber: 'ABC-123',
      departmentName: 'Department of Defense',
    }, 'https://sam.gov/opp/example/view')

    expect(mapped.client).toBe('Department of Defense')
  })

  it('preserves posted deadline clock time instead of converting through the browser timezone', () => {
    expect(parseSamGovDeadline('2026-05-27T23:59:00-04:00')).toEqual({
      dueDate: '2026-05-27',
      localTime: '23:59',
      timezone: 'EST',
    })
  })
})
