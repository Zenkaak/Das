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
      id: string;
      plan_code: string;
      amount_kes: number;
      status: string;
      result_code: number | null;
    }>>(
      `das_vpn_payments?id=eq.${paymentId}&session_id=eq.${session.id}&select=id,plan_code,amount_kes,status,result_code&limit=1`,
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
      resultCode: payment.result_code,
      message: payment.status === "paid"
        ? "Payment verified and subscription activated."
        : payment.status === "pending"
        ? "Waiting for M-Pesa confirmation. No subscription is active yet."
        : payment.status === "cancelled"
        ? "The payment was cancelled. No subscription was activated."
        : payment.result_code === 4999
        ? "Safaricom could not complete this payment (code 4999). No subscription was activated."
        : payment.status === "expired"
        ? "The payment request expired before confirmation. No subscription was activated."
        : "M-Pesa did not complete the payment. No subscription was activated.",
    });
  } catch (error) {
    return safeError(error);
  }
});
