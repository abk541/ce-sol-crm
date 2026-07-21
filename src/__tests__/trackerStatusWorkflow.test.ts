import { describe, expect, it, vi } from 'vitest'
import { commitTrackerStatusChange } from '../pages/TrackerPage'
import type { BDSubmission, OppStatus } from '../types'

type EditableTrackerStatus = Extract<OppStatus, 'SUBMITTED' | 'DISCUSSION' | 'WON' | 'LOST' | 'CANCELED'>

describe('TrackerPage status workflow', () => {
  it.each<[EditableTrackerStatus, BDSubmission['status']]>([
    ['SUBMITTED', 'SUBMITTED'],
    ['DISCUSSION', 'DISCUSSING'],
    ['WON', 'AWARDED'],
    ['LOST', 'LOST'],
  ])('routes %s through the atomic tracker transition as %s', async (opportunityStatus, trackerStatus) => {
    const transition = vi.fn().mockResolvedValue(true)
    const onCommitted = vi.fn()

    await expect(commitTrackerStatusChange(
      'opp-1',
      opportunityStatus,
      transition,
      onCommitted,
    )).resolves.toBe(true)

    expect(transition).toHaveBeenCalledOnce()
    expect(transition).toHaveBeenCalledWith('opp-1', trackerStatus)
    expect(onCommitted).toHaveBeenCalledOnce()
  })

  it('routes cancellation atomically and preserves its generated comment marker', async () => {
    const transition = vi.fn().mockResolvedValue(true)
    const onCommitted = vi.fn()

    await expect(commitTrackerStatusChange(
      'opp-1',
      'CANCELED',
      transition,
      onCommitted,
    )).resolves.toBe(true)

    expect(transition).toHaveBeenCalledWith('opp-1', 'CANCELED', 'Canceled')
    expect(onCommitted).toHaveBeenCalledOnce()
  })

  it('does not run success feedback when the database transition fails', async () => {
    const transition = vi.fn().mockResolvedValue(false)
    const onCommitted = vi.fn()

    await expect(commitTrackerStatusChange(
      'opp-1',
      'WON',
      transition,
      onCommitted,
    )).resolves.toBe(false)

    expect(onCommitted).not.toHaveBeenCalled()
  })

  it('waits for the transition to commit before running success feedback', async () => {
    let resolveTransition!: (committed: boolean) => void
    const transition = vi.fn(() => new Promise<boolean>(resolve => {
      resolveTransition = resolve
    }))
    const onCommitted = vi.fn()

    const pending = commitTrackerStatusChange('opp-1', 'WON', transition, onCommitted)

    expect(onCommitted).not.toHaveBeenCalled()
    resolveTransition(true)
    await expect(pending).resolves.toBe(true)
    expect(onCommitted).toHaveBeenCalledOnce()
  })
})
