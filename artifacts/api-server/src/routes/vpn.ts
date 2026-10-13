import {
  Router,
  type IRouter,
  type Request,
  type Response as ExpressResponse,
} from "express";
import type { RequestInit as FetchRequestInit } from "undici";

const router: IRouter = Router();

type Method = "GET" | "POST";

function proxyToSupabase(functionName: string, method: Method) {
  return async (req: Request, res: ExpressResponse) => {
    const baseUrl = process.env["SUPABASE_URL"];
    if (!baseUrl) {
      res.status(503).json({ error: "VPN backend is not configured", code: "SUPABASE_NOT_CONFIGURED" });
      return;
    }

    const headers = new Headers({ accept: "application/json" });
    const authorization = req.header("authorization");
    if (authorization) headers.set("authorization", authorization);

    const options: FetchRequestInit = { method, headers, signal: AbortSignal.timeout(45_000) };
    if (method === "POST") {
      headers.set("content-type", "application/json");
      if (req.header("idempotency-key")) {
        headers.set("idempotency-key", req.header("idempotency-key")!);
      }
      if (req.body && Object.keys(req.body).length > 0) {
        options.body = JSON.stringify(req.body);
      }
    }

    try {
      const query = functionName === "mpesa-payment-status"
        ? `?paymentId=${encodeURIComponent(
            Array.isArray(req.params["paymentId"])
              ? req.params["paymentId"][0] ?? ""
              : req.params["paymentId"] ?? "",
          )}`
        : "";
      const upstream = await globalThis.fetch(
        `${baseUrl.replace(/\/+$/, "")}/functions/v1/${functionName}${query}`,
        options,
      );
      const contentType = upstream.headers.get("content-type") ?? "application/json";
      const payload = await upstream.text();
      res.status(upstream.status).setHeader("content-type", contentType).send(payload);
    } catch {
      res.status(502).json({ error: "VPN service is temporarily unreachable", code: "VPN_UPSTREAM_UNAVAILABLE" });
    }
  };
}

router.post("/vpn/session", proxyToSupabase("device-session", "POST"));
router.post("/vpn/recovery", proxyToSupabase("recover-session", "POST"));
router.get("/vpn/status", proxyToSupabase("vpn-status", "GET"));
router.get("/vpn/servers", proxyToSupabase("vpn-servers", "GET"));
router.post("/vpn/payments", proxyToSupabase("mpesa-initiate", "POST"));
router.get("/vpn/payments/:paymentId", proxyToSupabase("mpesa-payment-status", "GET"));
router.post("/vpn/connect", proxyToSupabase("vpn-connect", "POST"));
router.post("/vpn/disconnect", proxyToSupabase("vpn-disconnect", "POST"));

export default router;
