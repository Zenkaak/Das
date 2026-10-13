import { database, getSession, json, preflight, safeError } from "../_shared/core.ts";

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const session = await getSession(request);
    if (!session) return json({ error: "Device session required", code: "SESSION_REQUIRED" }, 401);
    const peers = await database<Array<{ id: string }>>(
      `das_vpn_peers?session_id=eq.${session.id}&status=eq.active&select=id`,
    );
    if (peers.length > 0) {
      return json({
        disconnected: false,
        message: "No deployed WireGuard controller can revoke this peer yet.",
        code: "WIREGUARD_INFRASTRUCTURE_NOT_CONFIGURED",
      }, 503);
    }
    return json({ disconnected: true });
  } catch (error) {
    return safeError(error);
  }
});
