# `manage-users` Edge Function

Server-side Supabase Auth administration and first-login completion for the
CRM. Every request verifies the bearer token with Supabase Auth and then
re-checks the caller against `public.users`. Administrative actions accept only
an authenticated, active, fully onboarded caller whose effective permissions
include `admin:manageUsers`. Authorization uses the same role defaults and
role/user overrides as database RLS. The service role remains inside the Edge
Runtime.

## Request contract

Invoke with `supabase.functions.invoke('manage-users', { body })`. The current
user session supplies `Authorization: Bearer <access-token>` automatically.

```ts
type ManageUsersRequest =
  | { action: 'complete-first-login'; password: string }
  | {
      action: 'create'
      user: {
        name: string
        email: string
        username: string
        role: 'CAPTURE_MANAGER' | 'BD_MANAGER' | 'OPS_MANAGER' | 'TEAM_LEAD' | 'ASSOCIATE'
        password: string // 8+ chars, uppercase, number, and special character
        avatar?: string | null
        status?: 'active' | 'inactive'
        firstLogin?: true // false is rejected; every new user must finish setup
        team?: 'BD' | 'OPS' | null
        managerId?: string | null
      }
    }
  | {
      action: 'update'
      userId: string // public.users.id
      updates: {
        name?: string
        email?: string
        username?: string
        role?: 'CAPTURE_MANAGER' | 'BD_MANAGER' | 'OPS_MANAGER' | 'TEAM_LEAD' | 'ASSOCIATE'
        avatar?: string | null
        status?: 'active' | 'inactive'
        team?: 'BD' | 'OPS' | null
        managerId?: string | null
      }
    }
  | { action: 'reset-password'; userId: string; password: string }
  | { action: 'delete'; userId: string }
```

Successful responses contain an explicit safe profile and never contain a
password, recovery code, MFA secret, service key, or full Auth record:

```ts
type ManageUsersResponse = {
  user: {
    id: string
    authUserId: string
    name: string
    email: string
    username: string
    role: string
    avatar: string | null
    status: 'active' | 'inactive'
    firstLogin: boolean
    mfaEnabled: boolean
    createdAt: string | null
    team: 'BD' | 'OPS' | null
    managerId: string | null
  }
  // Present for complete-first-login. true means an earlier request already
  // committed the profile flag, so this retry made no second password change.
  alreadyComplete?: boolean
}

type ManageUsersError = {
  error: { code: string; message: string }
}
```

`complete-first-login` is the only non-admin action. It can change only the
caller's own Auth password and then clears the caller's `first_login` profile
flag with the service role. A completed retry is idempotent. If Auth succeeds
but the profile update fails, the response is
`setup_incomplete` and the caller can safely retry with the same password.
Pending first-login users are rejected from every admin action with
`setup_required`. The general update action cannot change `first_login`; only a
successful administrator password reset can set it to `true`, and only
`complete-first-login` can clear it.

All create, reset, and first-login completion passwords are checked by the same
policy used in the UI: at least 8 characters with one uppercase letter, one
number, and one special character. Password input is not trimmed or silently
changed.

Password reset gates the profile with `first_login=true` before changing Auth,
so a database failure never leaves an active account with an
administrator-known password. If the Auth change fails, the function restores
the prior completed flag; if that compensation fails, the account remains
gated and the administrator must retry.

The function also prevents self-deletion/self-lockout and uses service-role-only
permission RPCs to prevent resetting, deactivating, demoting, or deleting the
last effective `admin:manageUsers` holder. The database's deferred invariant is
the final transactional backstop. Auth deletion may be rejected when that Auth
user owns Storage objects; transfer ownership before retrying so files are
never deleted silently.

## Deployment configuration

Keep JWT verification enabled. Set the non-secret comma-separated frontend
origin allowlist before deployment, for example:

```text
MANAGE_USERS_ALLOWED_ORIGINS=https://crm.cesolutionplus.com,https://abk541.github.io
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied to the self-hosted
Edge Runtime by the Supabase stack. Never place the service-role key in Vite,
browser code, the repository, or this allowlist. Apply the RBAC migration that
defines `service_role_has_user_permission` and `service_role_has_other_admin`
before deploying this function.

Deploy `index.ts` together with its local `password-policy.ts` dependency. The
VPS function bundle is self-contained and does not import application source
files from `src/`.
