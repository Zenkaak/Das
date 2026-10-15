import { allowRequest, json, keyedHash, preflight, requiredEnv, rpc, safeError } from "../_shared/core.ts";

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await request.json();
    const recovery = typeof body.recoveryKey === "string" ? body.recoveryKey : "";
    const token = typeof body.deviceToken === "string" ? body.deviceToken : "";
    const nextRecovery = typeof body.nextRecoveryKey === "string" ? body.nextRecoveryKey : "";
    if (![recovery, token, nextRecovery].every((value) => /^[a-f0-9]{64}$/i.test(value))) {
      return json({ error: "Invalid recovery credentials", code: "INVALID_RECOVERY" }, 400);
    }

    requiredEnv("SESSION_HASH_SECRET");
    if (!(await allowRequest(await keyedHash("recover", recovery), 5, 900))) {
      return json({ error: "Too many recovery attempts", code: "RATE_LIMITED" }, 429);
    }

    const recovered = await rpc<boolean>("das_vpn_recover_session", {
      p_recovery_hash: await keyedHash("recovery", recovery),
      p_token_hash: await keyedHash("device", token),
      p_next_recovery_hash: await keyedHash("recovery", nextRecovery),
    });
    if (!recovered) {
      return json({ error: "Recovery key is not valid", code: "RECOVERY_NOT_FOUND" }, 404);
    }
    return json({ ready: true, recovered: true });
  } catch (error) {
    return safeError(error);
  }
});
