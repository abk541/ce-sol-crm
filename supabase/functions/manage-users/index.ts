import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.105.4";
import {
  PASSWORD_POLICY_MESSAGE,
  passwordMeetsPolicy,
} from "./password-policy.ts";

type Role =
  | "CAPTURE_MANAGER"
  | "BD_MANAGER"
  | "OPS_MANAGER"
  | "TEAM_LEAD"
  | "ASSOCIATE";

type UserStatus = "active" | "inactive";
type Team = "BD" | "OPS";

interface ProfileRow {
  id: string;
  auth_user_id: string;
  name: string;
  email: string;
  username: string;
  role: Role;
  avatar: string | null;
  status: UserStatus;
  first_login: boolean;
  mfa_enabled: boolean;
  created_at: string | null;
  team: Team | null;
  manager_id: string | null;
}

interface SafeUser {
  id: string;
  authUserId: string;
  name: string;
  email: string;
  username: string;
  role: Role;
  avatar: string | null;
  status: UserStatus;
  firstLogin: boolean;
  mfaEnabled: boolean;
  createdAt: string | null;
  team: Team | null;
  managerId: string | null;
}

interface AuthUpdateAttributes {
  email?: string;
  password?: string;
  ban_duration?: string;
  user_metadata?: Record<string, unknown>;
}

const SAFE_PROFILE_COLUMNS =
  "id,auth_user_id,name,email,username,role,avatar,status,first_login,mfa_enabled,created_at,team,manager_id";

const ROLES = new Set<Role>([
  "CAPTURE_MANAGER",
  "BD_MANAGER",
  "OPS_MANAGER",
  "TEAM_LEAD",
  "ASSOCIATE",
]);
const STATUSES = new Set<UserStatus>(["active", "inactive"]);
const TEAMS = new Set<Team>(["BD", "OPS"]);
const ADMIN_PERMISSION = "admin:manageUsers";
const LONG_BAN = "876000h"; // 100 years; active RLS also denies immediately.
const MAX_BODY_BYTES = 64 * 1024;

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_request", `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unexpected.length > 0) {
    throw new ApiError(
      400,
      "invalid_request",
      `${label} contains unsupported field(s): ${unexpected.join(", ")}.`,
    );
  }
}

function requiredString(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, "invalid_request", `${label} is required.`);
  }
  const result = value.trim();
  if (result.length > maxLength) {
    throw new ApiError(400, "invalid_request", `${label} is too long.`);
  }
  return result;
}

function optionalString(
  value: unknown,
  label: string,
  maxLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, label, maxLength);
}

function optionalNullableString(
  value: unknown,
  label: string,
  maxLength: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return requiredString(value, label, maxLength);
}

function parseEmail(value: unknown, required = true): string | undefined {
  if (!required && value === undefined) return undefined;
  const email = requiredString(value, "email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "invalid_request", "email is not valid.");
  }
  return email;
}

function parseUsername(value: unknown, required = true): string | undefined {
  if (!required && value === undefined) return undefined;
  const username = requiredString(value, "username", 64);
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(username)) {
    throw new ApiError(
      400,
      "invalid_request",
      "username must be 3-64 letters, numbers, dots, underscores, or hyphens.",
    );
  }
  return username;
}

function parsePassword(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError(400, "invalid_request", "password is required.");
  }
  if (value.length > 256) {
    throw new ApiError(400, "invalid_request", "password is too long.");
  }
  if (!passwordMeetsPolicy(value)) {
    throw new ApiError(
      400,
      "weak_password",
      PASSWORD_POLICY_MESSAGE,
    );
  }
  return value;
}

function parseRole(value: unknown, required = true): Role | undefined {
  if (!required && value === undefined) return undefined;
  if (typeof value !== "string" || !ROLES.has(value as Role)) {
    throw new ApiError(400, "invalid_request", "role is not valid.");
  }
  return value as Role;
}

function parseStatus(value: unknown, required = true): UserStatus | undefined {
  if (!required && value === undefined) return undefined;
  if (typeof value !== "string" || !STATUSES.has(value as UserStatus)) {
    throw new ApiError(400, "invalid_request", "status is not valid.");
  }
  return value as UserStatus;
}

