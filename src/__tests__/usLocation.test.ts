import { describe, expect, it } from 'vitest'
import { matchesUsLocationFilters, parseUsLocation, US_STATES } from '../lib/usLocation'

describe('US sourcing location filters', () => {
  it('recognizes every state and Washington DC by full name and postal code', () => {
    expect(US_STATES).toHaveLength(51)
    for (const state of US_STATES) {
      expect(matchesUsLocationFilters(`Test City, ${state.code}`, '', state.name)).toBe(true)
      expect(matchesUsLocationFilters(`Test City, ${state.name}`, '', state.code)).toBe(true)
    }
  })

  it('parses comma-separated locations with a ZIP code', () => {
    expect(parseUsLocation('Rockville, Maryland 20850')).toEqual({
      city: 'Rockville',
      state: 'Maryland',
      stateCode: 'MD',
      stateName: 'Maryland',
    })
  })

  it('ignores a trailing United States country label', () => {
    expect(parseUsLocation('Austin, TX, USA')).toEqual({
      city: 'Austin',
      state: 'TX',
      stateCode: 'TX',
      stateName: 'Texas',
    })
    expect(parseUsLocation('Seattle, Washington, United States')).toMatchObject({
      city: 'Seattle',
      stateCode: 'WA',
    })
  })

  it('recognizes punctuated District of Columbia postal notation', () => {
    expect(parseUsLocation('Washington, D.C.')).toEqual({
      city: 'Washington',
      state: 'D.C.',
      stateCode: 'DC',
      stateName: 'District of Columbia',
    })
    expect(matchesUsLocationFilters('Washington, D.C., USA', 'wash', 'DC')).toBe(true)
  })

  it('supports legacy locations without a comma', () => {
    expect(parseUsLocation('New York NY')).toMatchObject({ city: 'New York', stateCode: 'NY' })
  })

  it('filters city and state independently and case-insensitively', () => {
    expect(matchesUsLocationFilters('Kansas City, MO', 'kansas', 'missouri')).toBe(true)
    expect(matchesUsLocationFilters('Kansas City, MO', 'kansas', 'Maryland')).toBe(false)
    expect(matchesUsLocationFilters('Baltimore, MD', 'BALT', 'mar')).toBe(true)
  })

  it('does not match a two-letter code against an unrelated state name', () => {
    expect(matchesUsLocationFilters('Sacramento, California', '', 'IN')).toBe(false)
    expect(matchesUsLocationFilters('Indianapolis, Indiana', '', 'IN')).toBe(true)
  })
})
