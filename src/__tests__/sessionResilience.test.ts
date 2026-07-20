import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Opportunity, User } from '../types'

const mocks = vi.hoisted(() => ({
  revalidateAuthenticatedProfile: vi.fn(),
  restoreAuthenticatedProfile: vi.fn(),
  signOutCurrentSession: vi.fn().mockResolvedValue(undefined),
  loadAllData: vi.fn(),
  fetchNotifications: vi.fn(),
  fetchEmployeeRequests: vi.fn(),
  fetchActivityLogs: vi.fn(),
}))

vi.mock('../lib/auth', () => ({
  authenticateWithPassword: vi.fn(),
  completeFirstLoginPassword: vi.fn(),
  revalidateAuthenticatedProfile: mocks.revalidateAuthenticatedProfile,
  restoreAuthenticatedProfile: mocks.restoreAuthenticatedProfile,
  sessionStartedAt: vi.fn((_session, fallback = Date.now()) => fallback),
  signOutCurrentSession: mocks.signOutCurrentSession,
}))

vi.mock('../lib/api', () => ({
  isApiConnected: true,
  api: null,
}))

vi.mock('../lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/db')>()
  return {
    ...actual,
    loadAllData: mocks.loadAllData,
    fetchNotifications: mocks.fetchNotifications,
    fetchEmployeeRequests: mocks.fetchEmployeeRequests,
    fetchActivityLogs: mocks.fetchActivityLogs,
  }
})

import { useStore } from '../store/useStore'

const user: User = {
  id: 'profile-1',
  authUserId: 'auth-1',
  name: 'Example User',
  email: 'user@example.com',
  username: 'user',
  role: 'CAPTURE_MANAGER',
  avatar: 'EU',
  status: 'active',
  firstLogin: false,
  createdAt: '2026-07-20',
  team: 'BD',
  managerId: null,
}

const opportunity = { id: 'opp-1', solicitation: 'Sensitive opportunity' } as Opportunity

function setAuthenticatedWorkspace(): void {
  useStore.setState({
    currentUser: user,
    users: [user],
    opportunities: [opportunity],
    employees: [],
    isAuthenticated: true,
    authInitialized: true,
    needsFirstLogin: false,
    accessNoticeAccepted: true,
    loginTimestamp: Date.parse('2026-07-20T08:00:00.000Z'),
    dbReady: true,
    appSettings: { privateIntegrationKey: 'in-memory-only' },
  })
}

describe('background profile revalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    mocks.loadAllData.mockResolvedValue(null)
    mocks.restoreAuthenticatedProfile.mockResolvedValue({ initialized: true, profile: null })
    mocks.fetchNotifications.mockResolvedValue({ ok: false })
    mocks.fetchEmployeeRequests.mockResolvedValue({ ok: false })
    mocks.fetchActivityLogs.mockResolvedValue({ ok: false })
    setAuthenticatedWorkspace()
  })

  it('tolerates an explicitly retryable profile outage without loading or purging data', async () => {
    mocks.revalidateAuthenticatedProfile.mockResolvedValue({
      ok: false,
      code: 'profile_temporarily_unavailable',
      error: 'Temporary outage',
      retryable: true,
    })

    await useStore.getState().refreshFromDb()

    expect(mocks.loadAllData).not.toHaveBeenCalled()
    expect(mocks.signOutCurrentSession).not.toHaveBeenCalled()
    expect(useStore.getState()).toMatchObject({
      currentUser: user,
      opportunities: [opportunity],
      isAuthenticated: true,
      dbReady: true,
    })
  })

  it('immediately purges and signs out a missing profile before loading workspace data', async () => {
    mocks.revalidateAuthenticatedProfile.mockResolvedValue({
      ok: false,
      code: 'profile_missing',
      error: 'Missing profile',
      retryable: false,
    })

    await useStore.getState().refreshFromDb()

    expect(mocks.loadAllData).not.toHaveBeenCalled()
    expect(mocks.signOutCurrentSession).toHaveBeenCalledOnce()
    expect(useStore.getState()).toMatchObject({
      currentUser: null,
      users: [],
      opportunities: [],
      appSettings: {},
      isAuthenticated: false,
      dbReady: false,
    })
  })

  it('switches an admin-reset user to setup-only state and preserves notice acceptance', async () => {
    const resetProfile = { ...user, firstLogin: true }
    mocks.revalidateAuthenticatedProfile.mockResolvedValue({ ok: true, profile: resetProfile })

    await useStore.getState().refreshFromDb()

    expect(mocks.loadAllData).not.toHaveBeenCalled()
    expect(mocks.signOutCurrentSession).not.toHaveBeenCalled()
    expect(useStore.getState()).toMatchObject({
      currentUser: resetProfile,
      users: [resetProfile],
      opportunities: [],
      appSettings: {},
      isAuthenticated: false,
      needsFirstLogin: true,
      accessNoticeAccepted: true,
      dbReady: false,
    })
  })

  it('applies current role, team, and manager changes before loading business data', async () => {
    const refreshedProfile: User = {
      ...user,
      role: 'TEAM_LEAD',
      team: 'OPS',
      managerId: 'profile-2',
    }
    mocks.revalidateAuthenticatedProfile.mockResolvedValue({ ok: true, profile: refreshedProfile })

    await useStore.getState().refreshFromDb()

    expect(mocks.revalidateAuthenticatedProfile).toHaveBeenCalledWith('auth-1')
    expect(mocks.loadAllData).toHaveBeenCalledOnce()
    expect(
      mocks.revalidateAuthenticatedProfile.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.loadAllData.mock.invocationCallOrder[0])
    expect(useStore.getState().currentUser).toMatchObject({
      role: 'TEAM_LEAD',
      team: 'OPS',
      managerId: 'profile-2',
    })
  })

  it('revalidates USER_UPDATED events while preserving the absolute session start', async () => {
    const startedAt = useStore.getState().loginTimestamp
    const refreshedProfile: User = { ...user, role: 'BD_MANAGER', team: 'OPS' }
    mocks.revalidateAuthenticatedProfile.mockResolvedValue({ ok: true, profile: refreshedProfile })

    await useStore.getState().handleAuthSessionEvent('USER_UPDATED', {
      user: { id: 'auth-1', last_sign_in_at: '2026-07-20T12:00:00.000Z' },
    } as never)

    expect(useStore.getState()).toMatchObject({
      currentUser: refreshedProfile,
      isAuthenticated: true,
      loginTimestamp: startedAt,
      accessNoticeAccepted: true,
    })
  })

  it('switches to a different account opened in another tab without revoking its session', async () => {
    const otherUser: User = {
      ...user,
      id: 'profile-2',
      authUserId: 'auth-2',
      email: 'other@example.com',
      username: 'other',
    }
    mocks.restoreAuthenticatedProfile.mockResolvedValue({
      initialized: true,
      profile: otherUser,
      session: { user: { id: 'auth-2' } },
    })

    await useStore.getState().handleAuthSessionEvent('TOKEN_REFRESHED', {
      user: { id: 'auth-2' },
    })

    expect(mocks.revalidateAuthenticatedProfile).not.toHaveBeenCalled()
    expect(mocks.signOutCurrentSession).not.toHaveBeenCalled()
    expect(useStore.getState()).toMatchObject({
      currentUser: otherUser,
      isAuthenticated: true,
    })
    expect(useStore.getState().opportunities).toEqual([])
  })
})
