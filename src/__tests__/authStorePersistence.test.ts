import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Opportunity, User } from '../types'

const authMocks = vi.hoisted(() => ({
  authenticateWithPassword: vi.fn(),
  completeFirstLoginPassword: vi.fn(),
  revalidateAuthenticatedProfile: vi.fn(),
  restoreAuthenticatedProfile: vi.fn(),
  sessionStartedAt: vi.fn((session: { user?: { last_sign_in_at?: string } }, fallback = Date.now()) => {
    const parsed = Date.parse(session.user?.last_sign_in_at ?? '')
    return Number.isFinite(parsed) ? parsed : fallback
  }),
  signOutCurrentSession: vi.fn().mockResolvedValue(undefined),
  startMfaEnrollment: vi.fn(),
  confirmMfaEnrollment: vi.fn(),
  restoreMfaRecoveryCodes: vi.fn(),
  acknowledgeMfaRecoveryCodes: vi.fn(),
  verifyMfaChallenge: vi.fn(),
  cancelMfaChallenge: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/auth', () => ({
  authenticateWithPassword: authMocks.authenticateWithPassword,
  completeFirstLoginPassword: authMocks.completeFirstLoginPassword,
  revalidateAuthenticatedProfile: authMocks.revalidateAuthenticatedProfile,
  restoreAuthenticatedProfile: authMocks.restoreAuthenticatedProfile,
  sessionStartedAt: authMocks.sessionStartedAt,
  signOutCurrentSession: authMocks.signOutCurrentSession,
  startMfaEnrollment: authMocks.startMfaEnrollment,
  confirmMfaEnrollment: authMocks.confirmMfaEnrollment,
  restoreMfaRecoveryCodes: authMocks.restoreMfaRecoveryCodes,
  acknowledgeMfaRecoveryCodes: authMocks.acknowledgeMfaRecoveryCodes,
  verifyMfaChallenge: authMocks.verifyMfaChallenge,
  cancelMfaChallenge: authMocks.cancelMfaChallenge,
}))

vi.mock('../lib/api', () => ({
  isApiConnected: false,
  api: null,
}))

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
}

const opportunity = {
  id: 'opp-1',
  solicitation: 'Sensitive opportunity',
} as Opportunity

const recoveryCodes = [...'23456789AB'].map(
  character => `ABCD-EFGH-JKLM-${character.repeat(4)}`,
)

