import { database, getSession, json, preflight, safeError } from "../_shared/core.ts";

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    if (!(await getSession(request))) {
      return json({ error: "Device session required", code: "SESSION_REQUIRED" }, 401);
    }
    const rows = await database<Array<{
      id: string; name: string; country_code: string; country: string; city: string;
    }>>(
      "das_vpn_servers?enabled=eq.true&select=id,name,country_code,country,city&order=name.asc",
    );
    return json({
      servers: rows.map((server) => ({
        id: server.id,
        name: server.name,
        countryCode: server.country_code,
        country: server.country,
        city: server.city,
      })),
    });
  } catch (error) {
    return safeError(error);
  }
});
