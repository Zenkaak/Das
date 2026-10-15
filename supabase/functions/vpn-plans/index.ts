import { database, json, preflight } from "../_shared/core.ts";

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const rows = await database<Array<{
      code: string;
      label: string;
      amount_kes: number;
      duration_days: number;
      badge: string | null;
    }>>("das_vpn_plans?select=code,label,amount_kes,duration_days,badge&order=duration_days.asc");

    return json({
      plans: rows.map((plan) => ({
        code: plan.code,
        label: plan.label,
        amountKes: plan.amount_kes,
        durationDays: plan.duration_days,
        badge: plan.badge,
      })),
    });
  } catch {
    return json({ error: "Subscription plans are temporarily unavailable", code: "PLANS_UNAVAILABLE" }, 503);
  }
});
