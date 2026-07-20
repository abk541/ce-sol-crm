import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.105.4";

interface CallerProfile {
  id: string;
  status: "active" | "inactive";
  first_login: boolean;
}

interface SamGovReference {
  noticeId?: string;
  solicitationNumber?: string;
}

const MAX_BODY_BYTES = 8 * 1024;
const MAX_UPSTREAM_BYTES = 5 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 20_000;

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

function requiredString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, "invalid_request", `${label} is required.`);
  }
  const result = value.trim();
  if (result.length > maxLength) {
    throw new ApiError(400, "invalid_request", `${label} is too long.`);
  }
  return result;
}

function allowedOrigin(origin: string | null, supabaseUrl: string): string | null {
  if (!origin) return null;

  const configured = (
    Deno.env.get("SAM_GOV_ALLOWED_ORIGINS") ??
    Deno.env.get("MANAGE_USERS_ALLOWED_ORIGINS") ??
    ""
  )
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (configured.includes("*") || configured.includes(origin)) return origin;

  try {
    if (new URL(supabaseUrl).origin === origin) return origin;
  } catch {
    // SUPABASE_URL validation is handled by the main request handler.
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

function invalidSamGovUrl(): never {
  throw new ApiError(
    400,
    "invalid_sam_url",
    "Could not parse the SAM.gov URL. Paste the full URL from the opportunity page.",
  );
}

function parseSamGovReference(value: unknown): SamGovReference {
  const rawUrl = requiredString(value, "url", 2048);
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    invalidSamGovUrl();
  }

  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || (host !== "sam.gov" && !host.endsWith(".sam.gov"))) {
    invalidSamGovUrl();
  }

  const noticeId = parsed.pathname.match(/\/opp\/([a-f0-9]{32})(?:\/|$)/i)?.[1];
  if (noticeId) return { noticeId: noticeId.toLowerCase() };

  const pathSegments = parsed.pathname.split("/").filter(Boolean);
  const finalSegment = pathSegments[pathSegments.length - 1];
  const lastSegment = finalSegment?.toLowerCase() === "view"
    ? pathSegments[pathSegments.length - 2]
    : finalSegment;
  const solicitationNumber = (parsed.searchParams.get("q") ?? lastSegment ?? "").trim();

  if (
    solicitationNumber.length < 3 ||
    solicitationNumber.length > 128 ||
    !/\d/.test(solicitationNumber) ||
    /[\u0000-\u001f\u007f]/.test(solicitationNumber)
  ) {
    invalidSamGovUrl();
  }

  return { solicitationNumber };
}

function formatSamGovDate(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${month}/${day}/${date.getUTCFullYear()}`;
}

function samGovPostedRange(now = new Date()): { postedFrom: string; postedTo: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const postedTo = new Date(Date.UTC(value("year"), value("month") - 1, value("day"), 12));
  const postedFrom = new Date(postedTo);
  postedFrom.setUTCFullYear(postedTo.getUTCFullYear() - 1);
  postedFrom.setUTCDate(postedFrom.getUTCDate() + 1);
  return {
    postedFrom: formatSamGovDate(postedFrom),
    postedTo: formatSamGovDate(postedTo),
  };
}

function buildUpstreamUrl(reference: SamGovReference, apiKey: string): string {
  const { postedFrom, postedTo } = samGovPostedRange();
  const params = new URLSearchParams({
    limit: "1",
    offset: "0",
    api_key: apiKey,
    postedFrom,
    postedTo,
  });
  if (reference.noticeId) params.set("noticeid", reference.noticeId);
  else params.set("solnum", reference.solicitationNumber as string);
  return `https://api.sam.gov/opportunities/v2/search?${params.toString()}`;
}

function sanitizeSecret(value: unknown, secret: string): unknown {
  if (typeof value === "string") {
    return secret && value.includes(secret) ? value.split(secret).join("[redacted]") : value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeSecret(item, secret));
  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/^api[_-]?key$/i.test(key)) continue;
      sanitized[key] = sanitizeSecret(item, secret);
    }
    return sanitized;
  }
  return value;
}

