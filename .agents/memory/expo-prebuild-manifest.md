---
name: Expo prebuild manifest changes
description: Expo prebuild can reclassify core packages in package.json without updating the pnpm lockfile.
---

Running Android prebuild changed the app manifest by moving Expo, React, and React Native from `devDependencies` into `dependencies`, while the lockfile still recorded them as development dependencies.

**Why:** Committing this generated manifest change without intentionally updating the lockfile can break frozen installs.

**How to apply:** After Expo prebuild, inspect the package manifest and Git diff. Keep dependency sections aligned with the lockfile; update both only when the dependency change is intentional.
