import { database, getSession, json, preflight } from "../_shared/core.ts";

type Plan = { code: string; label: string };
type Payment = {
  id: string;
  plan_code: string;
  amount_kes: number;
  status: string;
  created_at: string;
  updated_at: string;
  transaction_date: string | null;
};
type Subscription = {
  id: string;
  plan_code: string;
  payment_id: string;
  starts_at: string;
  expires_at: string;
  created_at: string;
};

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const session = await getSession(request);
    if (!session) return json({ error: "Device session required", code: "SESSION_REQUIRED" }, 401);

    const [payments, subscriptions, plans] = await Promise.all([
      database<Payment[]>(
        `das_vpn_payments?session_id=eq.${session.id}&select=id,plan_code,amount_kes,status,created_at,updated_at,transaction_date&order=created_at.desc&limit=100`,
      ),
      database<Subscription[]>(
        `das_vpn_subscriptions?session_id=eq.${session.id}&select=id,plan_code,payment_id,starts_at,expires_at,created_at&order=created_at.desc&limit=100`,
      ),
      database<Plan[]>("das_vpn_plans?select=code,label"),
    ]);
    const labels = new Map(plans.map((plan) => [plan.code, plan.label]));
    const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
    const activities = [
      ...payments.map((payment) => ({
        id: `payment-${payment.id}`,
        type: "payment",
        status: payment.status,
        planCode: payment.plan_code,
        planLabel: labels.get(payment.plan_code) ?? payment.plan_code,
        amountKes: payment.amount_kes,
        occurredAt: payment.status === "pending"
          ? payment.created_at
          : payment.transaction_date ?? payment.updated_at,
        expiresAt: null,
      })),
      ...subscriptions.flatMap((subscription) => {
        const payment = paymentById.get(subscription.payment_id);
        const planLabel = labels.get(subscription.plan_code) ?? subscription.plan_code;
        const expiryStatus = new Date(subscription.expires_at).getTime() <= Date.now()
          ? "expired"
          : "upcoming";
        return [
          {
            id: `activation-${subscription.id}`,
            type: "activation",
            status: "paid",
            planCode: subscription.plan_code,
            planLabel,
            amountKes: payment?.amount_kes ?? 0,
            occurredAt: subscription.created_at,
            expiresAt: subscription.expires_at,
          },
          {
            id: `expiry-${subscription.id}`,
            type: "expiry",
            status: expiryStatus,
            planCode: subscription.plan_code,
            planLabel,
            amountKes: payment?.amount_kes ?? 0,
            occurredAt: subscription.expires_at,
            expiresAt: subscription.expires_at,
          },
        ];
      }),
    ].sort((left, right) =>
      new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
    );

    return json({ activities });
  } catch {
    return json({ error: "Activity is temporarily unavailable", code: "ACTIVITY_UNAVAILABLE" }, 503);
  }
});
