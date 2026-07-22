export const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
] as const

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
}

function withoutZip(value: string) {
  return value.replace(/\s+\d{5}(?:-\d{4})?\s*$/, '').trim()
}

function findState(value: string) {
  const query = normalize(withoutZip(value))
  if (!query) return undefined
  const compactQuery = query.replace(/\s+/g, '')
  return US_STATES.find(state =>
    normalize(state.code) === compactQuery || normalize(state.name) === query)
}

function isUnitedStatesCountry(value: string) {
  const query = normalize(value)
  const compactQuery = query.replace(/\s+/g, '')
  return compactQuery === 'us' || compactQuery === 'usa' ||
    query === 'united states' || query === 'united states of america'
}

export interface ParsedUsLocation {
  city: string
  state: string
  stateCode?: string
  stateName?: string
}

/**
 * Reads the location formats already stored by the app, including
 * "City, ST", "City, State 12345", and the legacy "City ST" form.
 */
export function parseUsLocation(value: string | null | undefined): ParsedUsLocation {
  const location = (value ?? '').trim()
  if (!location) return { city: '', state: '' }

  const commaParts = location.split(',').map(part => part.trim()).filter(Boolean)
  while (commaParts.length > 1 && isUnitedStatesCountry(commaParts[commaParts.length - 1] ?? '')) {
    commaParts.pop()
  }
  if (commaParts.length >= 2) {
    const statePart = withoutZip(commaParts[commaParts.length - 1] ?? '')
    const state = findState(statePart)
    return {
      city: commaParts.slice(0, -1).join(', '),
      state: statePart,
      stateCode: state?.code,
      stateName: state?.name,
    }
  }

  const domesticLocation = commaParts.length === 1 ? commaParts[0] : location
  const normalizedLocation = normalize(withoutZip(domesticLocation))
  const state = [...US_STATES]
    .sort((a, b) => b.name.length - a.name.length)
    .find(candidate => {
      const name = normalize(candidate.name)
      const code = normalize(candidate.code)
      return normalizedLocation === name || normalizedLocation.endsWith(` ${name}`) ||
        normalizedLocation === code || normalizedLocation.endsWith(` ${code}`)
    })

  if (!state) return { city: location, state: '' }

  const stateToken = normalizedLocation.endsWith(` ${normalize(state.name)}`) || normalizedLocation === normalize(state.name)
    ? normalize(state.name)
    : normalize(state.code)
  const city = normalizedLocation === stateToken
    ? ''
    : withoutZip(domesticLocation).slice(0, -(stateToken.length)).trim().replace(/,$/, '').trim()

  return { city, state: state.code, stateCode: state.code, stateName: state.name }
}

function stateMatches(parsed: ParsedUsLocation, query: string) {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return true

  const exactQueryState = findState(query)
  if (exactQueryState) return parsed.stateCode === exactQueryState.code

  if (parsed.stateCode && parsed.stateName) {
    return normalize(parsed.stateCode).startsWith(normalizedQuery) ||
      normalize(parsed.stateName).startsWith(normalizedQuery)
  }

  return normalize(parsed.state).includes(normalizedQuery)
}

export function matchesUsLocationFilters(
  value: string | null | undefined,
  cityQuery: string,
  stateQuery: string,
) {
  if (!cityQuery.trim() && !stateQuery.trim()) return true
  const parsed = parseUsLocation(value)
  const cityMatches = !cityQuery.trim() || normalize(parsed.city).includes(normalize(cityQuery))
  return cityMatches && stateMatches(parsed, stateQuery)
}
