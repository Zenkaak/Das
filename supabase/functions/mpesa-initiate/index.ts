import {
  allowRequest,
  database,
  getSession,
  json,
  preflight,
  requiredEnv,
  safeError,
} from "../_shared/core.ts";

const planCodes = new Set(["three_days", "weekly", "monthly", "three_months", "yearly"]);

function normalizeKenyanPhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");
  if (/^(?:254[17]\d{8})$/.test(digits)) return digits;
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  return null;
}

function darajaTimestamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}${value.hour}${value.minute}${value.second}`;
}

async function oauthToken(): Promise<string> {
  const environment = requiredEnv("DARAJA_ENVIRONMENT");
  const host = environment === "sandbox"
    ? "https://sandbox.safaricom.co.ke"
    : environment === "production"
    ? "https://api.safaricom.co.ke"
    : "";
  if (!host) throw new Error("missing_DARAJA_ENVIRONMENT");

  const credentials = btoa(
    `${requiredEnv("MPESA_CONSUMER_KEY")}:${requiredEnv("MPESA_CONSUMER_SECRET")}`,
  );
  const response = await fetch(
    `${host}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { authorization: `Basic ${credentials}` } },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.access_token !== "string") {
    throw new Error("daraja_authentication_failed");
  }
  return body.access_token as string;
}

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const session = await getSession(request);
    if (!session) return json({ error: "Device session required", code: "SESSION_REQUIRED" }, 401);

    const body = await request.json();
    const planCode = typeof body.planCode === "string" ? body.planCode : "";
    const phoneNumber = typeof body.phoneNumber === "string" ? body.phoneNumber : "";
    const phone = normalizeKenyanPhone(phoneNumber);
    const idempotencyKey = request.headers.get("idempotency-key") ?? "";
    if (!planCodes.has(planCode) || !phone || !/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) {
      return json({ error: "Choose a plan and enter a valid Kenyan M-Pesa number", code: "INVALID_PAYMENT_REQUEST" }, 400);
    }

    const transactionType = Deno.env.get("MPESA_TRANSACTION_TYPE");
    if (transactionType !== "CustomerPayBillOnline" && transactionType !== "CustomerBuyGoodsOnline") {
      return json({
        error: "M-Pesa collection type is not configured",
        code: "MPESA_COLLECTION_TYPE_REQUIRED",
      }, 503);
    }

    if (!(await allowRequest(`payment:${session.id}`, 3, 300))) {
      return json({ error: "Too many payment requests. Try again later.", code: "RATE_LIMITED" }, 429);
    }

    const existing = await database<Array<{
      id: string; plan_code: string; amount_kes: number; status: string;
      checkout_request_id: string | null;
    }>>(
      `das_vpn_payments?session_id=eq.${session.id}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=id,plan_code,amount_kes,status,checkout_request_id&limit=1`,
    );
    if (existing[0]) {
      const payment = existing[0];
      if (!payment.checkout_request_id && payment.status === "pending") {
        return json({ error: "This payment request is still being processed", code: "PAYMENT_REQUEST_PENDING" }, 409);
      }
      return json({
        id: payment.id,
        status: payment.status,
        planCode: payment.plan_code,
        amountKes: payment.amount_kes,
        message: "This request was already received.",
      }, payment.status === "pending" ? 202 : 200);
    }

    const plans = await database<Array<{ code: string; label: string; amount_kes: number }>>(
      `das_vpn_plans?code=eq.${planCode}&select=code,label,amount_kes&limit=1`,
    );
    const plan = plans[0];
    if (!plan) return json({ error: "Subscription plan is unavailable", code: "PLAN_UNAVAILABLE" }, 404);

    const payments = await database<Array<{ id: string }>>(
      "das_vpn_payments",
      {
        method: "POST",
        body: {
          session_id: session.id,
          plan_code: plan.code,
          amount_kes: plan.amount_kes,
          idempotency_key: idempotencyKey,
        },
        prefer: "return=representation",
      },
    );
    const payment = payments[0];
    if (!payment) throw new Error("payment_insert_failed");

    const shortcode = requiredEnv("MPESA_SHORTCODE");
    const passkey = requiredEnv("MPESA_PASSKEY");
    const timestamp = darajaTimestamp();
    const password = btoa(`${shortcode}${passkey}${timestamp}`);
    const token = await oauthToken();
    const environment = requiredEnv("DARAJA_ENVIRONMENT");
    const host = environment === "sandbox"
      ? "https://sandbox.safaricom.co.ke"
      : "https://api.safaricom.co.ke";
    const callbackSecret = requiredEnv("MPESA_CALLBACK_TOKEN");
    const callbackUrl = `${requiredEnv("SUPABASE_URL").replace(/\/+$/, "")}/functions/v1/mpesa-callback?key=${encodeURIComponent(callbackSecret)}`;

    const response = await fetch(`${host}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: transactionType,
        Amount: plan.amount_kes,
        PartyA: phone,
        PartyB: shortcode,
        PhoneNumber: phone,
        CallBackURL: callbackUrl,
        AccountReference: "DAS VPN",
        TransactionDesc: `${plan.label} subscription`,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || String(result.ResponseCode) !== "0" ||
        typeof result.CheckoutRequestID !== "string" ||
        typeof result.MerchantRequestID !== "string") {
      await database(`das_vpn_payments?id=eq.${payment.id}&status=eq.pending`, {
        method: "PATCH",
        body: { status: "failed", updated_at: new Date().toISOString() },
        prefer: "return=minimal",
      });
      return json({ error: "Safaricom did not accept the payment request", code: "STK_PUSH_REJECTED" }, 502);
    }

    await database(`das_vpn_payments?id=eq.${payment.id}`, {
      method: "PATCH",
      body: {
        merchant_request_id: result.MerchantRequestID,
        checkout_request_id: result.CheckoutRequestID,
        updated_at: new Date().toISOString(),
      },
      prefer: "return=minimal",
    });

    return json({
      id: payment.id,
      status: "pending",
      planCode: plan.code,
      amountKes: plan.amount_kes,
      message: "Check your phone and enter your M-Pesa PIN to approve the payment.",
    }, 202);
  } catch (error) {
    return safeError(error);
  }
});