function parseTeam(value: unknown): Team | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !TEAMS.has(value as Team)) {
    throw new ApiError(400, "invalid_request", "team must be BD, OPS, or null.");
  }
  return value as Team;
}

function parseBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new ApiError(400, "invalid_request", `${label} must be a boolean.`);
  }
  return value;
}

function toSafeUser(row: ProfileRow): SafeUser {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    name: row.name,
    email: row.email,
    username: row.username,
    role: row.role,
    avatar: row.avatar,
    status: row.status,
    firstLogin: row.first_login,
    mfaEnabled: row.mfa_enabled,
    createdAt: row.created_at,
    team: row.team,
    managerId: row.manager_id,
  };
}

function allowedOrigin(origin: string | null, supabaseUrl: string): string | null {
  if (!origin) return null;

  const configured = (Deno.env.get("MANAGE_USERS_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (configured.includes("*") || configured.includes(origin)) return origin;

  // Safe zero-config default for same-origin Studio/API smoke tests. A separate
  // frontend origin must be explicitly configured at deployment.
  try {
    if (new URL(supabaseUrl).origin === origin) return origin;
  } catch {
    // SUPABASE_URL validation is handled separately below.
  }

  throw new ApiError(403, "origin_denied", "This request origin is not allowed.");
}

function responseHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "authorization, apikey, content-type";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin),
  });
}

function errorResponse(error: ApiError, origin: string | null): Response {
  return jsonResponse(
    { error: { code: error.code, message: error.message } },
    error.status,
    origin,
  );
}

async function profileById(
  admin: SupabaseClient,
  userId: string,
): Promise<ProfileRow> {
  const { data, error } = await admin
    .from("users")
    .select(SAFE_PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("manage-users: profile lookup failed", error.code);
    throw new ApiError(500, "profile_lookup_failed", "Unable to load the user profile.");
  }
  if (!data) throw new ApiError(404, "user_not_found", "User was not found.");
  return data as ProfileRow;
}

async function completeFirstLogin(
  admin: SupabaseClient,
  caller: ProfileRow,
  body: Record<string, unknown>,
): Promise<{ user: SafeUser; alreadyComplete: boolean }> {
  assertAllowedKeys(body, ["action", "password"], "request");
  const password = parsePassword(body.password);

  if (caller.status !== "active") {
    throw new ApiError(403, "account_inactive", "This account is inactive.");
  }

  // A successful retry after the profile flag was already committed must not
  // change the password a second time. This is the idempotent terminal state.
  if (caller.first_login === false) {
    return { user: toSafeUser(caller), alreadyComplete: true };
  }

  const { error: authError } = await admin.auth.admin.updateUserById(
    caller.auth_user_id,
    { password },
  );
  if (authError) {
    console.error(
      "manage-users: first-login Auth password update failed",
      authError.code ?? "unknown",
    );
    if (authError.code === "weak_password") {
      throw new ApiError(
        400,
        "weak_password",
        "The password does not meet the server password policy.",
      );
    }
    throw new ApiError(
      409,
      "password_update_failed",
      "The password could not be updated. Please retry.",
    );
  }

  // The Auth and PostgREST APIs cannot share a transaction. Keep first_login
  // true unless the Auth update above succeeds, and use a conditional update
  // so concurrent/retried requests converge on the same completed state.
  const { data, error: profileError } = await admin
    .from("users")
    .update({ first_login: false })
    .eq("id", caller.id)
    .eq("auth_user_id", caller.auth_user_id)
    .eq("first_login", true)
    .select(SAFE_PROFILE_COLUMNS)
    .maybeSingle();

  if (profileError) {
    console.error(
      "manage-users: first-login profile completion failed",
      profileError.code ?? "unknown",
    );
    throw new ApiError(
      500,
      "setup_incomplete",
      "The password changed, but account setup is not complete. Retry with the same new password.",
    );
  }

  if (data) {
    return { user: toSafeUser(data as ProfileRow), alreadyComplete: false };
  }

  // Another in-flight request may have completed the conditional update. A
  // fresh read distinguishes that harmless race from a real partial failure.
  const latest = await profileById(admin, caller.id);
  if (latest.first_login === false) {
    return { user: toSafeUser(latest), alreadyComplete: true };
  }

  throw new ApiError(
    500,
    "setup_incomplete",
    "The password changed, but account setup is not complete. Retry with the same new password.",
  );
}

