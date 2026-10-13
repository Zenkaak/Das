import { allowRequest, json, keyedHash, preflight, readBearer, requiredEnv, rpc, safeError } from "../_shared/core.ts";

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await request.json();
    const token = typeof body.deviceToken === "string" ? body.deviceToken : "";
    const recovery = typeof body.recoveryKey === "string" ? body.recoveryKey : "";
    if (!/^[a-f0-9]{64}$/i.test(token) || !/^[a-f0-9]{64}$/i.test(recovery)) {
      return json({ error: "Invalid device credentials", code: "INVALID_SESSION" }, 400);
    }

    requiredEnv("SESSION_HASH_SECRET");
    if (!(await allowRequest(await keyedHash("register", token), 6, 300))) {
      return json({ error: "Too many requests", code: "RATE_LIMITED" }, 429);
    }

    await rpc<string>("das_vpn_register_session", {
      p_token_hash: await keyedHash("device", token),
      p_recovery_hash: await keyedHash("recovery", recovery),
    });
    return json({ ready: true, recovered: false });
  } catch (error) {
    return safeError(error);
  }
});
