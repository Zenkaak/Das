---
name: Subscription-only product scope
description: User-defined boundary between DAS subscription status and VPN tunnel connectivity.
---

DAS sells subscriptions, not servers. A verified payment activates subscription time; do not represent it as a live VPN tunnel connection unless a tunnel is actually configured and verified.

**Why:** The user explicitly stated that the product sells subscriptions, not servers, and that the app must not claim a VPN tunnel is connected when it is not.

**How to apply:** Keep subscription/payment status separate from actual tunnel connectivity in the app and backend.
