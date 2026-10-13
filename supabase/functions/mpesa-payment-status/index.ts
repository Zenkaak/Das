import { database, getSession, json, preflight, safeError } from "../_shared/core.ts";

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const session = await getSession(request);
    if (!session) return json({ error: "Device session required", code: "SESSION_REQUIRED" }, 401);
    const paymentId = new URL(request.url).searchParams.get("paymentId") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(paymentId)) {
      return json({ error: "Payment not found", code: "PAYMENT_NOT_FOUND" }, 404);
    }

    const rows = await database<Array<{
      id: string; plan_code: string; amount_kes: number; status: string;
    }>>(
      `das_vpn_payments?id=eq.${paymentId}&session_id=eq.${session.id}&select=id,plan_code,amount_kes,status&limit=1`,
    );
    const payment = rows[0];
    if (!payment) return json({ error: "Payment not found", code: "PAYMENT_NOT_FOUND" }, 404);

    const subscriptions = payment.status === "paid"
      ? await database<Array<{ expires_at: string }>>(
        `das_vpn_subscriptions?payment_id=eq.${payment.id}&select=expires_at&limit=1`,
      )
      : [];

    return json({
      id: payment.id,
      status: payment.status,
      planCode: payment.plan_code,
      amountKes: payment.amount_kes,
      expiresAt: subscriptions[0]?.expires_at ?? null,
    });
  } catch (error) {
    return safeError(error);
  }
});
