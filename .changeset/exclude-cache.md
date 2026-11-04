---
"@figentra/testbed": patch
---

`testbed run` no longer uploads a worktree's `.cache` (its pnpm store, about 7.5 GB); the box agent's seed refresh
leaves it out too, byte for byte as figentra/stackra.
