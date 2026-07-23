import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import PipelinePage from '../pages/PipelinePage'
import { useStore } from '../store/useStore'
import type { Employee, Opportunity, User } from '../types'

const associateUser: User = {
  id: 'associate-user',
  authUserId: 'associate-auth',
  name: 'Alex Associate',
  email: 'alex.associate@example.test',
  username: 'alex.associate',
  role: 'ASSOCIATE',
  avatar: 'AA',
  status: 'active',
  firstLogin: false,
  createdAt: '2026-07-23',
  team: 'BD',
  managerId: 'lead',
}

const employees: Employee[] = [
  {
    id: 'lead',
    name: 'Taylor Lead',
    email: 'taylor.lead@example.test',
    role: 'TEAM_LEAD',
    managerId: null,
    avatar: 'TL',
    team: 'BD',
  },
  {
    id: 'associate',
    name: associateUser.name,
    email: associateUser.email,
    role: 'ASSOCIATE',
    managerId: 'lead',
    avatar: 'AA',
    team: 'BD',
  },
  {
    id: 'other-associate',
    name: 'Other Associate',
    email: 'other.associate@example.test',
    role: 'ASSOCIATE',
    managerId: 'lead',
    avatar: 'OA',
    team: 'BD',
  },
]

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'associate-opportunity',
    solicitation: 'Associate sourcing opportunity',
    solicitationId: 'SOL-ASSOCIATE-QUOTE',
    client: 'Federal agency',
    type: 'OTJ',
    naicsCode: '238220',
    setAside: 'SB',
    priority: 'MEDIUM',
    status: 'ACTIVE',
    dueDate: '2026-08-15',
    localTime: '17:00',
    location: 'Maryland',
    pop: '',
    bdm: '',
    bds: 'Taylor Lead',
    supportAgent: associateUser.name,
    comments: [],
    period: 'AUG 2026',
    capturedOn: 'Jul 23, 2026',
    ...overrides,
  }
}

function buttonWithText(text: string): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll('button')).find(
    button => button.textContent?.trim().includes(text),
  )
}

describe('associate sourcing and quoted controls', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useStore.setState({
      currentUser: associateUser,
      users: [associateUser],
      employees,
      opportunities: [],
      subcontractors: [],
      deletionRequests: [],
      requireAssociateForActivePipeline: false,
      rolePermissionOverrides: {},
      userPermissionGrants: {},
      userPermissionRevokes: {},
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  async function renderAndOpenActions(record: Opportunity) {
    useStore.setState({ opportunities: [record] })
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/pipeline']}>
          <PipelinePage />
        </MemoryRouter>,
      )
    })
    const trigger = container.querySelector<HTMLButtonElement>('button[title="More actions"]')
    expect(trigger).not.toBeNull()
    await act(async () => trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  }

  it.each([
    ['the current assignment', { assignedTo: 'associate' }],
    ['a migrated legacy assignment', { assignedTo: 'lead', supportAgent: associateUser.email }],
  ])('shows Sourcing and Mark Quoted for %s', async (_label, assignment) => {
    await renderAndOpenActions(opportunity(assignment))

    expect(buttonWithText('Sourcing')).toBeDefined()
    expect(buttonWithText('Mark Quoted')).toBeDefined()

    await act(async () => buttonWithText('Sourcing')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(document.body.textContent).toContain('Attach quote files')
  })

  it('does not expose sourcing changes on another associate’s opportunity', async () => {
    await renderAndOpenActions(opportunity({
      assignedTo: 'other-associate',
      supportAgent: 'Other Associate',
    }))

    expect(buttonWithText('Sourcing')).toBeUndefined()
    expect(buttonWithText('Mark Quoted')).toBeUndefined()
  })
})