describe('auth memory and persistence boundaries', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('persists only harmless UI preferences', () => {
    useStore.setState({
      currentUser: user,
      isAuthenticated: true,
      users: [user],
      opportunities: [opportunity],
      appSettings: { privateIntegrationKey: 'must-not-persist' },
      sidebarCollapsed: true,
      prefs: { notificationSound: false },
    })

    const persisted = JSON.parse(localStorage.getItem('ces-crm-store') || '{}')
    expect(persisted.version).toBe(22)
    expect(persisted.state).toEqual({
      sidebarCollapsed: true,
      prefs: { notificationSound: false },
    })
  })

  it('signs out through API server and purges workspace data from memory', async () => {
    useStore.setState({
      currentUser: user,
      isAuthenticated: true,
      users: [user],
      opportunities: [opportunity],
      appSettings: { privateIntegrationKey: 'must-not-remain' },
      rolePermissionOverrides: { CAPTURE_MANAGER: ['admin:manageUsers'] },
    })

    await useStore.getState().logout()

    expect(authMocks.signOutCurrentSession).toHaveBeenCalledOnce()
    expect(useStore.getState()).toMatchObject({
      currentUser: null,
      isAuthenticated: false,
      users: [],
      employees: [],
      opportunities: [],
      contracts: [],
      appSettings: {},
      rolePermissionOverrides: {},
      dbReady: false,
    })
  })

  it('purges all workspace state while a first-login session is pending', async () => {
    const pendingUser = { ...user, firstLogin: true }
    authMocks.authenticateWithPassword.mockResolvedValue({
      ok: true,
      profile: pendingUser,
      session: { user: { id: pendingUser.authUserId } },
    })
    useStore.setState({
      currentUser: user,
      isAuthenticated: true,
      users: [user],
      employees: [{ id: 'employee-1' }] as never,
      opportunities: [opportunity],
      appSettings: { privateIntegrationKey: 'must-not-remain' },
      rolePermissionOverrides: { CAPTURE_MANAGER: ['admin:manageUsers'] },
      dbReady: true,
    })

    const result = await useStore.getState().login(pendingUser.email, 'TemporaryPassword1!')

    expect(result).toEqual({ ok: true, needsFirst: true })
    expect(useStore.getState()).toMatchObject({
      currentUser: pendingUser,
      isAuthenticated: false,
      needsFirstLogin: true,
      users: [pendingUser],
      employees: [],
      opportunities: [],
      appSettings: {},
      rolePermissionOverrides: {},
      dbReady: false,
    })
  })

  it('authenticates only after protected first-login completion returns a cleared profile', async () => {
    const pendingUser = { ...user, firstLogin: true }
    const completedUser = { ...user, firstLogin: false }
    useStore.setState({
      currentUser: pendingUser,
      users: [pendingUser],
      isAuthenticated: false,
      needsFirstLogin: true,
      loginTimestamp: Date.parse('2026-07-20T08:00:00.000Z'),
      accessNoticeAccepted: true,
      dbReady: false,
    })
    authMocks.completeFirstLoginPassword.mockResolvedValue({
      ok: true,
      profile: completedUser,
      stage: 'authenticated',
      session: { user: { id: 'auth-1' } },
    })

    await expect(useStore.getState().completeFirstLogin('NewPassword1!')).resolves.toEqual({ ok: true })

    expect(authMocks.completeFirstLoginPassword).toHaveBeenCalledWith('NewPassword1!')
    expect(useStore.getState()).toMatchObject({
      currentUser: completedUser,
      users: [completedUser],
      isAuthenticated: true,
      needsFirstLogin: false,
      accessNoticeAccepted: true,
      dbReady: false,
    })
  })

  it('restores the absolute sign-in time and an accepted notice for the same session', async () => {
    const startedAtIso = '2026-07-20T08:00:00.000Z'
    const startedAt = Date.parse(startedAtIso)
    useStore.setState({
      currentUser: user,
      users: [user],
      isAuthenticated: true,
      needsFirstLogin: false,
      loginTimestamp: startedAt,
      accessNoticeAccepted: false,
    })
    useStore.getState().acceptAccessNotice()

    // Simulate a reload: Zustand auth state is gone, but sessionStorage and the
    // API server Auth session both survive.
    useStore.setState({
      currentUser: null,
      users: [],
      isAuthenticated: false,
      authInitialized: false,
      loginTimestamp: null,
      accessNoticeAccepted: false,
    })
    authMocks.restoreAuthenticatedProfile.mockResolvedValue({
      initialized: true,
      profile: user,
      stage: 'authenticated',
      session: { user: { id: 'auth-1', last_sign_in_at: startedAtIso } },
    })

    await useStore.getState().restoreAuthSession()

    expect(useStore.getState()).toMatchObject({
      currentUser: user,
      isAuthenticated: true,
      loginTimestamp: startedAt,
      accessNoticeAccepted: true,
    })
  })

  it('requires the notice again after a brand-new password login', async () => {
    const oldStart = Date.parse('2026-07-20T08:00:00.000Z')
    useStore.setState({
      currentUser: user,
      users: [user],
      isAuthenticated: true,
      loginTimestamp: oldStart,
      accessNoticeAccepted: false,
    })
    useStore.getState().acceptAccessNotice()

    const newStartIso = '2026-07-20T12:00:00.000Z'
    authMocks.authenticateWithPassword.mockResolvedValue({
      ok: true,
      profile: user,
      stage: 'authenticated',
      session: { user: { id: 'auth-1', last_sign_in_at: newStartIso } },
    })

    await useStore.getState().login(user.email, 'NewSessionPassword1!')

    expect(useStore.getState()).toMatchObject({
      isAuthenticated: true,
      loginTimestamp: Date.parse(newStartIso),
      accessNoticeAccepted: false,
    })
  })

  it('completes a valid login when optional preference storage rejects writes', async () => {
    authMocks.authenticateWithPassword.mockResolvedValue({
      ok: true,
      profile: user,
      stage: 'authenticated',
      session: {
        access_token: 'opaque-token',
        user: { id: 'auth-1', last_sign_in_at: '2026-07-20T12:00:00.000Z' },
      },
    })
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError')
    })

    await expect(useStore.getState().login(user.email, 'ValidPassword1!')).resolves.toEqual({
      ok: true,
    })
    expect(useStore.getState()).toMatchObject({
      currentUser: user,
      isAuthenticated: true,
      needsFirstLogin: false,
    })
    setItem.mockRestore()
  })

  it('purges workspace state on a cross-tab sign-out event', async () => {
    useStore.setState({
      currentUser: user,
      users: [user],
      opportunities: [opportunity],
      isAuthenticated: true,
      dbReady: true,
      loginTimestamp: Date.now(),
    })

    await useStore.getState().handleAuthSessionEvent('SIGNED_OUT', null)

    expect(useStore.getState()).toMatchObject({
      currentUser: null,
      users: [],
      opportunities: [],
      isAuthenticated: false,
      dbReady: false,
      loginTimestamp: null,
    })
  })

  it('purges workspace state when a token-refresh event has no session', async () => {
    useStore.setState({
      currentUser: user,
      users: [user],
      opportunities: [opportunity],
      isAuthenticated: true,
      dbReady: true,
      loginTimestamp: Date.now(),
    })

    await useStore.getState().handleAuthSessionEvent('TOKEN_REFRESHED', null)

    expect(useStore.getState()).toMatchObject({
      currentUser: null,
      users: [],
      opportunities: [],
      isAuthenticated: false,
      dbReady: false,
      loginTimestamp: null,
    })
  })

  it('keeps the server-issued recovery bundle in memory through the recovery transition', async () => {
    const startedAt = Date.parse('2026-07-20T08:00:00.000Z')
    useStore.setState({
      currentUser: user,
      users: [user],
      isAuthenticated: false,
      needsFirstLogin: false,
      loginTimestamp: startedAt,
      accessNoticeAccepted: false,
      pendingMfaUserId: user.id,
      pendingMfaMode: 'enroll',
      pendingMfaRecoveryCodes: [],
    })
    authMocks.confirmMfaEnrollment.mockResolvedValue({
      ok: true,
      profile: user,
      recoveryCodes,
    })

    await expect(useStore.getState().completeMfaEnrollment('123456')).resolves.toEqual({
      ok: true,
      recoveryCodes,
      recoveryCodesNeedRestore: undefined,
    })
    expect(useStore.getState()).toMatchObject({
      currentUser: user,
      pendingMfaMode: 'recovery',
      pendingMfaRecoveryCodes: recoveryCodes,
      isAuthenticated: false,
      loginTimestamp: startedAt,
    })
    const persisted = JSON.parse(localStorage.getItem('ces-crm-store') || '{}')
    expect(persisted.state).not.toHaveProperty('pendingMfaRecoveryCodes')
  })

  it('ignores a late MFA success after the pending account changes', async () => {
    const otherUser = {
      ...user,
      id: 'profile-2',
      authUserId: 'auth-2',
      email: 'other@example.com',
    }
    useStore.setState({
      currentUser: user,
      users: [user],
      isAuthenticated: false,
      needsFirstLogin: false,
      loginTimestamp: 100,
      pendingMfaUserId: user.id,
      pendingMfaMode: 'verify',
      pendingMfaRecoveryCodes: [],
    })
    let resolveVerification!: (value: unknown) => void
    authMocks.verifyMfaChallenge.mockReturnValueOnce(new Promise(resolve => {
      resolveVerification = resolve
    }))

    const pending = useStore.getState().verifyMfaCode('123456')
    useStore.setState({
      currentUser: otherUser,
      users: [otherUser],
      loginTimestamp: 200,
      pendingMfaUserId: otherUser.id,
      pendingMfaMode: 'verify',
    })
    resolveVerification({
      ok: true,
      profile: user,
      stage: 'authenticated',
      session: { user: { id: 'auth-1', last_sign_in_at: '2026-07-20T09:00:00.000Z' } },
    })

    await expect(pending).resolves.toMatchObject({ ok: false })
    expect(useStore.getState()).toMatchObject({
      currentUser: otherUser,
      isAuthenticated: false,
      pendingMfaUserId: otherUser.id,
      pendingMfaMode: 'verify',
      loginTimestamp: 200,
    })
  })

  it('uses the completed MFA session start when preserving notice acceptance', async () => {
    const completedAt = '2026-07-20T09:00:00.000Z'
    useStore.setState({
      currentUser: user,
      users: [user],
      isAuthenticated: false,
      needsFirstLogin: false,
      loginTimestamp: Date.parse('2026-07-20T08:00:00.000Z'),
      accessNoticeAccepted: true,
      pendingMfaUserId: user.id,
      pendingMfaMode: 'verify',
      pendingMfaRecoveryCodes: [],
    })
    authMocks.verifyMfaChallenge.mockResolvedValueOnce({
      ok: true,
      profile: user,
      stage: 'authenticated',
      session: { user: { id: 'auth-1', last_sign_in_at: completedAt } },
    })

    await expect(useStore.getState().verifyMfaCode('123456')).resolves.toEqual({ ok: true })
    expect(useStore.getState()).toMatchObject({
      currentUser: user,
      isAuthenticated: true,
      pendingMfaUserId: null,
      pendingMfaMode: null,
      pendingMfaRecoveryCodes: [],
      loginTimestamp: Date.parse(completedAt),
      accessNoticeAccepted: true,
    })
  })

  it('does not let a late password login overwrite a newer cross-tab account', async () => {
    const otherUser = {
      ...user,
      id: 'profile-2',
      authUserId: 'auth-2',
      email: 'other@example.com',
    }
    useStore.setState({
      currentUser: null,
      users: [],
      isAuthenticated: false,
      needsFirstLogin: false,
      loginTimestamp: null,
      pendingMfaUserId: null,
      pendingMfaMode: null,
      pendingMfaRecoveryCodes: [],
    })
    let resolveLogin!: (value: unknown) => void
    authMocks.authenticateWithPassword.mockReturnValueOnce(new Promise(resolve => {
      resolveLogin = resolve
    }))

    const pending = useStore.getState().login(user.email, 'ValidPassword1!')
    useStore.setState({
      currentUser: otherUser,
      users: [otherUser],
      isAuthenticated: true,
      loginTimestamp: 200,
    })
    resolveLogin({
      ok: true,
      profile: user,
      stage: 'authenticated',
      session: {
        user: { id: 'auth-1', last_sign_in_at: '2026-07-20T09:00:00.000Z' },
      },
    })

    await expect(pending).resolves.toMatchObject({ ok: false })
    expect(useStore.getState()).toMatchObject({
      currentUser: otherUser,
      users: [otherUser],
      isAuthenticated: true,
      loginTimestamp: 200,
    })
  })

  it('does not let a delayed MFA cancellation wipe a newer cross-tab session', async () => {
    const otherUser = {
      ...user,
      id: 'profile-2',
      authUserId: 'auth-2',
      email: 'other@example.com',
    }
    useStore.setState({
      currentUser: user,
      users: [user],
      isAuthenticated: false,
      needsFirstLogin: false,
      loginTimestamp: 100,
      pendingMfaUserId: user.id,
      pendingMfaMode: 'verify',
      pendingMfaRecoveryCodes: [],
    })
    let resolveCancel!: () => void
    authMocks.cancelMfaChallenge.mockReturnValueOnce(new Promise<void>(resolve => {
      resolveCancel = resolve
    }))

    const pending = useStore.getState().cancelPendingMfa()
    expect(useStore.getState().currentUser).toBeNull()
    useStore.setState({
      currentUser: otherUser,
      users: [otherUser],
      isAuthenticated: true,
      loginTimestamp: 200,
    })
    resolveCancel()
    await pending

    expect(useStore.getState()).toMatchObject({
      currentUser: otherUser,
      users: [otherUser],
      isAuthenticated: true,
      loginTimestamp: 200,
    })
  })

  it('purges plaintext recovery codes as soon as enrollment is finalized', async () => {
    const completedAt = '2026-07-20T09:00:00.000Z'
    useStore.setState({
      currentUser: user,
      users: [user],
      isAuthenticated: false,
      needsFirstLogin: false,
      loginTimestamp: 100,
      pendingMfaUserId: user.id,
      pendingMfaMode: 'recovery',
      pendingMfaRecoveryCodes: recoveryCodes,
    })
    authMocks.acknowledgeMfaRecoveryCodes.mockResolvedValueOnce({
      ok: true,
      profile: user,
      stage: 'authenticated',
      session: { user: { id: 'auth-1', last_sign_in_at: completedAt } },
    })

    await expect(useStore.getState().acknowledgeMfaRecoveryCodes()).resolves.toEqual({
      ok: true,
    })
    expect(useStore.getState()).toMatchObject({
      isAuthenticated: true,
      pendingMfaUserId: null,
      pendingMfaMode: null,
      pendingMfaRecoveryCodes: [],
    })
  })
})
