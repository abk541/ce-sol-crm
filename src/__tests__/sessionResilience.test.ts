import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Opportunity, User } from '../types'

const mocks = vi.hoisted(() => ({
  revalidateAuthenticatedProfile: vi.fn(),
  restoreAuthenticatedProfile: vi.fn(),
  signOutCurrentSession: vi.fn().mockResolvedValue(undefined),
  loadAllData: vi.fn(),
  fetchNotifications: vi.fn(),
  fetchNotificationReadIds: vi.fn(),
  fetchEmployeeRequests: vi.fn(),
  fetchActivityLogs: vi.fn(),
  seedEmployeesIfEmpty: vi.fn().mockResolvedValue(undefined),
  seedIfEmpty: vi.fn().mockResolvedValue(undefined),
  fetchPermissionOverrides: vi.fn().mockResolvedValue({ ok: false }),
  fetchAppSettings: vi.fn().mockResolvedValue({ ok: false }),
  saveAppSetting: vi.fn().mockResolvedValue({ ok: true, missingTable: false }),
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
    fetchNotificationReadIds: mocks.fetchNotificationReadIds,
    fetchEmployeeRequests: mocks.fetchEmployeeRequests,
    fetchActivityLogs: mocks.fetchActivityLogs,
    seedEmployeesIfEmpty: mocks.seedEmployeesIfEmpty,
    seedIfEmpty: mocks.seedIfEmpty,
    fetchPermissionOverrides: mocks.fetchPermissionOverrides,
    fetchAppSettings: mocks.fetchAppSettings,
    saveAppSetting: mocks.saveAppSetting,
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
    mocks.fetchNotificationReadIds.mockResolvedValue({ ok: false })
    mocks.fetchEmployeeRequests.mockResolvedValue({ ok: false })
    mocks.fetchActivityLogs.mockResolvedValue({ ok: false })
    mocks.fetchAppSettings.mockResolvedValue({ ok: false, missingTable: false })
    mocks.saveAppSetting.mockResolvedValue({ ok: true, missingTable: false })
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

  it('hydrates an explicit false pipeline activation setting during initialization', async () => {
    useStore.setState({
      dbReady: false,
      requireAssociateForActivePipeline: true,
    })
    mocks.fetchAppSettings.mockResolvedValueOnce({
      ok: true,
      missingTable: false,
      payload: {
        non_sub_grace_hours: '0',
        non_sub_grace_minutes: '5',
        require_associate_for_active_pipeline: 'false',
      },
    })

    await useStore.getState().initializeStore()

    expect(useStore.getState()).toMatchObject({
      requireAssociateForActivePipeline: false,
      appSettingsSyncStatus: 'synced',
      appSettings: {
        require_associate_for_active_pipeline: 'false',
      },
    })
  })

  it('refreshes the shared pipeline activation setting without coercing false to the default', async () => {
    mocks.revalidateAuthenticatedProfile.mockResolvedValue({ ok: true, profile: user })
    mocks.fetchAppSettings.mockResolvedValueOnce({
      ok: true,
      missingTable: false,
      payload: { require_associate_for_active_pipeline: 'false' },
    })
    useStore.setState({ requireAssociateForActivePipeline: true })

    await useStore.getState().refreshFromDb()

    expect(useStore.getState().requireAssociateForActivePipeline).toBe(false)
    expect(mocks.fetchAppSettings).toHaveBeenCalledOnce()
  })

  it('persists activation changes and restores the prior value when the shared write fails', async () => {
    useStore.setState({
      requireAssociateForActivePipeline: true,
      appSettings: { require_associate_for_active_pipeline: 'true' },
      appSettingsSyncStatus: 'synced',
    })

    await expect(
      useStore.getState().setRequireAssociateForActivePipeline(false),
    ).resolves.toBe(true)
    expect(mocks.saveAppSetting).toHaveBeenLastCalledWith(
      'require_associate_for_active_pipeline',
      'false',
    )
    expect(useStore.getState()).toMatchObject({
      requireAssociateForActivePipeline: false,
      appSettings: { require_associate_for_active_pipeline: 'false' },
      appSettingsSyncStatus: 'synced',
    })

    mocks.saveAppSetting.mockResolvedValueOnce({ ok: false, missingTable: false })
    await expect(
      useStore.getState().setRequireAssociateForActivePipeline(true),
    ).resolves.toBe(false)

    expect(useStore.getState()).toMatchObject({
      requireAssociateForActivePipeline: false,
      appSettings: { require_associate_for_active_pipeline: 'false' },
      appSettingsSyncStatus: 'unknown',
    })
  })

  it('does not let a periodic refresh overwrite an activation change that is still saving', async () => {
    let resolveSave!: (value: { ok: true; missingTable: false }) => void
    mocks.saveAppSetting.mockReturnValueOnce(new Promise(resolve => {
      resolveSave = resolve
    }))
    mocks.revalidateAuthenticatedProfile.mockResolvedValue({ ok: true, profile: user })
    mocks.fetchAppSettings.mockResolvedValueOnce({
      ok: true,
      missingTable: false,
      payload: { require_associate_for_active_pipeline: 'true' },
    })
    useStore.setState({
      requireAssociateForActivePipeline: true,
      appSettings: { require_associate_for_active_pipeline: 'true' },
    })

    const pendingSave = useStore.getState().setRequireAssociateForActivePipeline(false)
    await vi.waitFor(() => expect(mocks.saveAppSetting).toHaveBeenCalledOnce())
    await useStore.getState().refreshFromDb()

    expect(useStore.getState()).toMatchObject({
      requireAssociateForActivePipeline: false,
      appSettings: { require_associate_for_active_pipeline: 'false' },
      appSettingsSyncStatus: 'unknown',
    })

    resolveSave({ ok: true, missingTable: false })
    await expect(pendingSave).resolves.toBe(true)
    expect(useStore.getState()).toMatchObject({
      requireAssociateForActivePipeline: false,
      appSettingsSyncStatus: 'synced',
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

  it('discards account-scoped initialization results after the active account changes', async () => {
    const otherUser: User = {
      ...user,
      id: 'profile-2',
      authUserId: 'auth-2',
      email: 'other@example.com',
      username: 'other',
    }
    let resolveNotifications!: (value: { ok: true; payload: [] }) => void
    mocks.fetchNotifications.mockReturnValueOnce(new Promise(resolve => {
      resolveNotifications = resolve
    }))
    mocks.fetchNotificationReadIds.mockResolvedValueOnce({ ok: true, payload: ['account-a-read'] })
    useStore.setState({ dbReady: false, notifications: [] })

    const initialization = useStore.getState().initializeStore()
    await vi.waitFor(() => expect(mocks.fetchNotifications).toHaveBeenCalledOnce())
    useStore.setState({
      currentUser: otherUser,
      users: [otherUser],
      loginTimestamp: Date.parse('2026-07-20T09:00:00.000Z'),
      notifications: [],
      notificationsReady: false,
    })
    resolveNotifications({ ok: true, payload: [] })
    await initialization

    expect(useStore.getState()).toMatchObject({
      currentUser: otherUser,
      notifications: [],
      notificationsReady: false,
    })
  })
})