async function ensureManagerExists(
  admin: SupabaseClient,
  managerId: string | null | undefined,
  targetId?: string,
): Promise<void> {
  if (!managerId) return;
  if (targetId && managerId === targetId) {
    throw new ApiError(400, "invalid_manager", "A user cannot manage themselves.");
  }

  const { count, error } = await admin
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("id", managerId)
    .eq("status", "active");

  if (error) {
    console.error("manage-users: manager lookup failed", error.code);
    throw new ApiError(500, "manager_lookup_failed", "Unable to validate the manager.");
  }
  if (count !== 1) {
    throw new ApiError(400, "invalid_manager", "managerId must identify an active user.");
  }
}

async function hasUserPermission(
  admin: SupabaseClient,
  authUserId: string,
  permission: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("service_role_has_user_permission", {
    caller_auth_user_id: authUserId,
    requested_permission: permission,
  });

  if (error) {
    console.error("manage-users: permission RPC failed", error.code);
    throw new ApiError(
      500,
      "permission_check_failed",
      "Unable to validate user permissions.",
    );
  }

  return data === true;
}

async function requireUserPermission(
  admin: SupabaseClient,
  authUserId: string,
  permission: string,
): Promise<void> {
  if (!(await hasUserPermission(admin, authUserId, permission))) {
    throw new ApiError(
      403,
      "forbidden",
      "You do not have permission to manage users.",
    );
  }
}

async function ensureAnotherEffectiveAdmin(
  admin: SupabaseClient,
  target: ProfileRow,
  targetHasAdminPermission?: boolean,
): Promise<void> {
  const targetIsEffectiveAdmin = targetHasAdminPermission ??
    await hasUserPermission(admin, target.auth_user_id, ADMIN_PERMISSION);
  if (!targetIsEffectiveAdmin) return;

  const { data, error } = await admin.rpc("service_role_has_other_admin", {
    excluded_profile_id: target.id,
  });

  if (error) {
    console.error("manage-users: effective admin coverage RPC failed", error.code);
    throw new ApiError(500, "admin_check_failed", "Unable to validate administrator coverage.");
  }
  if (data !== true) {
    throw new ApiError(
      409,
      "last_admin",
      "The last effective administrator cannot be reset, disabled, demoted, or deleted.",
    );
  }
}

async function createUser(
  admin: SupabaseClient,
  body: Record<string, unknown>,
): Promise<SafeUser> {
  assertAllowedKeys(body, ["action", "user"], "request");
  const input = asRecord(body.user, "user");
  assertAllowedKeys(
    input,
    [
      "name",
      "email",
      "username",
      "role",
      "avatar",
      "status",
      "firstLogin",
      "team",
      "managerId",
      "password",
    ],
    "user",
  );

  const name = requiredString(input.name, "name", 120);
  const email = parseEmail(input.email) as string;
  const username = parseUsername(input.username) as string;
  const role = parseRole(input.role) as Role;
  const password = parsePassword(input.password);
  const avatar = optionalNullableString(input.avatar, "avatar", 2048) ?? null;
  const status = parseStatus(input.status, false) ?? "active";
  const requestedFirstLogin = parseBoolean(input.firstLogin, "firstLogin");
  if (requestedFirstLogin === false) {
    throw new ApiError(
      400,
      "invalid_request",
      "New users must complete first-login password setup.",
    );
  }
  const team = parseTeam(input.team) ?? null;
  const managerId = optionalNullableString(input.managerId, "managerId", 128) ?? null;

  await ensureManagerExists(admin, managerId);

  const { data: authResult, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, username },
  });

  if (authError || !authResult.user) {
    console.error("manage-users: Auth create failed", authError?.code ?? "missing_user");
    throw new ApiError(409, "auth_create_failed", "Unable to create the Auth account.");
  }

  const authUserId = authResult.user.id;

  try {
    if (status === "inactive") {
      const { error } = await admin.auth.admin.updateUserById(authUserId, {
        ban_duration: LONG_BAN,
      });
      if (error) {
        console.error("manage-users: initial Auth ban failed", error.code);
        throw new ApiError(500, "auth_status_failed", "Unable to apply the account status.");
      }
    }

    const { data, error } = await admin
      .from("users")
      .insert({
        id: crypto.randomUUID(),
        auth_user_id: authUserId,
        name,
        email,
        username,
        role,
        avatar,
        status,
        first_login: true,
        mfa_enabled: false,
        team,
        manager_id: managerId,
      })
      .select(SAFE_PROFILE_COLUMNS)
      .single();

    if (error || !data) {
      console.error("manage-users: profile create failed", error?.code ?? "missing_profile");
      throw new ApiError(409, "profile_create_failed", "Unable to create the user profile.");
    }

    return toSafeUser(data as ProfileRow);
  } catch (error) {
    // Auth and PostgREST are separate APIs; compensate so a profile failure
    // never leaves an untracked login account behind.
    const { error: cleanupError } = await admin.auth.admin.deleteUser(authUserId);
    if (cleanupError) {
      console.error("manage-users: Auth create compensation failed", cleanupError.code);
    }
    throw error;
  }
}

