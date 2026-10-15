---
name: Vercel build source
description: The source directory configured for the DAS VPN production Vercel project.
---

The `dasvpn` Vercel project uses the repository root as its root directory. Its root `vercel.json` builds `artifacts/das-vpn`; the nested `Das/` project is a duplicate and is not used for production builds.

**Why:** A successful deployment still served the old screen because the newer screen existed only in the nested copy.

**How to apply:** Make production-facing client changes in the root `artifacts/das-vpn` workspace and verify the root Vercel build source before deploying.
