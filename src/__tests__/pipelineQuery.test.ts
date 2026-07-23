import { describe, expect, it } from 'vitest'
import {
  matchesPipelineFilterValue,
  matchesPipelineSetAside,
  pipelineFilterHref,
  readPipelineQueryFilters,
} from '../lib/pipelineQuery'

describe('pipeline dashboard query filters', () => {
  it('reads priority and type filters from dashboard navigation', () => {
    expect(readPipelineQueryFilters(new URLSearchParams('priority=MEDIUM&type=RECURRING&setAside=8%28a%29'))).toEqual({
      priority: 'MEDIUM',
      type: 'RECURRING',
      setAside: '8(a)',
    })
  })

  it('builds encoded filter links and omits blank filters', () => {
    expect(pipelineFilterHref({ priority: 'VERY_HIGH' })).toBe('/pipeline?priority=VERY_HIGH')
    expect(pipelineFilterHref({ type: 'S&D', priority: ' ' })).toBe('/pipeline?type=S%26D')
    expect(pipelineFilterHref({ setAside: '8(a)' })).toBe('/pipeline?setAside=8%28a%29')
    expect(pipelineFilterHref({ type: 'OTJ', priority: 'HIGH', setAside: 'SDVOSB' }))
      .toBe('/pipeline?type=OTJ&priority=HIGH&setAside=SDVOSB')
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

  it('supports exact normalized matching for set-aside drilldowns', () => {
    expect(matchesPipelineFilterValue('  8(a)  ', '8(A)', 'exact')).toBe(true)
    expect(matchesPipelineFilterValue('SDVOSB', 'VOSB', 'exact')).toBe(false)
  })

  it('maps the Unspecified dashboard slice to blank set-aside records', () => {
    expect(matchesPipelineSetAside('', 'Unspecified')).toBe(true)
    expect(matchesPipelineSetAside('   ', ' unspecified ')).toBe(true)
    expect(matchesPipelineSetAside('SB', 'Unspecified')).toBe(false)
    expect(matchesPipelineSetAside('8(a)', '8(A)')).toBe(true)
  })
})