async function updateUser(
  admin: SupabaseClient,
  callerAuthUserId: string,
  body: Record<string, unknown>,
): Promise<SafeUser> {
  assertAllowedKeys(body, ["action", "userId", "updates"], "request");
  const userId = requiredString(body.userId, "userId", 128);
  const updates = asRecord(body.updates, "updates");
  assertAllowedKeys(
    updates,
    [
      "name",
      "email",
      "username",
      "role",
      "avatar",
      "status",
      "team",
      "managerId",
    ],
    "updates",
  );
  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, "invalid_request", "updates must contain at least one field.");
  }

  const target = await profileById(admin, userId);
  const profilePatch: Record<string, unknown> = {};
  const authPatch: AuthUpdateAttributes = {};
  const rollbackAuthPatch: AuthUpdateAttributes = {};

  const name = optionalString(updates.name, "name", 120);
  if (name !== undefined) {
    profilePatch.name = name;
    authPatch.user_metadata = { name, username: target.username };
    rollbackAuthPatch.user_metadata = { name: target.name, username: target.username };
  }

  const email = parseEmail(updates.email, false);
  if (email !== undefined) {
    profilePatch.email = email;
    authPatch.email = email;
    rollbackAuthPatch.email = target.email;
  }

  const username = parseUsername(updates.username, false);
  if (username !== undefined) {
    profilePatch.username = username;
    authPatch.user_metadata = {
      name: name ?? target.name,
      username,
    };
    rollbackAuthPatch.user_metadata = { name: target.name, username: target.username };
  }

  const role = parseRole(updates.role, false);
  if (role !== undefined) profilePatch.role = role;

  const avatar = optionalNullableString(updates.avatar, "avatar", 2048);
  if (avatar !== undefined) profilePatch.avatar = avatar;

  const status = parseStatus(updates.status, false);
  if (status !== undefined) {
    profilePatch.status = status;
    authPatch.ban_duration = status === "inactive" ? LONG_BAN : "none";
    rollbackAuthPatch.ban_duration = target.status === "inactive" ? LONG_BAN : "none";
  }

  const team = parseTeam(updates.team);
  if (team !== undefined) profilePatch.team = team;

  const managerId = optionalNullableString(updates.managerId, "managerId", 128);
  if (managerId !== undefined) {
    await ensureManagerExists(admin, managerId, target.id);
    profilePatch.manager_id = managerId;
  }

  const mayRemoveAdminAccess =
    (role !== undefined && role !== target.role) ||
    (status === "inactive" && target.status !== "inactive");

  if (mayRemoveAdminAccess) {
    // This preflight gives a deterministic API error. The database's deferred
    // effective-admin invariant remains the concurrency backstop at commit.
    const targetIsEffectiveAdmin = await hasUserPermission(
      admin,
      target.auth_user_id,
      ADMIN_PERMISSION,
    );
    if (targetIsEffectiveAdmin && target.auth_user_id === callerAuthUserId) {
      throw new ApiError(409, "self_lockout", "You cannot disable or demote your own account.");
    }
    await ensureAnotherEffectiveAdmin(admin, target, targetIsEffectiveAdmin);
  }

  let authChanged = false;
  if (Object.keys(authPatch).length > 0) {
    const { error } = await admin.auth.admin.updateUserById(target.auth_user_id, authPatch);
    if (error) {
      console.error("manage-users: Auth update failed", error.code);
      throw new ApiError(409, "auth_update_failed", "Unable to update the Auth account.");
    }
    authChanged = true;
  }

  const { data, error } = await admin
    .from("users")
    .update(profilePatch)
    .eq("id", target.id)
    .select(SAFE_PROFILE_COLUMNS)
    .single();

  if (error || !data) {
    console.error("manage-users: profile update failed", error?.code ?? "missing_profile");
    if (authChanged && Object.keys(rollbackAuthPatch).length > 0) {
      const { error: rollbackError } = await admin.auth.admin.updateUserById(
        target.auth_user_id,
        rollbackAuthPatch,
      );
      if (rollbackError) {
        console.error("manage-users: Auth update compensation failed", rollbackError.code);
        throw new ApiError(
          500,
          "partial_update",
          "Auth changed, but the profile update and automatic rollback failed.",
        );
      }
    }
    throw new ApiError(409, "profile_update_failed", "Unable to update the user profile.");
  }

  return toSafeUser(data as ProfileRow);
}

