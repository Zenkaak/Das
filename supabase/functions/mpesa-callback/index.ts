import {
  database,
  json,
  preflight,
  requiredEnv,
  rpc,
} from "../_shared/core.ts";

type CallbackItem = { Name?: string; Value?: string | number };

function itemValue(items: CallbackItem[], name: string): string | number | undefined {
  return items.find((item) => item.Name === name)?.Value;
}

function transactionTime(value: string | number | undefined): string | null {
  if (value === undefined) return null;
  const digits = String(value);
  if (!/^\d{14}$/.test(digits)) return null;
  const date = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}+03:00`;
  const parsed = new Date(date);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

async function darajaToken(): Promise<{ host: string; token: string }> {
  const environment = requiredEnv("DARAJA_ENVIRONMENT");
  const host = environment === "sandbox"
    ? "https://sandbox.safaricom.co.ke"
    : environment === "production"
    ? "https://api.safaricom.co.ke"
    : "";
  if (!host) throw new Error("missing_DARAJA_ENVIRONMENT");
  const basic = btoa(
    `${requiredEnv("MPESA_CONSUMER_KEY")}:${requiredEnv("MPESA_CONSUMER_SECRET")}`,
  );
  const response = await fetch(
    `${host}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { authorization: `Basic ${basic}` } },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.access_token !== "string") {
    throw new Error("daraja_authentication_failed");
  }
  return { host, token: body.access_token as string };
}

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const payload = await request.json();
    const callback = payload?.Body?.stkCallback;
    const checkoutId = callback?.CheckoutRequestID;
    const merchantId = callback?.MerchantRequestID;
    if (typeof checkoutId !== "string" || typeof merchantId !== "string" ||
        !Number.isInteger(Number(callback?.ResultCode))) {
      return json({ ResultCode: 1, ResultDesc: "Invalid callback payload" }, 400);
    }

    const rows = await database<Array<{
      id: string;
      amount_kes: number;
      status: string;
      merchant_request_id: string | null;
      phone_number: string | null;
    }>>(
      `das_vpn_payments?checkout_request_id=eq.${encodeURIComponent(checkoutId)}&select=id,amount_kes,status,merchant_request_id,phone_number&limit=1`,
    );
    const payment = rows[0];
    if (!payment) {
      return json({ ResultCode: 1, ResultDesc: "Payment request not found; retry callback" }, 503);
    }
    if (payment.merchant_request_id !== merchantId) {
      return json({ ResultCode: 1, ResultDesc: "Payment request mismatch" }, 404);
    }
    if (payment.status === "paid") {
      return json({ ResultCode: 0, ResultDesc: "Already processed" }, 200);
    }
    if (payment.status !== "pending") {
      return json({ ResultCode: 0, ResultDesc: "Payment already closed" }, 200);
    }

    const { host, token } = await darajaToken();
    const shortcode = requiredEnv("MPESA_SHORTCODE");
    const timestamp = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Nairobi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const timeParts = Object.fromEntries(timestamp.map((part) => [part.type, part.value]));
    const formattedTimestamp = `${timeParts.year}${timeParts.month}${timeParts.day}${timeParts.hour}${timeParts.minute}${timeParts.second}`;
    const password = btoa(`${shortcode}${requiredEnv("MPESA_PASSKEY")}${formattedTimestamp}`);
    const verification = await fetch(`${host}/mpesa/stkpushquery/v1/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: formattedTimestamp,
        CheckoutRequestID: checkoutId,
      }),
    });
    const verified = await verification.json().catch(() => ({}));
    if (!verification.ok || String(verified.ResponseCode) !== "0" ||
        verified.ResultCode === undefined ||
        (verified.CheckoutRequestID !== undefined && verified.CheckoutRequestID !== checkoutId) ||
        (verified.MerchantRequestID !== undefined && verified.MerchantRequestID !== merchantId)) {
      return json({ ResultCode: 1, ResultDesc: "Payment verification unavailable; retry callback" }, 503);
    }

    const verifiedCode = Number(verified.ResultCode);
    const callbackCode = Number(callback.ResultCode);
    if (verifiedCode !== 0 || callbackCode !== 0) {
      const finalCode = callbackCode !== 0 ? callbackCode : verifiedCode;
      const cancelledCodes = new Set([1032, 4001]);
      const expiredCodes = new Set([1037]);
      await database(
        `das_vpn_payments?id=eq.${payment.id}&status=eq.pending`,
        {
          method: "PATCH",
          body: {
            status: cancelledCodes.has(finalCode)
              ? "cancelled"
              : expiredCodes.has(finalCode)
              ? "expired"
              : "failed",
            result_code: finalCode,
            result_description: String(callbackCode !== 0 ? callback.ResultDesc ?? "" : verified.ResultDesc ?? "").slice(0, 300),
            updated_at: new Date().toISOString(),
          },
          prefer: "return=minimal",
        },
      );
      return json({ ResultCode: 0, ResultDesc: "Payment was not completed" }, 200);
    }

    const items: CallbackItem[] = Array.isArray(callback.CallbackMetadata?.Item)
      ? callback.CallbackMetadata.Item
      : [];
    const amount = Number(itemValue(items, "Amount"));
    const receipt = itemValue(items, "MpesaReceiptNumber");
    const date = transactionTime(itemValue(items, "TransactionDate"));
    const payerPhone = String(itemValue(items, "PhoneNumber") ?? "");
    if (amount !== payment.amount_kes || typeof receipt !== "string" ||
        !/^[A-Z0-9]{8,20}$/.test(receipt) || !date ||
        !payment.phone_number || payerPhone !== payment.phone_number) {
      return json({ ResultCode: 1, ResultDesc: "Payment details do not match; retry callback" }, 503);
    }

    await rpc("das_vpn_activate_verified_payment", {
      p_payment_id: payment.id,
      p_mpesa_receipt: receipt,
      p_transaction_date: date,
    });
    return json({ ResultCode: 0, ResultDesc: "Accepted" }, 200);
  } catch (error) {
    void error;
    return json({ ResultCode: 1, ResultDesc: "Payment verification unavailable; please retry" }, 500);
  }
});
