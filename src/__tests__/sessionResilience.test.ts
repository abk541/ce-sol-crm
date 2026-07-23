import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Employee, Opportunity, User } from '../types'

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
  upsertOpportunity: vi.fn().mockResolvedValue(true),
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
    upsertOpportunity: mocks.upsertOpportunity,
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
const manager: Employee = {
  id: 'manager-1',
  name: 'Manager One',
  email: 'manager@example.test',
  role: 'BD_MANAGER',
  managerId: null,
  avatar: 'MO',
  team: 'BD',
}
const managerOnlyOpportunity = {
  ...opportunity,
  id: 'manager-only-opportunity',
  status: 'NEW_ASSIGNMENT',
  assignedTo: manager.id,
} as Opportunity

function loadedWorkspace(opportunities: Opportunity[]) {
  return {
    users: [user],
    employees: [manager],
    opportunities,
    contracts: [],
    freshAwards: [],
    pastPerformances: [],
    subcontractors: [],
    nonSubReports: [],
    deletionRequests: [],
    bdSubmissions: [],
    subkDatabase: [],
  }
}

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

  it('rolls back to an intermediate confirmed mode and persists its opportunity statuses', async () => {
    mocks.saveAppSetting
      .mockResolvedValueOnce({ ok: true, missingTable: false })
      .mockResolvedValueOnce({ ok: false, missingTable: false })
    useStore.setState({
      employees: [manager],
      opportunities: [managerOnlyOpportunity],
      requireAssociateForActivePipeline: true,
      appSettings: { require_associate_for_active_pipeline: 'true' },
      appSettingsSyncStatus: 'synced',
    })

    const intermediate = useStore.getState().setRequireAssociateForActivePipeline(false)
    const latest = useStore.getState().setRequireAssociateForActivePipeline(true)

    await expect(intermediate).resolves.toBe(true)
    await expect(latest).resolves.toBe(false)

    expect(useStore.getState()).toMatchObject({
      requireAssociateForActivePipeline: false,
      appSettings: { require_associate_for_active_pipeline: 'false' },
      opportunities: [
        expect.objectContaining({
          id: managerOnlyOpportunity.id,
          status: 'ACTIVE',
        }),
      ],
    })
    await vi.waitFor(() => expect(mocks.upsertOpportunity).toHaveBeenCalledOnce())
    expect(mocks.upsertOpportunity).toHaveBeenCalledWith(
      expect.objectContaining({
        id: managerOnlyOpportunity.id,
        status: 'ACTIVE',
      }),
    )
  })

  it('rolls back to the original confirmed mode when every queued setting write fails', async () => {
    mocks.saveAppSetting
      .mockResolvedValueOnce({ ok: false, missingTable: false })
      .mockResolvedValueOnce({ ok: false, missingTable: false })
    useStore.setState({
      employees: [manager],
      opportunities: [managerOnlyOpportunity],
      requireAssociateForActivePipeline: true,
      appSettings: { require_associate_for_active_pipeline: 'true' },
      appSettingsSyncStatus: 'synced',
    })

    const first = useStore.getState().setRequireAssociateForActivePipeline(false)
    const latest = useStore.getState().setRequireAssociateForActivePipeline(true)

    await expect(first).resolves.toBe(false)
    await expect(latest).resolves.toBe(false)

    expect(useStore.getState()).toMatchObject({
      requireAssociateForActivePipeline: true,
      appSettings: { require_associate_for_active_pipeline: 'true' },
      opportunities: [
        expect.objectContaining({
          id: managerOnlyOpportunity.id,
          status: 'NEW_ASSIGNMENT',
        }),
      ],
    })
    expect(mocks.upsertOpportunity).not.toHaveBeenCalled()
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

  it('ignores a stale activation response from a refresh that started before a newer saved choice', async () => {
    type SettingsResult = {
      ok: true
      missingTable: false
      payload: Record<string, string>
    }
    let resolveSettings!: (value: SettingsResult) => void
    mocks.revalidateAuthenticatedProfile.mockResolvedValue({ ok: true, profile: user })
    mocks.fetchAppSettings.mockReturnValueOnce(new Promise(resolve => {
      resolveSettings = resolve
    }))
    useStore.setState({
      requireAssociateForActivePipeline: true,
      appSettings: {
        non_sub_grace_hours: '0',
        require_associate_for_active_pipeline: 'true',
      },
      appSettingsSyncStatus: 'synced',
    })

    const staleRefresh = useStore.getState().refreshFromDb()
    await vi.waitFor(() => expect(mocks.fetchAppSettings).toHaveBeenCalledOnce())

    await expect(
      useStore.getState().setRequireAssociateForActivePipeline(false),
    ).resolves.toBe(true)
    expect(useStore.getState()).toMatchObject({
      requireAssociateForActivePipeline: false,
      appSettings: { require_associate_for_active_pipeline: 'false' },
      appSettingsSyncStatus: 'synced',
    })

    resolveSettings({
      ok: true,
      missingTable: false,
      payload: {
        non_sub_grace_hours: '12',
        require_associate_for_active_pipeline: 'true',
      },
    })
    await staleRefresh

    // Keep the newer activation choice, but do not throw away unrelated
    // workspace settings returned by the refresh.
    expect(useStore.getState()).toMatchObject({
      nonSubGraceHours: 12,
      requireAssociateForActivePipeline: false,
      appSettings: {
        non_sub_grace_hours: '12',
        require_associate_for_active_pipeline: 'false',
      },
      appSettingsSyncStatus: 'synced',
    })
  })

  it('protects a pending activation choice from a settings read started before its save commits', async () => {
    type SaveResult = { ok: true; missingTable: false }
    type SettingsResult = {
      ok: true
      missingTable: false
      payload: Record<string, string>
    }
    let resolveSave!: (value: SaveResult) => void
    let resolveSettings!: (value: SettingsResult) => void
    mocks.saveAppSetting.mockReturnValueOnce(new Promise(resolve => {
      resolveSave = resolve
    }))
    mocks.fetchAppSettings.mockReturnValueOnce(new Promise(resolve => {
      resolveSettings = resolve
    }))
    mocks.revalidateAuthenticatedProfile.mockResolvedValue({ ok: true, profile: user })
    mocks.loadAllData.mockResolvedValueOnce(loadedWorkspace([managerOnlyOpportunity]))
    useStore.setState({
      employees: [manager],
      opportunities: [managerOnlyOpportunity],
      requireAssociateForActivePipeline: true,
      appSettings: {
        non_sub_grace_hours: '0',
        require_associate_for_active_pipeline: 'true',
      },
      appSettingsSyncStatus: 'synced',
    })

    const pendingSave = useStore.getState().setRequireAssociateForActivePipeline(false)
    await vi.waitFor(() => expect(mocks.saveAppSetting).toHaveBeenCalledOnce())
    const staleRefresh = useStore.getState().refreshFromDb()
    await vi.waitFor(() => expect(mocks.fetchAppSettings).toHaveBeenCalledOnce())

    resolveSave({ ok: true, missingTable: false })
    await expect(pendingSave).resolves.toBe(true)
    resolveSettings({
      ok: true,
      missingTable: false,
      payload: {
        non_sub_grace_hours: '13',
        require_associate_for_active_pipeline: 'true',
      },
    })
    await staleRefresh

    expect(useStore.getState()).toMatchObject({
      nonSubGraceHours: 13,
      requireAssociateForActivePipeline: false,
      appSettings: {
        non_sub_grace_hours: '13',
        require_associate_for_active_pipeline: 'false',
      },
      opportunities: [
        expect.objectContaining({
          id: managerOnlyOpportunity.id,
          status: 'ACTIVE',
        }),
      ],
      appSettingsSyncStatus: 'synced',
    })
  })

  it('normalizes refreshed opportunities to a pending mode even when settings loading fails', async () => {
    type SaveResult = { ok: true; missingTable: false }
    let resolveSave!: (value: SaveResult) => void
    mocks.saveAppSetting.mockReturnValueOnce(new Promise(resolve => {
      resolveSave = resolve
    }))
    mocks.revalidateAuthenticatedProfile.mockResolvedValue({ ok: true, profile: user })
    mocks.loadAllData.mockResolvedValueOnce(loadedWorkspace([managerOnlyOpportunity]))
    mocks.fetchAppSettings.mockResolvedValueOnce({ ok: false, missingTable: false })
    useStore.setState({
      employees: [manager],
      opportunities: [managerOnlyOpportunity],
      requireAssociateForActivePipeline: true,
      appSettings: { require_associate_for_active_pipeline: 'true' },
      appSettingsSyncStatus: 'synced',
    })

    const pendingSave = useStore.getState().setRequireAssociateForActivePipeline(false)
    await vi.waitFor(() => expect(mocks.saveAppSetting).toHaveBeenCalledOnce())
    await useStore.getState().refreshFromDb()

    expect(useStore.getState()).toMatchObject({
      requireAssociateForActivePipeline: false,
      appSettings: { require_associate_for_active_pipeline: 'false' },
      opportunities: [
        expect.objectContaining({
          id: managerOnlyOpportunity.id,
          status: 'ACTIVE',
        }),
      ],
    })

    resolveSave({ ok: true, missingTable: false })
    await expect(pendingSave).resolves.toBe(true)
  })

  it('keeps the latest activation choice through an overlapping false-true-false save sequence', async () => {
    type SaveResult = { ok: true; missingTable: false }
    let resolveFirst!: (value: SaveResult) => void
    let resolveSecond!: (value: SaveResult) => void
    let resolveThird!: (value: SaveResult) => void
    mocks.saveAppSetting
      .mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve }))
      .mockReturnValueOnce(new Promise(resolve => { resolveSecond = resolve }))
      .mockReturnValueOnce(new Promise(resolve => { resolveThird = resolve }))
    mocks.revalidateAuthenticatedProfile.mockResolvedValue({ ok: true, profile: user })
    useStore.setState({
      requireAssociateForActivePipeline: true,
      appSettings: { require_associate_for_active_pipeline: 'true' },
      appSettingsSyncStatus: 'synced',
    })

    const first = useStore.getState().setRequireAssociateForActivePipeline(false)
    const second = useStore.getState().setRequireAssociateForActivePipeline(true)
    const third = useStore.getState().setRequireAssociateForActivePipeline(false)

    await vi.waitFor(() => expect(mocks.saveAppSetting).toHaveBeenCalledTimes(1))
    resolveFirst({ ok: true, missingTable: false })
    await expect(first).resolves.toBe(true)
    await vi.waitFor(() => expect(mocks.saveAppSetting).toHaveBeenCalledTimes(2))

    resolveSecond({ ok: true, missingTable: false })
    await expect(second).resolves.toBe(true)
    await vi.waitFor(() => expect(mocks.saveAppSetting).toHaveBeenCalledTimes(3))

    // The second queued write has reached the database, but the user's newest
    // choice is still waiting to save. A refresh carrying that intermediate
    // value must not silently revert the current mode.
    mocks.fetchAppSettings.mockResolvedValueOnce({
      ok: true,
      missingTable: false,
      payload: { require_associate_for_active_pipeline: 'true' },
    })
    await useStore.getState().refreshFromDb()

    expect(useStore.getState()).toMatchObject({
      requireAssociateForActivePipeline: false,
      appSettings: { require_associate_for_active_pipeline: 'false' },
      appSettingsSyncStatus: 'unknown',
    })

    resolveThird({ ok: true, missingTable: false })
    await expect(third).resolves.toBe(true)
    expect(useStore.getState()).toMatchObject({
      requireAssociateForActivePipeline: false,
      appSettings: { require_associate_for_active_pipeline: 'false' },
      appSettingsSyncStatus: 'synced',
    })
    expect(mocks.saveAppSetting.mock.calls.slice(-3)).toEqual([
      ['require_associate_for_active_pipeline', 'false'],
      ['require_associate_for_active_pipeline', 'true'],
      ['require_associate_for_active_pipeline', 'false'],
    ])
  })

  it('serializes opportunity status batches so the newest activation mode reaches the database last', async () => {
    let resolveFirstStatus!: (value: boolean) => void
    let resolveLatestStatus!: (value: boolean) => void
    let latestStatusSettled = false
    mocks.upsertOpportunity
      .mockReturnValueOnce(new Promise(resolve => { resolveFirstStatus = resolve }))
      .mockReturnValueOnce(
        new Promise<boolean>(resolve => { resolveLatestStatus = resolve })
          .then(value => {
            latestStatusSettled = true
            return value
          }),
      )
    useStore.setState({
      employees: [manager],
      opportunities: [managerOnlyOpportunity],
      requireAssociateForActivePipeline: true,
      appSettings: { require_associate_for_active_pipeline: 'true' },
      appSettingsSyncStatus: 'synced',
    })

    await expect(
      useStore.getState().setRequireAssociateForActivePipeline(false),
    ).resolves.toBe(true)
    await vi.waitFor(() => expect(mocks.upsertOpportunity).toHaveBeenCalledTimes(1))
    expect(mocks.upsertOpportunity).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: 'ACTIVE' }),
    )

    await expect(
      useStore.getState().setRequireAssociateForActivePipeline(true),
    ).resolves.toBe(true)
    // The newest NEW_ASSIGNMENT write must wait for the older ACTIVE request;
    // otherwise a slow first response could land last in the database.
    expect(mocks.upsertOpportunity).toHaveBeenCalledTimes(1)

    resolveFirstStatus(true)
    await vi.waitFor(() => expect(mocks.upsertOpportunity).toHaveBeenCalledTimes(2))
    expect(mocks.upsertOpportunity).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ status: 'NEW_ASSIGNMENT' }),
    )
    resolveLatestStatus(true)
    await vi.waitFor(() => expect(latestStatusSettled).toBe(true))
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
