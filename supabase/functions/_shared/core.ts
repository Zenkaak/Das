const encoder = new TextEncoder();

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

export function preflight(request: Request): Response | null {
  return request.method === "OPTIONS"
    ? new Response(null, { status: 204, headers: corsHeaders })
    : null;
}

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name}`);
  return value;
}

export function readBearer(request: Request): string | null {
  const value = request.headers.get("authorization");
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice(7).trim();
  return /^[a-f0-9]{64}$/i.test(token) ? token.toLowerCase() : null;
}

export async function keyedHash(namespace: string, value: string): Promise<string> {
  const keyBytes = encoder.encode(requiredEnv("SESSION_HASH_SECRET"));
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${namespace}:${value}`),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function supabaseHeaders(extra: HeadersInit = {}): Headers {
  const headers = new Headers(extra);
  headers.set("apikey", requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
  headers.set(
    "authorization",
    `Bearer ${requiredEnv("SUPABASE_SERVICE_ROLE_KEY")}`,
  );
  headers.set("accept", "application/json");
  return headers;
}

export async function database<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    prefer?: string;
  } = {},
): Promise<T> {
  const url = new URL(`/rest/v1/${path.replace(/^\/+/, "")}`, requiredEnv("SUPABASE_URL"));
  const headers = supabaseHeaders();
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.prefer) headers.set("prefer", options.prefer);

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`database_request_failed_${response.status}`);
  }
  return (text.length > 0 ? JSON.parse(text) : null) as T;
}

export function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  return database<T>(`rpc/${name}`, { method: "POST", body });
}

export async function getSession(request: Request): Promise<{ id: string } | null> {
  const token = readBearer(request);
  if (!token) return null;

  const hash = await keyedHash("device", token);
  const rows = await database<Array<{ id: string }>>(
    `das_vpn_device_sessions?token_hash=eq.${encodeURIComponent(hash)}&revoked_at=is.null&select=id&limit=1`,
  );
  if (!rows[0]) return null;

  await database(`das_vpn_device_sessions?id=eq.${rows[0].id}`, {
    method: "PATCH",
    body: { last_seen_at: new Date().toISOString() },
    prefer: "return=minimal",
  }).catch(() => undefined);
  return rows[0];
}

export async function allowRequest(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  return rpc<boolean>("das_vpn_allow_request", {
    p_bucket_key: await keyedHash("rate", key),
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
}

export function safeError(error: unknown): Response {
  if (error instanceof Error && error.message.startsWith("missing_")) {
    return json({ error: "A required server setting is missing", code: "SERVER_NOT_CONFIGURED" }, 503);
  }
  return json({ error: "The request could not be completed", code: "REQUEST_FAILED" }, 500);
}

export function constantTimeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
