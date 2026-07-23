import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import PipelinePage from '../pages/PipelinePage'
import { useStore } from '../store/useStore'
import type { Opportunity, User } from '../types'

const currentUser: User = {
  id: 'pipeline-admin',
  authUserId: 'pipeline-auth',
  name: 'Pipeline Admin',
  email: 'pipeline.admin@example.test',
  username: 'pipeline.admin',
  role: 'CAPTURE_MANAGER',
  avatar: 'PA',
  status: 'active',
  firstLogin: false,
  createdAt: '2026-07-23',
  team: 'BD',
  managerId: null,
}

function makeOpportunity(overrides: Partial<Opportunity>): Opportunity {
  return {
    id: 'pipeline-opportunity',
    solicitation: 'Pipeline opportunity',
    solicitationId: 'SOL-PIPELINE',
    client: 'Federal agency',
    type: 'OTJ',
    naicsCode: '238220',
    setAside: 'SB',
    priority: 'MEDIUM',
    status: 'ACTIVE',
    dueDate: '2026-08-01',
    localTime: '17:00',
    location: 'Maryland',
    pop: '',
    bdm: '',
    bds: '',
    comments: [],
    period: 'AUG 2026',
    capturedOn: 'Jul 23, 2026',
    assignedTo: currentUser.id,
    ...overrides,
  }
}

describe('General Opportunity Pipeline filter visibility', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useStore.setState({
      currentUser,
      users: [currentUser],
      employees: [],
      opportunities: [],
      deletionRequests: [],
      requireAssociateForActivePipeline: true,
    })
  })

  async function renderPipeline(entry = '/pipeline') {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[entry]}>
          <PipelinePage />
        </MemoryRouter>,
      )
    })
  }

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('hides and restores the controls without clearing an active filter', async () => {
    await renderPipeline()

    const solicitationFilter = container.querySelector<HTMLInputElement>(
      'input[placeholder="Any solicitation"]',
    )
    expect(solicitationFilter).not.toBeNull()

    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set
    expect(nativeValueSetter).toBeTypeOf('function')
    await act(async () => {
      nativeValueSetter?.call(solicitationFilter, 'Bridge repair')
      solicitationFilter?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(solicitationFilter?.value).toBe('Bridge repair')

    const hideButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent?.includes('Hide filters'),
    )
    expect(hideButton).toBeDefined()
    await act(async () => hideButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    expect(container.querySelector('#pipeline-column-filters')).toBeNull()
    const showButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent?.includes('Show filters'),
    )
    expect(showButton).toBeDefined()
    await act(async () => showButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    expect(
      container.querySelector<HTMLInputElement>('input[placeholder="Any solicitation"]')?.value,
    ).toBe('Bridge repair')
  })

  it('shows only active opportunities matching a Set-Aside dashboard drilldown', async () => {
    useStore.setState({
      opportunities: [
        makeOpportunity({
          id: 'sdvosb-active',
          solicitation: 'Matching active SDVOSB opportunity',
          setAside: 'SDVOSB',
        }),
        makeOpportunity({
          id: 'vosb-active',
          solicitation: 'Different active VOSB opportunity',
          setAside: 'VOSB',
        }),
        makeOpportunity({
          id: 'sdvosb-submitted',
          solicitation: 'Matching but submitted SDVOSB opportunity',
          setAside: 'SDVOSB',
          status: 'SUBMITTED',
        }),
      ],
      requireAssociateForActivePipeline: false,
    })

    await renderPipeline('/pipeline?setAside=SDVOSB')

    expect(
      container.querySelector<HTMLInputElement>('input[placeholder="Any set aside"]')?.value,
    ).toBe('SDVOSB')
    expect(container.textContent).toContain('1 results')

    const results = container.querySelector('tbody')?.textContent ?? ''
    expect(results).toContain('Matching active SDVOSB opportunity')
    expect(results).not.toContain('Different active VOSB opportunity')
    expect(results).not.toContain('Matching but submitted SDVOSB opportunity')
  })
})