async function resetPassword(
  admin: SupabaseClient,
  body: Record<string, unknown>,
): Promise<SafeUser> {
  assertAllowedKeys(body, ["action", "userId", "password"], "request");
  const userId = requiredString(body.userId, "userId", 128);
  const password = parsePassword(body.password);
  const target = await profileById(admin, userId);

  await ensureAnotherEffectiveAdmin(admin, target);

  // Gate the profile before installing an administrator-known password. If
  // this database write fails, Auth is untouched and the reset fails closed.
  const { data: gatedProfile, error: gateError } = await admin
    .from("users")
    .update({ first_login: true })
    .eq("id", target.id)
    .eq("auth_user_id", target.auth_user_id)
    .select(SAFE_PROFILE_COLUMNS)
    .maybeSingle();

  if (gateError || !gatedProfile) {
    console.error(
      "manage-users: first-login gate before password reset failed",
      gateError?.code ?? "missing_profile",
    );
    throw new ApiError(
      409,
      "password_reset_gate_failed",
      "The account could not be gated, so its password was not changed.",
    );
  }

  const { error: authError } = await admin.auth.admin.updateUserById(target.auth_user_id, {
    password,
  });
  if (authError) {
    console.error("manage-users: password reset failed", authError.code);

    // Auth did not change, so restore only the flag changed by this request.
    // If compensation fails, the already-committed true flag remains the safe
    // state: the user is gated and an administrator can retry the reset.
    if (target.first_login === false) {
      const { data: restoredProfile, error: compensationError } = await admin
        .from("users")
        .update({ first_login: false })
        .eq("id", target.id)
        .eq("auth_user_id", target.auth_user_id)
        .eq("first_login", true)
        .select("id")
        .maybeSingle();

      if (compensationError || !restoredProfile) {
        console.error(
          "manage-users: password reset gate compensation failed; account remains gated",
          compensationError?.code ?? "missing_profile",
        );
        throw new ApiError(
          500,
          "password_reset_compensation_failed",
          "The password was not changed and the account remains gated. Retry the reset.",
        );
      }
    }

    if (authError.code === "weak_password") {
      throw new ApiError(400, "weak_password", PASSWORD_POLICY_MESSAGE);
    }
    throw new ApiError(409, "password_reset_failed", "Unable to reset the password.");
  }

  return toSafeUser(gatedProfile as ProfileRow);
}

