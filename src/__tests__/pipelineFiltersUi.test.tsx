import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import PipelinePage from '../pages/PipelinePage'
import { useStore } from '../store/useStore'
import type { User } from '../types'

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

describe('General Opportunity Pipeline filter visibility', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(async () => {
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

    await act(async () => {
      root.render(
        <MemoryRouter>
          <PipelinePage />
        </MemoryRouter>,
      )
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('hides and restores the controls without clearing an active filter', async () => {
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
})
