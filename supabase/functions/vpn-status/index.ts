import { database, getSession, json, preflight, safeError } from "../_shared/core.ts";

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const session = await getSession(request);
    if (!session) return json({ error: "Device session required", code: "SESSION_REQUIRED" }, 401);

    const [subscriptions, payments] = await Promise.all([
      database<Array<{ plan_code: string; expires_at: string }>>(
        `das_vpn_subscriptions?session_id=eq.${session.id}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=plan_code,expires_at&order=expires_at.desc&limit=1`,
      ),
      database<Array<{ id: string; plan_code: string; status: string }>>(
        `das_vpn_payments?session_id=eq.${session.id}&select=id,plan_code,status&order=created_at.desc&limit=1`,
      ),
    ]);

    const subscription = subscriptions[0]
      ? { planCode: subscriptions[0].plan_code, expiresAt: subscriptions[0].expires_at }
      : null;
    const payment = payments[0]
      ? { id: payments[0].id, planCode: payments[0].plan_code, status: payments[0].status }
      : null;

    return json({
      subscription,
      nativeTunnel: { supported: false, connected: false },
      latestPayment: payment,
    });
  } catch (error) {
    return safeError(error);
  }
});