async function deleteUser(
  admin: SupabaseClient,
  callerAuthUserId: string,
  body: Record<string, unknown>,
): Promise<SafeUser> {
  assertAllowedKeys(body, ["action", "userId"], "request");
  const userId = requiredString(body.userId, "userId", 128);
  const target = await profileById(admin, userId);

  if (target.auth_user_id === callerAuthUserId) {
    throw new ApiError(409, "self_delete", "You cannot delete your own account.");
  }
  await ensureAnotherEffectiveAdmin(admin, target);

  // The FK cascade removes the public profile and its dependent permission
  // overrides atomically with Auth deletion. Supabase deliberately rejects the
  // delete if this Auth user still owns Storage objects; ownership must be
  // transferred explicitly instead of silently deleting business files.
  const { error } = await admin.auth.admin.deleteUser(target.auth_user_id);
  if (error) {
    console.error("manage-users: Auth delete failed", error.code);
    throw new ApiError(
      409,
      "delete_failed",
      "Unable to delete the user. Transfer any owned Storage objects and retry.",
    );
  }

  return toSafeUser(target);
}

Deno.serve(async (request: Request): Promise<Response> => {
  let responseOrigin: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("manage-users: required Supabase server environment is missing");
      throw new ApiError(500, "server_misconfigured", "User management is not configured.");
    }

    responseOrigin = allowedOrigin(request.headers.get("Origin"), supabaseUrl);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: responseHeaders(responseOrigin) });
    }
    if (request.method !== "POST") {
      throw new ApiError(405, "method_not_allowed", "Only POST is supported.");
    }

    const contentLength = Number(request.headers.get("Content-Length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      throw new ApiError(413, "request_too_large", "Request body is too large.");
    }

    const authorization = request.headers.get("Authorization") ?? "";
    const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) {
      throw new ApiError(401, "unauthorized", "A valid user access token is required.");
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    // Verify with GoTrue on every request; never trust decoded, client-supplied
    // JWT claims or user_metadata for authorization.
    const { data: authData, error: authError } = await admin.auth.getUser(tokenMatch[1]);
    if (authError || !authData.user) {
      throw new ApiError(401, "unauthorized", "The access token is invalid or expired.");
    }

    const { data: caller, error: callerError } = await admin
      .from("users")
      .select(SAFE_PROFILE_COLUMNS)
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();

    if (callerError) {
      console.error("manage-users: caller profile lookup failed", callerError.code);
      throw new ApiError(500, "caller_lookup_failed", "Unable to authorize this request.");
    }
    let body: Record<string, unknown>;
    try {
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
        throw new ApiError(413, "request_too_large", "Request body is too large.");
      }
      body = asRecord(JSON.parse(rawBody), "request");
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
    }

    const action = requiredString(body.action, "action", 32);

    if (!caller) {
      throw new ApiError(403, "forbidden", "An active application profile is required.");
    }
    const callerProfile = caller as ProfileRow;
    if (action === "complete-first-login") {
      const result = await completeFirstLogin(admin, callerProfile, body);
      return jsonResponse(
        { user: result.user, alreadyComplete: result.alreadyComplete },
        200,
        responseOrigin,
      );
    }

    // Every administrative action requires a fully onboarded profile. This is
    // checked from server-owned database state on every call, never from
    // user-editable JWT metadata or a frontend permission flag.
    if (callerProfile.status !== "active") {
      throw new ApiError(403, "account_inactive", "This account is inactive.");
    }
    if (callerProfile.first_login !== false) {
      throw new ApiError(
        403,
        "setup_required",
        "Complete first-login password setup before using administrator actions.",
      );
    }
    await requireUserPermission(admin, authData.user.id, ADMIN_PERMISSION);

    let user: SafeUser;
    switch (action) {
      case "create":
        user = await createUser(admin, body);
        break;
      case "update":
        user = await updateUser(admin, authData.user.id, body);
        break;
      case "reset-password":
        user = await resetPassword(admin, body);
        break;
      case "delete":
        user = await deleteUser(admin, authData.user.id, body);
        break;
      default:
        throw new ApiError(400, "unsupported_action", "action is not supported.");
    }

    return jsonResponse({ user }, 200, responseOrigin);
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error, responseOrigin);
    console.error("manage-users: unhandled error", error);
    return errorResponse(
      new ApiError(500, "internal_error", "An unexpected server error occurred."),
      responseOrigin,
    );
  }
});
