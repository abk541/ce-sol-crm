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
}))

vi.mock('../lib/auth', () => ({
  authenticateWithPassword: authMocks.authenticateWithPassword,
  completeFirstLoginPassword: authMocks.completeFirstLoginPassword,
  revalidateAuthenticatedProfile: authMocks.revalidateAuthenticatedProfile,
  restoreAuthenticatedProfile: authMocks.restoreAuthenticatedProfile,
  sessionStartedAt: authMocks.sessionStartedAt,
  signOutCurrentSession: authMocks.signOutCurrentSession,
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

describe('auth memory and persistence boundaries', () => {
  beforeEach(() => {
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
      session: { user: { id: 'auth-1', last_sign_in_at: newStartIso } },
    })

    await useStore.getState().login(user.email, 'NewSessionPassword1!')

    expect(useStore.getState()).toMatchObject({
      isAuthenticated: true,
      loginTimestamp: Date.parse(newStartIso),
      accessNoticeAccepted: false,
    })
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
})