async function requireCompletedActiveProfile(
  admin: SupabaseClient,
  accessToken: string,
): Promise<string> {
  const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
  if (authError || !authData.user) {
    throw new ApiError(401, "unauthorized", "The access token is invalid or expired.");
  }

  const { data, error } = await admin
    .from("users")
    .select("id,status,first_login")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  if (error) {
    console.error("sam-gov-import: caller profile lookup failed", error.code);
    throw new ApiError(500, "caller_lookup_failed", "Unable to authorize this request.");
  }
  if (!data) {
    throw new ApiError(403, "forbidden", "An active application profile is required.");
  }

  const profile = data as CallerProfile;
  if (profile.status !== "active") {
    throw new ApiError(403, "account_inactive", "This account is inactive.");
  }
  if (profile.first_login !== false) {
    throw new ApiError(
      403,
      "setup_required",
      "Complete first-login password setup before using integrations.",
    );
  }
  return authData.user.id;
}

async function requireUserPermission(
  admin: SupabaseClient,
  callerAuthUserId: string,
  permission: string,
): Promise<void> {
  const { data, error } = await admin.rpc("service_role_has_user_permission", {
    caller_auth_user_id: callerAuthUserId,
    requested_permission: permission,
  });
  if (error) {
    console.error("sam-gov-import: permission RPC failed", error.code);
    throw new ApiError(500, "permission_check_failed", "Unable to authorize this integration request.");
  }
  if (data !== true) {
    throw new ApiError(403, "forbidden", "You do not have permission to import opportunities.");
  }
}

async function fetchOpportunity(reference: SamGovReference, apiKey: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(buildUpstreamUrl(reference, apiKey), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(504, "upstream_unavailable", "SAM.gov did not respond in time. Try again.");
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 429) {
    throw new ApiError(429, "rate_limited", "SAM.gov rate limit reached. Wait a few minutes, then try again.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new ApiError(502, "integration_rejected", "SAM.gov rejected the server integration credentials.");
  }
  if (!response.ok) {
    throw new ApiError(502, "upstream_error", "SAM.gov could not complete the request. Try again.");
  }

  const declaredLength = Number(response.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPSTREAM_BYTES) {
    throw new ApiError(502, "upstream_response_too_large", "SAM.gov returned an unexpectedly large response.");
  }

  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_UPSTREAM_BYTES) {
    throw new ApiError(502, "upstream_response_too_large", "SAM.gov returned an unexpectedly large response.");
  }

  let payload: Record<string, unknown>;
  try {
    payload = asRecord(JSON.parse(raw), "SAM.gov response");
  } catch {
    throw new ApiError(502, "invalid_upstream_response", "SAM.gov returned an invalid response.");
  }

  const opportunities = payload.opportunitiesData;
  const opportunity = Array.isArray(opportunities) ? opportunities[0] : null;
  if (!opportunity || typeof opportunity !== "object" || Array.isArray(opportunity)) {
    throw new ApiError(404, "opportunity_not_found", "Opportunity not found on SAM.gov. Check the URL.");
  }

  return sanitizeSecret(opportunity, apiKey) as Record<string, unknown>;
}

Deno.serve(async (request: Request): Promise<Response> => {
  let responseOrigin: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("sam-gov-import: required Supabase server environment is missing");
      throw new ApiError(500, "server_misconfigured", "The SAM.gov integration is not configured.");
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
    const callerAuthUserId = await requireCompletedActiveProfile(admin, tokenMatch[1]);

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

    const action = requiredString(body.action, "action", 16);
    const apiKey = (Deno.env.get("SAM_GOV_API_KEY") ?? "").trim();

    if (action === "status") {
      assertAllowedKeys(body, ["action"], "request");
      return jsonResponse({ configured: apiKey.length > 0 }, 200, responseOrigin);
    }
    if (action !== "import") {
      throw new ApiError(400, "unsupported_action", "action is not supported.");
    }

    assertAllowedKeys(body, ["action", "url"], "request");
    await requireUserPermission(admin, callerAuthUserId, "opportunity:create");
    if (!apiKey) {
      throw new ApiError(503, "integration_not_configured", "The SAM.gov integration is not configured on the server.");
    }

    const opportunity = await fetchOpportunity(parseSamGovReference(body.url), apiKey);
    return jsonResponse({ opportunity }, 200, responseOrigin);
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error, responseOrigin);
    // Do not log caught values here: fetch errors may contain the secret-bearing
    // upstream request URL. The generic marker is enough for operational triage.
    console.error("sam-gov-import: unhandled request failure");
    return errorResponse(
      new ApiError(500, "internal_error", "An unexpected server error occurred."),
      responseOrigin,
    );
  }
});
