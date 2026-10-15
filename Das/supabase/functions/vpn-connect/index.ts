import { database, getSession, json, preflight, safeError } from "../_shared/core.ts";

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const session = await getSession(request);
    if (!session) return json({ error: "Device session required", code: "SESSION_REQUIRED" }, 401);

    const active = await database<Array<{ id: string }>>(
      `das_vpn_subscriptions?session_id=eq.${session.id}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id&order=expires_at.desc&limit=1`,
    );
    if (!active[0]) {
      return json({ error: "A paid, unexpired subscription is required", code: "SUBSCRIPTION_REQUIRED" }, 403);
    }

    const body = await request.json();
    const serverId = typeof body.serverId === "string" ? body.serverId : "";
    const publicKey = typeof body.publicKey === "string" ? body.publicKey : "";
    if (!/^[0-9a-f-]{36}$/i.test(serverId) || publicKey.length < 40 || publicKey.length > 64) {
      return json({ error: "Invalid server or WireGuard public key", code: "INVALID_PEER" }, 400);
    }

    const servers = await database<Array<{ id: string; controller_id: string | null }>>(
      `das_vpn_servers?id=eq.${serverId}&enabled=eq.true&select=id,controller_id&limit=1`,
    );
    const server = servers[0];
    if (!server) return json({ error: "This VPN server is not available", code: "SERVER_UNAVAILABLE" }, 404);
    if (!server.controller_id || !Deno.env.get("WIREGUARD_CONTROLLER_URL") ||
        !Deno.env.get("WIREGUARD_CONTROLLER_TOKEN")) {
      return json({
        connected: false,
        message: "A WireGuard server controller has not been deployed.",
        code: "WIREGUARD_INFRASTRUCTURE_NOT_CONFIGURED",
      }, 503);
    }

    return json({
      connected: false,
      message: "The configured server controller has no supported provisioning adapter.",
      code: "WIREGUARD_ADAPTER_NOT_CONFIGURED",
    }, 503);
  } catch (error) {
    return safeError(error);
  }
});
