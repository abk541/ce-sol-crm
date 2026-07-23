export interface PipelineQueryFilters {
  type: string
  priority: string
  setAside: string
}

export type PipelineFilterMatchMode = 'contains' | 'exact'

type SearchParamsReader = Pick<URLSearchParams, 'get'>

export function readPipelineQueryFilters(searchParams: SearchParamsReader): PipelineQueryFilters {
  return {
    type: searchParams.get('type')?.trim() ?? '',
    priority: searchParams.get('priority')?.trim() ?? '',
    setAside: searchParams.get('setAside')?.trim() ?? '',
  }
}

export function pipelineFilterHref(filters: Partial<PipelineQueryFilters>): string {
  const searchParams = new URLSearchParams()
  const type = filters.type?.trim()
  const priority = filters.priority?.trim()
  const setAside = filters.setAside?.trim()
  if (type) searchParams.set('type', type)
  if (priority) searchParams.set('priority', priority)
  if (setAside) searchParams.set('setAside', setAside)
  const query = searchParams.toString()
  return query ? `/pipeline?${query}` : '/pipeline'
}

export function matchesPipelineFilterValue(
  value: string,
  filter: string,
  mode: PipelineFilterMatchMode = 'contains',
): boolean {
  const normalizedFilter = filter.trim().toLowerCase()
  if (!normalizedFilter) return true

  const normalizedValue = value.trim().toLowerCase()
  return mode === 'exact'
    ? normalizedValue === normalizedFilter
    : normalizedValue.includes(normalizedFilter)
}

export function matchesPipelineSetAside(value: string, filter: string): boolean {
  const normalizedFilter = filter.trim().toLowerCase()
  if (!normalizedFilter) return true
  if (normalizedFilter === 'unspecified') return value.trim().length === 0
  return matchesPipelineFilterValue(value, filter, 'exact')
}
