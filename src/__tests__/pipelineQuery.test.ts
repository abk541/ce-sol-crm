import { describe, expect, it } from 'vitest'
import {
  matchesPipelineFilterValue,
  pipelineFilterHref,
  readPipelineQueryFilters,
} from '../lib/pipelineQuery'

describe('pipeline dashboard query filters', () => {
  it('reads priority and type filters from dashboard navigation', () => {
    expect(readPipelineQueryFilters(new URLSearchParams('priority=MEDIUM&type=RECURRING'))).toEqual({
      priority: 'MEDIUM',
      type: 'RECURRING',
    })
  })

  it('builds encoded filter links and omits blank filters', () => {
    expect(pipelineFilterHref({ priority: 'VERY_HIGH' })).toBe('/pipeline?priority=VERY_HIGH')
    expect(pipelineFilterHref({ type: 'S&D', priority: ' ' })).toBe('/pipeline?type=S%26D')
    expect(pipelineFilterHref({})).toBe('/pipeline')
  })

  it('matches priority filters exactly after normalizing case and whitespace', () => {
    expect(matchesPipelineFilterValue('HIGH', ' high ', 'exact')).toBe(true)
    expect(matchesPipelineFilterValue('VERY_HIGH', 'HIGH', 'exact')).toBe(false)
  })

  it('retains contains matching for non-priority text filters', () => {
    expect(matchesPipelineFilterValue('RECURRING', 'curr')).toBe(true)
    expect(matchesPipelineFilterValue('Austin Operations', 'OPER')).toBe(true)
  })
})
